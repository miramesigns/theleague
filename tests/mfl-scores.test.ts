import assert from 'node:assert/strict';
import test from 'node:test';

import { fetchMflExport } from '../lib/mfl.ts';
import {
  estimateMflStyleWinChances,
  LIVE_SCORES_ERROR_MESSAGE,
  loadMatchupDetailState,
  loadScoreboardState,
  parseMflStatProjections,
  resolvePrimaryFranchiseId,
  type MatchupTeam,
} from '../lib/mfl-scores.ts';

const baseEnv = {
  ...process.env,
};

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in baseEnv)) {
      delete (process.env as Record<string, string | undefined>)[key];
    }
  }

  Object.assign(process.env, baseEnv);
}

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function makeLeaguePayload() {
  const franchises = [
    ['0001', 'Alpha Wolves', 'Alpha'],
    ['0002', 'Beta Bears', 'Beta'],
    ['0003', 'Crimson Cats', 'Crimson'],
    ['0004', 'The Ashy Elbows', 'Elbows'],
    ['0005', 'Emerald Eagles', 'Eagles'],
    ['0006', 'Frost Foxes', 'Frost'],
    ['0007', 'Granite Giants', 'Giants'],
    ['0008', 'Harbor Hawks', 'Harbor'],
    ['0009', 'Ivory Iguanas', 'Ivory'],
    ['0010', 'Jade Jaguars', 'Jade'],
    ['0011', 'Knight Owls', 'Knights'],
    ['0012', 'Lunar Lions', 'Lunar'],
  ].map(([id, name, abbrev]) => ({ id, name, abbrev }));

  return {
    league: {
      franchises: {
        franchise: franchises,
      },
    },
  };
}

function makeMatchup(
  home: string,
  away: string,
  options: {
    homeScore?: string;
    awayScore?: string;
    homeResult?: string;
    awayResult?: string;
    live?: boolean;
    starterTotal?: string;
    playersCurrentlyPlaying?: string;
    playersYetToPlay?: string;
    homePlayers?: Array<{ id: string; status: string; score: string; gameSecondsRemaining: string }>;
    awayPlayers?: Array<{ id: string; status: string; score: string; gameSecondsRemaining: string }>;
  } = {},
) {
  return {
    franchise: [
      {
        id: home,
        isHome: '1',
        ...(options.homeScore ? { score: options.homeScore } : {}),
        ...(options.homeResult ? { result: options.homeResult } : {}),
        ...(options.live
          ? {
              playersCurrentlyPlaying: options.playersCurrentlyPlaying ?? '1',
              playersYetToPlay: options.playersYetToPlay ?? '0',
              gameSecondsRemaining: '3600',
              ...(options.starterTotal ? { starters: { count: options.starterTotal } } : {}),
            }
          : {}),
        ...(options.homePlayers ? { players: { player: options.homePlayers } } : {}),
      },
      {
        id: away,
        isHome: '0',
        ...(options.awayScore ? { score: options.awayScore } : {}),
        ...(options.awayResult ? { result: options.awayResult } : {}),
        ...(options.live
          ? {
              playersCurrentlyPlaying: options.playersCurrentlyPlaying ?? '1',
              playersYetToPlay: options.playersYetToPlay ?? '0',
              gameSecondsRemaining: '3600',
              ...(options.starterTotal ? { starters: { count: options.starterTotal } } : {}),
            }
          : {}),
        ...(options.awayPlayers ? { players: { player: options.awayPlayers } } : {}),
      },
    ],
  };
}

function makeMyLeaguesPayload() {
  return {
    leagues: {
      league: [
        {
          league_id: '35743',
          franchise_id: '0004',
          franchise_name: 'The Ashy Elbows',
          name: 'MFL League Companion',
          url: 'https://example.invalid',
        },
      ],
    },
  };
}

function makePlayersPayload() {
  return {
    players: {
      player: [
        { id: 'p1001', name: 'Quarterback One', position: 'QB', team: 'WAS' },
        { id: 'p1002', name: 'Running Back One', position: 'RB', team: 'PHI' },
        { id: 'p1003', name: 'Wide Receiver One', position: 'WR', team: 'NYJ' },
        { id: 'p1004', name: 'Bench Tight End', position: 'TE', team: 'DAL' },
      ],
    },
  };
}

