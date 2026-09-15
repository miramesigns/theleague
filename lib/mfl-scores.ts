import { fetchMflExport, fetchMflLiveProjections, fetchMflSiteExport, getMflConfig } from './mfl.ts';
import { addPlayerLiveState, loadNflScheduleGames } from './mfl-live-state.ts';

const LIVE_SCORES_ERROR_MESSAGE = 'Live data could not be loaded. Please sign in on the More tab and try again.';
const MATCHUP_ERROR_MESSAGE = 'Matchup details could not be loaded. Please refresh and try again.';

export type ScoresSource = 'live' | 'results' | 'schedule' | 'error';

export type MatchupPlayer = {
  id: string;
  name: string;
  position: string;
  nflTeam: string | null;
  status: 'starter' | 'bench' | 'reserve';
  score: number | null;
  projection: number | null;
  gameSecondsRemaining: number | null;
  liveStateText?: string;
};

export type MatchupTeamSummary = {
  starterTotal: number | null;
  played: number | null;
  playing: number | null;
  yetToPlay: number | null;
  winChance: number | null;
  winChanceMode: 'estimated' | 'exact' | 'unavailable';
};

export type MatchupTeam = {
  teamId: string;
  teamName: string;
  isHome: boolean;
  score: number | null;
  result: string | null;
  status: 'Live' | 'Final' | 'Scheduled';
  players: MatchupPlayer[];
  summary: MatchupTeamSummary;
};

export type MatchupCard = {
  home: MatchupTeam;
  away: MatchupTeam;
  hrefFranchiseId: string;
  isPrimary: boolean;
};

export type ScoresPageState = {
  source: ScoresSource;
  message: string;
  currentWeek: number | null;
  selectedWeek: number | null;
  availableWeeks: number[];
  matchups: MatchupCard[];
  primaryFranchiseId: string | null;
};

export type MatchupDetailState = {
  source: ScoresSource;
  message: string;
  currentWeek: number | null;
  selectedWeek: number | null;
  matchup: {
    home: MatchupTeam;
    away: MatchupTeam;
    primaryTeamId: string | null;
  } | null;
};

type NamedPlayer = {
  name: string;
  position: string;
  team: string | null;
};

type ParsedWeek = {
  weeks: number[];
  weekMap: Map<number, Record<string, unknown>>;
};

export type PrimaryFranchiseResolution = {
  franchiseId: string;
  source: 'authenticated' | 'fallback';
} | null;

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function safeWeek(value: unknown): number | null {
  const parsed = safeNumber(value);
  return parsed !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'home') {
      return true;
    }

    if (normalized === '0' || normalized === 'false' || normalized === 'away') {
      return false;
    }
  }

  return null;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    return [value];
  }

  return [];
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function extractText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['#text', 'name', 'franchise_name', 'team_name', 'title', 'position']) {
      const nested = record[key];
      if (typeof nested === 'string' && nested.trim()) {
        return nested.trim();
      }
    }
  }

  return '';
}

function toJsonArray(value: unknown): Record<string, unknown>[] {
  return toArray(value).map((entry) => toRecord(entry)).filter((entry): entry is Record<string, unknown> => entry !== null);
}

function normalizeFranchiseId(value: unknown): string | null {
  const text = extractText(value);
  return /^\d{4}$/.test(text) ? text : null;
}

function buildErrorState(message = LIVE_SCORES_ERROR_MESSAGE): ScoresPageState {
  return {
    source: 'error',
    message,
    currentWeek: null,
    selectedWeek: null,
    availableWeeks: [],
    matchups: [],
    primaryFranchiseId: null,
  };
}

function buildDetailErrorState(message = MATCHUP_ERROR_MESSAGE): MatchupDetailState {
  return {
    source: 'error',
    message,
    currentWeek: null,
    selectedWeek: null,
    matchup: null,
  };
}

function determineLiveStatus(franchise: Record<string, unknown>): MatchupTeam['status'] {
  const secondsRemaining = safeNumber(franchise.gameSecondsRemaining) ?? 0;
  const playersCurrentlyPlaying = safeNumber(franchise.playersCurrentlyPlaying) ?? 0;
  const playersYetToPlay = safeNumber(franchise.playersYetToPlay) ?? 0;

  if (secondsRemaining > 0 || playersCurrentlyPlaying > 0) {
    return 'Live';
  }

  if (playersYetToPlay > 0) {
    return 'Scheduled';
  }

  return 'Final';
}

function parseLeagueNames(leaguePayload: unknown): Map<string, string> | null {
  const leagueRoot = toRecord(leaguePayload)?.league;
  const leagueRecord = toRecord(leagueRoot);
  const franchisesRecord = toRecord(leagueRecord?.franchises);
  const franchises = toJsonArray(franchisesRecord?.franchise);

  if (franchises.length !== 12) {
    return null;
  }

  const namesById = new Map<string, string>();

  for (const franchise of franchises) {
    const id = extractText(franchise.id);
    if (!id) {
      return null;
    }

    const name = extractText(franchise.name) || `Franchise ${id}`;
    namesById.set(id, name);
  }

  return namesById.size === 12 ? namesById : null;
}

