import assert from 'node:assert/strict';
import test from 'node:test';

import { POST as submitLineup } from '../app/api/mfl/lineup/route.ts';
import { fetchMflExport } from '../lib/mfl.ts';
import {
  importLineupSubmission,
  deriveTeamByeWeeks,
  formatLineupRowMeta,
  formatLineupSubmissionCue,
  loadLineupSubmissionContext,
  loadLineupPageState,
  normalizeLineupInjuryDesignation,
  parseLineupRules,
  resolveHasSubmittedLineup,
  resolveRosterPlayerName,
  validateLineupSubmission,
} from '../lib/mfl-lineup.ts';
import type { LineupRosterSnapshot } from '../lib/mfl-lineup.ts';

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function restoreEnv(baseEnv: NodeJS.ProcessEnv) {
  for (const key of Object.keys(process.env)) {
    if (!(key in baseEnv)) {
      delete (process.env as Record<string, string | undefined>)[key];
    }
  }

  Object.assign(process.env, baseEnv);
}

function makeLeaguePayload() {
  return {
    league: {
      rosterPositions: {
        rosterPosition: [
          { position: 'QB', min: '1', max: '1' },
          { position: 'RB', min: '2', max: '4' },
          { position: 'WR', min: '2', max: '4' },
          { position: 'TE', min: '1', max: '2' },
          { position: 'PK', min: '1', max: '1' },
          { position: 'Def', min: '1', max: '1' },
        ],
      },
      lineup: {
        startingLineup: {
          lineupSlot: [
            { position: 'QB' },
            { position: 'RB' },
            { position: 'RB' },
            { position: 'WR' },
            { position: 'WR' },
            { position: 'TE' },
            { position: 'PK' },
            { position: 'Def' },
          { position: 'RB,WR,TE', flex: '1' },
          { position: 'RB,WR,TE', flex: '1' },
          ],
        },
      },
      schedule: {
        currentWeek: '8',
        week: [{ week: '7' }, { week: '8' }, { week: '9' }],
      },
      franchises: {
        franchise: [{ id: '0004', name: 'The Ashy Elbows' }],
      },
    },
  };
}

function makeLiveLeaguePayload() {
  return {
    league: {
      starters: {
        count: '10',
        position: [
          { name: 'QB', limit: '1' },
          { name: 'RB', limit: '2-4' },
          { name: 'WR', limit: '2-4' },
          { name: 'TE', limit: '1-2' },
          { name: 'PK', limit: '1' },
          { name: 'Def', limit: '1' },
        ],
      },
      rosterLimits: {
        position: [
          { name: 'QB', limit: '0-0' },
          { name: 'RB', limit: '0-0' },
          { name: 'WR', limit: '0-0' },
          { name: 'TE', limit: '0-0' },
          { name: 'PK', limit: '0-0' },
          { name: 'Def', limit: '0-0' },
        ],
      },
    },
  };
}

function makeSchedulePayload() {
  return {
    schedule: {
      currentWeek: '8',
      weeklySchedule: [
        { week: '7' },
        { week: '8' },
        { week: '9' },
      ],
    },
  };
}

function makeLiveScoringWeekPayload(week = '8', players: Array<Record<string, string>> = []) {
  return {
    liveScoring: {
      week,
      ...(players.length > 0 ? { matchup: [{ franchise: [{ id: '0004', players: { player: players } }] }] } : {}),
    },
  };
}

function makeRosterPayload() {
  return {
    rosters: {
      franchise: {
        player: [
          { id: '00123', status: 'S', rosterPosition: 'QB' },
          { id: '00234', status: 'B', rosterPosition: 'RB' },
          { id: '00235', status: 'B', rosterPosition: 'RB' },
          { id: '00345', status: 'B', rosterPosition: 'WR' },
          { id: '00346', status: 'B', rosterPosition: 'WR' },
          { id: '00347', status: 'B', rosterPosition: 'WR' },
          { id: '00456', status: 'B', rosterPosition: 'TE' },
          { id: '00457', status: 'B', rosterPosition: 'TE' },
          { id: '00567', status: 'B', rosterPosition: 'PK' },
          { id: '00678', status: 'B', rosterPosition: 'Def' },
        ],
      },
    },
  };
}

function makeRosterPayloadWithMissingNames() {
  return {
    rosters: {
      franchise: {
        player: [{ id: '13116', status: 'S', rosterPosition: 'QB' }],
      },
    },
  };
}

function makeRosterPayloadWithGeneratedPlaceholderName() {
  return {
    rosters: {
      franchise: {
        player: [{ id: '13116', name: 'TBD', status: 'S', rosterPosition: 'QB' }],
      },
    },
  };
}

function makeRosterPayloadWithGenuineRosterName() {
  return {
    rosters: {
      franchise: {
        player: [{ id: '13116', name: 'Mahomes, Patrick', status: 'S', rosterPosition: 'QB' }],
      },
    },
  };
}