function makeProjectedScoresPayload() {
  return {
    projectedScores: {
      week: '8',
      playerScore: [
        { id: 'p1001', score: '24.0' },
        { id: 'p1002', score: '18.0' },
        { id: 'p1003', score: '14.0' },
        { id: 'p1004', score: '8.0' },
      ],
    },
  };
}

function makeNflSchedulePayload() {
  return {
    nflSchedule: {
      matchup: [
        {
          kickoff: '1789331100',
          gameSecondsRemaining: '1422',
          team: [
            { id: 'WAS', isHome: '0', score: '13' },
            { id: 'PHI', isHome: '1', score: '24' },
          ],
        },
        {
          kickoff: '1789431300',
          gameSecondsRemaining: '3600',
          team: [
            { id: 'NYJ', isHome: '0', score: '' },
            { id: 'DAL', isHome: '1', score: '' },
          ],
        },
      ],
    },
  };
}

function makeDetailedLiveScoringPayload() {
  return {
    liveScoring: {
      week: '8',
      matchup: [
        makeMatchup('0001', '0002', {
          homeScore: '101.5',
          awayScore: '98.2',
          live: true,
          starterTotal: '3',
          playersCurrentlyPlaying: '1',
          playersYetToPlay: '1',
          homePlayers: [
            { id: 'p1001', status: 'starter', score: '23.4', gameSecondsRemaining: '0' },
            { id: 'p1002', status: 'starter', score: '18.6', gameSecondsRemaining: '1200' },
            { id: 'p1004', status: 'starter', score: '7.0', gameSecondsRemaining: '3600' },
          ],
          awayPlayers: [
            { id: 'p1001', status: 'starter', score: '23.4', gameSecondsRemaining: '0' },
            { id: 'p1002', status: 'starter', score: '18.6', gameSecondsRemaining: '1200' },
            { id: 'p1003', status: 'starter', score: '11.2', gameSecondsRemaining: '3600' },
          ],
        }),
        makeMatchup('0003', '0004', {
          homeScore: '77.0',
          awayScore: '74.5',
          live: true,
          starterTotal: '3',
          playersCurrentlyPlaying: '1',
          playersYetToPlay: '1',
          homePlayers: [
            { id: 'p1001', status: 'starter', score: '23.4', gameSecondsRemaining: '0' },
            { id: 'p1004', status: 'starter', score: '7.0', gameSecondsRemaining: '1200' },
            { id: 'p1002', status: 'starter', score: '18.6', gameSecondsRemaining: '3600' },
          ],
          awayPlayers: [
            { id: 'p1002', status: 'starter', score: '18.6', gameSecondsRemaining: '0' },
            { id: 'p1003', status: 'starter', score: '11.2', gameSecondsRemaining: '900' },
            { id: 'p1004', status: 'starter', score: '7.0', gameSecondsRemaining: '3600' },
          ],
        }),
        makeMatchup('0005', '0006', { homeScore: '0.0', awayScore: '0.0' }),
        makeMatchup('0007', '0008', { homeScore: '123.4', awayScore: '120.1', live: true }),
        makeMatchup('0009', '0010', { homeScore: '88.8', awayScore: '91.3', homeResult: 'L', awayResult: 'W' }),
        makeMatchup('0011', '0012', { homeScore: '110.0', awayScore: '109.7' }),
      ],
    },
  };
}

function makeLiveScoringPayload() {
  return {
    liveScoring: {
      week: '8',
      matchup: [
        makeMatchup('0001', '0002', {
          homeScore: '101.5',
          awayScore: '98.2',
          live: true,
          starterTotal: '3',
          playersCurrentlyPlaying: '1',
          playersYetToPlay: '1',
        }),
        makeMatchup('0003', '0004', { homeScore: '77.0', awayScore: '74.5', homeResult: 'W', awayResult: 'L' }),
        makeMatchup('0005', '0006', { homeScore: '0.0', awayScore: '0.0' }),
        makeMatchup('0007', '0008', { homeScore: '123.4', awayScore: '120.1', live: true }),
        makeMatchup('0009', '0010', { homeScore: '88.8', awayScore: '91.3', homeResult: 'L', awayResult: 'W' }),
        makeMatchup('0011', '0012', { homeScore: '110.0', awayScore: '109.7' }),
      ],
    },
  };
}

