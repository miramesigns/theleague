import assert from 'node:assert/strict';
import test from 'node:test';

import {
  amendDraftFromPendingTrade,
  buildTradeDraftNameById,
  counterDraftFromPendingTrade,
  franchiseDisplayLabel,
  shortFranchiseLabel,
  isIncomingPendingTrade,
  isOutgoingPendingTrade,
  isPlaceholderPlayerLabel,
  resolveTradeDraftAssetLabel,
  tradeCardSides,
  parseCompletedTrades,
  parsePendingTrades,
  parseTradeBait,
  parseTradesPageState,
  parseFutureDraftPicksByFranchise,
  buildTradeOfferPool,
  buildTradeRequestPool,
} from '../lib/mfl-trades.ts';

import {
  formatFuturePickLabel,
  parseMflAssetToken,
  partitionTradePickerAssets,
  sortTradePickerAssets,
} from '../lib/mfl-assets.ts';

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

test('shortFranchiseLabel prefers abbrev and truncates long names', () => {
  assert.equal(
    shortFranchiseLabel({
      name: 'The Ashy Elbows',
      abbrev: 'Elbows',
      id: '0004',
    }),
    'Elbows',
  );
  assert.equal(
    shortFranchiseLabel({
      name: '🏆 🏆 🏆 🏆 🏆 🏆 🏆',
      abbrev: '3-Peat',
      id: '0005',
    }),
    '3-Peat',
  );
  assert.equal(
    shortFranchiseLabel({
      name: 'Alpha Wolves Forever',
      abbrev: null,
      id: '0001',
      maxLength: 10,
    }),
    'Alpha Wol…',
  );
  assert.equal(
    shortFranchiseLabel({
      name: 'Gas Factory',
      abbrev: 'U KNOW WHY IM HERE',
      id: '0007',
      maxLength: 10,
    }),
    'U KNOW WH…',
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

test('counterDraftFromPendingTrade prefills give/get as You offer / You request', () => {
  const draft = counterDraftFromPendingTrade(
    {
      id: 'pending-1',
      mflTradeId: '1',
      timestamp: 1,
      timeLabel: '',
      expiresAt: null,
      expiresLabel: null,
      franchiseId: '0005',
      franchiseName: 'Shadow',
      partnerId: '0004',
      partnerName: 'Me',
      // Shadow offers WRs; requests our TE
      offered: [
        { kind: 'player', id: '16187', label: 'Player 16187' },
        { kind: 'player', id: '17599', label: 'Player 17599' },
      ],
      requested: [{ kind: 'player', id: '17104', label: 'Loveland, Colston' }],
      summary: '',
      status: 'pending',
      byCommish: false,
    },
    '0004',
  );
  assert.equal(draft.partnerId, '0005');
  // Same terms as an outgoing offer from primary: offer what we'd give, request what we'd get.
  assert.deepEqual(draft.offeringPlayerIds, ['17104']);
  assert.deepEqual(draft.requestingPlayerIds, ['16187', '17599']);
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

test('resolveTradeDraftAssetLabel uses name map when id is missing from side pool', () => {
  const nameById = buildTradeDraftNameById({
    myRosterAssets: [{ kind: 'player', id: '99901', label: 'Loveland, Colston' }],
    rosterAssetsByFranchiseId: {
      '0005': [{ kind: 'player', id: '16187', label: 'Player 16187' }],
    },
    freeAgentAssets: [],
    valueCatalog: {
      settingsNote: '',
      byMflId: {
        '16187': { value: 1813, name: 'Odunze, Rome', fantasyCalcId: 1 },
        '17599': { value: 1784, name: 'Burden, Luther', fantasyCalcId: 2 },
        '17104': { value: 4521, name: 'Hunter, Travis', fantasyCalcId: 3 },
      },
    },
    pending: [
      {
        id: 'p1',
        mflTradeId: '1',
        timestamp: 1,
        timeLabel: '',
        expiresAt: null,
        expiresLabel: null,
        franchiseId: '0005',
        franchiseName: 'Shadow',
        partnerId: '0004',
        partnerName: 'Me',
        offered: [{ kind: 'player', id: '16187', label: 'Odunze, Rome' }],
        requested: [{ kind: 'player', id: '17104', label: 'Hunter, Travis' }],
        summary: '',
        status: 'pending',
        byCommish: false,
      },
    ],
  });

  assert.equal(isPlaceholderPlayerLabel('Player 16187', '16187'), true);
  assert.equal(isPlaceholderPlayerLabel('Odunze, Rome', '16187'), false);

  // Pool empty (counter prefill id not on this side) — still resolve from catalog / pending.
  assert.equal(resolveTradeDraftAssetLabel('16187', nameById, []), 'Odunze, Rome');
  assert.equal(resolveTradeDraftAssetLabel('17599', nameById, []), 'Burden, Luther');
  assert.equal(resolveTradeDraftAssetLabel('17104', nameById, []), 'Hunter, Travis');
  assert.equal(
    resolveTradeDraftAssetLabel('99901', nameById, [{ kind: 'player', id: '99901', label: 'Loveland, Colston' }]),
    'Loveland, Colston',
  );
  assert.equal(resolveTradeDraftAssetLabel('00000', nameById, []), 'Player 00000');
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

test('tradeCardSides uses You get / You give from primary perspective', () => {
  const trade = {
    franchiseId: '0005',
    franchiseName: '3-Peat',
    partnerId: '0004',
    partnerName: 'The Ashy Elbows',
    offered: [
      { kind: 'player' as const, id: '1', label: 'Nailor, Jalen' },
      { kind: 'player' as const, id: '2', label: 'Vele, Devaughn' },
      { kind: 'player' as const, id: '3', label: 'TeSlaa, Isaac' },
    ],
    requested: [{ kind: 'player' as const, id: '4', label: 'Odunze, Rome' }],
  };

  const incoming = tradeCardSides(trade, '0004');
  assert.equal(incoming.left.label, 'You get');
  assert.equal(incoming.right.label, 'You give');
  assert.equal(incoming.left.assets.map((a) => a.label).join(' • '), 'Nailor, Jalen • Vele, Devaughn • TeSlaa, Isaac');
  assert.equal(incoming.right.assets[0].label, 'Odunze, Rome');
  assert.equal(incoming.partnerTitle, 'from 3-Peat');
  assert.equal(incoming.partnerMeta, null);

  const outgoing = tradeCardSides(trade, '0005');
  assert.equal(outgoing.left.label, 'You get');
  assert.equal(outgoing.right.label, 'You give');
  assert.equal(outgoing.left.assets[0].label, 'Odunze, Rome');
  assert.equal(outgoing.right.assets.map((a) => a.label).join(' • '), 'Nailor, Jalen • Vele, Devaughn • TeSlaa, Isaac');
  assert.equal(outgoing.partnerTitle, 'to The Ashy Elbows');
  assert.equal(outgoing.partnerMeta, null);

  const neutral = tradeCardSides(trade, '0099');
  assert.equal(neutral.left.label, 'Offers');
  assert.equal(neutral.right.label, 'Asks for');
  assert.equal(neutral.left.franchiseName, '3-Peat');
  assert.equal(neutral.partnerTitle, null);
  assert.equal(neutral.partnerMeta, 'with The Ashy Elbows');
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

test('future pick labels are human-readable with franchise names', () => {
  assert.equal(formatFuturePickLabel('2027', '2', 'Hitmen'), '2027 2nd (Hitmen)');
  const named = parseMflAssetToken('FP_0001_2027_3', {
    franchiseNames: new Map([['0001', "P.O.T.'s Hitmen"]]),
  });
  assert.equal(named.kind, 'futurePick');
  assert.equal(named.label, "2027 3rd (P.O.T.'s Hitmen)");
});

test('parseFutureDraftPicksByFranchise buckets owned picks with FP_ ids', () => {
  const byFranchise = parseFutureDraftPicksByFranchise(
    {
      futureDraftPicks: {
        franchise: [
          {
            id: '0001',
            futureDraftPick: [
              { year: '2027', round: '1', originalPickFor: '0001' },
              { year: '2027', round: '3', originalPickFor: '0008' },
            ],
          },
          {
            id: '0008',
            futureDraftPick: { year: '2027', round: '2', originalPickFor: '0008' },
          },
        ],
      },
    },
    new Map([['0001', 'Hitmen'], ['0008', 'Shadow']]),
  );

  assert.equal(byFranchise['0001'].length, 2);
  assert.deepEqual(
    byFranchise['0001'].map((asset) => asset.id).sort(),
    ['FP_0001_2027_1', 'FP_0008_2027_3'],
  );
  assert.equal(byFranchise['0001'].find((asset) => asset.id === 'FP_0008_2027_3')?.label, '2027 3rd (Shadow)');
  assert.equal(byFranchise['0008'][0].id, 'FP_0008_2027_2');
});

test('parseTradesPageState merges owned picks into roster asset pools', () => {
  const state = parseTradesPageState({
    authenticated: true,
    primaryFranchiseId: '0001',
    league: {
      league: {
        defaultTradeExpirationDays: '7',
        franchises: {
          franchise: [
            { id: '0001', name: 'Hitmen' },
            { id: '0008', name: 'Shadow' },
          ],
        },
      },
    },
    players: {
      players: {
        player: [{ id: '11671', name: 'Alpha, One' }],
      },
    },
    transactions: { transactions: { transaction: [] } },
    pendingTrades: null,
    tradeBait: { tradeBaits: {} },
    roster: {
      rosters: {
        franchise: [
          { id: '0001', player: [{ id: '11671' }] },
          { id: '0008', player: [] },
        ],
      },
    },
    freeAgents: null,
    futureDraftPicks: {
      futureDraftPicks: {
        franchise: [
          {
            id: '0001',
            futureDraftPick: [
              { year: '2027', round: '1', originalPickFor: '0001' },
              { year: '2027', round: '3', originalPickFor: '0008' },
            ],
          },
          {
            id: '0008',
            futureDraftPick: [{ year: '2027', round: '2', originalPickFor: '0008' }],
          },
        ],
      },
    },
  });

  assert.equal(state.ok, true);
  assert.ok(state.myRosterAssets.some((asset) => asset.id === '11671'));
  assert.ok(state.myRosterAssets.some((asset) => asset.id === 'FP_0001_2027_1'));
  assert.ok(state.myRosterAssets.some((asset) => asset.id === 'FP_0008_2027_3'));
  assert.ok(state.rosterAssetsByFranchiseId['0008']?.some((asset) => asset.id === 'FP_0008_2027_2'));
  assert.equal(
    state.myRosterAssets.find((asset) => asset.id === 'FP_0008_2027_3')?.label,
    '2027 3rd (Shadow)',
  );
});

test('counter and amend drafts include pick assets, not only players', () => {
  const trade = {
    id: 'pending-9',
    mflTradeId: '9',
    timestamp: 1,
    timeLabel: '',
    expiresAt: Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60,
    expiresLabel: null,
    franchiseId: '0001',
    franchiseName: 'Hitmen',
    partnerId: '0008',
    partnerName: 'Shadow',
    offered: [
      { kind: 'player' as const, id: '11671', label: 'Alpha, One' },
      {
        kind: 'futurePick' as const,
        id: 'FP_0001_2027_1',
        label: '2027 1st (Hitmen)',
        franchiseId: '0001',
        year: '2027',
        round: '1',
      },
    ],
    requested: [
      {
        kind: 'futurePick' as const,
        id: 'FP_0008_2027_2',
        label: '2027 2nd (Shadow)',
        franchiseId: '0008',
        year: '2027',
        round: '2',
      },
    ],
    summary: '',
    status: 'pending' as const,
    byCommish: false,
  };

  const counter = counterDraftFromPendingTrade(trade, '0008');
  assert.equal(counter.partnerId, '0001');
  assert.deepEqual(counter.offeringPlayerIds, ['FP_0008_2027_2']);
  assert.deepEqual(counter.requestingPlayerIds, ['11671', 'FP_0001_2027_1']);

  const amend = amendDraftFromPendingTrade(trade);
  assert.deepEqual(amend.offeringPlayerIds, ['11671', 'FP_0001_2027_1']);
  assert.deepEqual(amend.requestingPlayerIds, ['FP_0008_2027_2']);
  assert.equal(amend.revokeTradeId, '9');
});

test('partitionTradePickerAssets surfaces draft picks before players', () => {
  const partitioned = partitionTradePickerAssets([
    { kind: 'player', id: '2', label: 'Zebra, A' },
    {
      kind: 'futurePick',
      id: 'FP_0008_2027_2',
      label: '2027 2nd (Shadow)',
      franchiseId: '0008',
      year: '2027',
      round: '2',
    },
    { kind: 'player', id: '1', label: 'Alpha, B' },
  ]);
  assert.deepEqual(partitioned.picks.map((asset) => asset.id), ['FP_0008_2027_2']);
  assert.deepEqual(partitioned.players.map((asset) => asset.label), ['Alpha, B', 'Zebra, A']);
  assert.deepEqual(
    sortTradePickerAssets([
      { kind: 'player', id: '1', label: 'Alpha, B' },
      {
        kind: 'futurePick',
        id: 'FP_0008_2027_2',
        label: '2027 2nd (Shadow)',
        franchiseId: '0008',
        year: '2027',
        round: '2',
      },
    ]).map((asset) => asset.kind),
    ['futurePick', 'player'],
  );
});

test('trade picker pools include owned picks and exclude free agents', () => {
  const myRoster = [
    { kind: 'player' as const, id: '11671', label: 'Alpha, One' },
    {
      kind: 'futurePick' as const,
      id: 'FP_0001_2027_1',
      label: '2027 1st (Hitmen)',
      franchiseId: '0001',
      year: '2027',
      round: '1',
    },
  ];
  const freeAgents = [
    { kind: 'player' as const, id: '99999', label: 'Free, Agent' },
  ];
  const byFranchise = {
    '0001': myRoster,
    '0008': [
      { kind: 'player' as const, id: '12801', label: 'Partner, Player' },
      {
        kind: 'futurePick' as const,
        id: 'FP_0008_2027_2',
        label: '2027 2nd (Shadow)',
        franchiseId: '0008',
        year: '2027',
        round: '2',
      },
    ],
  };

  const offer = buildTradeOfferPool(myRoster);
  assert.ok(offer.some((asset) => asset.id === '11671'));
  assert.ok(offer.some((asset) => asset.id === 'FP_0001_2027_1'));
  assert.equal(offer[0].kind, 'futurePick');

  const request = buildTradeRequestPool(byFranchise, '0008');
  assert.ok(request.some((asset) => asset.id === '12801'));
  assert.ok(request.some((asset) => asset.id === 'FP_0008_2027_2'));
  assert.ok(!request.some((asset) => asset.id === '99999'));
  // Even if a caller mistakenly concatenates FAs, the request helper itself never reads FA pools.
  assert.deepEqual(
    request.map((asset) => asset.id).sort(),
    ['12801', 'FP_0008_2027_2'],
  );
  assert.ok(!offer.some((asset) => asset.id === '99999'));
  assert.equal(freeAgents[0].id, '99999'); // sanity: FA fixture exists but is unused by pools
});

