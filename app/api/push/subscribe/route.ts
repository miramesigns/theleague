import { NextResponse } from 'next/server';

import { addSubscription } from '@/lib/push-subscription-store';
import { getMflSessionCookieValue } from '@/lib/mfl-session';
import { resolvePrimaryFranchiseId } from '@/lib/mfl-scores';

export const dynamic = 'force-dynamic';

function deriveExpectedOrigin(request: Request): string | null {
  const headers = request.headers;
  const requestUrl = new URL(request.url);
  const host = headers.get('x-forwarded-host') || headers.get('host') || requestUrl.host;
  if (!host) return null;

  const proto = headers.get('x-forwarded-proto') || requestUrl.protocol.replace(':', '') || 'https';
  return `${proto}://${host}`;
}

export async function POST(request: Request) {
  const expectedOrigin = deriveExpectedOrigin(request);
  const origin = request.headers.get('origin');
  if (!expectedOrigin || !origin || origin !== expectedOrigin) {
    return NextResponse.json({ ok: false, message: 'Request origin is not allowed.' }, { status: 403 });
  }

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

  try {
    await addSubscription(resolution.franchiseId, {
      endpoint: body.endpoint,
      expirationTime: body.expirationTime ?? null,
      keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
      categories,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not save subscription.';
    return NextResponse.json({ ok: false, message }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