function makePlayersPayload() {
  return {
    players: {
      player: [
        { id: '00123', name: 'Quarterback One', position: 'QB', team: 'WAS' },
        { id: '00234', name: 'Running Back One', position: 'RB', team: 'PHI' },
        { id: '00235', name: 'Running Back Two', position: 'RB', team: 'NYJ' },
        { id: '00345', name: 'Wide Receiver One', position: 'WR', team: 'DAL' },
        { id: '00346', name: 'Wide Receiver Two', position: 'WR', team: 'BUF' },
        { id: '00347', name: 'Wide Receiver Three', position: 'WR', team: 'KC' },
        { id: '00456', name: 'Tight End One', position: 'TE', team: 'SEA' },
        { id: '00457', name: 'Tight End Two', position: 'TE', team: 'MIA' },
        { id: '00567', name: 'Kicker One', position: 'PK', team: 'HOU' },
        { id: '00678', name: 'Defense One', position: 'Def', team: 'PIT' },
      ],
    },
  };
}

function makePlayersPayloadWithDirectoryName() {
  return {
    players: {
      player: [{ id: '13116', name: 'Mahomes, Patrick', position: 'QB', team: 'KC' }],
    },
  };
}

function makePlayerStatusPayload(starters = '00123,') {
  const starterIds = starters.split(',').map((value) => value.trim()).filter(Boolean);
  const starterSet = new Set(starterIds);
  const allIds = ['00123', '00234', '00235', '00345', '00346', '00347', '00456', '00457', '00567', '00678'];
  return {
    weeklyResults: {
      week: '8',
      matchup: [{
        franchise: [{
          id: '0004',
          starters,
          player: allIds.map((id) => ({
            id,
            status: starterSet.has(id) ? 'starter' : 'nonstarter',
          })),
        }],
      }],
    },
  };
}

function makeVerifiedPlayerStatusPayload() {
  return {
    weeklyResults: {
      week: '8',
      matchup: [{
        franchise: [{
          id: '0004',
          starters: '00123,00234,00235,00345,00346,00347,00456,00457,00567,00678,',
          player: [
            { id: '00123', status: 'starter' },
            { id: '00234', status: 'starter' },
            { id: '00235', status: 'starter' },
            { id: '00345', status: 'starter' },
            { id: '00346', status: 'starter' },
            { id: '00347', status: 'starter' },
            { id: '00456', status: 'starter' },
            { id: '00457', status: 'starter' },
            { id: '00567', status: 'starter' },
            { id: '00678', status: 'starter' },
          ],
        }],
      }],
    },
  };
}

function makeProjectedScoresPayload() {
  return {
    projectedScores: {
      playerScore: [{ id: '00123', score: '19.5' }, { id: '00234', score: '16.2' }],
    },
  };
}

function makePlayerScoresPayload() {
  return {
    playerScores: {
      playerScore: [{ id: '00234', score: '6.7' }],
    },
  };
}

function makeInjuriesPayload() {
  return {
    injuries: {
      injury: [{ id: '00345', status: 'Questionable' }],
    },
  };
}

function makeNflSchedulePayload() {
  return {
    nflSchedule: {
      matchup: [
        {
          kickoff: '1893456000',
          gameSecondsRemaining: '3600',
          team: [
            { id: 'WAS', isHome: '0', opponent: 'PHI' },
            { id: 'PHI', isHome: '1', opponent: 'WAS' },
          ],
        },
        {
          kickoff: '1893459600',
          gameSecondsRemaining: '3600',
          team: [
            { id: 'NYJ', isHome: '0', opponent: 'DAL' },
            { id: 'DAL', isHome: '1', opponent: 'NYJ' },
          ],
        },
        {
          kickoff: '1893463200',
          gameSecondsRemaining: '3600',
          team: [
            { id: 'BUF', isHome: '0', opponent: 'SEA' },
            { id: 'SEA', isHome: '1', opponent: 'BUF' },
          ],
        },
        {
          kickoff: '1893466800',
          gameSecondsRemaining: '3600',
          team: [
            { id: 'HOU', isHome: '0', opponent: 'PIT' },
            { id: 'PIT', isHome: '1', opponent: 'HOU' },
          ],
        },
        {
          kickoff: '1893470400',
          gameSecondsRemaining: '3600',
          team: [
            { id: 'KC', isHome: '0', opponent: 'MIA' },
            { id: 'MIA', isHome: '1', opponent: 'KC' },
          ],
        },
      ],
    },
  };
}

function makeTopStartersPayload() {
  return {
    topStarters: {
      player: [{ id: '00234', percent: '73' }],
    },
  };
}

function makeMyLeaguesPayload(franchiseId = '0004') {
  return {
    leagues: {
      league: [{ league_id: '35743', franchise_id: franchiseId }],
    },
  };
}

test('formatLineupSubmissionCue uses Daniel short copy', () => {
  assert.equal(formatLineupSubmissionCue(2, false), 'week 2 not submitted');
  assert.equal(formatLineupSubmissionCue(8, true), 'submitted');
});

test('resolveHasSubmittedLineup treats identical pre-kickoff starters as carried, not submitted', () => {
  const starters = new Set(['00123', '00234']);
  assert.equal(resolveHasSubmittedLineup({
    starterIds: starters,
    previousStarterIds: new Set(['00123', '00234']),
    selectedWeek: 2,
    currentWeek: 2,
    kickoffStarted: false,
  }), false);

  assert.equal(resolveHasSubmittedLineup({
    starterIds: starters,
    previousStarterIds: new Set(['00123']),
    selectedWeek: 2,
    currentWeek: 2,
    kickoffStarted: false,
  }), true);

  assert.equal(resolveHasSubmittedLineup({
    starterIds: starters,
    previousStarterIds: new Set(['00123', '00234']),
    selectedWeek: 2,
    currentWeek: 2,
    kickoffStarted: true,
  }), true);

  assert.equal(resolveHasSubmittedLineup({
    starterIds: starters,
    previousStarterIds: new Set(['00123', '00234']),
    selectedWeek: 1,
    currentWeek: 2,
    kickoffStarted: false,
  }), true);

  assert.equal(resolveHasSubmittedLineup({
    starterIds: new Set(),
    previousStarterIds: null,
    selectedWeek: 2,
    currentWeek: 2,
    kickoffStarted: false,
  }), false);
});

