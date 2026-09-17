import { NextResponse } from 'next/server.js';

import { getMflSessionCookieValue } from '@/lib/mfl-session';
import {
  importAmendedTradeProposal,
  importTradeProposal,
  validateTradeProposeInput,
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
    return NextResponse.json({ ok: false, message: 'Login required before a trade can be submitted.' }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isPlainRecord(payload)) {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 });
  }

  if (payload.confirmed !== true) {
    return NextResponse.json({ ok: false, message: 'Explicit confirmation required.' }, { status: 400 });
  }

  const validated = validateTradeProposeInput({
    partnerFranchiseId: payload.partnerFranchiseId,
    offeringPlayerIds: payload.offeringPlayerIds,
    requestingPlayerIds: payload.requestingPlayerIds,
    expiresDays: payload.expiresDays,
    comments: payload.comments,
    revokeTradeId: payload.revokeTradeId,
  });

  if (!validated.ok) {
    return NextResponse.json({ ok: false, message: validated.message }, { status: 400 });
  }

  const { value } = validated;

  try {
    const result = value.revokeTradeId
      ? await importAmendedTradeProposal({
          sessionCookieValue,
          revokeTradeId: value.revokeTradeId,
          partnerFranchiseId: value.partnerFranchiseId,
          willGiveUpIds: value.willGiveUpIds,
          willReceiveIds: value.willReceiveIds,
          comments: value.comments,
          expiresDays: value.expiresDays,
        })
      : await importTradeProposal({
          sessionCookieValue,
          partnerFranchiseId: value.partnerFranchiseId,
          willGiveUpIds: value.willGiveUpIds,
          willReceiveIds: value.willReceiveIds,
          comments: value.comments,
          expiresDays: value.expiresDays,
        });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: result.message,
          revokedTradeId: result.revokedTradeId ?? null,
        },
        { status: result.status },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: result.message,
        revokedTradeId: result.revokedTradeId ?? null,
        draft: {
          partnerFranchiseId: value.partnerFranchiseId,
          offeringPlayerIds: value.willGiveUpIds,
          requestingPlayerIds: value.willReceiveIds,
          expiresDays: value.expiresDays,
          comments: value.comments ?? '',
        },
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ ok: false, message: 'Trade could not be submitted to MFL.' }, { status: 503 });
  }
}