function makeWeeklyResultsPayload() {
  return {
    weeklyResults: {
      week: '7',
      matchup: [
        makeMatchup('0001', '0002', { homeScore: '99.5', awayScore: '96.1', homeResult: 'W', awayResult: 'L' }),
        makeMatchup('0003', '0004', { homeScore: '78.0', awayScore: '80.3', homeResult: 'L', awayResult: 'W' }),
        makeMatchup('0005', '0006', { homeScore: '66.6', awayScore: '66.6', homeResult: 'T', awayResult: 'T' }),
        makeMatchup('0007', '0008', { homeScore: '121.4', awayScore: '118.8', homeResult: 'L', awayResult: 'W' }),
        makeMatchup('0009', '0010', { homeScore: '92.8', awayScore: '88.9', homeResult: 'W', awayResult: 'L' }),
        makeMatchup('0011', '0012', { homeScore: '109.2', awayScore: '107.0', homeResult: 'L', awayResult: 'W' }),
      ],
    },
  };
}

function makeSchedulePayload() {
  return {
    schedule: {
      weeklySchedule: [
        {
          week: '7',
          matchup: [
            makeMatchup('0001', '0002', { homeScore: '99.5', awayScore: '96.1', homeResult: 'W', awayResult: 'L' }),
            makeMatchup('0003', '0004', { homeScore: '78.0', awayScore: '80.3', homeResult: 'L', awayResult: 'W' }),
            makeMatchup('0005', '0006', { homeScore: '66.6', awayScore: '60.4', homeResult: 'W', awayResult: 'L' }),
            makeMatchup('0007', '0008', { homeScore: '121.4', awayScore: '118.8', homeResult: 'L', awayResult: 'W' }),
            makeMatchup('0009', '0010', { homeScore: '92.8', awayScore: '88.9', homeResult: 'W', awayResult: 'L' }),
            makeMatchup('0011', '0012', { homeScore: '109.2', awayScore: '107.0', homeResult: 'L', awayResult: 'W' }),
          ],
        },
        {
          week: '8',
          matchup: [
            makeMatchup('0001', '0002', { homeScore: '101.5', awayScore: '98.2', live: true }),
            makeMatchup('0003', '0004', { homeScore: '77.0', awayScore: '74.5', homeResult: 'W', awayResult: 'L' }),
            makeMatchup('0005', '0006', { homeScore: '0.0', awayScore: '0.0' }),
            makeMatchup('0007', '0008', { homeScore: '123.4', awayScore: '120.1', live: true }),
            makeMatchup('0009', '0010', { homeScore: '88.8', awayScore: '91.3', homeResult: 'L', awayResult: 'W' }),
            makeMatchup('0011', '0012', { homeScore: '110.0', awayScore: '109.7' }),
          ],
        },
        {
          week: '9',
          matchup: [
            makeMatchup('0001', '0002'),
            makeMatchup('0003', '0004'),
            makeMatchup('0005', '0006'),
            makeMatchup('0007', '0008'),
            makeMatchup('0009', '0010'),
            makeMatchup('0011', '0012'),
          ],
        },
      ],
    },
  };
}

function setNodeEnv(value: string) {
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = value;
}

