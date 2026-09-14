import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadRosterPageState,
  parseRosterPageState,
} from '../lib/mfl-roster.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function restoreEnv(baseEnv: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in baseEnv)) delete (process.env as Record<string, string | undefined>)[key];
  }
  Object.assign(process.env, baseEnv);
}

test('parseRosterPageState combines MFL roster, player, YTD score, salary, and trade exports', () => {
  const state = parseRosterPageState({
    franchiseId: '0004',
    franchiseName: 'The Ashy Elbows',
    roster: { rosters: { franchise: { player: [
      { id: '00123', status: 'S', rosterPosition: 'QB' },
      { id: '00234', status: 'B', rosterPosition: 'RB' },
    ] } } },
    players: { players: { player: [
      { id: '00123', name: 'Quarterback One', position: 'QB', team: 'WAS', bye_week: '8' },
      { id: '00234', name: 'Running Back One', position: 'RB', team: 'PHI', bye_week: '9' },
    ] } },
    scores: { playerScores: { playerScore: [
      { id: '00123', score: '112.4' },
      { id: '00234', score: '88' },
    ] } },
    salaries: { salaries: { player: [
      { id: '00123', salary: '42', contractYear: '2' },
      { id: '00234', salary: '7', contractYear: '1' },
    ] } },
    tradeBait: { tradeBait: { player: [{ id: '00234' }] } },
  });

  assert.equal(state.ok, true);
  assert.equal(state.rows.length, 2);
  assert.deepEqual(state.rows[0], {
    id: '00123', name: 'Quarterback One', position: 'QB', team: 'WAS',
    ytdPoints: 112.4, byeWeek: 8, salary: 42, contractYear: 2,
    tradeAvailability: 'Not listed', status: 'Starter',
  });
  assert.equal(state.rows[1].tradeAvailability, 'Available');
  assert.equal(state.summary.rosterCount, 2);
  assert.equal(state.summary.ytdPoints, 200.4);
  assert.equal(state.summary.salary, 49);
}
);

test('parseRosterPageState never invents unavailable roster fields', () => {
  const state = parseRosterPageState({
    franchiseId: '0004', franchiseName: null,
    roster: { rosters: { franchise: { player: { id: '00123', status: 'B' } } } },
    players: { players: { player: { id: '00123', name: 'Mystery Player', position: 'QB' } } },
    scores: { playerScores: { playerScore: [] } },
    salaries: { salaries: { player: [] } },
    tradeBait: null,
  });

  assert.equal(state.rows[0].team, null);
  assert.equal(state.rows[0].ytdPoints, null);
  assert.equal(state.rows[0].byeWeek, null);
  assert.equal(state.rows[0].salary, null);
  assert.equal(state.rows[0].contractYear, null);
  assert.equal(state.rows[0].tradeAvailability, 'Unavailable');
}
);

test('loadRosterPageState requires the private session before making any MFL request', async () => {
  let fetched = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetched = true;
    return jsonResponse({});
  }) as typeof fetch;

  try {
    const state = await loadRosterPageState(null);
    assert.equal(fetched, false);
    assert.equal(state.ok, false);
    assert.equal(state.message, 'Sign in to MFL to load your roster.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadRosterPageState uses authenticated MFL exports and YTD query', async () => {
  const originalFetch = globalThis.fetch;
  const baseEnv = { ...process.env };
  process.env.MFL_PRIMARY_FRANCHISE_ID = '0004';
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE');
    calls.push(`${type}:${url.searchParams.get('W') ?? ''}`);
    if (type === 'myleagues') return jsonResponse({ leagues: { league: { league_id: '35743', franchise_id: '0004' } } });
    if (type === 'league') return jsonResponse({ league: { franchises: { franchise: { id: '0004', name: 'The Ashy Elbows' } } } });
    if (type === 'rosters') return jsonResponse({ rosters: { franchise: { player: { id: '00123', status: 'B' } } } });
    if (type === 'players') return jsonResponse({ players: { player: { id: '00123', name: 'Quarterback One', position: 'QB', team: 'WAS' } } });
    if (type === 'playerScores') return jsonResponse({ playerScores: { playerScore: { id: '00123', score: '10' } } });
    if (type === 'salaries') return jsonResponse({ salaries: { player: { id: '00123', salary: '5', contractYear: '1' } } });
    if (type === 'tradeBait') return jsonResponse({ tradeBait: { player: [] } });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const state = await loadRosterPageState('private-session');
    assert.equal(state.ok, true);
    assert.match(calls.join('\n'), /playerScores:YTD/);
    assert.deepEqual(calls.sort(), ['league:', 'myleagues:', 'players:', 'playerScores:YTD', 'rosters:', 'salaries:', 'tradeBait:'].sort());
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(baseEnv);
  }
});
