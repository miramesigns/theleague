import webpush from 'web-push';

export type PushCategory = 'scores' | 'lineup' | 'waiver' | 'trade' | 'league';

export type PushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  categories: PushCategory[];
  createdAt: string;
};

export type PushSubscriptionRecord = {
  franchiseId: string;
  subscription: PushSubscription;
};

// v0: in-memory store. Production should use Redis/Postgres.
const store = new Map<string, PushSubscription[]>();

export function getVapidPublicKey(): string {
  const key = process.env.VAPID_PUBLIC_KEY?.trim();
  if (!key) throw new Error('VAPID_PUBLIC_KEY is not configured');
  return key;
}

export function configureWebPush(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@localsignalapp.com';
  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys are not configured');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export function addSubscription(franchiseId: string, subscription: PushSubscription): void {
  const existing = store.get(franchiseId) ?? [];
  const filtered = existing.filter((s) => s.endpoint !== subscription.endpoint);
  filtered.push(subscription);
  store.set(franchiseId, filtered);
}

export function removeSubscription(franchiseId: string, endpoint: string): void {
  const existing = store.get(franchiseId) ?? [];
  store.set(
    franchiseId,
    existing.filter((s) => s.endpoint !== endpoint),
  );
}

export function getSubscriptions(franchiseId: string): PushSubscription[] {
  return store.get(franchiseId) ?? [];
}

export function getAllSubscriptions(): PushSubscriptionRecord[] {
  const result: PushSubscriptionRecord[] = [];
  for (const [franchiseId, subscriptions] of store.entries()) {
    for (const subscription of subscriptions) {
      result.push({ franchiseId, subscription });
    }
  }
  return result;
}

// Test-only: reset the in-memory store
export function clearSubscriptions(): void {
  store.clear();
}

export async function sendPush(
  subscription: webpush.PushSubscription,
  payload: { title: string; body: string; href: string; tag?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    configureWebPush();
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('410') || message.includes('unsubscribed') || message.includes('NotRegistered')) {
      return { ok: false, error: 'expired' };
    }
    return { ok: false, error: message };
  }
}
