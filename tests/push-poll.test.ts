import assert from 'node:assert/strict';
import test from 'node:test';

import type { LeagueNotification } from '../lib/mfl-notifications.ts';
import {
  filterNotificationsForPush,
  mapNotificationCategoryToPush,
  notificationAffectsFranchise,
  notificationToPushPayload,
} from '../lib/push-poll.ts';

function note(partial: Partial<LeagueNotification> & Pick<LeagueNotification, 'id' | 'category'>): LeagueNotification {
  return {
    title: partial.title ?? 'Title',
    body: partial.body ?? 'Body',
    timestamp: partial.timestamp ?? 1_789_000_000,
    timeLabel: partial.timeLabel ?? 'now',
    href: partial.href ?? '/trades',
    franchiseIds: partial.franchiseIds ?? [],
    ...partial,
  };
}

test('mapNotificationCategoryToPush maps score to scores', () => {
  assert.equal(mapNotificationCategoryToPush('score'), 'scores');
  assert.equal(mapNotificationCategoryToPush('trade'), 'trade');
  assert.equal(mapNotificationCategoryToPush('waiver'), 'waiver');
});

test('notificationToPushPayload maps event fields for Web Push', () => {
  const payload = notificationToPushPayload(
    note({
      id: 'pending-trade-1',
      category: 'trade',
      title: 'Trade proposal',
      body: 'Shadow offers Alpha to Primary',
      href: '/trades',
    }),
  );

  assert.deepEqual(payload, {
    title: 'Trade proposal',
    body: 'Shadow offers Alpha to Primary',
    href: '/trades',
    tag: 'trade-pending-trade-1',
  });
});

test('filterNotificationsForPush dedupes, respects lookback, and keeps pending trades', () => {
  const now = 1_789_100_000;
  const subscribed = new Set(['0004']);

  const filtered = filterNotificationsForPush({
    notifications: [
      note({ id: 'already', category: 'waiver', franchiseIds: ['0004'], timestamp: now - 60 }),
      note({ id: 'too-old', category: 'waiver', franchiseIds: ['0004'], timestamp: now - 10_000 }),
      note({ id: 'fresh', category: 'waiver', franchiseIds: ['0004'], timestamp: now - 60 }),
      note({
        id: 'pending-trade-99',
        category: 'trade',
        franchiseIds: ['0004'],
        timestamp: now - 50_000,
      }),
      note({ id: 'other-team', category: 'waiver', franchiseIds: ['0008'], timestamp: now - 60 }),
      note({ id: 'league-wide', category: 'lineup', franchiseIds: [], timestamp: now - 60 }),
    ],
    subscribedFranchiseIds: subscribed,
    alreadySentIds: new Set(['already']),
    nowSeconds: now,
    lookbackSeconds: 3600,
  });

  const ids = filtered.map((n) => n.id).sort();
  assert.deepEqual(ids, ['fresh', 'league-wide', 'pending-trade-99']);
});

test('notificationAffectsFranchise treats empty franchiseIds as league-wide', () => {
  assert.equal(notificationAffectsFranchise(note({ id: 'a', category: 'lineup', franchiseIds: [] }), '0004'), true);
  assert.equal(
    notificationAffectsFranchise(note({ id: 'b', category: 'trade', franchiseIds: ['0004'] }), '0004'),
    true,
  );
  assert.equal(
    notificationAffectsFranchise(note({ id: 'c', category: 'trade', franchiseIds: ['0008'] }), '0004'),
    false,
  );
});