test('parseLineupRules derives flexible starter bands from the league export', () => {
  const rules = parseLineupRules(makeLeaguePayload());

  assert.equal(rules.totalMin, 10);
  assert.equal(rules.totalMax, 15);
  assert.deepEqual(rules.positions.map((entry) => [entry.position, entry.min, entry.max]), [
    ['QB', 1, 1],
    ['RB', 2, 4],
    ['WR', 2, 4],
    ['TE', 1, 2],
    ['PK', 1, 1],
    ['DEF', 1, 1],
  ]);
  assert.deepEqual(rules.flexEligiblePositions, ['RB', 'WR', 'TE']);
});

test('parseLineupRules handles the live starters export shape with an exact total starter count', () => {
  const rules = parseLineupRules(makeLiveLeaguePayload());

  assert.equal(rules.totalMin, 10);
  assert.equal(rules.totalMax, 10);
  assert.deepEqual(rules.positions.map((entry) => [entry.position, entry.min, entry.max]), [
    ['QB', 1, 1],
    ['RB', 2, 4],
    ['WR', 2, 4],
    ['TE', 1, 2],
    ['PK', 1, 1],
    ['DEF', 1, 1],
  ]);
});

test('normalizeLineupInjuryDesignation exposes only known NFL designations', () => {
  assert.equal(normalizeLineupInjuryDesignation('Q'), 'Questionable');
  assert.equal(normalizeLineupInjuryDesignation('Doubtful'), 'Doubtful');
  assert.equal(normalizeLineupInjuryDesignation('P'), 'Probable');
  assert.equal(normalizeLineupInjuryDesignation('O'), 'Out');
  assert.equal(normalizeLineupInjuryDesignation('IR-R'), 'Injured Reserve');
  assert.equal(normalizeLineupInjuryDesignation('day-to-day'), null);
  assert.equal(normalizeLineupInjuryDesignation(null), null);
});

test('loadLineupPageState resolves the authenticated franchise and preserves leading-zero ids', async () => {
  const originalFetch = globalThis.fetch;
  const baseEnv = { ...process.env };
  process.env.MFL_PRIMARY_FRANCHISE_ID = '0004';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE');

    if (type === 'myleagues') return createJsonResponse(makeMyLeaguesPayload());
    if (type === 'league') return createJsonResponse(makeLeaguePayload());
    if (type === 'schedule') return createJsonResponse(makeSchedulePayload());
    if (type === 'liveScoring') return createJsonResponse(makeLiveScoringWeekPayload('8', [
      { id: '00123', score: '12.4', gameSecondsRemaining: '900' },
      { id: '00234', score: '0.0', gameSecondsRemaining: '3600' },
    ]));
    if (type === 'rosters') return createJsonResponse(makeRosterPayload());
    if (type === 'players') return createJsonResponse(makePlayersPayload());
    if (type === 'weeklyResults') {
      const week = url.searchParams.get('W');
      if (week === '7') return createJsonResponse(makePlayerStatusPayload('00234,'));
      return createJsonResponse(makePlayerStatusPayload('00123,'));
    }
    if (type === 'projectedScores') return createJsonResponse(makeProjectedScoresPayload());
    if (type === 'playerScores') return createJsonResponse(makePlayerScoresPayload());
    if (type === 'injuries') return createJsonResponse(makeInjuriesPayload());
    if (type === 'topStarters') return createJsonResponse(makeTopStartersPayload());
    if (type === 'nflSchedule') return createJsonResponse(makeNflSchedulePayload());

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const state = await loadLineupPageState('session-123', '8');

    assert.equal(state.franchiseId, '0004');
    assert.equal(state.franchiseName, 'The Ashy Elbows');
    assert.equal(state.selectedWeek, 8);
    assert.equal(state.availableWeeks.join(','), '7,8,9');
    assert.equal(state.rows[0].id, '00123');
    assert.equal(typeof state.rows[0].id, 'string');
    assert.equal(state.rows[0].statusText.toLowerCase().includes('kickoff'), true);
    assert.equal(state.rows[0].projection, 19.5);
    assert.equal(state.rows[0].actualPoints, 12.4);
    assert.equal(state.rows.find((row) => row.id === '00234')?.actualPoints, null);
    assert.equal(state.rows[0].startPercentage, 0);
    assert.equal(state.rows[0].rosterRank, 1);
    assert.equal(state.rows[0].selected, true);
    assert.equal(state.hasSubmittedLineup, true);
    assert.equal(state.rows[0].bye, null);
    assert.equal(state.rows[0].team, 'WAS');
    assert.equal(state.rows[0].opponent, 'PHI');
    const questionable = state.rows.find((row) => row.id === '00345');
    assert.equal(questionable?.injury, 'Questionable');
    assert.equal(questionable?.canToggle, true);
    assert.match(questionable?.statusText ?? '', /Questionable/);
    assert.match(questionable?.statusText ?? '', /Bye week unavailable/);
    assert.match(questionable?.statusText ?? '', /Unlocked/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(baseEnv);
  }
});

