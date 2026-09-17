import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNotificationsFromTransactions,
  buildPendingTradeNotifications,
  parseNotificationsPageState,
} from '../lib/mfl-notifications.ts';

test('buildNotificationsFromTransactions surfaces waivers, trades, and locks', () => {
  const notifications = buildNotificationsFromTransactions(
    {
      transactions: {
        transaction: [
          { type: 'LOCK_ALL_PLAYERS', franchise: '', timestamp: '1789318800', transaction: '' },
          {
            type: 'TRADE',
            franchise: '0008',
            franchise2: '0001',
            franchise1_gave_up: '11671,',
            franchise2_gave_up: '12801,',
            timestamp: '1788666698',
          },
          {
            type: 'BBID_WAIVER',
            franchise: '0008',
            timestamp: '1788956739',
            transaction: '17509,|1300000|',
          },
          {
            type: 'IR',
            franchise: '0004',
            timestamp: '1788956800',
            activated: '11671',
            deactivated: '',
          },
        ],
      },
    },
    {
      players: {
        player: [
          { id: '11671', name: 'Alpha, One' },
          { id: '12801', name: 'Beta, Two' },
          { id: '17509', name: 'Gamma, Three' },
        ],
      },
    },
    {
      league: {
        franchises: {
          franchise: [
            { id: '0008', name: 'Shadow' },
            { id: '0001', name: 'Hitmen' },
            { id: '0004', name: 'Primary' },
          ],
        },
      },
    },
  );

  assert.equal(notifications.some((entry) => entry.category === 'lineup'), true);
  assert.equal(notifications.some((entry) => entry.category === 'trade'), true);
  assert.equal(notifications.some((entry) => entry.category === 'waiver'), true);
  assert.equal(notifications.some((entry) => entry.category === 'league'), true);

  const trade = notifications.find((entry) => entry.category === 'trade');
  assert.ok(trade);
  assert.deepEqual(trade.franchiseIds.sort(), ['0001', '0008']);

  const lock = notifications.find((entry) => entry.category === 'lineup');
  assert.ok(lock);
  assert.deepEqual(lock.franchiseIds, []);
});

test('buildPendingTradeNotifications targets receiver and offerer', () => {
  const notifications = buildPendingTradeNotifications(
    {
      pendingTrades: {
        pendingTrade: {
          trade_id: '1587',
          timestamp: '1789000000',
          offeringteam: '0008',
          offeredto: '0004',
          franchise1_gave_up: '11671,',
          franchise2_gave_up: '12801,',
        },
      },
    },
    {
      players: {
        player: [
          { id: '11671', name: 'Alpha, One' },
          { id: '12801', name: 'Beta, Two' },
        ],
      },
    },
    {
      league: {
        franchises: {
          franchise: [
            { id: '0008', name: 'Shadow' },
            { id: '0004', name: 'Primary' },
          ],
        },
      },
    },
  );

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].category, 'trade');
  assert.equal(notifications[0].title, 'Trade proposal');
  assert.equal(notifications[0].id, 'pending-trade-1587');
  assert.ok(notifications[0].franchiseIds.includes('0004'));
  assert.ok(notifications[0].franchiseIds.includes('0008'));
  assert.match(notifications[0].body, /offers/);
});

test('parseNotificationsPageState returns empty-friendly messaging', () => {
  const state = parseNotificationsPageState({
    transactions: { transactions: { transaction: [] } },
    players: { players: { player: [] } },
    league: { league: { franchises: { franchise: [] } } },
    liveScoring: null,
    primaryFranchiseId: '0004',
  });

  assert.equal(state.ok, false);
  assert.match(state.message, /No recent league activity/);
  assert.equal(state.pushDraftAvailable, true);
});
