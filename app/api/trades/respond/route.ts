import { NextResponse } from 'next/server.js';

import { getMflSessionCookieValue } from '@/lib/mfl-session';

export const dynamic = 'force-dynamic';

type RespondPayload = {
  confirmed?: boolean;
  action?: 'accept' | 'decline';
  tradeId?: string;
  franchiseId?: string;
  partnerFranchiseId?: string;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function POST(request: Request) {
  const sessionCookieValue = await getMflSessionCookieValue();
  if (!sessionCookieValue) {
    return NextResponse.json({ ok: false, message: 'Login required before a trade response can be queued.' }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as RespondPayload | null;
  if (!isPlainRecord(payload)) {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 });
  }

  if (!payload.confirmed) {
    return NextResponse.json({ ok: false, message: 'Explicit confirmation required.' }, { status: 400 });
  }

  const action = payload.action === 'accept' || payload.action === 'decline' ? payload.action : null;
  if (!action) {
    return NextResponse.json({ ok: false, message: 'Action must be accept or decline.' }, { status: 400 });
  }

  const tradeId = typeof payload.tradeId === 'string' ? payload.tradeId.trim() : '';
  if (!tradeId) {
    return NextResponse.json({ ok: false, message: 'A pending trade id is required.' }, { status: 400 });
  }

  return NextResponse.json(
    {
      ok: false,
      message: `Safe TODO stub: live MFL trade ${action} is not enabled yet. Response was accepted locally and still requires ask-before-send confirmation before any future write.`,
      draft: {
        action,
        tradeId,
        franchiseId: typeof payload.franchiseId === 'string' ? payload.franchiseId : '',
        partnerFranchiseId: typeof payload.partnerFranchiseId === 'string' ? payload.partnerFranchiseId : '',
      },
    },
    { status: 501 },
  );
}