test('loadLineupPageState keeps carried starters but marks the week as not submitted', async () => {
  const originalFetch = globalThis.fetch;
  const baseEnv = { ...process.env };
  process.env.MFL_PRIMARY_FRANCHISE_ID = '0004';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE');

    if (type === 'myleagues') return createJsonResponse(makeMyLeaguesPayload());
    if (type === 'league') return createJsonResponse(makeLeaguePayload());
    if (type === 'liveScoring') return createJsonResponse(makeLiveScoringWeekPayload('8'));
    if (type === 'schedule') return createJsonResponse(makeSchedulePayload());
    if (type === 'rosters') return createJsonResponse(makeRosterPayload());
    if (type === 'players') return createJsonResponse(makePlayersPayload());
    if (type === 'weeklyResults') return createJsonResponse(makePlayerStatusPayload('00123,'));
    if (type === 'projectedScores') return createJsonResponse(makeProjectedScoresPayload());
    if (type === 'playerScores') return createJsonResponse(makePlayerScoresPayload());
    if (type === 'injuries') return createJsonResponse(makeInjuriesPayload());
    if (type === 'topStarters') return createJsonResponse(makeTopStartersPayload());
    if (type === 'nflSchedule') return createJsonResponse(makeNflSchedulePayload());

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const state = await loadLineupPageState('session-123', '8');

    assert.equal(state.selectedWeek, 8);
    assert.equal(state.hasSubmittedLineup, false);
    assert.equal(formatLineupSubmissionCue(state.selectedWeek!, state.hasSubmittedLineup), 'week 8 not submitted');
    assert.equal(state.rows.find((row) => row.id === '00123')?.selected, true);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(baseEnv);
  }
});

test('loadLineupPageState defaults to the live MFL current week instead of schedule metadata', async () => {
  const originalFetch = globalThis.fetch;
  const baseEnv = { ...process.env };
  process.env.MFL_PRIMARY_FRANCHISE_ID = '0004';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE');

    if (type === 'myleagues') return createJsonResponse(makeMyLeaguesPayload());
    if (type === 'league') return createJsonResponse(makeLeaguePayload());
    if (type === 'liveScoring') return createJsonResponse(makeLiveScoringWeekPayload('8'));
    if (type === 'schedule') return createJsonResponse({ schedule: { currentWeek: '1', week: [{ week: '1' }, { week: '8' }] } });
    if (type === 'rosters') return createJsonResponse(makeRosterPayload());
    if (type === 'players') return createJsonResponse(makePlayersPayload());
    if (type === 'weeklyResults') {
      const week = url.searchParams.get('W');
      if (week === '7') return createJsonResponse(makePlayerStatusPayload('00234,'));
      return createJsonResponse(makePlayerStatusPayload('00123,'));
    }
    if (type === 'projectedScores') return createJsonResponse(makeProjectedScoresPayload());
    if (type === 'playerScores') return createJsonResponse(makePlayerScoresPayload());
    if (type === 'injuries') return createJsonResponse(makeInjuriesPayload());
    if (type === 'topStarters') return createJsonResponse(makeTopStartersPayload());
    if (type === 'nflSchedule') return createJsonResponse(makeNflSchedulePayload());

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const state = await loadLineupPageState('session-123');

    assert.equal(state.currentWeek, 8);
    assert.equal(state.selectedWeek, 8);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(baseEnv);
  }
});

test('loadLineupPageState fixes a benched player after the real NFL kickoff', async () => {
  const originalFetch = globalThis.fetch;
  const baseEnv = { ...process.env };
  process.env.MFL_PRIMARY_FRANCHISE_ID = '0004';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE');

    if (type === 'myleagues') return createJsonResponse(makeMyLeaguesPayload());
    if (type === 'league') return createJsonResponse(makeLeaguePayload());
    if (type === 'liveScoring') return createJsonResponse(makeLiveScoringWeekPayload('8'));
    if (type === 'schedule') return createJsonResponse(makeSchedulePayload());
    if (type === 'rosters') return createJsonResponse(makeRosterPayload());
    if (type === 'players') return createJsonResponse(makePlayersPayload());
    if (type === 'weeklyResults') {
      const week = url.searchParams.get('W');
      if (week === '7') return createJsonResponse(makePlayerStatusPayload('00234,'));
      return createJsonResponse(makePlayerStatusPayload('00123,'));
    }
    if (type === 'projectedScores') return createJsonResponse(makeProjectedScoresPayload());
    if (type === 'playerScores') return createJsonResponse(makePlayerScoresPayload());
    if (type === 'injuries') return createJsonResponse(makeInjuriesPayload());
    if (type === 'topStarters') return createJsonResponse(makeTopStartersPayload());
    if (type === 'nflSchedule') return createJsonResponse({ nflSchedule: { matchup: [{ kickoff: '1', team: [{ id: 'WAS', isHome: '0', opponent: 'PHI' }, { id: 'PHI', isHome: '1', opponent: 'WAS' }] }] } });

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const state = await loadLineupPageState('session-123', '8');
    const benched = state.rows.find((row) => row.id === '00234');

    assert.equal(benched?.selected, false);
    assert.equal(benched?.locked, true);
    assert.equal(benched?.canToggle, false);
    assert.equal(benched?.actualPoints, 6.7);
    assert.match(benched?.statusText ?? '', /^No injury designation · Bye week unavailable · Locked · Kickoff /);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(baseEnv);
  }
});

