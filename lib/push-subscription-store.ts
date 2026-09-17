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

type StoreBackend = 'memory' | 'upstash' | 'supabase';

const MEMORY_SUBS = new Map<string, PushSubscription[]>();
const MEMORY_SENT = new Set<string>();
let memoryBootstrapped = false;

const UPSTASH_SUB_PREFIX = 'push:subs:';
const UPSTASH_FRANCHISE_INDEX = 'push:franchises';
const UPSTASH_SENT_PREFIX = 'push:sent:';
const UPSTASH_BOOTSTRAP_KEY = 'push:bootstrapped';
const SENT_TTL_SECONDS = 60 * 60 * 24 * 21; // 21 days

function trimEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

export function resolvePushStoreBackend(): StoreBackend {
  if (trimEnv('UPSTASH_REDIS_REST_URL') && trimEnv('UPSTASH_REDIS_REST_TOKEN')) {
    return 'upstash';
  }
  const supabaseUrl = trimEnv('SUPABASE_URL') || trimEnv('NEXT_PUBLIC_SUPABASE_URL');
  if (supabaseUrl && trimEnv('SUPABASE_SERVICE_ROLE_KEY')) {
    return 'supabase';
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Push store requires UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  return 'memory';
}

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

function normalizeSubscription(subscription: PushSubscription): PushSubscription {
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    categories: [...subscription.categories],
    createdAt: subscription.createdAt,
  };
}

function upsertLocal(franchiseId: string, subscription: PushSubscription): void {
  const existing = MEMORY_SUBS.get(franchiseId) ?? [];
  const filtered = existing.filter((s) => s.endpoint !== subscription.endpoint);
  filtered.push(normalizeSubscription(subscription));
  MEMORY_SUBS.set(franchiseId, filtered);
}

function removeLocal(franchiseId: string, endpoint: string): void {
  const existing = MEMORY_SUBS.get(franchiseId) ?? [];
  MEMORY_SUBS.set(
    franchiseId,
    existing.filter((s) => s.endpoint !== endpoint),
  );
}

async function upstashCommand(command: unknown[]): Promise<unknown> {
  const url = trimEnv('UPSTASH_REDIS_REST_URL');
  const token = trimEnv('UPSTASH_REDIS_REST_TOKEN');
  if (!url || !token) throw new Error('Upstash Redis is not configured');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Upstash command failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as { result?: unknown; error?: string };
  if (payload.error) throw new Error(`Upstash error: ${payload.error}`);
  return payload.result;
}

async function upstashGetSubscriptions(franchiseId: string): Promise<PushSubscription[]> {
  const raw = await upstashCommand(['GET', `${UPSTASH_SUB_PREFIX}${franchiseId}`]);
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw) as PushSubscription[];
    return Array.isArray(parsed) ? parsed.map(normalizeSubscription) : [];
  } catch {
    return [];
  }
}

async function upstashSetSubscriptions(franchiseId: string, subscriptions: PushSubscription[]): Promise<void> {
  if (subscriptions.length === 0) {
    await upstashCommand(['DEL', `${UPSTASH_SUB_PREFIX}${franchiseId}`]);
    await upstashCommand(['SREM', UPSTASH_FRANCHISE_INDEX, franchiseId]);
    return;
  }
  await upstashCommand(['SET', `${UPSTASH_SUB_PREFIX}${franchiseId}`, JSON.stringify(subscriptions)]);
  await upstashCommand(['SADD', UPSTASH_FRANCHISE_INDEX, franchiseId]);
}

function supabaseConfig(): { url: string; key: string } {
  const url = trimEnv('SUPABASE_URL') || trimEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = trimEnv('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Supabase is not configured');
  return { url: url.replace(/\/$/, ''), key };
}

type SupabaseSubRow = {
  franchise_id: string;
  endpoint: string;
  expiration_time: number | null;
  p256dh: string;
  auth: string;
  categories: string[];
  created_at: string;
};

function rowToSubscription(row: SupabaseSubRow): PushSubscription {
  return normalizeSubscription({
    endpoint: row.endpoint,
    expirationTime: row.expiration_time,
    keys: { p256dh: row.p256dh, auth: row.auth },
    categories: (row.categories ?? []).filter((c): c is PushCategory =>
      ['scores', 'lineup', 'waiver', 'trade', 'league'].includes(c),
    ),
    createdAt: row.created_at,
  });
}

