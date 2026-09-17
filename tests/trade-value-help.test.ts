import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildFantasyCalcIndexes,
  matchFuturePickToFantasyCalc,
  matchMflPlayerToFantasyCalc,
  normalizeNflTeam,
  normalizePlayerNameKey,
  parseFantasyCalcValuesPayload,
} from '../lib/fantasycalc-values.ts';
import {
  buildTradeValueRead,
  favorLabel,
  perspectiveAssetsForTrade,
} from '../lib/trade-value-help.ts';
import { attachTradeValueReads, parsePendingTrades } from '../lib/mfl-trades.ts';

const sampleCatalog = parseFantasyCalcValuesPayload([
  {
    player: { id: 998, name: 'Drake London', mflId: '15751', position: 'WR', maybeTeam: 'ATL' },
    value: 5009,
  },
  {
    player: { id: 9824, name: 'Tucker Kraft', mflId: '16222', position: 'TE', maybeTeam: 'GB' },
    value: 3118,
  },
  {
    player: { id: 11908, name: 'Devaughn Vele', mflId: '16788', position: 'WR', maybeTeam: 'NO' },
    value: 1203,
  },
  {
    player: { id: 15351, name: '2027 1st (Mid)', mflId: 'FP_2027_mid_0', position: 'PICK', maybeTeam: null },
    value: 3005,
  },
]);

test('normalizePlayerNameKey handles MFL last-first and accents', () => {
  assert.equal(normalizePlayerNameKey('London, Drake'), 'drake london');
  assert.equal(normalizePlayerNameKey("Ja'Marr Chase"), 'jamarr chase');
});

test('normalizeNflTeam maps MFL abbreviations', () => {
  assert.equal(normalizeNflTeam('GBP'), 'GB');
  assert.equal(normalizeNflTeam('NOS'), 'NO');
  assert.equal(normalizeNflTeam('JAC'), 'JAX');
});

test('match prefers FantasyCalc mflId then fuzzy name+pos+team', () => {
  const indexes = buildFantasyCalcIndexes(sampleCatalog);
  const byId = matchMflPlayerToFantasyCalc({ id: '15751', name: 'London, Drake', position: 'WR', team: 'ATL' }, indexes);
  assert.equal(byId.ok, true);
  if (byId.ok) {
    assert.equal(byId.via, 'mflId');
    assert.equal(byId.entry.value, 5009);
  }

  const fuzzy = matchMflPlayerToFantasyCalc(
    { id: '99999', name: 'Kraft, Tucker', position: 'TE', team: 'GBP' },
    indexes,
  );
  assert.equal(fuzzy.ok, true);
  if (fuzzy.ok) {
    assert.equal(fuzzy.via, 'fuzzy');
    assert.equal(fuzzy.entry.mflId, '16222');
  }

  const miss = matchMflPlayerToFantasyCalc({ id: '1', name: 'Nobody, Fake', position: 'WR', team: 'ATL' }, indexes);
  assert.equal(miss.ok, false);
});

test('future picks map to FantasyCalc Mid round values', () => {
  const indexes = buildFantasyCalcIndexes(sampleCatalog);
  const hit = matchFuturePickToFantasyCalc('2027', '1', indexes);
  assert.equal(hit.ok, true);
  if (hit.ok) assert.equal(hit.entry.value, 3005);
});

test('London vs Kraft/Vele side totals favor London side', () => {
  const indexes = buildFantasyCalcIndexes(sampleCatalog);
  const read = buildTradeValueRead({
    giveAssets: [{ kind: 'player', id: '15751', label: 'London, Drake' }],
    getAssets: [
      { kind: 'player', id: '16222', label: 'Kraft, Tucker' },
      { kind: 'player', id: '16788', label: 'Vele, Devaughn' },
    ],
    indexes,
    perspective: 'you',
  });

  assert.equal(read.give.total, 5009);
  assert.equal(read.get.total, 3118 + 1203);
  assert.equal(read.delta, 3118 + 1203 - 5009);
  assert.equal(read.label, 'FantasyCalc: favors them');
  assert.deepEqual(read.give.misses, []);
  assert.deepEqual(read.get.misses, []);
});

test('favorLabel close band and perspective wording', () => {
  assert.equal(favorLabel(50, 4000, 4050, 'you'), 'FantasyCalc: close');
  assert.equal(favorLabel(1000, 4000, 5000, 'you'), 'FantasyCalc: favors you');
  assert.equal(favorLabel(-1000, 5000, 4000, 'franchise'), 'FantasyCalc: favors giver');
});

test('perspectiveAssetsForTrade flips when primary is partner', () => {
  const offered = [{ kind: 'player' as const, id: '1', label: 'A' }];
  const requested = [{ kind: 'player' as const, id: '2', label: 'B' }];
  const flipped = perspectiveAssetsForTrade({
    franchiseId: '0004',
    partnerId: '0005',
    offered,
    requested,
    primaryFranchiseId: '0005',
  });
  assert.equal(flipped.perspective, 'you');
  assert.equal(flipped.give[0].id, '2');
  assert.equal(flipped.get[0].id, '1');
});

test('attachTradeValueReads documents unmatched picks/players', () => {
  const indexes = buildFantasyCalcIndexes(sampleCatalog);
  const pending = parsePendingTrades(
    {
      pendingTrades: {
        pendingTrade: [{
          franchise: '0004',
          franchise2: '0005',
          franchise1_gave_up: '15751,FP_0008_2027_1,',
          franchise2_gave_up: '16222,99901,',
          timestamp: '100',
        }],
      },
    },
    {
      players: {
        player: [
          { id: '15751', name: 'London, Drake', position: 'WR', team: 'ATL' },
          { id: '16222', name: 'Kraft, Tucker', position: 'TE', team: 'GBP' },
          { id: '99901', name: 'Ghost, Player', position: 'WR', team: 'ATL' },
        ],
      },
    },
    new Map([['0004', 'Me'], ['0005', 'Them']]),
  );

  const [enriched] = attachTradeValueReads(
    pending,
    indexes,
    new Map([
      ['15751', { name: 'London, Drake', position: 'WR', team: 'ATL' }],
      ['16222', { name: 'Kraft, Tucker', position: 'TE', team: 'GBP' }],
      ['99901', { name: 'Ghost, Player', position: 'WR', team: 'ATL' }],
    ]),
    '0004',
  );

  assert.ok(enriched.valueRead);
  assert.equal(enriched.valueRead?.give.total, 5009 + 3005);
  assert.equal(enriched.valueRead?.get.total, 3118);
  assert.ok(enriched.valueRead?.get.misses.some((label) => /Ghost|99901|Player/.test(label)));
});
