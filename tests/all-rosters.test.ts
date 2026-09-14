import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadAllRostersPageState,
  parseAllRostersPageState,
  selectAllRostersFranchise,
} from '../lib/mfl-all-rosters.ts';

function franchise(id: string) {
  return { id, name: `Team ${id}` };
}

function leaguePayload() {
  return { league: { franchises: { franchise: Array.from({ length: 12 }, (_, index) => franchise(String(index + 1).padStart(4, '0'))) } } };
}

function rosterPayload(id: string) {
  return { rosters: { franchise: { id, player: { id: `${id}-player`, status: 'S' } } } };
}

test('all-rosters state contains all 12 franchises and defaults to the authenticated franchise', () => {
  const payloads = Object.fromEntries(Array.from({ length: 12 }, (_, index) => {
    const id = String(index + 1).padStart(4, '0');
    return [id, rosterPayload(id)];
  }));
  const state = parseAllRostersPageState({
    authenticatedFranchiseId: '0007',
    league: leaguePayload(),
    rosters: payloads,
    players: { players: { player: Array.from({ length: 12 }, (_, index) => ({ id: `${String(index + 1).padStart(4, '0')}-player`, name: `Player ${index}`, position: 'WR', team: 'AAA' })) } },
    scores: { playerScores: { playerScore: [] } },
    salaries: { salaries: { player: [] } },
  });

  assert.equal(state.franchises.length, 12);
  assert.equal(state.selectedFranchiseId, '0007');
  assert.equal(state.selectedFranchise?.name, 'Team 0007');
  assert.equal(selectAllRostersFranchise(state, '0012')?.id, '0012');
  assert.equal(selectAllRostersFranchise(state, 'not-a-franchise')?.id, '0007');
});

test('all-rosters loader refuses unauthenticated requests without contacting MFL', async () => {
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = (async () => {
    fetched = true;
    return new Response('{}');
  }) as typeof fetch;

  try {
    const state = await loadAllRostersPageState(null);
    assert.equal(fetched, false);
    assert.equal(state.ok, false);
    assert.match(state.message, /Sign in/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('all-rosters mapping preserves proven player fields and marks missing fields unavailable', () => {
  const franchises = Array.from({ length: 12 }, (_, index) => franchise(String(index + 1).padStart(4, '0')));
  const state = parseAllRostersPageState({
    authenticatedFranchiseId: '0001',
    league: { league: { franchises: { franchise: franchises } } },
    rosters: Object.fromEntries(franchises.map(({ id }) => [id, rosterPayload(id)])),
    players: { players: { player: [{ id: '0001-player', name: 'Known Player', position: 'RB', team: 'BUF' }] } },
    scores: { playerScores: { playerScore: { id: '0001-player', score: '91.5' } } },
    salaries: { salaries: { player: { id: '0001-player', salary: '12', contractYear: '3' } } },
  });

  assert.deepEqual(state.selectedFranchise?.rows[0], {
    id: '0001-player', name: 'Known Player', position: 'RB', team: 'BUF',
    ytdPoints: 91.5, byeWeek: null, salary: 12, contractYear: 3, status: 'Starter',
  });
  assert.equal(state.selectedFranchise?.summary.ytdPoints, 91.5);
});
