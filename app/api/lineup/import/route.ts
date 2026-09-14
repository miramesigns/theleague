import { NextResponse } from 'next/server.js';

import { getMflSessionCookieValue } from '@/lib/mfl-session';

export const dynamic = 'force-dynamic';

type ImportPayload = {
  confirmed?: boolean;
  lineup?: Record<string, string>;
};

export async function POST(request: Request) {
  const sessionCookieValue = await getMflSessionCookieValue();
  const payload = (await request.json().catch(() => null)) as ImportPayload | null;

  if (!sessionCookieValue) {
    return NextResponse.json({ ok: false, message: 'Login required before import can be queued.' }, { status: 401 });
  }

  if (!payload?.confirmed) {
    return NextResponse.json({ ok: false, message: 'Explicit confirmation required.' }, { status: 400 });
  }

  return NextResponse.json(
    {
      ok: false,
      message: 'Safe TODO stub: actual MFL lineup write is not enabled yet and still requires upstream session handling.',
      lineupSize: Object.keys(payload.lineup || {}).length,
    },
    { status: 501 }
  );
}
