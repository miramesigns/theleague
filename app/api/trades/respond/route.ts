import { NextResponse } from 'next/server.js';

import { getMflSessionCookieValue } from '@/lib/mfl-session';
import {
  importTradeResponse,
  normalizeMflTradeId,
  normalizeTradeResponseAction,
} from '@/lib/mfl-trade-writes';

export const dynamic = 'force-dynamic';

function deriveExpectedOrigin(request: Request): string | null {
  const headers = request.headers;
  const requestUrl = new URL(request.url);
  const host = headers.get('x-forwarded-host') || headers.get('host') || requestUrl.host;
  if (!host) return null;

  const proto = headers.get('x-forwarded-proto') || requestUrl.protocol.replace(':', '') || 'https';
  return `${proto}://${host}`;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function POST(request: Request) {
  const expectedOrigin = deriveExpectedOrigin(request);
  const origin = request.headers.get('origin');
  if (!expectedOrigin || !origin || origin !== expectedOrigin) {
    return NextResponse.json({ ok: false, message: 'Request origin is not allowed.' }, { status: 403 });
  }

  const sessionCookieValue = await getMflSessionCookieValue();
  if (!sessionCookieValue) {
    return NextResponse.json({ ok: false, message: 'Login required before a trade response can be submitted.' }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isPlainRecord(payload)) {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 });
  }

  if (payload.confirmed !== true) {
    return NextResponse.json({ ok: false, message: 'Explicit confirmation required.' }, { status: 400 });
  }

  const action = normalizeTradeResponseAction(payload.action);
  if (!action) {
    return NextResponse.json({ ok: false, message: 'Action must be accept, reject, or revoke.' }, { status: 400 });
  }

  const tradeId = normalizeMflTradeId(payload.tradeId);
  if (!tradeId) {
    return NextResponse.json({ ok: false, message: 'A pending trade id is required.' }, { status: 400 });
  }

  const comments = typeof payload.comments === 'string' ? payload.comments.slice(0, 280) : '';

  try {
    const result = await importTradeResponse({
      sessionCookieValue,
      tradeId,
      response: action,
      comments: comments || undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
    }

    return NextResponse.json(
      {
        ok: true,
        message: result.message,
        action,
        tradeId,
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ ok: false, message: 'Trade response could not be submitted to MFL.' }, { status: 503 });
  }
}