test('loadLineupPageState prefers the players directory name when the roster export only has a generated placeholder', async () => {
  const originalFetch = globalThis.fetch;
  const baseEnv = { ...process.env };
  process.env.MFL_PRIMARY_FRANCHISE_ID = '0004';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE');

    if (type === 'myleagues') return createJsonResponse(makeMyLeaguesPayload());
    if (type === 'league') return createJsonResponse(makeLeaguePayload());
    if (type === 'schedule') return createJsonResponse(makeSchedulePayload());
    if (type === 'rosters') return createJsonResponse(makeRosterPayloadWithMissingNames());
    if (type === 'players') return createJsonResponse(makePlayersPayloadWithDirectoryName());
    if (type === 'weeklyResults') {
      const week = url.searchParams.get('W');
      if (week === '7') return createJsonResponse(makePlayerStatusPayload('00234,'));
      return createJsonResponse(makePlayerStatusPayload('00123,'));
    }
    if (type === 'projectedScores') return createJsonResponse(makeProjectedScoresPayload());
    if (type === 'injuries') return createJsonResponse(makeInjuriesPayload());
    if (type === 'topStarters') return createJsonResponse(makeTopStartersPayload());
    if (type === 'nflSchedule') return createJsonResponse(makeNflSchedulePayload());

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const state = await loadLineupPageState('session-123', '8');

    assert.equal(state.ok, true);
    assert.equal(state.rows[0].id, '13116');
    assert.equal(state.rows[0].name, 'Mahomes, Patrick');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(baseEnv);
  }
});

test('loadLineupPageState keeps a genuine roster-provided name', async () => {
  const originalFetch = globalThis.fetch;
  const baseEnv = { ...process.env };
  process.env.MFL_PRIMARY_FRANCHISE_ID = '0004';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE');

    if (type === 'myleagues') return createJsonResponse(makeMyLeaguesPayload());
    if (type === 'league') return createJsonResponse(makeLeaguePayload());
    if (type === 'schedule') return createJsonResponse(makeSchedulePayload());
    if (type === 'rosters') return createJsonResponse(makeRosterPayloadWithGenuineRosterName());
    if (type === 'players') return createJsonResponse(makePlayersPayloadWithDirectoryName());
    if (type === 'weeklyResults') {
      const week = url.searchParams.get('W');
      if (week === '7') return createJsonResponse(makePlayerStatusPayload('00234,'));
      return createJsonResponse(makePlayerStatusPayload('00123,'));
    }
    if (type === 'projectedScores') return createJsonResponse(makeProjectedScoresPayload());
    if (type === 'injuries') return createJsonResponse(makeInjuriesPayload());
    if (type === 'topStarters') return createJsonResponse(makeTopStartersPayload());
    if (type === 'nflSchedule') return createJsonResponse(makeNflSchedulePayload());

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const state = await loadLineupPageState('session-123', '8');

    assert.equal(state.rows[0].name, 'Mahomes, Patrick');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(baseEnv);
  }
});

test('loadLineupPageState scopes selected-week dynamic data requests to the chosen week', async () => {
  const originalFetch = globalThis.fetch;
  const baseEnv = { ...process.env };
  process.env.MFL_PRIMARY_FRANCHISE_ID = '0004';
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE');
    calls.push(`${type}:${url.searchParams.get('W') ?? ''}`);

    if (type === 'myleagues') return createJsonResponse(makeMyLeaguesPayload());
    if (type === 'league') return createJsonResponse(makeLeaguePayload());
    if (type === 'schedule') return createJsonResponse(makeSchedulePayload());
    if (type === 'rosters') return createJsonResponse(makeRosterPayload());
    if (type === 'players') return createJsonResponse(makePlayersPayload());
    if (type === 'weeklyResults') {
      const week = url.searchParams.get('W');
      if (week === '7') return createJsonResponse(makePlayerStatusPayload('00234,'));
      return createJsonResponse(makePlayerStatusPayload('00123,'));
    }
    if (type === 'projectedScores') return createJsonResponse(makeProjectedScoresPayload());
    if (type === 'injuries') return createJsonResponse(makeInjuriesPayload());
    if (type === 'topStarters') return createJsonResponse(makeTopStartersPayload());
    if (type === 'nflSchedule') return createJsonResponse(makeNflSchedulePayload());

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    await loadLineupPageState('session-123', '8');

    assert.match(calls.join('\n'), /projectedScores:8/);
    assert.match(calls.join('\n'), /injuries:8/);
    assert.match(calls.join('\n'), /topStarters:8/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(baseEnv);
  }
});

