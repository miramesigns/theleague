import { fetchMflExport, fetchMflSiteExport, getMflConfig } from './mfl.ts';
import { addPlayerLiveState, loadNflScheduleGames } from './mfl-live-state.ts';

const LIVE_SCORES_ERROR_MESSAGE = 'Live data could not be loaded. Please sign in on the More tab and try again.';
const MATCHUP_ERROR_MESSAGE = 'Matchup details could not be loaded. Please refresh and try again.';

export type ScoresSource = 'live' | 'results' | 'schedule' | 'error';

export type MatchupPlayer = {
  id: string;
  name: string;
  position: string;
  status: 'starter' | 'bench' | 'reserve';
  score: number | null;
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

export function estimateMatchupWinChance(
  team: Pick<MatchupTeam, 'score' | 'status' | 'summary'>,
  opponent: Pick<MatchupTeam, 'score' | 'status' | 'summary'>,
): MatchupTeamSummary['winChance'] {
  if (team.score === null || opponent.score === null) {
    return null;
  }

  if (isFinalTeamStatus(team.status) && isFinalTeamStatus(opponent.status)) {
    if (team.score === opponent.score) {
      return 50;
    }

    return team.score > opponent.score ? 100 : 0;
  }

  const teamPlaying = team.summary.playing ?? null;
  const teamYetToPlay = team.summary.yetToPlay ?? null;
  const opponentPlaying = opponent.summary.playing ?? null;
  const opponentYetToPlay = opponent.summary.yetToPlay ?? null;

  if (
    teamPlaying === null ||
    teamYetToPlay === null ||
    opponentPlaying === null ||
    opponentYetToPlay === null
  ) {
    return null;
  }

  const teamRemaining = teamPlaying * 0.5 + teamYetToPlay;
  const opponentRemaining = opponentPlaying * 0.5 + opponentYetToPlay;
  const remainingPool = teamRemaining + opponentRemaining;
  const scoreEdge = (team.score - opponent.score) * 1.8;
  const remainingEdge = (teamRemaining - opponentRemaining) * 2.5;
  const pressure = 1 / (1 + remainingPool / 6);
  const swing = Math.max(-35, Math.min(35, scoreEdge + remainingEdge));

  return clampPercentage(Math.round(50 + swing * pressure));
}

function parseMatchupPlayers(
  franchise: Record<string, unknown>,
  playersById: Map<string, NamedPlayer>,
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
        status: parsePlayerGroup(entry.status),
        score,
        gameSecondsRemaining,
      } satisfies MatchupPlayer;
    })
    .filter((player): player is MatchupPlayer => player !== null);
}

function parseMatchupTeam(
  franchise: Record<string, unknown>,
  namesById: Map<string, string>,
  playersById: Map<string, NamedPlayer>,
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
  const players = parseMatchupPlayers(franchise, playersById, source);
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
  source: ScoresSource,
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
    const home = parseMatchupTeam(homeFranchise, namesById, playersById, source);
    const away = parseMatchupTeam(awayFranchise, namesById, playersById, source);

    if (!home || !away) {
      return null;
    }

    home.summary.winChance = estimateMatchupWinChance(home, away);
    home.summary.winChanceMode = home.status === 'Final' && away.status === 'Final' ? 'exact' : home.summary.winChance === null ? 'unavailable' : 'estimated';
    away.summary.winChance = estimateMatchupWinChance(away, home);
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
  source: ScoresSource,
): MatchupCard | null {
  const matchups = parseMatchupCards(weekRecord, namesById, playersById, source);
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
    const [liveScoringResponse, leagueResponse, scheduleResponse, primaryResolution] = await Promise.all([
      fetchMflExport('liveScoring', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      fetchMflExport('league', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      fetchMflExport('schedule', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      resolvePrimaryFranchiseId(sessionCookieValue),
    ]);

    if (!liveScoringResponse.ok || !leagueResponse.ok || !scheduleResponse.ok) {
      return buildErrorState();
    }

    const [livePayload, leaguePayload, schedulePayload] = await Promise.all([
      liveScoringResponse.json(),
      leagueResponse.json(),
      scheduleResponse.json(),
    ]);

    const namesById = parseLeagueNames(leaguePayload);
    const playersById = new Map<string, NamedPlayer>();
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
      const liveMatchups = parseMatchupCards(liveScoring, namesById, playersById, 'live');

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
        const resultsMatchups = parseMatchupCards(resultsRecord, namesById, playersById, 'results');

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
        const resultsMatchups = parseMatchupCards(resultsRecord, namesById, playersById, 'results');

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

      const scheduleMatchups = parseMatchupCards(schedule.weekMap.get(selectedWeek), namesById, playersById, 'schedule');
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

    const scheduleMatchups = parseMatchupCards(schedule.weekMap.get(selectedWeek), namesById, playersById, 'schedule');
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
    const [currentLiveResponse, selectedLiveResponse, leagueResponse, playersResponse, primaryResolution] = await Promise.all([
      fetchMflExport('liveScoring', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      fetchMflExport('liveScoring', { W: String(selectedWeek), JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      fetchMflExport('league', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      fetchMflExport('players', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      resolvePrimaryFranchiseId(sessionCookieValue),
    ]);

    if (!currentLiveResponse.ok || !selectedLiveResponse.ok || !leagueResponse.ok || !playersResponse.ok) {
      return buildDetailErrorState();
    }

    const [currentLivePayload, selectedLivePayload, leaguePayload, playersPayload] = await Promise.all([
      currentLiveResponse.json(),
      selectedLiveResponse.json(),
      leagueResponse.json(),
      playersResponse.json(),
    ]);

    const currentLiveRecord = toRecord(toRecord(currentLivePayload)?.liveScoring);
    const currentWeek = safeWeek(currentLiveRecord?.week);
    const selectedLiveRecord = toRecord(toRecord(selectedLivePayload)?.liveScoring);
    const namesById = parseLeagueNames(leaguePayload);
    const playersById = parsePlayersExport(playersPayload);

    if (!namesById || !playersById || currentWeek === null) {
      return buildDetailErrorState();
    }

    const source = sourceFromWeekComparison(selectedWeek, currentWeek);
    const matchup = parseSelectedMatchup(selectedLiveRecord, franchiseId, namesById, playersById, source);

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
