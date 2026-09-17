import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMflAssetList, parseMflAssetToken } from '../lib/mfl-assets.ts';
import {
  parseBbidTransactionBlob,
  parseFaabBoard,
  parseFreeAgents,
  parseFreeAgentTransactionBlob,
  parseRecentWaiverClaims,
  parseWaiverRules,
  parseWaiversPageState,
} from '../lib/mfl-waivers.ts';

test('parseBbidTransactionBlob extracts add, bid, and drop ids', () => {
  assert.deepEqual(parseBbidTransactionBlob('17506,|3500000|16191,'), {
    addPlayerIds: ['17506'],
    dropPlayerIds: ['16191'],
    bidAmount: 3500000,
  });
  assert.deepEqual(parseBbidTransactionBlob('17509,|1300000|'), {
    addPlayerIds: ['17509'],
    dropPlayerIds: [],
    bidAmount: 1300000,
  });
});

test('parseFreeAgentTransactionBlob handles drop-only blobs', () => {
  assert.deepEqual(parseFreeAgentTransactionBlob('|16584,13633,'), {
    addPlayerIds: [],
    dropPlayerIds: ['16584', '13633'],
  });
});

test('parseWaiverRules and FAAB board come from league settings', () => {
  const league = {
    league: {
      currentWaiverType: 'BBID',
      bbidMinimum: '300000',
      bbidIncrement: '50000',
      bbidTiebreaker: 'SORT',
      maxWaiverRounds: '4',
      bbidConditional: 'No',
      franchises: {
        franchise: [
          { id: '0004', name: 'The Ashy Elbows', bbidAvailableBalance: '17463543.02', waiverSortOrder: '7' },
          { id: '0001', name: "P.O.T.'s Hitmen", bbidAvailableBalance: '14675854.04', waiverSortOrder: '10' },
        ],
      },
    },
  };

  assert.deepEqual(parseWaiverRules(league), {
    waiverType: 'BBID',
    bbidMinimum: 300000,
    bbidIncrement: 50000,
    bbidTiebreaker: 'SORT',
    maxWaiverRounds: 4,
    bbidConditional: false,
  });

  const board = parseFaabBoard(league, '0004');
  assert.equal(board[0].franchiseId, '0004');
  assert.equal(board[0].isPrimary, true);
  assert.equal(board[0].bbidAvailableBalance, 17463543.02);
});

test('parseFreeAgents joins player names and keeps salary/status', () => {
  const rows = parseFreeAgents(
    { freeAgents: { leagueUnit: { player: [{ id: '16168', salary: '868218.75', status: 'locked', contractYear: '-1' }] } } },
    { players: { player: [{ id: '16168', name: 'Abanikanda, Israel', team: 'DAL', position: 'RB' }] } },
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Abanikanda, Israel');
  assert.equal(rows[0].position, 'RB');
  assert.equal(rows[0].salary, 868218.75);
});

test('parseRecentWaiverClaims builds readable BBID summaries', () => {
  const claims = parseRecentWaiverClaims(
    {
      transactions: {
        transaction: [
          { type: 'BBID_WAIVER', franchise: '0008', timestamp: '1788956739', transaction: '17509,|1300000|' },
        ],
      },
    },
    { players: { player: [{ id: '17509', name: 'Test, Player', position: 'WR', team: 'DAL' }] } },
    new Map([['0008', 'Shadow']]),
  );

  assert.equal(claims.length, 1);
  assert.match(claims[0].summary, /Shadow claimed Test, Player/);
  assert.equal(claims[0].bidAmount, 1300000);
});

test('parseWaiversPageState assembles a usable board', () => {
  const state = parseWaiversPageState({
    authenticated: true,
    primaryFranchiseId: '0004',
    league: {
      league: {
        currentWaiverType: 'BBID',
        bbidMinimum: '300000',
        bbidIncrement: '50000',
        bbidTiebreaker: 'SORT',
        maxWaiverRounds: '4',
        bbidConditional: 'No',
        franchises: { franchise: [{ id: '0004', name: 'The Ashy Elbows', bbidAvailableBalance: '1', waiverSortOrder: '1' }] },
      },
    },
    freeAgents: { freeAgents: { leagueUnit: { player: [{ id: '1', salary: '0', status: 'locked' }] } } },
    players: { players: { player: [{ id: '1', name: 'A, B', position: 'QB', team: 'BUF' }] } },
    transactions: { transactions: { transaction: [] } },
    pendingWaivers: null,
  });

  assert.equal(state.ok, true);
  assert.equal(state.freeAgents[0].name, 'A, B');
  assert.equal(state.myBalance, 1);
});

test('asset tokens parse players and future picks', () => {
  assert.equal(parseMflAssetToken('11671', new Map([['11671', 'Example, Player']])).label, 'Example, Player');
  const pick = parseMflAssetToken('FP_0001_2027_3');
  assert.equal(pick.kind, 'futurePick');
  assert.deepEqual(parseMflAssetList('11671,FP_0001_2027_3,').map((asset) => asset.kind), ['player', 'futurePick']);
});
