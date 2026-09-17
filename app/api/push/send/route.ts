import { NextResponse } from 'next/server';

import { hasValidCronAuthorization } from '@/lib/access-control';
import { getMflSessionCookieValue } from '@/lib/mfl-session';
import { getAllSubscriptions, removeSubscription, sendPush } from '@/lib/push-subscription-store';

export const dynamic = 'force-dynamic';

/**
 * Manual / relay push. Prefer `/api/push/poll` for cron discovery of MFL events.
 * Auth: Bearer CRON_SECRET, or signed-in session with an explicit title (test push).
 */
export async function POST(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  const isCron = hasValidCronAuthorization(auth);

  const body = (await request.json().catch(() => null)) as {
    title?: string;
    body?: string;
    href?: string;
    category?: string;
    tag?: string;
    id?: string;
  } | null;

  if (!isCron) {
    const session = await getMflSessionCookieValue();
    if (!session || !body?.title?.trim()) {
      return NextResponse.json({ ok: false, message: 'Unauthorized or invalid payload.' }, { status: 401 });
    }
  }

  let subscriptions;
  try {
    subscriptions = await getAllSubscriptions();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Push store unavailable.';
    return NextResponse.json({ ok: false, message }, { status: 503 });
  }

  if (subscriptions.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No subscriptions.' });
  }

  const payload = {
    title: body?.title ?? 'MFL League Companion',
    body: body?.body ?? '',
    href: body?.href ?? '/scores',
    tag: body?.tag ?? 'mfl',
  };

  let sent = 0;
  const expired: { franchiseId: string; endpoint: string }[] = [];

  for (const record of subscriptions) {
    const matchCategory = !body?.category || record.subscription.categories.includes(body.category as never);
    if (!matchCategory) continue;

    const result = await sendPush(
      {
        endpoint: record.subscription.endpoint,
        expirationTime: record.subscription.expirationTime,
        keys: record.subscription.keys,
      },
      payload,
    );

    if (result.ok) {
      sent += 1;
    } else if (result.error === 'expired') {
      expired.push({ franchiseId: record.franchiseId, endpoint: record.subscription.endpoint });
    }
  }

  for (const item of expired) {
    await removeSubscription(item.franchiseId, item.endpoint);
  }

  return NextResponse.json({ ok: true, sent, expired: expired.length });
}