test('fetchMflExport forwards the configured user agent, no-store cache, and MFL session cookie', async () => {
  const originalFetch = globalThis.fetch;
  const captured: { url?: string; init?: RequestInit } = {};

  process.env.MFL_USER_AGENT = 'Test Agent';

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.url = String(input);
    captured.init = init;
    return new Response('ok', { status: 200 });
  }) as typeof fetch;

  try {
    await fetchMflExport('liveScoring', { week: '3' }, { sessionCookieValue: 'session-123' });

    assert.equal(captured.url?.includes('TYPE=liveScoring'), true);
    assert.equal(captured.url?.includes('week=3'), true);
    assert.equal(captured.init?.cache, 'no-store');
    const headers = new Headers(captured.init?.headers);
    assert.equal(headers.get('User-Agent'), 'Test Agent');
    assert.equal(headers.get('Cookie'), 'MFL_USER_ID=session-123');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('MFL-style simulation makes the projected favorite the favorite despite a current deficit', () => {
  const statProjections = parseMflStatProjections([
    '13116,QB,PC=21.72,RA=3.61,#P=2.23,#R=0.26,APY=10.5967,ARY=6.0000,IN=0.65,FL=0.06,P2=0.16,PA=34.05,TGT=0.05',
    '11244,TE,RA=0.04,CC=5,#C=0.27,ARY=1.0000,ACY=9.7820,FL=0.03,TGT=7.34',
    '13630,WR,CC=4.15,#C=0.4,ACY=13.3253,FL=0.03,TGT=7.28',
  ].join('\n'));
  const team = (teamId: string, score: number, isHome: boolean, players: Array<[string, string]>): MatchupTeam => ({
    teamId,
    teamName: teamId,
    teamAbbrev: null,
    isHome,
    score,
    result: null,
    status: 'Live',
    players: players.map(([id, position]) => ({
      id,
      name: id,
      position,
      nflTeam: null,
      status: 'starter',
      score: 0,
      projection: null,
      gameSecondsRemaining: 3600,
    })),
    summary: {
      starterTotal: 10,
      played: 10 - players.length,
      playing: 0,
      yetToPlay: players.length,
      winChance: null,
      winChanceMode: 'unavailable',
    },
  });

  const chances = estimateMflStyleWinChances(
    team('The Ashy Elbows', 57.4, true, [['13116', 'QB'], ['11244', 'TE']]),
    team('Outlaw Joker', 90, false, [['13630', 'WR']]),
    1,
    statProjections,
  );

  assert.notEqual(chances.home, null);
  assert.notEqual(chances.away, null);
  if (chances.home === null || chances.away === null) throw new Error('Expected simulated probabilities.');
  assert.equal(chances.home + chances.away, 100);
  assert.ok(chances.home >= 68 && chances.home <= 75);
  assert.ok(chances.away >= 25 && chances.away <= 32);
});

test('loadScoreboardState defaults to the current live week and uses live scoring', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ type: string; week?: string | null }> = [];
  const leaguePayload = makeLeaguePayload();
  const livePayload = makeLiveScoringPayload();
  const schedulePayload = makeSchedulePayload();

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE');
    requests.push({ type: type || '', week: url.searchParams.get('W') });

    if (type === 'liveScoring') {
      return createJsonResponse(livePayload);
    }

    if (type === 'league') {
      return createJsonResponse(leaguePayload);
    }

    if (type === 'schedule') {
      return createJsonResponse(schedulePayload);
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    delete (process.env as Record<string, string | undefined>).MFL_PRIMARY_FRANCHISE_ID;
    const result = await loadScoreboardState('session-123');

    assert.equal(result.source, 'live');
    assert.equal(result.currentWeek, 8);
    assert.equal(result.selectedWeek, 8);
    assert.equal(result.matchups.length, 6);
    assert.equal(requests.some((request) => request.type === 'weeklyResults'), false);
    assert.equal(result.matchups[0].home.teamName, 'Alpha Wolves');
    assert.equal(result.matchups[0].home.teamAbbrev, 'Alpha');
    assert.equal(result.matchups[0].away.teamName, 'Beta Bears');
    assert.equal(result.matchups[0].away.teamAbbrev, 'Beta');
    assert.equal(result.matchups.every((matchup) => matchup.home.isHome && !matchup.away.isHome), true);
    assert.equal(result.matchups[0].home.summary.played, 1);
    assert.equal(result.matchups[0].home.summary.playing, 1);
    assert.equal(result.matchups[0].home.summary.yetToPlay, 1);
    assert.equal(result.matchups[0].home.summary.winChance, null);
    assert.equal(result.matchups[0].away.summary.winChance, null);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('loadScoreboardState uses weekly results for a past week and schedule for a future week', async () => {
  const originalFetch = globalThis.fetch;
  const leaguePayload = makeLeaguePayload();
  const livePayload = makeLiveScoringPayload();
  const resultsPayload = makeWeeklyResultsPayload();
  const schedulePayload = makeSchedulePayload();
  const requests: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE') || '';
    const week = url.searchParams.get('W');
    requests.push(`${type}:${week || ''}`);

    if (type === 'liveScoring') {
      return createJsonResponse(livePayload);
    }

    if (type === 'league') {
      return createJsonResponse(leaguePayload);
    }

    if (type === 'schedule') {
      return createJsonResponse(schedulePayload);
    }

    if (type === 'weeklyResults' && week === '7') {
      return createJsonResponse(resultsPayload);
    }

    if (type === 'weeklyResults' && week === '9') {
      return new Response('not found', { status: 404 });
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    delete (process.env as Record<string, string | undefined>).MFL_PRIMARY_FRANCHISE_ID;
    const past = await loadScoreboardState('session-123', '7');
    const future = await loadScoreboardState('session-123', '9');

    assert.equal(past.source, 'results');
    assert.equal(past.selectedWeek, 7);
    assert.equal(past.matchups.length, 6);
    assert.equal(past.matchups[0].home.score, 99.5);
    assert.equal(past.matchups[0].home.status, 'Final');
    assert.equal(past.matchups[0].home.summary.winChance, 100);
    assert.equal(past.matchups[0].away.summary.winChance, 0);
    assert.equal(past.matchups[2].home.summary.winChance, 50);
    assert.equal(past.matchups[2].away.summary.winChance, 50);

    assert.equal(future.source, 'schedule');
    assert.equal(future.selectedWeek, 9);
    assert.equal(future.matchups.length, 6);
    assert.equal(future.matchups[0].home.score, null);
    assert.equal(future.matchups[0].home.status, 'Scheduled');
    assert.equal(future.matchups[0].home.summary.winChance, null);
    assert.equal(future.matchups.every((matchup) => matchup.home.teamId && matchup.away.teamId), true);
    assert.equal(requests.some((request) => request === 'weeklyResults:7'), true);
    assert.equal(requests.some((request) => request === 'weeklyResults:9'), false);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('loadScoreboardState validates week bounds and shows a visible error for invalid weeks', async () => {
  const originalFetch = globalThis.fetch;
  const leaguePayload = makeLeaguePayload();
  const livePayload = makeLiveScoringPayload();
  const schedulePayload = makeSchedulePayload();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE');

    if (type === 'liveScoring') {
      return createJsonResponse(livePayload);
    }

    if (type === 'league') {
      return createJsonResponse(leaguePayload);
    }

    if (type === 'schedule') {
      return createJsonResponse(schedulePayload);
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    delete (process.env as Record<string, string | undefined>).MFL_PRIMARY_FRANCHISE_ID;
    const result = await loadScoreboardState('session-123', '99');

    assert.equal(result.source, 'error');
    assert.equal(result.matchups.length, 0);
    assert.equal(result.currentWeek, 8);
    assert.equal(result.selectedWeek, 8);
    assert.match(result.message, /outside the available schedule/i);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('loadScoreboardState returns a visible error state when live data fails', async () => {
  const originalFetch = globalThis.fetch;
  const env = process.env as Record<string, string | undefined>;

  globalThis.fetch = (async () => {
    return new Response('denied', { status: 401, headers: { 'content-type': 'text/plain' } });
  }) as typeof fetch;

  try {
    delete (process.env as Record<string, string | undefined>).MFL_PRIMARY_FRANCHISE_ID;
    delete env.MFL_ALLOW_MOCK_SCORES;
    setNodeEnv('production');

    const result = await loadScoreboardState(null);

    assert.equal(result.source, 'error');
    assert.equal(result.matchups.length, 0);
    assert.equal(result.message, LIVE_SCORES_ERROR_MESSAGE);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('resolvePrimaryFranchiseId uses authenticated league mapping when available', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE');

    if (type === 'myleagues') {
      return createJsonResponse(makeMyLeaguesPayload());
    }

    if (type === 'nflSchedule') {
      return createJsonResponse(makeNflSchedulePayload());
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    const resolved = await resolvePrimaryFranchiseId('session-123');

    assert.equal(resolved?.franchiseId, '0004');
    assert.equal(resolved?.source, 'authenticated');
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('loadScoreboardState promotes franchise 0004 to the first matchup card', async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  const leaguePayload = makeLeaguePayload();
  const livePayload = makeDetailedLiveScoringPayload();
  const schedulePayload = makeSchedulePayload();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE') || '';
    requests.push(type);

    if (type === 'liveScoring') {
      return createJsonResponse(livePayload);
    }

    if (type === 'league') {
      return createJsonResponse(leaguePayload);
    }

    if (type === 'schedule') {
      return createJsonResponse(schedulePayload);
    }

    if (type === 'myleagues') {
      return createJsonResponse(makeMyLeaguesPayload());
    }

    if (type === 'nflSchedule') {
      return createJsonResponse(makeNflSchedulePayload());
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    process.env.MFL_PRIMARY_FRANCHISE_ID = '0004';
    const result = await loadScoreboardState('session-123');

    assert.equal(result.primaryFranchiseId, '0004');
    assert.equal(result.matchups[0].isPrimary, true);
    assert.equal(result.matchups[0].away.teamId, '0004');
    assert.equal(result.matchups[0].hrefFranchiseId, '0004');
    assert.equal(result.matchups[0].away.teamName, 'The Ashy Elbows');
    assert.equal(result.matchups[0].away.teamAbbrev, 'Elbows');
    assert.equal(requests.includes('myleagues'), true);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});

test('loadMatchupDetailState maps live player ids to names and hides fake scores for scheduled weeks', async () => {
  const originalFetch = globalThis.fetch;
  const leaguePayload = makeLeaguePayload();
  const currentLivePayload = makeDetailedLiveScoringPayload();
  const selectedLivePayload = makeDetailedLiveScoringPayload();
  const playersPayload = makePlayersPayload();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const type = url.searchParams.get('TYPE') || '';
    const week = url.searchParams.get('W');

    if (type === 'liveScoring' && !week) {
      return createJsonResponse(currentLivePayload);
    }

    if (type === 'liveScoring' && (week === '8' || week === '9')) {
      return createJsonResponse(selectedLivePayload);
    }

    if (type === 'league') {
      return createJsonResponse(leaguePayload);
    }

    if (type === 'players') {
      return createJsonResponse(playersPayload);
    }

    if (type === 'projectedScores') {
      return createJsonResponse(makeProjectedScoresPayload());
    }

    if (type === 'myleagues') {
      return createJsonResponse(makeMyLeaguesPayload());
    }

    if (type === 'nflSchedule') {
      return createJsonResponse(makeNflSchedulePayload());
    }

    if (String(input).includes('live_stats_')) {
      return new Response('p1002|RA 12|RY 55|#R 1|RS 3\np1001|PC 18|PA 25|PY 210|#P 2|PS 5,12|IN 0\n', {
        status: 200,
        headers: { 'content-type': 'text/plain' },
      });
    }

    if (String(input).includes('live_proj_')) {
      return new Response('', { status: 200, headers: { 'content-type': 'text/plain' } });
    }

    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  try {
    process.env.MFL_PRIMARY_FRANCHISE_ID = '0004';

    const liveResult = await loadMatchupDetailState('session-123', '8', '0004');
    assert.equal(liveResult.source, 'live');
    assert.equal(liveResult.matchup?.primaryTeamId, '0004');
    assert.equal(liveResult.matchup?.away.players[0].name, 'Running Back One');
    assert.equal(liveResult.matchup?.away.players[0].score, 18.6);
    assert.equal(liveResult.matchup?.away.players[0].statsText, 'Rush: 12/55, 1 RuTD (3)');
    assert.equal(liveResult.matchup?.home.players[0].statsText, 'Pass: 18/25, 210 Yd, 2 PaTD (5,12)');
    assert.equal(liveResult.matchup?.home.summary.played, 1);
    assert.equal(liveResult.matchup?.home.summary.playing, 1);
    assert.equal(liveResult.matchup?.home.summary.yetToPlay, 1);
    assert.equal(liveResult.matchup?.away.summary.played, 1);
    assert.equal(liveResult.matchup?.away.summary.playing, 1);
    assert.equal(liveResult.matchup?.away.summary.yetToPlay, 1);
    assert.equal(liveResult.matchup?.home.summary.winChance, 95);
    assert.equal(liveResult.matchup?.away.summary.winChance, 5);
    assert.equal(liveResult.matchup?.home.players[0].liveStateText, 'Playing · Q3 08:42 left');
    assert.equal(liveResult.matchup?.away.players[0].liveStateText, 'Playing · Q3 08:42 left');
    assert.equal(liveResult.matchup?.away.players[1].liveStateText, 'Yet to play');
    assert.equal(liveResult.matchup?.away.players[1].statsText ?? null, null);
    assert.equal(liveResult.matchup?.away.players[1].scheduleCue, '@ DAL · Mon 8:15');
    assert.equal(liveResult.matchup?.away.players[0].scheduleCue, 'vs WAS · Sun 4:25');

    const scheduledResult = await loadMatchupDetailState('session-123', '9', '0004');
    assert.equal(scheduledResult.source, 'schedule');
    assert.equal(scheduledResult.matchup?.away.summary.winChance, null);
    assert.equal(scheduledResult.matchup?.away.players.every((player) => player.score === null), true);
    assert.equal(scheduledResult.matchup?.away.players.every((player) => !player.statsText), true);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv();
  }
});
