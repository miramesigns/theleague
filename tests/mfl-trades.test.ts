import assert from 'node:assert/strict';
import test from 'node:test';

import {
  amendDraftFromPendingTrade,
  counterDraftFromPendingTrade,
  franchiseDisplayLabel,
  isIncomingPendingTrade,
  isOutgoingPendingTrade,
  parseCompletedTrades,
  parsePendingTrades,
  parseTradeBait,
  parseTradesPageState,
} from '../lib/mfl-trades.ts';

test('parseCompletedTrades maps franchise swaps and pick assets', () => {
  const trades = parseCompletedTrades(
    {
      transactions: {
        transaction: [{
          type: 'TRADE',
          franchise: '0008',
          franchise2: '0001',
          franchise1_gave_up: '11671,',
          franchise2_gave_up: '12801,FP_0001_2027_3,',
          timestamp: '1788666698',
          expires: '1789257600',
          by_commish: '1',
        }],
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
    new Map([['0008', 'Shadow'], ['0001', "P.O.T.'s Hitmen"]]),
  );

  assert.equal(trades.length, 1);
  assert.equal(trades[0].offered[0].label, 'Alpha, One');
  assert.equal(trades[0].requested[1].kind, 'futurePick');
  assert.match(trades[0].summary, /Shadow traded/);
});

test('parsePendingTrades tolerates empty and error payloads', () => {
  assert.deepEqual(parsePendingTrades({ error: { $t: 'API requires logged in user' } }, {}, new Map()), []);
  const pending = parsePendingTrades(
    {
      pendingTrades: {
        pendingTrade: [{
          franchise: '0004',
          franchise2: '0005',
          franchise1_gave_up: '100,',
          franchise2_gave_up: '200,',
          timestamp: '100',
        }],
      },
    },
    { players: { player: [{ id: '100', name: 'A' }, { id: '200', name: 'B' }] } },
    new Map([['0004', 'Me'], ['0005', 'Them']]),
  );
  assert.equal(pending[0].status, 'pending');
  assert.equal(pending[0].offered[0].label, 'A');
});

test('parsePendingTrades maps live MFL offeringteam/offeredto keys to giver/receiver names', () => {
  // Captured 2026-09-17 from MFL pendingTrades for league 35743 (trade_id 1587).
  const pending = parsePendingTrades(
    {
      pendingTrades: {
        pendingTrade: {
          timestamp: '1789614470',
          expires: '1790218800',
          will_give_up: '16287,16788,',
          offeredto: '0004',
          will_receive: '15751,',
          comments: '',
          offeringteam: '0005',
          description:
            '🏆 🏆 🏆 🏆 🏆 🏆 🏆  proposed a trade to The Ashy Elbows: … Tucker, Tre; Vele, Devaughn for London, Drake',
          trade_id: '1587',
        },
      },
    },
    {
      players: {
        player: [
          { id: '16287', name: 'Tucker, Tre' },
          { id: '16788', name: 'Vele, Devaughn' },
          { id: '15751', name: 'London, Drake' },
        ],
      },
    },
    new Map([
      ['0004', 'The Ashy Elbows'],
      ['0005', '🏆 🏆 🏆 🏆 🏆 🏆 🏆'],
    ]),
  );

  assert.equal(pending.length, 1);
  assert.equal(pending[0].franchiseId, '0005');
  assert.equal(pending[0].partnerId, '0004');
  assert.equal(pending[0].franchiseName, '🏆 🏆 🏆 🏆 🏆 🏆 🏆');
  assert.equal(pending[0].partnerName, 'The Ashy Elbows');
  assert.equal(pending[0].id, 'pending-1587');
  assert.equal(pending[0].mflTradeId, '1587');
  assert.equal(pending[0].offered.map((a) => a.label).join(' • '), 'Tucker, Tre • Vele, Devaughn');
  assert.equal(pending[0].requested[0].label, 'London, Drake');
  assert.doesNotMatch(pending[0].franchiseName, /Unknown/i);
  assert.doesNotMatch(pending[0].partnerName, /Unknown/i);
});

test('parsePendingTrades reads franchise ids from @attributes wrappers', () => {
  const pending = parsePendingTrades(
    {
      pendingTrades: {
        pendingTrade: [{
          '@attributes': {
            offeringteam: '5',
            offeredto: '4',
            timestamp: '100',
            expires: '200',
            trade_id: '99',
          },
          will_give_up: '16287,16788,',
          will_receive: '15751,',
        }],
      },
    },
    {
      players: {
        player: [
          { id: '16287', name: 'Tucker, Tre' },
          { id: '16788', name: 'Vele, Devaughn' },
          { id: '15751', name: 'London, Drake' },
        ],
      },
    },
    new Map([
      ['0004', 'The Ashy Elbows'],
      ['0005', '🏆 🏆 🏆 🏆 🏆 🏆 🏆'],
    ]),
  );

  assert.equal(pending[0].franchiseId, '0005');
  assert.equal(pending[0].partnerId, '0004');
  assert.equal(pending[0].franchiseName, '🏆 🏆 🏆 🏆 🏆 🏆 🏆');
  assert.equal(pending[0].partnerName, 'The Ashy Elbows');
  assert.equal(pending[0].id, 'pending-99');
  assert.equal(pending[0].mflTradeId, '99');
  assert.equal(pending[0].offered.map((a) => a.label).join(' • '), 'Tucker, Tre • Vele, Devaughn');
  assert.equal(pending[0].requested[0].label, 'London, Drake');
});

test('parsePendingTrades never labels missing franchises as Franchise ?', () => {
  const pending = parsePendingTrades(
    {
      pendingTrades: {
        pendingTrade: [{
          franchise1_gave_up: '100,',
          franchise2_gave_up: '200,',
          timestamp: '1',
        }],
      },
    },
    { players: { player: [{ id: '100', name: 'A' }, { id: '200', name: 'B' }] } },
    new Map(),
  );
  assert.equal(pending[0].franchiseName, 'Unknown franchise');
  assert.equal(pending[0].partnerName, 'Unknown franchise');
  assert.doesNotMatch(pending[0].franchiseName, /\?/);
});

test('franchiseDisplayLabel falls back from emoji-only name to abbrev then Franchise id', () => {
  assert.equal(
    franchiseDisplayLabel({
      name: '🏆 🏆 🏆 🏆 🏆 🏆 🏆 ',
      abbrev: '3-Peat ',
      id: '0005',
    }),
    '3-Peat',
  );
  assert.equal(
    franchiseDisplayLabel({
      name: '🏆 🏆 🏆 🏆 🏆 🏆 🏆',
      abbrev: '',
      id: '0005',
    }),
    'Franchise 0005',
  );
  assert.equal(
    franchiseDisplayLabel({
      name: 'The Ashy Elbows',
      abbrev: 'Elbows',
      id: '0004',
    }),
    'The Ashy Elbows',
  );
  assert.doesNotMatch(
    franchiseDisplayLabel({
      name: '🏆 🏆 🏆 🏆 🏆 🏆 🏆',
      abbrev: '3-Peat',
      id: '0005',
    }),
    /Unknown/i,
  );
});

test('parseTradesPageState resolves pending offeringteam names via league franchise map', () => {
  const state = parseTradesPageState({
    authenticated: true,
    primaryFranchiseId: '0004',
    league: {
      league: {
        defaultTradeExpirationDays: '7',
        franchises: {
          franchise: [
            { id: '0004', name: 'The Ashy Elbows', abbrev: 'Elbows' },
            { id: '0005', name: '🏆 🏆 🏆 🏆 🏆 🏆 🏆', abbrev: '3-Peat' },
          ],
        },
      },
    },
    players: {
      players: {
        player: [
          { id: '16287', name: 'Tucker, Tre' },
          { id: '16788', name: 'Vele, Devaughn' },
          { id: '15751', name: 'London, Drake' },
        ],
      },
    },
    transactions: { transactions: { transaction: [] } },
    pendingTrades: {
      pendingTrades: {
        pendingTrade: {
          timestamp: '1789614470',
          expires: '1790218800',
          will_give_up: '16287,16788,',
          offeredto: '0004',
          will_receive: '15751,',
          offeringteam: '0005',
          trade_id: '1587',
        },
      },
    },
    tradeBait: null,
    roster: null,
  });

  assert.equal(state.ok, true);
  assert.equal(state.pending.length, 1);
  assert.equal(state.pending[0].franchiseId, '0005');
  assert.equal(state.pending[0].partnerId, '0004');
  // Emoji-only MFL names are not used as UI labels (mobile WebViews often mojibake them).
  assert.equal(state.pending[0].franchiseName, '3-Peat');
  assert.equal(state.pending[0].partnerName, 'The Ashy Elbows');
  assert.equal(state.pending[0].id, 'pending-1587');
  assert.equal(state.pending[0].mflTradeId, '1587');
  assert.equal(state.franchises.find((f) => f.id === '0005')?.name, '3-Peat');
  assert.doesNotMatch(state.pending[0].franchiseName, /Unknown/i);
  assert.doesNotMatch(state.pending[0].franchiseName, /🏆/);
});

test('counterDraftFromPendingTrade swaps assets for the primary franchise', () => {
  const draft = counterDraftFromPendingTrade(
    {
      id: 'pending-1',
      mflTradeId: '1',
      timestamp: 1,
      timeLabel: '',
      expiresAt: null,
      expiresLabel: null,
      franchiseId: '0005',
      franchiseName: 'Them',
      partnerId: '0004',
      partnerName: 'Me',
      offered: [{ kind: 'player', id: '16287', label: 'Tucker, Tre' }],
      requested: [{ kind: 'player', id: '15751', label: 'London, Drake' }],
      summary: '',
      status: 'pending',
      byCommish: false,
    },
    '0004',
  );
  assert.equal(draft.partnerId, '0005');
  assert.deepEqual(draft.offeringPlayerIds, ['16287']);
  assert.deepEqual(draft.requestingPlayerIds, ['15751']);
  assert.equal(draft.revokeTradeId, null);
});

test('amendDraftFromPendingTrade keeps same assets and revoke trade id', () => {
  const draft = amendDraftFromPendingTrade({
    id: 'pending-1587',
    mflTradeId: '1587',
    timestamp: 1,
    timeLabel: '',
    expiresAt: Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60,
    expiresLabel: null,
    franchiseId: '0005',
    franchiseName: 'Me',
    partnerId: '0004',
    partnerName: 'Them',
    offered: [{ kind: 'player', id: '16287', label: 'Tucker, Tre' }],
    requested: [{ kind: 'player', id: '15751', label: 'London, Drake' }],
    summary: '',
    status: 'pending',
    byCommish: false,
  });
  assert.equal(draft.partnerId, '0004');
  assert.deepEqual(draft.offeringPlayerIds, ['16287']);
  assert.deepEqual(draft.requestingPlayerIds, ['15751']);
  assert.equal(draft.revokeTradeId, '1587');
  assert.ok(draft.expiresDays !== null && draft.expiresDays >= 1);
});

test('incoming vs outgoing pending trade helpers', () => {
  const trade = {
    id: 'pending-1',
    mflTradeId: '1',
    timestamp: 1,
    timeLabel: '',
    expiresAt: null,
    expiresLabel: null,
    franchiseId: '0005',
    franchiseName: 'Them',
    partnerId: '0004',
    partnerName: 'Me',
    offered: [],
    requested: [],
    summary: '',
    status: 'pending' as const,
    byCommish: false,
  };
  assert.equal(isIncomingPendingTrade(trade, '0004'), true);
  assert.equal(isOutgoingPendingTrade(trade, '0004'), false);
  assert.equal(isOutgoingPendingTrade(trade, '0005'), true);
  assert.equal(isIncomingPendingTrade(trade, '0005'), false);
});

test('parseTradeBait handles empty bait boards', () => {
  assert.deepEqual(parseTradeBait({ tradeBaits: {} }, {}, new Map()), []);
});

test('parseTradesPageState keeps default expiration days from league', () => {
  const state = parseTradesPageState({
    authenticated: true,
    primaryFranchiseId: '0004',
    league: {
      league: {
        defaultTradeExpirationDays: '7',
        franchises: {
          franchise: [
            { id: '0004', name: 'The Ashy Elbows' },
            { id: '0005', name: 'Outlaw Joker' },
          ],
        },
      },
    },
    players: { players: { player: [] } },
    transactions: {
      transactions: {
        transaction: [{
          type: 'TRADE',
          franchise: '0004',
          franchise2: '0005',
          franchise1_gave_up: '1,',
          franchise2_gave_up: '2,',
          timestamp: '10',
        }],
      },
    },
    pendingTrades: null,
    tradeBait: { tradeBaits: {} },
    roster: null,
  });

  assert.equal(state.ok, true);
  assert.equal(state.defaultExpirationDays, 7);
  assert.equal(state.recent.length, 1);
  assert.equal(state.franchises.length, 2);
  assert.equal(state.valueCatalog, null);
});