function parsePlayersExport(playersPayload: unknown): Map<string, NamedPlayer> | null {
  const playersRoot = toRecord(playersPayload)?.players;
  const playersRecord = toRecord(playersRoot);
  const players = toJsonArray(playersRecord?.player);

  if (players.length === 0) {
    return null;
  }

  const playersById = new Map<string, NamedPlayer>();

  for (const player of players) {
    const id = extractText(player.id);
    if (!id) {
      continue;
    }

    const name = extractText(player.name) || extractText(player.full_name) || extractText(player.title) || `Player ${id}`;
    const position = extractText(player.position) || extractText(player.pos) || extractText(player.fantasy_position) || 'UNK';
    const team = extractText(player.team) || extractText(player.nfl_team) || extractText(player.nflTeam) || null;
    playersById.set(id, { name, position, team: team || null });
  }

  return playersById.size > 0 ? playersById : null;
}

function parseScheduleWeeks(schedulePayload: unknown): ParsedWeek | null {
  const scheduleRoot = toRecord(schedulePayload)?.schedule;
  const weeklySchedule = toJsonArray(toRecord(scheduleRoot)?.weeklySchedule);

  if (weeklySchedule.length === 0) {
    return null;
  }

  const weekMap = new Map<number, Record<string, unknown>>();

  for (const weekRecord of weeklySchedule) {
    const week = safeWeek(weekRecord.week);
    if (week === null || weekMap.has(week)) {
      return null;
    }

    weekMap.set(week, weekRecord);
  }

  return {
    weeks: [...weekMap.keys()].sort((left, right) => left - right),
    weekMap,
  };
}

