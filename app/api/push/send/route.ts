import { NextResponse } from 'next/server';
import { getAllSubscriptions, sendPush } from '@/lib/push-subscription-store';

export const dynamic = 'force-dynamic';

const sentIds = new Set<string>();

export async function POST(request: Request) {
  const auth = request.headers.get('authorization') ?? '';
  const cronSecret = process.env.CRON_SECRET?.trim();
  const isCron = auth === `Bearer ${cronSecret}`;
  const body = (await request.json().catch(() => null)) as {
    title?: string;
    body?: string;
    href?: string;
    category?: string;
    tag?: string;
    id?: string;
  } | null;

  // Allow manual test pushes without secret; cron/deduped pushes require secret
  if (!body?.title && !isCron) {
    return NextResponse.json({ ok: false, message: 'Unauthorized or invalid payload.' }, { status: 401 });
  }

  const subscriptions = getAllSubscriptions();
  if (subscriptions.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: 'No subscriptions.' });
  }

  const dedupeId = body?.id ?? `${body?.tag ?? 'manual'}-${Date.now()}`;
  if (isCron && sentIds.has(dedupeId)) {
    return NextResponse.json({ ok: true, sent: 0, message: 'Already sent.' });
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
    const { removeSubscription } = await import('@/lib/push-subscription-store');
    removeSubscription(item.franchiseId, item.endpoint);
  }

  if (isCron) {
    sentIds.add(dedupeId);
    // Keep set bounded
    if (sentIds.size > 5000) {
      const toDelete = [...sentIds].slice(0, sentIds.size - 4000);
      for (const id of toDelete) sentIds.delete(id);
    }
  }

  return NextResponse.json({ ok: true, sent, expired: expired.length });
}