test('deriveTeamByeWeeks only resolves an unambiguous single-week gap', () => {
  const byeWeeks = deriveTeamByeWeeks(
    new Map([
      [1, new Set(['WAS', 'PHI', 'NYJ'])],
      [2, new Set(['WAS', 'NYJ'])],
      [3, new Set(['WAS', 'PHI', 'NYJ'])],
    ]),
    [1, 2, 3],
  );

  assert.equal(byeWeeks.get('PHI'), 2);
  assert.equal(byeWeeks.get('WAS'), null);
  assert.equal(byeWeeks.get('NYJ'), null);

  const ambiguous = deriveTeamByeWeeks(
    new Map([
      [1, new Set(['DAL'])],
      [2, new Set([])],
      [3, new Set([])],
    ]),
    [1, 2, 3],
  );

  assert.equal(ambiguous.get('DAL'), null);
});

test('formatLineupRowMeta renders matchup, bye, and missing metrics text', () => {
  const liveRow = formatLineupRowMeta({
    id: '00123',
    name: 'Quarterback One',
    position: 'QB',
    team: 'WAS',
    opponent: 'PHI',
    homeAway: 'home',
    bye: null,
    projection: 19.5,
    actualPoints: 12.4,
    startPercentage: 73,
    statusText: 'Locked',
    selected: true,
  } as LineupRosterSnapshot);

  assert.equal(liveRow.compactText, 'QB · WAS · vs PHI · Actual 12.4 · Start 73%');
  assert.match(liveRow.ariaLabel, /Quarterback One/);

  const byeRow = formatLineupRowMeta({
    id: '00345',
    name: 'Wide Receiver One',
    position: 'WR',
    team: 'NYJ',
    opponent: null,
    homeAway: null,
    bye: 'Bye',
    projection: null,
    actualPoints: null,
    startPercentage: null,
    statusText: 'Bye week',
    selected: false,
  } as LineupRosterSnapshot);

  assert.equal(byeRow.compactText, 'WR · NYJ · Bye · Metrics unavailable');
  assert.match(byeRow.ariaLabel, /Bye/);
});

test('resolveRosterPlayerName falls back from generated placeholders but keeps genuine roster names', () => {
  assert.equal(resolveRosterPlayerName('TBD', 'Mahomes, Patrick', '13116'), 'Mahomes, Patrick');
  assert.equal(resolveRosterPlayerName('Mahomes, Patrick', 'Directory Fallback', '13116'), 'Mahomes, Patrick');
});

