import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildNotificationsFromTransactions,
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
          ],
        },
      },
    },
  );

  assert.equal(notifications.some((entry) => entry.category === 'lineup'), true);
  assert.equal(notifications.some((entry) => entry.category === 'trade'), true);
  assert.equal(notifications.some((entry) => entry.category === 'waiver'), true);
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