async function supabaseRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, key } = supabaseConfig();
  const headers = new Headers(init.headers);
  headers.set('apikey', key);
  headers.set('Authorization', `Bearer ${key}`);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${url}/rest/v1/${path}`, { ...init, headers, cache: 'no-store' });
}

export async function addSubscription(franchiseId: string, subscription: PushSubscription): Promise<void> {
  const backend = resolvePushStoreBackend();
  const next = normalizeSubscription(subscription);

  if (backend === 'memory') {
    upsertLocal(franchiseId, next);
    return;
  }

  if (backend === 'upstash') {
    const existing = await upstashGetSubscriptions(franchiseId);
    const filtered = existing.filter((s) => s.endpoint !== next.endpoint);
    filtered.push(next);
    await upstashSetSubscriptions(franchiseId, filtered);
    return;
  }

  const response = await supabaseRequest('push_subscriptions?on_conflict=franchise_id,endpoint', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({
      franchise_id: franchiseId,
      endpoint: next.endpoint,
      expiration_time: next.expirationTime,
      p256dh: next.keys.p256dh,
      auth: next.keys.auth,
      categories: next.categories,
      created_at: next.createdAt,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase upsert failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}

export async function removeSubscription(franchiseId: string, endpoint: string): Promise<void> {
  const backend = resolvePushStoreBackend();

  if (backend === 'memory') {
    removeLocal(franchiseId, endpoint);
    return;
  }

  if (backend === 'upstash') {
    const existing = await upstashGetSubscriptions(franchiseId);
    await upstashSetSubscriptions(
      franchiseId,
      existing.filter((s) => s.endpoint !== endpoint),
    );
    return;
  }

  const response = await supabaseRequest(
    `push_subscriptions?franchise_id=eq.${encodeURIComponent(franchiseId)}&endpoint=eq.${encodeURIComponent(endpoint)}`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase delete failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}

export async function getSubscriptions(franchiseId: string): Promise<PushSubscription[]> {
  const backend = resolvePushStoreBackend();
  if (backend === 'memory') return MEMORY_SUBS.get(franchiseId) ?? [];
  if (backend === 'upstash') return upstashGetSubscriptions(franchiseId);

  const response = await supabaseRequest(
    `push_subscriptions?franchise_id=eq.${encodeURIComponent(franchiseId)}&select=*`,
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase select failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  const rows = (await response.json()) as SupabaseSubRow[];
  return rows.map(rowToSubscription);
}

export async function getAllSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const backend = resolvePushStoreBackend();

  if (backend === 'memory') {
    const result: PushSubscriptionRecord[] = [];
    for (const [franchiseId, subscriptions] of MEMORY_SUBS.entries()) {
      for (const subscription of subscriptions) {
        result.push({ franchiseId, subscription });
      }
    }
    return result;
  }

  if (backend === 'upstash') {
    const franchiseIds = (await upstashCommand(['SMEMBERS', UPSTASH_FRANCHISE_INDEX])) as string[] | null;
    const result: PushSubscriptionRecord[] = [];
    for (const franchiseId of franchiseIds ?? []) {
      for (const subscription of await upstashGetSubscriptions(franchiseId)) {
        result.push({ franchiseId, subscription });
      }
    }
    return result;
  }

  const response = await supabaseRequest('push_subscriptions?select=*');
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase select-all failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  const rows = (await response.json()) as SupabaseSubRow[];
  return rows.map((row) => ({
    franchiseId: row.franchise_id,
    subscription: rowToSubscription(row),
  }));
}

export async function hasSentNotification(id: string): Promise<boolean> {
  const backend = resolvePushStoreBackend();
  if (backend === 'memory') return MEMORY_SENT.has(id);

  if (backend === 'upstash') {
    const result = await upstashCommand(['EXISTS', `${UPSTASH_SENT_PREFIX}${id}`]);
    return Number(result) === 1;
  }

  const response = await supabaseRequest(
    `push_sent_notifications?id=eq.${encodeURIComponent(id)}&select=id`,
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase sent lookup failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  const rows = (await response.json()) as { id: string }[];
  return rows.length > 0;
}

export async function markSentNotification(id: string): Promise<void> {
  const backend = resolvePushStoreBackend();
  if (backend === 'memory') {
    MEMORY_SENT.add(id);
    return;
  }

  if (backend === 'upstash') {
    await upstashCommand(['SET', `${UPSTASH_SENT_PREFIX}${id}`, '1', 'EX', String(SENT_TTL_SECONDS)]);
    return;
  }

  const response = await supabaseRequest('push_sent_notifications?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ id, sent_at: new Date().toISOString() }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase sent insert failed (${response.status}): ${detail.slice(0, 200)}`);
  }
}

export async function markSentNotifications(ids: string[]): Promise<void> {
  for (const id of ids) {
    await markSentNotification(id);
  }
}

export async function isPushPollBootstrapped(): Promise<boolean> {
  const backend = resolvePushStoreBackend();
  if (backend === 'memory') return memoryBootstrapped;

  if (backend === 'upstash') {
    const result = await upstashCommand(['EXISTS', UPSTASH_BOOTSTRAP_KEY]);
    return Number(result) === 1;
  }

  const response = await supabaseRequest(
    `push_sent_notifications?id=eq.${encodeURIComponent('__bootstrap__')}&select=id`,
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Supabase bootstrap lookup failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  const rows = (await response.json()) as { id: string }[];
  return rows.length > 0;
}

export async function markPushPollBootstrapped(): Promise<void> {
  const backend = resolvePushStoreBackend();
  if (backend === 'memory') {
    memoryBootstrapped = true;
    return;
  }

  if (backend === 'upstash') {
    await upstashCommand(['SET', UPSTASH_BOOTSTRAP_KEY, '1']);
    return;
  }

  await markSentNotification('__bootstrap__');
}

/** Test-only: reset the in-memory store */
export function clearSubscriptions(): void {
  MEMORY_SUBS.clear();
  MEMORY_SENT.clear();
  memoryBootstrapped = false;
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
