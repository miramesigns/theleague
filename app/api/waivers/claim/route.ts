import { NextResponse } from 'next/server.js';

import { getMflSessionCookieValue } from '@/lib/mfl-session';
import { importBlindBidWaiverClaim, validateWaiverClaimInput } from '@/lib/mfl-waiver-writes';

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
    return NextResponse.json({ ok: false, message: 'Login required before a waiver claim can be submitted.' }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!isPlainRecord(payload)) {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 });
  }

  if (payload.confirmed !== true) {
    return NextResponse.json({ ok: false, message: 'Explicit confirmation required.' }, { status: 400 });
  }

  const validated = validateWaiverClaimInput({
    playerId: payload.playerId,
    bidAmount: payload.bidAmount,
    dropPlayerIds: payload.dropPlayerIds,
    comments: payload.comments,
    round: payload.round,
    replaceExisting: payload.replaceExisting,
  });

  if (!validated.ok) {
    return NextResponse.json({ ok: false, message: validated.message }, { status: 400 });
  }

  try {
    const result = await importBlindBidWaiverClaim({
      sessionCookieValue,
      playerId: validated.value.playerId,
      bidAmount: validated.value.bidAmount,
      dropPlayerIds: validated.value.dropPlayerIds,
      comments: validated.value.comments,
      round: validated.value.round,
      replaceExisting: validated.value.replaceExisting,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: result.status });
    }

    return NextResponse.json(
      {
        ok: true,
        message: result.message,
        verifiedPending: result.verifiedPending,
        draft: {
          playerId: result.draft.playerId,
          bidAmount: result.draft.bidAmount,
          dropPlayerIds: result.draft.dropPlayerIds,
          comments: result.draft.comments ?? '',
        },
      },
      { status: 200 },
    );
  } catch {
    return NextResponse.json({ ok: false, message: 'Waiver claim could not be submitted to MFL.' }, { status: 503 });
  }
}
