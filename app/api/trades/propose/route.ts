import { NextResponse } from 'next/server.js';

import { getMflSessionCookieValue } from '@/lib/mfl-session';

export const dynamic = 'force-dynamic';

type ProposePayload = {
  confirmed?: boolean;
  partnerFranchiseId?: string;
  offeringPlayerIds?: string[];
  requestingPlayerIds?: string[];
  expiresDays?: number;
  comments?: string;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())).map((id) => id.trim());
}

export async function POST(request: Request) {
  const sessionCookieValue = await getMflSessionCookieValue();
  if (!sessionCookieValue) {
    return NextResponse.json({ ok: false, message: 'Login required before a trade can be queued.' }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as ProposePayload | null;
  if (!isPlainRecord(payload)) {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 });
  }

  if (!payload.confirmed) {
    return NextResponse.json({ ok: false, message: 'Explicit confirmation required.' }, { status: 400 });
  }

  const partnerFranchiseId = typeof payload.partnerFranchiseId === 'string' ? payload.partnerFranchiseId.trim() : '';
  if (!/^\d{4}$/.test(partnerFranchiseId)) {
    return NextResponse.json({ ok: false, message: 'A partner franchise is required.' }, { status: 400 });
  }

  const offeringPlayerIds = readIdList(payload.offeringPlayerIds);
  const requestingPlayerIds = readIdList(payload.requestingPlayerIds);
  if (offeringPlayerIds.length === 0 && requestingPlayerIds.length === 0) {
    return NextResponse.json({ ok: false, message: 'Add at least one asset on either side of the trade.' }, { status: 400 });
  }

  const expiresDays = typeof payload.expiresDays === 'number' && Number.isInteger(payload.expiresDays) && payload.expiresDays > 0
    ? payload.expiresDays
    : 7;

  return NextResponse.json(
    {
      ok: false,
      message: 'Safe TODO stub: live MFL trade submit is not enabled yet. Draft was accepted locally and still requires ask-before-send confirmation before any future write.',
      draft: {
        partnerFranchiseId,
        offeringPlayerIds,
        requestingPlayerIds,
        expiresDays,
        comments: typeof payload.comments === 'string' ? payload.comments.slice(0, 280) : '',
      },
    },
    { status: 501 },
  );
}