test('loadLineupPageState returns a sign-in error immediately when the app session is missing', async () => {
  const originalFetch = globalThis.fetch;
  let fetched = false;

  globalThis.fetch = (async () => {
    fetched = true;
    return new Response('unexpected', { status: 500 });
  }) as typeof fetch;

  try {
    const state = await loadLineupPageState(null, '8');

    assert.equal(fetched, false);
    assert.equal(state.ok, false);
    assert.equal(state.message, 'Sign in to MFL to load your lineup.');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('loadLineupPageState shows a generic load error when the upstream export cannot be parsed', async () => {
  const originalFetch = globalThis.fetch;
  const baseEnv = { ...process.env };
  process.env.MFL_PRIMARY_FRANCHISE_ID = '0004';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE');

    if (type === 'league') return createJsonResponse({ league: { starters: { count: '10' } } });
    if (type === 'schedule') return createJsonResponse(makeSchedulePayload());
    if (type === 'players') return createJsonResponse(makePlayersPayload());
    if (type === 'myleagues') return createJsonResponse(makeMyLeaguesPayload());

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const state = await loadLineupPageState('session-123', '8');

    assert.equal(state.ok, false);
    assert.equal(state.message, 'Lineup data could not be loaded.');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(baseEnv);
  }
});

test('validateLineupSubmission rejects duplicates, roster mismatches, locks, byes, and accidental empties', () => {
  const playersById = new Map<string, LineupRosterSnapshot>([
    ['00123', { id: '00123', name: 'Quarterback One', position: 'QB', team: 'WAS', rosterStatus: 'S', locked: true, selected: true, bye: null, opponent: 'PHI', homeAway: 'home', kickoffUtc: 1, kickoffLocal: 'Thu 1:00 PM ET', injury: null, projection: null, startPercentage: null, rosterRank: 1, statusText: 'Locked', availability: 'locked', canToggle: false, group: 'QB' } as LineupRosterSnapshot],
    ['00234', { id: '00234', name: 'Running Back One', position: 'RB', team: 'PHI', rosterStatus: 'B', locked: false, selected: false, bye: null, opponent: null, homeAway: null, kickoffUtc: null, kickoffLocal: null, injury: null, projection: null, startPercentage: null, rosterRank: 1, statusText: 'Available', availability: 'available', canToggle: true, group: 'RB' } as LineupRosterSnapshot],
    ['00345', { id: '00345', name: 'Wide Receiver One', position: 'WR', team: 'NYJ', rosterStatus: 'B', locked: false, selected: false, bye: 'Bye', opponent: null, homeAway: null, kickoffUtc: null, kickoffLocal: null, injury: null, projection: null, startPercentage: null, rosterRank: 1, statusText: 'Bye week', availability: 'bye', canToggle: false, group: 'WR' } as LineupRosterSnapshot],
  ]);

  const validation = validateLineupSubmission(
    {
      rules: parseLineupRules(makeLeaguePayload()),
      playersById,
      rosterPlayerIds: new Set(['00123', '00234']),
      starters: ['00123', '00123'],
      clear: false,
      comments: 'hello',
    },
  );

  assert.equal(validation.ok, false);
  assert.match(validation.message, /duplicate/i);

  const rosterMismatch = validateLineupSubmission({
    rules: parseLineupRules(makeLeaguePayload()),
    playersById,
    rosterPlayerIds: new Set(['00123']),
    starters: ['00234'],
    clear: false,
    comments: 'hello',
  });

  assert.equal(rosterMismatch.ok, false);
  assert.match(rosterMismatch.message, /active roster/i);

  const byeBlocked = validateLineupSubmission({
    rules: parseLineupRules(makeLeaguePayload()),
    playersById,
    rosterPlayerIds: new Set(['00123', '00345']),
    starters: ['00345'],
    clear: false,
    comments: 'hello',
  });

  assert.equal(byeBlocked.ok, false);
  assert.match(byeBlocked.message, /bye/i);

  const empty = validateLineupSubmission({
    rules: parseLineupRules(makeLeaguePayload()),
    playersById,
    rosterPlayerIds: new Set(['00123']),
    starters: [],
    clear: false,
    comments: '',
  });

  assert.equal(empty.ok, false);
  assert.match(empty.message, /empty lineup/i);
});

test('validateLineupSubmission rejects newly starting Out but allows removing an already selected Out player', () => {
  const outBench = {
    id: '00456', name: 'Tight End Out', position: 'TE', team: 'SEA', rosterStatus: 'B', locked: false,
    selected: false, bye: null, opponent: null, homeAway: null, kickoffUtc: 1893456000, kickoffLocal: 'Sun 1:00 PM ET',
    injury: 'Out', projection: null, startPercentage: null, rosterRank: 1, statusText: 'Out · No bye · Unlocked',
    availability: 'injured', canToggle: false, group: 'TE',
  } as LineupRosterSnapshot;
  const outStarter = { ...outBench, rosterStatus: 'S' as const, selected: true, canToggle: true };
  const shared = {
    rules: { positions: [], flexSlots: 0, flexEligiblePositions: [], totalMin: 1, totalMax: 1 },
    rosterPlayerIds: new Set(['00456']),
    comments: '',
    clear: false,
  };

  const rejected = validateLineupSubmission({ ...shared, playersById: new Map([['00456', outBench]]), starters: ['00456'] });
  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /Out.*cannot be started/i);

  const removed = validateLineupSubmission({ ...shared, playersById: new Map([['00456', outStarter]]), starters: [] });
  assert.equal(removed.ok, false);
  assert.match(removed.message, /empty lineup/i);

  const removedWithOtherStarter = validateLineupSubmission({
    ...shared,
    playersById: new Map([
      ['00456', outStarter],
      ['00123', { ...outStarter, id: '00123', name: 'Quarterback One', position: 'QB', injury: null, rosterStatus: 'S', selected: true, locked: false, canToggle: true, group: 'QB' } as LineupRosterSnapshot],
    ]),
    rosterPlayerIds: new Set(['00123', '00456']),
    starters: ['00123'],
  });
  assert.equal(removedWithOtherStarter.ok, true);
});

test('POST rejects invalid origin, accidental clears, and sensitive fields stay out of the response', async () => {
  const request = new Request('https://example.com/api/mfl/lineup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
    body: JSON.stringify({ week: 8, starters: ['00123'], comments: 'hi' }),
  });

  const response = await submitLineup(request);
  const body = await response.json() as { ok?: boolean; message?: string; error?: string };

  assert.equal(response.status, 403);
  assert.equal(body.ok, false);
  assert.match(body.message ?? '', /origin/i);
  assert.equal(JSON.stringify(body).includes('MFL_USER_ID'), false);

  const clearRequest = new Request('https://example.com/api/mfl/lineup', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://example.com', cookie: 'MFL_USER_ID=session-123' },
    body: JSON.stringify({ week: 8, starters: [], clear: false }),
  });

  const clearResponse = await submitLineup(clearRequest);
  const clearBody = await clearResponse.json() as { ok?: boolean; message?: string };

  assert.equal(clearResponse.status, 400);
  assert.equal(clearBody.ok, false);
  assert.match(clearBody.message ?? '', /clear/i);
});

