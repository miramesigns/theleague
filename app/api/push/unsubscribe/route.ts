import { NextResponse } from 'next/server';
import { removeSubscription } from '@/lib/push-subscription-store';
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

  const body = (await request.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) {
    return NextResponse.json({ ok: false, message: 'Endpoint required.' }, { status: 400 });
  }

  removeSubscription(resolution.franchiseId, body.endpoint);
  return NextResponse.json({ ok: true });
}