function parseWeekParam(weekParam: string | null | undefined): number | null | 'invalid' {
  if (weekParam == null || weekParam.trim() === '') {
    return null;
  }

  if (!/^\d+$/.test(weekParam.trim())) {
    return 'invalid';
  }

  const parsed = Number(weekParam.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 'invalid';
}

function parseFranchiseIdParam(franchiseId: string | null | undefined): string | null | 'invalid' {
  if (franchiseId == null || franchiseId.trim() === '') {
    return null;
  }

  const normalized = franchiseId.trim();
  return /^\d{4}$/.test(normalized) ? normalized : 'invalid';
}

function parsePlayerGroup(status: unknown): MatchupPlayer['status'] {
  const normalized = extractText(status).toLowerCase();

  if (normalized === 'starter') {
    return 'starter';
  }

  if (normalized === 'reserve' || normalized === 'ir' || normalized === 'taxi') {
    return 'reserve';
  }

  return 'bench';
}

function toNonNegativeInteger(value: unknown): number | null {
  const parsed = safeNumber(value);
  return parsed !== null && Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function extractStarterTotal(franchise: Record<string, unknown>): number | null {
  const starters = toRecord(franchise.starters);
  const candidates = [
    starters?.count,
    starters?.total,
    franchise.starterTotal,
    franchise.starter_total,
    franchise.playersStarted,
    franchise.startersCount,
  ];

  for (const candidate of candidates) {
    const total = toNonNegativeInteger(candidate);
    if (total !== null) {
      return total;
    }
  }

  return null;
}

function classifyStarterPlayer(player: MatchupPlayer): 'played' | 'playing' | 'yetToPlay' | 'unknown' {
  if (player.status !== 'starter') {
    return 'unknown';
  }

  if (player.gameSecondsRemaining === 0) {
    return 'played';
  }

  if (player.gameSecondsRemaining === null || player.gameSecondsRemaining === 3600) {
    return 'yetToPlay';
  }

  return 'playing';
}

function deriveStarterPhaseSummary(franchise: Record<string, unknown>, players: MatchupPlayer[], source: ScoresSource): MatchupTeamSummary {
  if (source === 'schedule') {
    return {
      starterTotal: null,
      played: null,
      playing: null,
      yetToPlay: null,
      winChance: null,
      winChanceMode: 'unavailable',
    };
  }

  const starterPlayers = players.filter((player) => player.status === 'starter');
  const starterTotal = extractStarterTotal(franchise) ?? (starterPlayers.length > 0 ? starterPlayers.length : null);
  const playing = toNonNegativeInteger(franchise.playersCurrentlyPlaying);
  const yetToPlay = toNonNegativeInteger(franchise.playersYetToPlay);

  if (starterTotal !== null && playing !== null && yetToPlay !== null && playing + yetToPlay <= starterTotal) {
    return {
      starterTotal,
      played: starterTotal - playing - yetToPlay,
      playing,
      yetToPlay,
      winChance: null,
      winChanceMode: 'unavailable',
    };
  }

  if (starterPlayers.length === 0) {
    return {
      starterTotal,
      played: null,
      playing: null,
      yetToPlay: null,
      winChance: null,
      winChanceMode: 'unavailable',
    };
  }

  let playedCount = 0;
  let playingCount = 0;
  let yetToPlayCount = 0;

  for (const player of starterPlayers) {
    const phase = classifyStarterPlayer(player);
    if (phase === 'played') {
      playedCount += 1;
    } else if (phase === 'playing') {
      playingCount += 1;
    } else if (phase === 'yetToPlay') {
      yetToPlayCount += 1;
    }
  }

  return {
    starterTotal,
    played: starterTotal !== null ? starterTotal - playingCount - yetToPlayCount : playedCount,
    playing: playingCount,
    yetToPlay: yetToPlayCount,
    winChance: null,
    winChanceMode: 'unavailable',
  };
}

function isFinalTeamStatus(status: MatchupTeam['status']): boolean {
  return status === 'Final';
}

function clampPercentage(value: number): number {
  return Math.max(1, Math.min(99, value));
}

const WIN_PROBABILITY_SIMULATIONS = 400;

type MflStatProjection = Record<string, number>;
type MflStatProjections = {
  players: Map<string, MflStatProjection>;
  teams: Map<string, MflStatProjection>;
};

const MINIMUM_PLAYER_PROJECTIONS: Record<string, MflStatProjection> = {
  QB: { '#P': 0.07, '#R': 0.03, '#C': 0.01, IN: 0.05, FL: 0.02, CC: 0.02, PC: 2, RA: 0.2, P2: 0.02, R2: 0.01, APY: 0.5, ARY: 0.1, ACY: 0.1, PA: 3, TGT: 0.05 },
  TMQB: { '#P': 0.1, '#R': 0.06, '#C': 0.01, IN: 0.05, FL: 0.02, CC: 0.02, PC: 10, RA: 0.5, P2: 0.2, R2: 0.1, APY: 0.5, ARY: 0.1, ACY: 0.1, PA: 15, TGT: 0.05 },
  RB: { '#P': 0.02, '#R': 0.08, '#C': 0.05, IN: 0.01, FL: 0.02, CC: 0.4, PC: 0.02, RA: 2, R2: 0.02, PA: 0.04, APY: 0.2, ARY: 0.2, ACY: 0.2, TGT: 0.8 },
  WR: { '#P': 0.02, '#R': 0.02, '#C': 0.09, IN: 0.01, FL: 0.02, CC: 0.8, PC: 0.01, RA: 0.1, C2: 0.02, PA: 0.02, APY: 0.2, ARY: 0.1, ACY: 0.3, TGT: 1 },
  TE: { '#P': 0.02, '#R': 0.02, '#C': 0.1, IN: 0.01, FL: 0.02, CC: 0.5, PC: 0.01, RA: 0.08, C2: 0.02, PA: 0.02, APY: 0.2, ARY: 0.1, ACY: 0.2, TGT: 0.9 },
};

const MINIMUM_TEAM_PROJECTION: MflStatProjection = {
  AS: 4, TK: 6, SK: 0.3, IC: 0.15, FC: 0.1, TPA: 0, OPA: 0, TYA: 0, '#T': 0.01,
};

const MFL_EVENT_STATS = new Set([
  '#P', '#R', '#C', 'PC', 'RA', 'CC', 'PA', 'TGT', 'PD', 'IN', 'FL',
  'P2', 'R2', 'C2', 'IC', 'FC', '#F', 'EP', 'EM',
]);

function emptyStatProjections(): MflStatProjections {
  return { players: new Map(), teams: new Map() };
}

export function parseMflStatProjections(source: string): MflStatProjections {
  const projections = emptyStatProjections();

  for (const line of source.split(/\r?\n/)) {
    const [id, position, ...fields] = line.split(',');
    if (!id || !position) continue;

    const isPlayer = /^\d+$/.test(id);
    const base = isPlayer ? MINIMUM_PLAYER_PROJECTIONS[position] : position === 'Def' ? MINIMUM_TEAM_PROJECTION : undefined;
    const stats: MflStatProjection = { ...(base ?? {}) };

    for (const field of fields) {
      const [stat, rawValue] = field.split('=');
      const value = Number(rawValue);
      if (stat && Number.isFinite(value)) stats[stat] = (stats[stat] ?? 0) + value;
    }

    (isPlayer ? projections.players : projections.teams).set(id, stats);
  }

  return projections;
}

async function loadMflStatProjections(week: number, sessionCookieValue: string | null): Promise<MflStatProjections> {
  try {
    const response = await fetchMflLiveProjections(week, { sessionCookieValue, cache: 'no-store' });
    return response.ok ? parseMflStatProjections(await response.text()) : emptyStatProjections();
  } catch {
    return emptyStatProjections();
  }
}

type SeededRandom = {
  next: () => number;
  normal: (mean: number, standardDeviation: number) => number;
};

function createMflStyleRandom(playerId: string, week: number): SeededRandom {
  const modulusOne = 4_294_967_087;
  const modulusTwo = 4_294_965_887;
  const numericId = Number(playerId);
  let seed = Number.isFinite(numericId)
    ? numericId
    : 100_000 + [...playerId].reduce((total, character, index) => total + character.charCodeAt(0) * (index + 1), 0);

  seed *= week;
  let seedOne = seed % (modulusOne - 1) + 1;
  let seedTwo = seed % (modulusTwo - 1) + 1;
  let spareNormal: number | null = null;

  const next = () => {
    seedOne = (seedOne * 65_539) % modulusOne;
    seedTwo = (seedTwo * 65_537) % modulusTwo;
    return ((seedOne + seedTwo) % 0xffffffff) / 0xffffffff;
  };

  for (let index = 0; index < 5; index += 1) {
    next();
  }

  return {
    next,
    normal(mean, standardDeviation) {
      if (spareNormal !== null) {
        const value = spareNormal;
        spareNormal = null;
        return mean + standardDeviation * value;
      }

      const first = Math.max(next(), Number.EPSILON);
      const second = next();
      const radius = Math.sqrt(-2 * Math.log(first));
      const angle = 2 * Math.PI * second;
      spareNormal = radius * Math.sin(angle);
      return mean + standardDeviation * radius * Math.cos(angle);
    },
  };
}

function poisson(random: SeededRandom, mean: number): number {
  if (mean <= 0) return 0;
  const target = random.next();
  let count = -1;
  let factorial = 1;
  let cumulativeProbability = 0;

  while (cumulativeProbability < target) {
    count += 1;
    if (count > 0) factorial *= count;
    cumulativeProbability += Math.pow(mean, count) * Math.exp(-mean) / factorial;
  }

  return count;
}

function simulateFromStatProjection(
  player: MatchupPlayer,
  projection: MflStatProjection,
  secondsRemaining: number,
  week: number,
): number[] {
  const fraction = secondsRemaining / 3600;
  const random = createMflStyleRandom(player.id, week);

  return Array.from({ length: WIN_PROBABILITY_SIMULATIONS }, () => {
    const simulated: MflStatProjection = {};
    for (const [stat, projectedValue] of Object.entries(projection)) {
      const blendedMean = projectedValue * fraction;
      simulated[stat] = MFL_EVENT_STATS.has(stat)
        ? poisson(random, Math.max(0, blendedMean * fraction))
        : Math.max(0, random.normal(blendedMean, Math.abs(projectedValue) / 2.5) * fraction);
    }

    const completions = simulated.PC ?? 0;
    const rushes = simulated.RA ?? 0;
    const receptions = simulated.CC ?? 0;
    simulated.PY = completions > 0 ? Math.max(0, random.normal(projection.APY ?? 0, 2) * completions) : 0;
    simulated.RY = rushes > 0 ? Math.max(0, random.normal(projection.ARY ?? 0, 1) * rushes) : 0;
    simulated.CY = receptions > 0 ? Math.max(0, random.normal(projection.ACY ?? 0, 2) * receptions) : 0;

    if (player.position.toLowerCase() === 'def') {
      return (simulated.IC ?? 0) * 2 +
        (simulated.FC ?? 0) * 2 +
        (simulated.SK ?? 0) +
        12.5 - (simulated.OPA ?? 0) * 0.5;
    }

    let points =
      (simulated['#P'] ?? 0) * 6 +
      (simulated['#R'] ?? 0) * 6 +
      (simulated['#C'] ?? 0) * 6 +
      (simulated.P2 ?? 0) * 2 +
      (simulated.R2 ?? 0) * 2 +
      (simulated.C2 ?? 0) * 2 +
      (simulated.EP ?? 0) -
      (simulated.EM ?? 0) -
      (simulated.IN ?? 0) * 2 +
      simulated.PY * 0.1 +
      simulated.RY * 0.1 +
      simulated.CY * 0.1 +
      receptions;

    const fieldGoals = Math.round(simulated['#F'] ?? 0);
    for (let fieldGoal = 0; fieldGoal < fieldGoals; fieldGoal += 1) {
      const distance = random.normal(41, 6);
      points += distance >= 60 ? 6 : distance >= 50 ? 5 : distance >= 40 ? 4 : 3;
    }

    return points;
  });
}

function simulatePlayerRemainingPoints(
  player: MatchupPlayer,
  week: number,
  statProjections: MflStatProjections,
): number[] | null {
  if (player.status !== 'starter' || player.gameSecondsRemaining === 0) {
    return Array(WIN_PROBABILITY_SIMULATIONS).fill(0);
  }

  if (player.gameSecondsRemaining === null) {
    return null;
  }

  let secondsRemaining = Math.max(0, Math.min(3600, player.gameSecondsRemaining));
  if (secondsRemaining < 360) {
    // MFL lengthens the final six minutes slightly because late-game plays are
    // less evenly distributed. Possession is unavailable in the export, so use
    // the same neutral 0.5 factor MFL uses when possession is unknown.
    secondsRemaining += 0.5 * secondsRemaining * (360 - secondsRemaining) / 360;
  }

  const statProjection = player.position.toLowerCase() === 'def'
    ? player.nflTeam ? statProjections.teams.get(player.nflTeam) : undefined
    : statProjections.players.get(player.id);
  if (statProjection && secondsRemaining === 3600) {
    return simulateFromStatProjection(player, statProjection, secondsRemaining, week);
  }

  if (player.projection === null) {
    return null;
  }

  const remainingFraction = secondsRemaining / 3600;
  const actualPoints = player.score ?? 0;
  const blendedFullGameMean = player.projection * remainingFraction + actualPoints * (1 - remainingFraction);
  const remainingMean = blendedFullGameMean * remainingFraction;
  const remainingDeviation = Math.abs(player.projection) / 2.5 * remainingFraction;
  const random = createMflStyleRandom(player.id, week);

  const scoringComponents = 8;
  return Array.from({ length: WIN_PROBABILITY_SIMULATIONS }, () => {
    let remainingPoints = 0;
    for (let component = 0; component < scoringComponents; component += 1) {
      remainingPoints += random.normal(
        remainingMean / scoringComponents,
        remainingDeviation / Math.sqrt(scoringComponents),
      );
    }
    return Math.max(0, remainingPoints);
  });
}

function simulateTeamFinalScores(team: MatchupTeam, week: number, statProjections: MflStatProjections): number[] | null {
  if (team.score === null) {
    return null;
  }

  const starters = team.players.filter((entry) => entry.status === 'starter');
  const remainingStarterCount = (team.summary.playing ?? 0) + (team.summary.yetToPlay ?? 0);
  if (remainingStarterCount > 0 && starters.length === 0) {
    return null;
  }

  const totals = Array(WIN_PROBABILITY_SIMULATIONS).fill(team.score) as number[];
  for (const player of starters) {
    const remainingPoints = simulatePlayerRemainingPoints(player, week, statProjections);
    if (!remainingPoints) {
      return null;
    }

    for (let index = 0; index < WIN_PROBABILITY_SIMULATIONS; index += 1) {
      totals[index] += remainingPoints[index];
    }
  }

  return totals;
}

export function estimateMflStyleWinChances(
  home: MatchupTeam,
  away: MatchupTeam,
  week: number,
  statProjections: MflStatProjections = emptyStatProjections(),
): { home: MatchupTeamSummary['winChance']; away: MatchupTeamSummary['winChance'] } {
  if (home.score === null || away.score === null) {
    return { home: null, away: null };
  }

  if (isFinalTeamStatus(home.status) && isFinalTeamStatus(away.status)) {
    if (home.score === away.score) {
      return { home: 50, away: 50 };
    }

    return home.score > away.score ? { home: 100, away: 0 } : { home: 0, away: 100 };
  }

  const homeScores = simulateTeamFinalScores(home, week, statProjections);
  const awayScores = simulateTeamFinalScores(away, week, statProjections);
  if (!homeScores || !awayScores) {
    return { home: null, away: null };
  }

  let awayWins = 0;
  let homeWins = 0;
  for (let index = 0; index < WIN_PROBABILITY_SIMULATIONS; index += 1) {
    if (awayScores[index] > homeScores[index]) awayWins += 1;
    if (homeScores[index] > awayScores[index]) homeWins += 1;
  }

  const decidedSimulations = awayWins + homeWins;
  if (decidedSimulations === 0) {
    return { home: 50, away: 50 };
  }

  const awayChance = clampPercentage(Math.round(100 * awayWins / decidedSimulations));
  return { home: 100 - awayChance, away: awayChance };
}

function parseProjectedScores(payload: unknown): Map<string, number> {
  const root = toRecord(payload);
  const projectedScores = toRecord(root?.projectedScores);
  const entries = toJsonArray(
    projectedScores?.playerScore ?? projectedScores?.player ?? projectedScores?.players ?? root?.playerScore ?? root?.player,
  );
  const projections = new Map<string, number>();

  for (const entry of entries) {
    const id = extractText(entry.id);
    const projection = safeNumber(entry.score ?? entry.points ?? entry.projection);
    if (id && projection !== null) projections.set(id, projection);
  }

  return projections;
}

function parseMatchupPlayers(
  franchise: Record<string, unknown>,
  playersById: Map<string, NamedPlayer>,
  projectionsById: Map<string, number>,
  source: ScoresSource,
): MatchupPlayer[] {
  const playersRoot = toRecord(franchise.players);
  const playerEntries = toJsonArray(playersRoot?.player);

  return playerEntries
    .map((entry) => {
      const id = extractText(entry.id);
      if (!id) {
        return null;
      }

      const playerInfo = playersById.get(id);
      const name = playerInfo?.name || `Player ${id}`;
      const position = playerInfo?.position || 'UNK';
      const score = source === 'schedule' ? null : safeNumber(entry.score);
      const gameSecondsRemaining = source === 'schedule' ? null : safeNumber(entry.gameSecondsRemaining);

      return {
        id,
        name,
        position,
        nflTeam: playerInfo?.team ?? null,
        status: parsePlayerGroup(entry.status),
        score,
        projection: projectionsById.get(id) ?? null,
        gameSecondsRemaining,
      } satisfies MatchupPlayer;
    })
    .filter((player): player is MatchupPlayer => player !== null);
}

function parseMatchupTeam(
  franchise: Record<string, unknown>,
  namesById: Map<string, string>,
  playersById: Map<string, NamedPlayer>,
  projectionsById: Map<string, number>,
  source: ScoresSource,
): MatchupTeam | null {
  const teamId = extractText(franchise.id);
  if (!teamId) {
    return null;
  }

  const teamName = namesById.get(teamId) || `Franchise ${teamId}`;
  const isHome = safeBoolean(franchise.isHome) ?? false;
  const score = source === 'schedule' ? null : safeNumber(franchise.score);
  const result = source === 'schedule' ? null : extractText(franchise.result) || null;
  const players = parseMatchupPlayers(franchise, playersById, projectionsById, source);
  const summary = deriveStarterPhaseSummary(franchise, players, source);

  if ((source === 'live' || source === 'results') && score === null) {
    return null;
  }

  return {
    teamId,
    teamName,
    isHome,
    score,
    result,
    status:
      source === 'live'
        ? determineLiveStatus(franchise)
        : source === 'results'
          ? 'Final'
          : score !== null || result !== null
            ? 'Final'
            : 'Scheduled',
    players,
    summary,
  };
}

function parseMatchupCards(
  weekRecord: Record<string, unknown> | null | undefined,
  namesById: Map<string, string>,
  playersById: Map<string, NamedPlayer>,
  projectionsById: Map<string, number>,
  source: ScoresSource,
  simulationWeek: number,
  statProjections: MflStatProjections = emptyStatProjections(),
): MatchupCard[] | null {
  if (!weekRecord) {
    return null;
  }

  const matchups = toJsonArray(weekRecord.matchup);
  if (matchups.length !== 6) {
    return null;
  }

  const matchupCards: MatchupCard[] = [];
  const seenTeamIds = new Set<string>();

  for (const matchup of matchups) {
    const franchises = toJsonArray(matchup.franchise);
    if (franchises.length !== 2) {
      return null;
    }

    const homeIndex = franchises.findIndex((franchise) => safeBoolean(franchise.isHome) === true);
    const orderedFranchises = homeIndex === 1 ? [franchises[1], franchises[0]] : franchises;

    const [homeFranchise, awayFranchise] = orderedFranchises;
    const home = parseMatchupTeam(homeFranchise, namesById, playersById, projectionsById, source);
    const away = parseMatchupTeam(awayFranchise, namesById, playersById, projectionsById, source);

    if (!home || !away) {
      return null;
    }

    const chances = estimateMflStyleWinChances(home, away, simulationWeek, statProjections);
    home.summary.winChance = chances.home;
    home.summary.winChanceMode = home.status === 'Final' && away.status === 'Final' ? 'exact' : home.summary.winChance === null ? 'unavailable' : 'estimated';
    away.summary.winChance = chances.away;
    away.summary.winChanceMode = home.status === 'Final' && away.status === 'Final' ? 'exact' : away.summary.winChance === null ? 'unavailable' : 'estimated';

    if (seenTeamIds.has(home.teamId) || seenTeamIds.has(away.teamId)) {
      return null;
    }

    seenTeamIds.add(home.teamId);
    seenTeamIds.add(away.teamId);
    matchupCards.push({
      home,
      away,
      hrefFranchiseId: home.teamId,
      isPrimary: false,
    });
  }

  return seenTeamIds.size === 12 ? matchupCards : null;
}

function findMatchupIndex(matchups: MatchupCard[], primaryFranchiseId: string | null): number {
  if (!primaryFranchiseId) {
    return -1;
  }

  return matchups.findIndex((matchup) => matchup.home.teamId === primaryFranchiseId || matchup.away.teamId === primaryFranchiseId);
}

function promotePrimaryMatchup(matchups: MatchupCard[], primaryFranchiseId: string | null): MatchupCard[] {
  const primaryIndex = findMatchupIndex(matchups, primaryFranchiseId);
  if (primaryIndex <= 0) {
    return matchups.map((matchup, index) => ({
      ...matchup,
      isPrimary: index === 0 && primaryIndex === 0,
      hrefFranchiseId: index === 0 && primaryIndex === 0 && primaryFranchiseId ? primaryFranchiseId : matchup.home.teamId,
    }));
  }

  const promoted = [...matchups];
  const [primaryMatchup] = promoted.splice(primaryIndex, 1);
  promoted.unshift(primaryMatchup);

  return promoted.map((matchup, index) => ({
    ...matchup,
    isPrimary: index === 0,
    hrefFranchiseId: index === 0 && primaryFranchiseId ? primaryFranchiseId : matchup.home.teamId,
  }));
}

function buildSuccessState(args: {
  source: Exclude<ScoresSource, 'error'>;
  currentWeek: number;
  selectedWeek: number;
  availableWeeks: number[];
  matchups: MatchupCard[];
  primaryFranchiseId: string | null;
}): ScoresPageState {
  const { source, currentWeek, selectedWeek, availableWeeks, matchups, primaryFranchiseId } = args;

  return {
    source,
    currentWeek,
    selectedWeek,
    availableWeeks,
    matchups: promotePrimaryMatchup(matchups, primaryFranchiseId),
    primaryFranchiseId,
    message:
      source === 'live'
        ? `Week ${selectedWeek} · Live MFL scoring`
        : source === 'results'
          ? `Week ${selectedWeek} · Final weekly results`
          : `Week ${selectedWeek} · Scheduled matchup slate`,
  };
}

export async function resolvePrimaryFranchiseId(sessionCookieValue: string | null): Promise<PrimaryFranchiseResolution> {
  const fallback = process.env.NODE_ENV === 'production' ? null : normalizeFranchiseId(process.env.MFL_PRIMARY_FRANCHISE_ID);
  if (!sessionCookieValue?.trim()) {
    return fallback ? { franchiseId: fallback, source: 'fallback' } : null;
  }

  try {
    const config = getMflConfig();
    const response = await fetchMflSiteExport(
      'myleagues',
      { YEAR: config.year, FRANCHISE_NAMES: '1', JSON: '1' },
      { sessionCookieValue, cache: 'no-store' },
    );

    if (response.ok) {
      const payload = await response.json().catch(() => null);
      const leaguesRoot = toRecord(payload)?.leagues;
      const leagues = toJsonArray(toRecord(leaguesRoot)?.league);

      for (const league of leagues) {
        const leagueId = extractText(league.league_id ?? league.id ?? league.L);
        if (leagueId !== config.leagueId) {
          continue;
        }

        const franchiseId = normalizeFranchiseId(league.franchise_id ?? league.franchiseId);
        if (franchiseId) {
          return { franchiseId, source: 'authenticated' };
        }
      }
    }
  } catch {
    // Fall back only when the authenticated mapping cannot be proved.
  }

  return fallback ? { franchiseId: fallback, source: 'fallback' } : null;
}

function sourceFromWeekComparison(selectedWeek: number, currentWeek: number): Exclude<ScoresSource, 'error'> {
  if (selectedWeek === currentWeek) {
    return 'live';
  }

  if (selectedWeek < currentWeek) {
    return 'results';
  }

  return 'schedule';
}

function matchupDetailFromCard(matchup: MatchupCard, primaryFranchiseId: string | null) {
  const primaryTeamId = primaryFranchiseId && matchup.home.teamId === primaryFranchiseId
    ? matchup.home.teamId
    : primaryFranchiseId && matchup.away.teamId === primaryFranchiseId
      ? matchup.away.teamId
      : null;

  const home = matchup.home;
  const away = matchup.away;

  return {
    home,
    away,
    primaryTeamId,
  };
}

function buildSelectedMatchupState(args: {
  source: Exclude<ScoresSource, 'error'>;
  currentWeek: number;
  selectedWeek: number;
  matchup: MatchupCard;
  primaryFranchiseId: string | null;
}): MatchupDetailState {
  return {
    source: args.source,
    currentWeek: args.currentWeek,
    selectedWeek: args.selectedWeek,
    message:
      args.source === 'live'
        ? `Week ${args.selectedWeek} · Live MFL scoring`
        : args.source === 'results'
          ? `Week ${args.selectedWeek} · Final weekly results`
          : `Week ${args.selectedWeek} · Scheduled matchup slate`,
    matchup: matchupDetailFromCard(args.matchup, args.primaryFranchiseId),
  };
}

function parseSelectedMatchup(
  weekRecord: Record<string, unknown> | null | undefined,
  franchiseId: string,
  namesById: Map<string, string>,
  playersById: Map<string, NamedPlayer>,
  projectionsById: Map<string, number>,
  source: ScoresSource,
  simulationWeek: number,
  statProjections: MflStatProjections = emptyStatProjections(),
): MatchupCard | null {
  const matchups = parseMatchupCards(weekRecord, namesById, playersById, projectionsById, source, simulationWeek, statProjections);
  if (!matchups) {
    return null;
  }

  return matchups.find((matchup) => matchup.home.teamId === franchiseId || matchup.away.teamId === franchiseId) || null;
}

export async function loadScoresPageState(
  sessionCookieValue: string | null,
  requestedWeekParam?: string | null,
): Promise<ScoresPageState> {
  try {
    const [liveScoringResponse, leagueResponse, scheduleResponse, playersResponse, projectedScoresResponse, primaryResolution] = await Promise.all([
      fetchMflExport('liveScoring', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      fetchMflExport('league', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      fetchMflExport('schedule', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      fetchMflExport('players', { JSON: '1' }, { sessionCookieValue, revalidate: 60 * 60 * 24 }),
      fetchMflExport('projectedScores', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      resolvePrimaryFranchiseId(sessionCookieValue),
    ]);

    if (!liveScoringResponse.ok || !leagueResponse.ok || !scheduleResponse.ok) {
      return buildErrorState();
    }

    const [livePayload, leaguePayload, schedulePayload, playersPayload, projectedScoresPayload] = await Promise.all([
      liveScoringResponse.json(),
      leagueResponse.json(),
      scheduleResponse.json(),
      playersResponse.ok ? playersResponse.json().catch(() => null) : Promise.resolve(null),
      projectedScoresResponse.ok ? projectedScoresResponse.json().catch(() => null) : Promise.resolve(null),
    ]);

    const namesById = parseLeagueNames(leaguePayload);
    const playersById = parsePlayersExport(playersPayload) ?? new Map<string, NamedPlayer>();
    const projectionsById = parseProjectedScores(projectedScoresPayload);
    const schedule = parseScheduleWeeks(schedulePayload);
    const liveScoringRecord = toRecord(toRecord(livePayload)?.liveScoring);
    const currentWeek = safeWeek(liveScoringRecord?.week);
    const requestedWeek = parseWeekParam(requestedWeekParam);

    if (!namesById || !schedule || currentWeek === null || !schedule.weekMap.has(currentWeek)) {
      return buildErrorState();
    }

    if (requestedWeek === 'invalid') {
      return {
        ...buildErrorState(`Invalid week selection. Use a week between ${schedule.weeks[0]} and ${schedule.weeks[schedule.weeks.length - 1]}.`),
        currentWeek,
        selectedWeek: currentWeek,
        availableWeeks: schedule.weeks,
        primaryFranchiseId: primaryResolution?.franchiseId ?? null,
      };
    }

    const selectedWeek = requestedWeek ?? currentWeek;
    if (!schedule.weekMap.has(selectedWeek)) {
      return {
        ...buildErrorState(`Week ${selectedWeek} is outside the available schedule.`),
        currentWeek,
        selectedWeek: currentWeek,
        availableWeeks: schedule.weeks,
        primaryFranchiseId: primaryResolution?.franchiseId ?? null,
      };
    }

    if (selectedWeek === currentWeek) {
      const liveScoring = toRecord(toRecord(livePayload)?.liveScoring);
      const statProjections = await loadMflStatProjections(selectedWeek, sessionCookieValue);
      const liveMatchups = parseMatchupCards(liveScoring, namesById, playersById, projectionsById, 'live', selectedWeek, statProjections);

      if (liveMatchups) {
        return buildSuccessState({
          source: 'live',
          currentWeek,
          selectedWeek,
          availableWeeks: schedule.weeks,
          matchups: liveMatchups,
          primaryFranchiseId: primaryResolution?.franchiseId ?? null,
        });
      }

      const resultsResponse = await fetchMflExport('weeklyResults', { W: String(selectedWeek), JSON: '1' }, { sessionCookieValue, cache: 'no-store' });
      if (resultsResponse.ok) {
        const resultsPayload = await resultsResponse.json();
        const resultsRecord = toRecord(toRecord(resultsPayload)?.weeklyResults);
        const resultsMatchups = parseMatchupCards(resultsRecord, namesById, playersById, projectionsById, 'results', selectedWeek);

        if (resultsMatchups) {
          return buildSuccessState({
            source: 'results',
            currentWeek,
            selectedWeek,
            availableWeeks: schedule.weeks,
            matchups: resultsMatchups,
            primaryFranchiseId: primaryResolution?.franchiseId ?? null,
          });
        }
      }

      return buildErrorState();
    }

    if (selectedWeek < currentWeek) {
      const resultsResponse = await fetchMflExport('weeklyResults', { W: String(selectedWeek), JSON: '1' }, { sessionCookieValue, cache: 'no-store' });
      if (resultsResponse.ok) {
        const resultsPayload = await resultsResponse.json();
        const resultsRecord = toRecord(toRecord(resultsPayload)?.weeklyResults);
        const resultsMatchups = parseMatchupCards(resultsRecord, namesById, playersById, projectionsById, 'results', selectedWeek);

        if (resultsMatchups) {
          return buildSuccessState({
            source: 'results',
            currentWeek,
            selectedWeek,
            availableWeeks: schedule.weeks,
            matchups: resultsMatchups,
            primaryFranchiseId: primaryResolution?.franchiseId ?? null,
          });
        }
      }

      const scheduleMatchups = parseMatchupCards(schedule.weekMap.get(selectedWeek), namesById, playersById, projectionsById, 'schedule', selectedWeek);
      if (scheduleMatchups) {
        return buildSuccessState({
          source: 'schedule',
          currentWeek,
          selectedWeek,
          availableWeeks: schedule.weeks,
          matchups: scheduleMatchups,
          primaryFranchiseId: primaryResolution?.franchiseId ?? null,
        });
      }

      return buildErrorState();
    }

    const scheduleMatchups = parseMatchupCards(schedule.weekMap.get(selectedWeek), namesById, playersById, projectionsById, 'schedule', selectedWeek);
    if (!scheduleMatchups) {
      return buildErrorState();
    }

    return buildSuccessState({
      source: 'schedule',
      currentWeek,
      selectedWeek,
      availableWeeks: schedule.weeks,
      matchups: scheduleMatchups,
      primaryFranchiseId: primaryResolution?.franchiseId ?? null,
    });
  } catch {
    return buildErrorState();
  }
}

export async function loadMatchupDetailState(
  sessionCookieValue: string | null,
  selectedWeekParam: string | null | undefined,
  franchiseIdParam: string | null | undefined,
): Promise<MatchupDetailState> {
  const selectedWeek = parseWeekParam(selectedWeekParam);
  const franchiseId = parseFranchiseIdParam(franchiseIdParam);

  if (selectedWeek === 'invalid' || franchiseId === 'invalid') {
    return buildDetailErrorState('Invalid matchup request.');
  }

  if (selectedWeek === null || franchiseId === null) {
    return buildDetailErrorState('Missing matchup request parameters.');
  }

  try {
    const [currentLiveResponse, selectedLiveResponse, leagueResponse, playersResponse, projectedScoresResponse, statProjections, primaryResolution] = await Promise.all([
      fetchMflExport('liveScoring', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      fetchMflExport('liveScoring', { W: String(selectedWeek), JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      fetchMflExport('league', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      fetchMflExport('players', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      fetchMflExport('projectedScores', { W: String(selectedWeek), JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      loadMflStatProjections(selectedWeek, sessionCookieValue),
      resolvePrimaryFranchiseId(sessionCookieValue),
    ]);

    if (!currentLiveResponse.ok || !selectedLiveResponse.ok || !leagueResponse.ok || !playersResponse.ok) {
      return buildDetailErrorState();
    }

    const [currentLivePayload, selectedLivePayload, leaguePayload, playersPayload, projectedScoresPayload] = await Promise.all([
      currentLiveResponse.json(),
      selectedLiveResponse.json(),
      leagueResponse.json(),
      playersResponse.json(),
      projectedScoresResponse.ok ? projectedScoresResponse.json().catch(() => null) : Promise.resolve(null),
    ]);

    const currentLiveRecord = toRecord(toRecord(currentLivePayload)?.liveScoring);
    const currentWeek = safeWeek(currentLiveRecord?.week);
    const selectedLiveRecord = toRecord(toRecord(selectedLivePayload)?.liveScoring);
    const namesById = parseLeagueNames(leaguePayload);
    const playersById = parsePlayersExport(playersPayload);
    const projectionsById = parseProjectedScores(projectedScoresPayload);

    if (!namesById || !playersById || currentWeek === null) {
      return buildDetailErrorState();
    }

    const source = sourceFromWeekComparison(selectedWeek, currentWeek);
    const matchup = parseSelectedMatchup(selectedLiveRecord, franchiseId, namesById, playersById, projectionsById, source, selectedWeek, statProjections);

    if (!matchup) {
      return buildDetailErrorState(`No matchup was found for week ${selectedWeek}.`);
    }

    if (source === 'live') {
      const gamesByTeam = await loadNflScheduleGames(currentWeek);
      const teamByPlayerId = new Map([...playersById.entries()].map(([playerId, player]) => [playerId, player.team]));

      matchup.home.players = addPlayerLiveState(matchup.home.players, teamByPlayerId, gamesByTeam);
      matchup.away.players = addPlayerLiveState(matchup.away.players, teamByPlayerId, gamesByTeam);
    }

    return buildSelectedMatchupState({
      source,
      currentWeek,
      selectedWeek,
      matchup,
      primaryFranchiseId: primaryResolution?.franchiseId ?? null,
    });
  } catch {
    return buildDetailErrorState();
  }
}

export async function loadScoreboardState(
  sessionCookieValue: string | null,
  requestedWeekParam?: string | null,
): Promise<ScoresPageState> {
  return loadScoresPageState(sessionCookieValue, requestedWeekParam);
}

export { LIVE_SCORES_ERROR_MESSAGE, MATCHUP_ERROR_MESSAGE };
export type ScoreboardSource = ScoresSource;
export type ScoreboardState = ScoresPageState;
