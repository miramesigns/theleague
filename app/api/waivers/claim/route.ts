import { NextResponse } from 'next/server.js';

import { getMflSessionCookieValue } from '@/lib/mfl-session';

export const dynamic = 'force-dynamic';

type ClaimPayload = {
  confirmed?: boolean;
  playerId?: string;
  bidAmount?: number;
  dropPlayerIds?: string[];
  comments?: string;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function POST(request: Request) {
  const sessionCookieValue = await getMflSessionCookieValue();
  if (!sessionCookieValue) {
    return NextResponse.json({ ok: false, message: 'Login required before a waiver claim can be queued.' }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as ClaimPayload | null;
  if (!isPlainRecord(payload)) {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 });
  }

  if (!payload.confirmed) {
    return NextResponse.json({ ok: false, message: 'Explicit confirmation required.' }, { status: 400 });
  }

  const playerId = typeof payload.playerId === 'string' ? payload.playerId.trim() : '';
  if (!playerId) {
    return NextResponse.json({ ok: false, message: 'A free-agent player is required.' }, { status: 400 });
  }

  const bidAmount = typeof payload.bidAmount === 'number' && Number.isFinite(payload.bidAmount) ? payload.bidAmount : null;
  if (bidAmount === null || bidAmount < 0) {
    return NextResponse.json({ ok: false, message: 'A valid FAAB bid is required.' }, { status: 400 });
  }

  const dropPlayerIds = Array.isArray(payload.dropPlayerIds)
    ? payload.dropPlayerIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    : [];

  return NextResponse.json(
    {
      ok: false,
      message: 'Safe TODO stub: live MFL waiver/FAAB submit is not enabled yet. Draft was accepted locally and still requires ask-before-send confirmation before any future write.',
      draft: {
        playerId,
        bidAmount,
        dropPlayerIds,
        comments: typeof payload.comments === 'string' ? payload.comments.slice(0, 280) : '',
      },
    },
    { status: 501 },
  );
}
