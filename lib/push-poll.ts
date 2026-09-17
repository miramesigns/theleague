import type { LeagueNotification, NotificationCategory } from './mfl-notifications.ts';
import {
  buildPushCandidateNotifications,
  loadPushPollSourcePayloads,
} from './mfl-notifications.ts';
import { loginMflFromEnv } from './mfl-server-auth.ts';
import {
  getAllSubscriptions,
  hasSentNotification,
  isPushPollBootstrapped,
  markPushPollBootstrapped,
  markSentNotifications,
  removeSubscription,
  sendPush,
  type PushCategory,
  type PushSubscriptionRecord,
} from './push-subscription-store.ts';

export const DEFAULT_PUSH_LOOKBACK_SECONDS = 60 * 60 * 2; // 2 hours

export function mapNotificationCategoryToPush(category: NotificationCategory): PushCategory {
  return category === 'score' ? 'scores' : category;
}

export function notificationToPushPayload(notification: LeagueNotification): {
  title: string;
  body: string;
  href: string;
  tag: string;
} {
  return {
    title: notification.title,
    body: notification.body,
    href: notification.href,
    tag: `${notification.category}-${notification.id}`,
  };
}

export function notificationAffectsFranchise(
  notification: LeagueNotification,
  franchiseId: string,
): boolean {
  if (!notification.franchiseIds.length) return true;
  return notification.franchiseIds.includes(franchiseId);
}

export function filterNotificationsForPush(args: {
  notifications: LeagueNotification[];
  subscribedFranchiseIds: ReadonlySet<string>;
  alreadySentIds: ReadonlySet<string>;
  nowSeconds?: number;
  lookbackSeconds?: number;
}): LeagueNotification[] {
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const lookback = args.lookbackSeconds ?? DEFAULT_PUSH_LOOKBACK_SECONDS;
  const cutoff = now - lookback;

  return args.notifications.filter((notification) => {
    if (args.alreadySentIds.has(notification.id)) return false;

    // Pending trade proposals stay active until first delivery (no lookback trim).
    const isPendingTrade = notification.id.startsWith('pending-trade-');
    if (!isPendingTrade && notification.timestamp > 0 && notification.timestamp < cutoff) {
      return false;
    }

    if (!notification.franchiseIds.length) {
      return args.subscribedFranchiseIds.size > 0;
    }

    return notification.franchiseIds.some((id) => args.subscribedFranchiseIds.has(id));
  });
}

function subscriptionWantsCategory(record: PushSubscriptionRecord, category: PushCategory): boolean {
  return record.subscription.categories.includes(category);
}

export type PushPollResult = {
  ok: boolean;
  message: string;
  bootstrapped?: boolean;
  candidates?: number;
  delivered?: number;
  expired?: number;
  skippedSent?: number;
  status?: number;
};

export async function runPushPoll(): Promise<PushPollResult> {
  const login = await loginMflFromEnv();
  if (!login.ok) {
    return { ok: false, message: login.message, status: login.status };
  }

  let subscriptions: PushSubscriptionRecord[];
  try {
    subscriptions = await getAllSubscriptions();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message, status: 503 };
  }

  if (subscriptions.length === 0) {
    return { ok: true, message: 'No push subscriptions.', delivered: 0 };
  }

  const sources = await loadPushPollSourcePayloads(login.sessionCookieValue);
  if (!sources.ok) {
    return { ok: false, message: sources.message || 'MFL export load failed.', status: 502 };
  }

  const candidates = buildPushCandidateNotifications({
    transactions: sources.transactions,
    players: sources.players,
    league: sources.league,
    liveScoring: sources.liveScoring,
    pendingTrades: sources.pendingTrades,
    includeScores: true,
  });

  const subscribedFranchiseIds = new Set(subscriptions.map((s) => s.franchiseId));

  // First poll after deploy: seed dedupe without spamming historical events.
  if (!(await isPushPollBootstrapped())) {
    await markSentNotifications(candidates.map((n) => n.id));
    await markPushPollBootstrapped();
    return {
      ok: true,
      message: 'Push poll bootstrapped; historical events marked sent without delivery.',
      bootstrapped: true,
      candidates: candidates.length,
      delivered: 0,
    };
  }

  const alreadySentIds = new Set<string>();
  for (const notification of candidates) {
    if (await hasSentNotification(notification.id)) {
      alreadySentIds.add(notification.id);
    }
  }

  const lookbackRaw = Number.parseInt(process.env.PUSH_POLL_LOOKBACK_SECONDS?.trim() || '', 10);
  const lookbackSeconds = Number.isFinite(lookbackRaw) && lookbackRaw > 0 ? lookbackRaw : DEFAULT_PUSH_LOOKBACK_SECONDS;

  const toSend = filterNotificationsForPush({
    notifications: candidates,
    subscribedFranchiseIds,
    alreadySentIds,
    lookbackSeconds,
  });

  let delivered = 0;
  let expired = 0;
  const sentNow: string[] = [];

  for (const notification of toSend) {
    const pushCategory = mapNotificationCategoryToPush(notification.category);
    const payload = notificationToPushPayload(notification);
    const targets = subscriptions.filter(
      (record) =>
        notificationAffectsFranchise(notification, record.franchiseId) &&
        subscriptionWantsCategory(record, pushCategory),
    );

    if (targets.length === 0) {
      // Still mark sent so we don't re-check forever when prefs exclude the category.
      sentNow.push(notification.id);
      continue;
    }

    for (const record of targets) {
      const result = await sendPush(
        {
          endpoint: record.subscription.endpoint,
          expirationTime: record.subscription.expirationTime,
          keys: record.subscription.keys,
        },
        payload,
      );

      if (result.ok) {
        delivered += 1;
      } else if (result.error === 'expired') {
        expired += 1;
        await removeSubscription(record.franchiseId, record.subscription.endpoint);
      }
    }

    sentNow.push(notification.id);
  }

  if (sentNow.length > 0) {
    await markSentNotifications(sentNow);
  }

  return {
    ok: true,
    message: 'Push poll complete.',
    candidates: candidates.length,
    delivered,
    expired,
    skippedSent: alreadySentIds.size,
  };
}
