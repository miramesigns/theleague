import { NextResponse } from 'next/server';
import { addSubscription } from '@/lib/push-subscription-store';
import { getMflSessionCookieValue } from '@/lib/mfl-session';
import { resolvePrimaryFranchiseId } from '@/lib/mfl-scores';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const sessionCookieValue = await getMflSessionCookieValue();
  if (!sessionCookieValue) {
    return NextResponse.json({ ok: false, message: 'Sign in required.' }, { status: 401 });
  }

  const resolution = await resolvePrimaryFranchiseId(sessionCookieValue);
  if (!resolution) {
    return NextResponse.json({ ok: false, message: 'Franchise could not be identified.' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    endpoint?: string;
    expirationTime?: number | null;
    keys?: { p256dh?: string; auth?: string };
    categories?: string[];
  } | null;

  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ ok: false, message: 'Invalid subscription payload.' }, { status: 400 });
  }

  const categories = (body.categories ?? ['scores', 'lineup', 'waiver', 'trade', 'league']).filter(
    (c): c is 'scores' | 'lineup' | 'waiver' | 'trade' | 'league' =>
      ['scores', 'lineup', 'waiver', 'trade', 'league'].includes(c),
  );

  addSubscription(resolution.franchiseId, {
    endpoint: body.endpoint,
    expirationTime: body.expirationTime ?? null,
    keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    categories,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