test('POST reports upstream auth, throttle, verified success, and mismatch errors', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const baseEnv = { ...process.env };
  process.env.MFL_PRIMARY_FRANCHISE_ID = '0004';
  let attempt = 0;
  let phase: 'context' | 'verify' | 'done' = 'context';

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE');
    calls.push(`${url.origin}${url.pathname}?${type}`);

    if (type === 'league' && phase === 'done') {
      attempt += 1;
      phase = 'context';
    }

    if (type === 'league') return createJsonResponse(makeLeaguePayload());
    if (type === 'schedule') return createJsonResponse(makeSchedulePayload());
    if (type === 'rosters') return createJsonResponse(makeRosterPayload());
    if (type === 'players') return createJsonResponse(makePlayersPayload());
    if (type === 'weeklyResults') {
      if (phase === 'context') {
        const week = url.searchParams.get('W');
        if (week === '7') return createJsonResponse(makePlayerStatusPayload('00234,'));
        return createJsonResponse(makePlayerStatusPayload('00123,'));
      }

      phase = 'done';
      return attempt === 0
        ? createJsonResponse(makeVerifiedPlayerStatusPayload())
        : createJsonResponse({ weeklyResults: { matchup: [{ franchise: [{ id: '0004', starters: '', player: [{ id: '00123', status: 'nonstarter' }] }] }] } });
    }
    if (type === 'projectedScores') return createJsonResponse(makeProjectedScoresPayload());
    if (type === 'injuries') return createJsonResponse(makeInjuriesPayload());
    if (type === 'topStarters') return createJsonResponse(makeTopStartersPayload());
    if (type === 'nflSchedule') return createJsonResponse(makeNflSchedulePayload());
    if (type === 'myleagues') return createJsonResponse(makeMyLeaguesPayload());
    if (String(input).includes('/import')) {
      phase = 'verify';
      return new Response('ok', { status: 200 });
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const okRequest = new Request('https://example.com/api/mfl/lineup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.com', cookie: 'MFL_USER_ID=session-123' },
      body: JSON.stringify({ week: 8, starters: ['00123', '00234', '00235', '00345', '00346', '00347', '00456', '00457', '00567', '00678'], comments: 'keep this secret' }),
    });

    const okResponse = await submitLineup(okRequest);
    const okBody = await okResponse.json() as { ok?: boolean; verified?: boolean; message?: string };

    assert.equal(okResponse.status, 200);
    assert.equal(okBody.ok, true);
    assert.equal(okBody.verified, true);
    assert.equal(calls.some((entry) => entry.includes('/import')), true);
    assert.equal(JSON.stringify(okBody).includes('keep this secret'), false);
    assert.equal(JSON.stringify(okBody).includes('MFL_USER_ID'), false);

    const mismatchRequest = new Request('https://example.com/api/mfl/lineup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://example.com', cookie: 'MFL_USER_ID=session-123' },
      body: JSON.stringify({ week: 8, starters: ['00123', '00234', '00235', '00345', '00346', '00347', '00456', '00457', '00567', '00678'], comments: 'keep this secret' }),
    });

    const mismatchResponse = await submitLineup(mismatchRequest);
    const mismatchBody = await mismatchResponse.json() as { ok?: boolean; message?: string };

    assert.equal(mismatchResponse.status, 409);
    assert.equal(mismatchBody.ok, false);
    assert.match(mismatchBody.message ?? '', /verification/i);

    const expiredResponse = new Response('denied', { status: 401 });
    assert.equal(expiredResponse.status, 401);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(baseEnv);
  }
});

test('importLineupSubmission maps upstream 401 and 429 errors to sanitized responses', async () => {
  const originalFetch = globalThis.fetch;
  const baseEnv = { ...process.env };
  process.env.MFL_PRIMARY_FRANCHISE_ID = '0004';

  let importStatus: 401 | 429 = 401;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE');

    if (type === 'league') return createJsonResponse(makeLeaguePayload());
    if (type === 'schedule') return createJsonResponse(makeSchedulePayload());
    if (type === 'rosters') return createJsonResponse(makeRosterPayload());
    if (type === 'players') return createJsonResponse(makePlayersPayload());
    if (type === 'weeklyResults') {
      const week = url.searchParams.get('W');
      if (week === '7') return createJsonResponse(makePlayerStatusPayload('00234,'));
      return createJsonResponse(makePlayerStatusPayload('00123,'));
    }
    if (type === 'projectedScores') return createJsonResponse(makeProjectedScoresPayload());
    if (type === 'injuries') return createJsonResponse(makeInjuriesPayload());
    if (type === 'topStarters') return createJsonResponse(makeTopStartersPayload());
    if (type === 'nflSchedule') return createJsonResponse(makeNflSchedulePayload());
    if (type === 'myleagues') return createJsonResponse(makeMyLeaguesPayload());
    if (String(input).includes('/import')) {
      return new Response('denied', { status: importStatus });
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const context = await loadLineupSubmissionContext('session-123', '8');
    const starters = ['00123', '00234', '00235', '00345', '00346', '00347', '00456', '00457', '00567', '00678'];

    const response401 = await importLineupSubmission({
      sessionCookieValue: 'session-123',
      franchiseId: context.franchiseId ?? '0004',
      week: 8,
      starters,
      comments: 'secret comment',
      clear: false,
      playersById: context.playersById,
      rosterPlayerIds: context.rosterPlayerIds,
      rules: context.rules,
    });

    assert.equal(response401.ok, false);
    assert.equal(response401.status, 401);
    assert.match(response401.message ?? '', /expired/i);

    importStatus = 429;

    const response429 = await importLineupSubmission({
      sessionCookieValue: 'session-123',
      franchiseId: context.franchiseId ?? '0004',
      week: 8,
      starters,
      comments: 'secret comment',
      clear: false,
      playersById: context.playersById,
      rosterPlayerIds: context.rosterPlayerIds,
      rules: context.rules,
    });

    assert.equal(response429.ok, false);
    assert.equal(response429.status, 429);
    assert.match(response429.message ?? '', /rate limiting/i);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(baseEnv);
  }
});

test('fetchMflExport stays on the configured MFL host', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    capturedUrl = String(input);
    return new Response('ok', { status: 200 });
  }) as typeof fetch;

  try {
    await fetchMflExport('league', { JSON: '1' }, { sessionCookieValue: 'session-123' });
    assert.match(capturedUrl, /www42\.myfantasyleague\.com\/2026\/export/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
