import { resolvePrimaryFranchiseId } from './mfl-scores.ts';
import { fetchMflExport, fetchMflSiteExport, getMflConfig } from './mfl.ts';

type JsonRecord = Record<string, any>;

export type LineupRulePosition = {
  position: string;
  min: number;
  max: number;
};

export type LineupRules = {
  positions: LineupRulePosition[];
  flexSlots: number;
  flexEligiblePositions: string[];
  totalMin: number;
  totalMax: number;
};

export type LineupInjuryDesignation =
  | 'Questionable'
  | 'Doubtful'
  | 'Probable'
  | 'Out'
  | 'Injured Reserve'
  | 'PUP'
  | 'NFI'
  | 'Suspended'
  | 'Holdout'
  | 'Retired';

export type LineupRosterSnapshot = {
  id: string;
  name: string;
  position: string;
  team: string | null;
  rosterStatus: 'S' | 'B' | 'IR' | 'TAXI' | 'RESERVE' | 'UNKNOWN';
  locked: boolean;
  selected: boolean;
  bye: string | null;
  byeWeek: number | null;
  opponent: string | null;
  homeAway: 'home' | 'away' | null;
  kickoffUtc: number | null;
  kickoffLocal: string | null;
  injury: LineupInjuryDesignation | null;
  projection: number | null;
  actualPoints: number | null;
  startPercentage: number | null;
  rosterRank: number | null;
  statusText: string;
  availability: 'available' | 'locked' | 'bye' | 'injured' | 'unknown';
  canToggle: boolean;
  group: 'QB' | 'RB' | 'WR' | 'TE' | 'PK' | 'DEF' | 'OTHER';
};

export type LineupPageSummary = {
  totalSelected: number;
  totalMin: number;
  totalMax: number;
  legal: boolean;
  problems: string[];
  perPosition: Record<string, { selected: number; min: number; max: number }>;
};

export type LineupPageState = {
  ok: boolean;
  message: string;
  franchiseId: string | null;
  franchiseName: string | null;
  currentWeek: number | null;
  selectedWeek: number | null;
  availableWeeks: number[];
  rules: LineupRules | null;
  rows: LineupRosterSnapshot[];
  summary: LineupPageSummary;
  hasSubmittedLineup: boolean;
  submittedAt: string | null;
};

export type LineupSubmissionContext = LineupPageState & {
  rosterPlayerIds: Set<string>;
  playersById: Map<string, LineupRosterSnapshot>;
  currentStarterIds: string[];
  rules: LineupRules;
};

export type LineupRowMeta = {
  matchupText: string;
  metricsText: string;
  compactText: string;
  ariaLabel: string;
};

export type LineupSubmissionInput = {
  week: number;
  starters: string[];
  comments?: string;
  clear?: boolean;
};

export class LineupLoadError extends Error {
  readonly status: 400 | 401 | 503;

  constructor(
    status: 400 | 401 | 503,
    message: string,
  ) {
    super(message);
    this.status = status;
    this.name = 'LineupLoadError';
  }
}

export type LineupValidationResult =
  | { ok: true; normalizedStarters: string[] }
  | { ok: false; status: 400 | 401 | 403 | 409 | 429 | 502 | 503; message: string };

function toRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' ? (value as JsonRecord) : null;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  return [];
}

function toRecords(value: unknown): JsonRecord[] {
  return toArray(value).filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object');
}

function extractText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const record = value as JsonRecord;
    for (const key of ['#text', 'name', 'title', 'position', 'id', 'team', 'franchise_name']) {
      const nested = record[key];
      if (typeof nested === 'string' && nested.trim()) return nested.trim();
      if (typeof nested === 'number') return String(nested);
    }
  }
  return '';
}

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function safeInteger(value: unknown): number | null {
  const parsed = safeNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function normalizePosition(value: string): string {
  const upper = value.trim().toUpperCase();
  if (upper === 'DEF' || upper === 'DST' || upper === 'D/ST') return 'DEF';
  return upper;
}

function groupPosition(position: string): LineupRosterSnapshot['group'] {
  const normalized = normalizePosition(position);
  if (normalized === 'DEF') return 'DEF';
  if (normalized === 'QB' || normalized === 'RB' || normalized === 'WR' || normalized === 'TE' || normalized === 'PK') {
    return normalized;
  }
  return 'OTHER';
}

function formatEtKickoff(kickoffUtcSeconds: number): string {
  const date = new Date(kickoffUtcSeconds * 1000);
  if (Number.isNaN(date.getTime())) return 'Unavailable';

  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${dateFormatter.format(date)} ${timeFormatter.format(date)} ET`;
}

function parseCommaList(value: unknown): string[] {
  const text = extractText(value);
  if (!text) return [];
  return text
    .split(/[\/,|]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(normalizePosition);
}

function parseLimitRange(value: unknown): { min: number; max: number } | null {
  const text = extractText(value);
  if (!text) return null;

  const match = text.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
  if (!match) return null;

  const min = Number(match[1]);
  const max = Number(match[2] ?? match[1]);
  if (!Number.isInteger(min) || !Number.isInteger(max) || min <= 0 || max <= 0) return null;

  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function parseLineupSlot(entry: JsonRecord): { position: string; min: number; max: number; flexEligible?: string[]; flexSlots?: number } | null {
  const position = extractText(entry.position ?? entry.pos ?? entry.slot ?? entry.label ?? entry.name);
  if (!position) return null;

  const limit = parseLimitRange(entry.limit ?? entry.range);
  const min = safeInteger(entry.min ?? entry.minimum ?? entry.required ?? entry.count) ?? limit?.min ?? 1;
  const max = safeInteger(entry.max ?? entry.maximum ?? entry.count ?? entry.required) ?? limit?.max ?? min;
  const flexEligible = parseCommaList(entry.eligible ?? entry.allowed ?? entry.flexEligible ?? entry.positions);
  const isFlex = flexEligible.length > 0 || /flex/i.test(position) || Boolean(entry.flex);

  return {
    position: normalizePosition(position),
    min,
    max: Math.max(min, max),
    ...(isFlex ? { flexEligible: flexEligible.length > 0 ? flexEligible : ['RB', 'WR', 'TE'], flexSlots: safeInteger(entry.flex ?? entry.slots ?? entry.count) ?? 1 } : {}),
  };
}

function collectLineupEntries(leaguePayload: unknown): JsonRecord[] {
  const league = toRecord(leaguePayload)?.league;
  const record = toRecord(league);
  const candidates = [
    toRecords(toRecord(record?.starters)?.position),
    toRecords(toRecord(record?.rosterPositions)?.rosterPosition),
    toRecords(toRecord(toRecord(record?.lineup)?.startingLineup)?.lineupSlot),
    toRecords(toRecord(record?.startingLineup)?.lineupSlot),
    toRecords(record?.lineupPosition),
    toRecords(record?.rosterPosition),
  ];

  return candidates.flat().filter((entry) => Object.keys(entry).length > 0);
}

export function parseLineupRules(leaguePayload: unknown): LineupRules {
  const leagueRecord = toRecord(toRecord(leaguePayload)?.league) as JsonRecord | null;
  const entries = collectLineupEntries(leaguePayload);
  const positions: LineupRulePosition[] = [];
  const flexEligible = new Set<string>();
  let flexSlots = 0;

  for (const entry of entries) {
    const parsed = parseLineupSlot(entry);
    if (!parsed) continue;
    if (parsed.flexEligible && parsed.flexEligible.length > 0) {
      for (const position of parsed.flexEligible) flexEligible.add(position);
      flexSlots += parsed.flexSlots ?? 1;
      continue;
    }

    if (!positions.some((position) => position.position === parsed.position)) {
      positions.push({ position: parsed.position, min: parsed.min, max: parsed.max });
    }
  }

  if (positions.length === 0) {
    throw new Error('Unable to parse lineup rules.');
  }

  const derivedTotalMin = positions.reduce((sum, position) => sum + position.min, 0) + flexSlots;
  const derivedTotalMax = positions.reduce((sum, position) => sum + position.max, 0) + flexSlots;
  const startersCount = safeInteger(leagueRecord?.starters && toRecord(leagueRecord.starters)?.count);
  const useExactStarterCount =
    startersCount !== null &&
    toRecords(toRecord(leagueRecord?.starters)?.position).length > 0 &&
    startersCount >= derivedTotalMin &&
    startersCount <= derivedTotalMax;

  return {
    positions,
    flexSlots,
    flexEligiblePositions: [...flexEligible],
    totalMin: useExactStarterCount ? startersCount : derivedTotalMin,
    totalMax: useExactStarterCount ? startersCount : derivedTotalMax,
  };
}

function parseScheduleWeeks(schedulePayload: unknown): { currentWeek: number | null; weeks: number[] } | null {
  const scheduleRoot = toRecord(schedulePayload)?.schedule;
  const record = toRecord(scheduleRoot) as JsonRecord | null;
  const weeks = new Set<number>();

  for (const source of [
    toRecords(record?.weeklySchedule?.week),
    toRecords(record?.weeklySchedule),
    toRecords(record?.week),
    toRecords(record?.weeks),
  ]) {
    for (const entry of source) {
      const week = safeInteger(entry.week ?? entry.W ?? entry.number ?? entry.value);
      if (week !== null) weeks.add(week);
    }
  }

  const currentWeek = safeInteger(record?.currentWeek ?? record?.current_week ?? record?.week);
  const sortedWeeks = [...weeks].sort((left, right) => left - right);
  if (sortedWeeks.length === 0) return null;

  return { currentWeek, weeks: sortedWeeks };
}

function parseLiveScoringWeek(payload: unknown): number | null {
  const liveScoring = toRecord(toRecord(payload)?.liveScoring);
  return safeInteger(liveScoring?.week);
}

function parseLeagueFranchises(leaguePayload: unknown): Map<string, string> {
  const league = toRecord(leaguePayload)?.league;
  const leagueRecord = toRecord(league) as JsonRecord | null;
  const franchises = toRecords((leagueRecord?.franchises as JsonRecord | undefined)?.franchise ?? leagueRecord?.franchise);
  const names = new Map<string, string>();

  for (const franchise of franchises) {
    const id = extractText(franchise.id ?? franchise.franchise_id ?? franchise.franchiseId);
    if (!id) continue;
    const name = extractText(franchise.name ?? franchise.franchise_name ?? franchise.franchiseName) || `Franchise ${id}`;
    names.set(id, name);
  }

  return names;
}

function parsePlayersDirectory(playersPayload: unknown): Map<string, { name: string; position: string; team: string | null }> {
  const playersRoot = toRecord(playersPayload) as JsonRecord | null;
  const players = toRecords((playersRoot?.players as JsonRecord | undefined)?.player ?? playersRoot?.player);
  const result = new Map<string, { name: string; position: string; team: string | null }>();

  for (const player of players) {
    const id = extractText(player.id ?? player.playerId ?? player.player_id);
    if (!id) continue;
    result.set(id, {
      name: extractText(player.name ?? player.full_name ?? player.fullName ?? player.title) || `Player ${id}`,
      position: normalizePosition(extractText(player.position ?? player.pos ?? player.fantasy_position) || 'UNK'),
      team: extractText(player.team ?? player.nfl_team ?? player.nflTeam) || null,
    });
  }

  return result;
}

function isGeneratedRosterName(name: string, id: string): boolean {
  const normalized = name.trim();
  if (!normalized) return true;
  if (normalized === `Player ${id}`) return true;
  if (/^player\s+\d+$/i.test(normalized)) return true;
  if (/^(tbd|unknown|unavailable|placeholder|n\/a|--+)$/i.test(normalized)) return true;
  if (/^\d+$/.test(normalized)) return true;
  return false;
}

export function resolveRosterPlayerName(playerName: string, directoryName: string | null, id: string): string {
  if (!isGeneratedRosterName(playerName, id)) {
    return playerName.trim();
  }

  if (directoryName && !isGeneratedRosterName(directoryName, id)) {
    return directoryName.trim();
  }

  return `Player ${id}`;
}

function parseProjectedScores(payload: unknown): Map<string, number> {
  const root = toRecord(payload) as JsonRecord | null;
  const projectedScores = toRecord(root?.projectedScores);
  const players = toRecords(projectedScores?.playerScore ?? projectedScores?.player ?? projectedScores?.players ?? root?.playerScore ?? root?.player);
  const result = new Map<string, number>();
  for (const player of players) {
    const id = extractText(player.id);
    const score = safeNumber(player.score ?? player.points ?? player.projection);
    if (id && score !== null) result.set(id, score);
  }
  return result;
}

export function normalizeLineupInjuryDesignation(value: unknown): LineupInjuryDesignation | null {
  const normalized = extractText(value).trim().toLowerCase();
  if (normalized === 'q' || normalized === 'questionable') return 'Questionable';
  if (normalized === 'd' || normalized === 'doubtful') return 'Doubtful';
  if (normalized === 'p' || normalized === 'probable') return 'Probable';
  if (normalized === 'o' || normalized === 'out') return 'Out';
  if (normalized === 'ir' || normalized === 'ir-r') return 'Injured Reserve';
  if (normalized === 'pup' || normalized === 'ir-pup') return 'PUP';
  if (normalized === 'nfi' || normalized === 'ir-nfi') return 'NFI';
  if (normalized === 'suspended') return 'Suspended';
  if (normalized === 'holdout') return 'Holdout';
  if (normalized === 'retired') return 'Retired';
  return null;
}

function parseInjuries(payload: unknown): Map<string, LineupInjuryDesignation> {
  const root = toRecord(payload) as JsonRecord | null;
  const injuries = toRecord(root?.injuries);
  const players = toRecords(injuries?.injury ?? injuries?.player ?? root?.injury ?? root?.player);
  const result = new Map<string, LineupInjuryDesignation>();
  for (const player of players) {
    const id = extractText(player.id);
    const designation = normalizeLineupInjuryDesignation(player.designation ?? player.injury ?? player.status);
    if (id && designation) result.set(id, designation);
  }
  return result;
}

function parseTopStarters(payload: unknown): Map<string, number> {
  const root = toRecord(payload) as JsonRecord | null;
  const players = toRecords((root?.topStarters as JsonRecord | undefined)?.player ?? root?.player);
  const result = new Map<string, number>();
  for (const player of players) {
    const id = extractText(player.id);
    const percentage = safeNumber(player.percent ?? player.startPercentage ?? player.percentage ?? player.rate);
    if (id && percentage !== null) result.set(id, percentage);
  }
  return result;
}

function parseSubmittedLineup(payload: unknown, franchiseId: string): { found: boolean; starterIds: Set<string> } {
  const root = toRecord(payload) as JsonRecord | null;
  const weeklyResults = toRecord(root?.weeklyResults);
  const matchups = toRecords(weeklyResults?.matchup);

  for (const matchup of matchups) {
    for (const franchise of toRecords(matchup.franchise)) {
      const id = extractText(franchise.id ?? franchise.franchise_id ?? franchise.franchiseId);
      if (id !== franchiseId) continue;

      const starterIds = new Set<string>();
      for (const player of toRecords(franchise.player)) {
        const status = extractText(player.status).toLowerCase();
        const playerId = extractText(player.id ?? player.player_id ?? player.playerId);
        if (playerId && (status === 'starter' || status === 's')) starterIds.add(playerId);
      }

      for (const playerId of extractText(franchise.starters).split(',').map((value) => value.trim()).filter(Boolean)) {
        starterIds.add(playerId);
      }

      return { found: starterIds.size > 0, starterIds };
    }
  }

  return { found: false, starterIds: new Set() };
}

function deriveStartRanks(
  topStarters: Map<string, number>,
  playersDirectory: Map<string, { name: string; position: string; team: string | null }>,
): Map<string, number> {
  const byPosition = new Map<string, Array<{ id: string; percentage: number }>>();

  for (const [id, percentage] of topStarters) {
    const position = playersDirectory.get(id)?.position;
    if (!position) continue;
    const entries = byPosition.get(position) ?? [];
    entries.push({ id, percentage });
    byPosition.set(position, entries);
  }

  const ranks = new Map<string, number>();
  for (const entries of byPosition.values()) {
    entries.sort((left, right) => right.percentage - left.percentage || left.id.localeCompare(right.id));
    entries.forEach((entry, index) => ranks.set(entry.id, index + 1));
  }

  for (const [id, player] of playersDirectory) {
    if (!ranks.has(id)) ranks.set(id, (byPosition.get(player.position)?.length ?? 0) + 1);
  }
  return ranks;
}

function parseRosterPlayers(payload: unknown): Map<string, { id: string; name: string; position: string; team: string | null }> {
  const root = toRecord(payload) as JsonRecord | null;
  const candidateSets = [
    toRecords(root?.rosters?.franchise?.player),
    toRecords(root?.roster?.franchise?.player),
    toRecords(root?.franchise?.player),
    toRecords(root?.players?.player),
    toRecords(root?.player),
  ];
  const players = candidateSets.find((entries) => entries.length > 0) ?? [];
  const result = new Map<string, { id: string; name: string; position: string; team: string | null }>();

  for (const player of players) {
    const id = extractText(player.id ?? player.player_id ?? player.playerId);
    if (!id) continue;
    result.set(id, {
      id,
      name: extractText(player.name ?? player.full_name ?? player.title ?? player.player_name) || `Player ${id}`,
      position: normalizePosition(extractText(player.position ?? player.pos ?? player.rosterPosition ?? player.fantasy_position) || 'UNK'),
      team: extractText(player.team ?? player.nfl_team ?? player.nflTeam) || null,
    });
  }

  return result;
}

export function formatLineupRowMeta(row: Pick<LineupRosterSnapshot, 'name' | 'position' | 'team' | 'opponent' | 'homeAway' | 'bye' | 'projection' | 'actualPoints' | 'startPercentage' | 'rosterRank'>): LineupRowMeta {
  const matchupText = row.bye
    ? 'Bye'
    : row.opponent && row.homeAway
      ? `${row.homeAway === 'home' ? 'vs' : '@'} ${row.opponent}`
      : '-- / --';
  const metrics = [
    row.actualPoints != null
      ? `Actual ${Number.isInteger(row.actualPoints) ? String(row.actualPoints) : row.actualPoints.toFixed(1)}`
      : row.projection === null
        ? null
        : `Proj ${Number.isInteger(row.projection) ? String(row.projection) : row.projection.toFixed(1)}`,
    row.rosterRank == null ? null : `Start rank ${row.rosterRank}`,
    row.startPercentage === null ? null : `Start ${Math.round(row.startPercentage)}%`,
  ].filter(Boolean);
  const metricsText = metrics.length > 0 ? metrics.join(' · ') : 'Metrics unavailable';
  const compactText = `${row.position} · ${row.team ?? '--'} · ${matchupText} · ${metricsText}`;

  return {
    matchupText,
    metricsText,
    compactText,
    ariaLabel: `${row.name}. ${compactText}.`,
  };
}

function parseActualPlayerScores(payload: unknown): Map<string, { score: number; gameSecondsRemaining: number | null }> {
  const root = toRecord(payload);
  const scoring = toRecord(root?.liveScoring ?? root?.weeklyResults);
  const scores = new Map<string, { score: number; gameSecondsRemaining: number | null }>();

  for (const player of toRecords(toRecord(root?.playerScores)?.playerScore)) {
    const id = extractText(player.id ?? player.player_id ?? player.playerId);
    const score = safeNumber(player.score ?? player.points);
    if (!id || score === null) continue;
    scores.set(id, { score, gameSecondsRemaining: null });
  }

  for (const matchup of toRecords(scoring?.matchup)) {
    for (const franchise of toRecords(matchup.franchise)) {
      const playersRoot = toRecord(franchise.players);
      for (const player of toRecords(playersRoot?.player ?? franchise.player)) {
        const id = extractText(player.id ?? player.player_id ?? player.playerId);
        const score = safeNumber(player.score ?? player.points);
        if (!id || score === null) continue;

        scores.set(id, {
          score,
          gameSecondsRemaining: safeNumber(player.gameSecondsRemaining ?? player.game_seconds_remaining),
        });
      }
    }
  }

  return scores;
}

export function deriveTeamByeWeeks(scheduleWeeks: Map<number, Set<string>>, regularWeeks: number[]): Map<string, number | null> {
  const teams = new Map<string, Set<number>>();

  for (const week of regularWeeks) {
    const weekTeams = scheduleWeeks.get(week) ?? new Set<string>();
    for (const team of weekTeams) {
      const weeks = teams.get(team) ?? new Set<number>();
      weeks.add(week);
      teams.set(team, weeks);
    }
  }

  const result = new Map<string, number | null>();

  for (const [team, weeksPresent] of teams.entries()) {
    const missingWeeks = regularWeeks.filter((week) => !weeksPresent.has(week));
    result.set(team, missingWeeks.length === 1 ? missingWeeks[0] : null);
  }

  return result;
}

function parseNflSchedule(payload: unknown): Map<string, { opponent: string | null; homeAway: 'home' | 'away' | null; kickoffUtc: number | null; kickoffLocal: string | null }> {
  const root = toRecord(payload) as JsonRecord | null;
  const matchups = toRecords((root?.nflSchedule as JsonRecord | undefined)?.matchup ?? (root?.schedule as JsonRecord | undefined)?.matchup ?? root?.matchup);
  const result = new Map<string, { opponent: string | null; homeAway: 'home' | 'away' | null; kickoffUtc: number | null; kickoffLocal: string | null }>();

  for (const matchup of matchups) {
    const kickoffUtc = safeNumber(matchup.kickoff ?? matchup.start ?? matchup.startTime);
    const teams = toRecords(matchup.team);
    if (teams.length !== 2) continue;

    for (const team of teams) {
      const id = extractText(team.id ?? team.team_id ?? team.teamId);
      if (!id) continue;
      const opponentTeam = teams.find((candidate) => extractText(candidate.id ?? candidate.team_id ?? candidate.teamId) !== id) ?? null;
      const opponent = extractText(team.opponent) || extractText(opponentTeam?.id ?? opponentTeam?.team_id ?? opponentTeam?.teamId);
      const homeAway = extractText(team.isHome).toLowerCase() === '1' || extractText(team.isHome).toLowerCase() === 'home' ? 'home' : extractText(team.isHome).toLowerCase() === '0' || extractText(team.isHome).toLowerCase() === 'away' ? 'away' : null;
      result.set(id, {
        opponent: opponent || null,
        homeAway,
        kickoffUtc: kickoffUtc !== null ? kickoffUtc : null,
        kickoffLocal: kickoffUtc !== null ? formatEtKickoff(kickoffUtc) : null,
      });
    }
  }

  return result;
}

function chooseDefaultWeek(currentWeek: number | null, weeks: number[]): number | null {
  if (weeks.length === 0) return null;
  if (currentWeek !== null && weeks.includes(currentWeek)) return currentWeek;
  if (currentWeek !== null) {
    const upcoming = weeks.find((week) => week >= currentWeek);
    if (upcoming !== undefined) return upcoming;
  }
  return weeks[0] ?? null;
}

function normalizeFranchiseId(value: unknown): string | null {
  const text = extractText(value);
  return /^\d{4}$/.test(text) ? text : null;
}

function parseWeekParam(weekParam: string | null | undefined): number | null | 'invalid' {
  if (weekParam == null || weekParam.trim() === '') return null;
  if (!/^\d+$/.test(weekParam.trim())) return 'invalid';
  const parsed = Number(weekParam.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 'invalid';
}

function buildErrorState(message: string): LineupPageState {
  return {
    ok: false,
    message,
    franchiseId: null,
    franchiseName: null,
    currentWeek: null,
    selectedWeek: null,
    availableWeeks: [],
    rules: null,
    rows: [],
    summary: { totalSelected: 0, totalMin: 0, totalMax: 0, legal: false, problems: [message], perPosition: {} },
    hasSubmittedLineup: false,
    submittedAt: null,
  };
}

function summarizeRows(rules: LineupRules, rows: LineupRosterSnapshot[]): LineupPageSummary {
  const perPosition: LineupPageSummary['perPosition'] = {};
  for (const position of rules.positions) {
    perPosition[position.position] = { selected: 0, min: position.min, max: position.max };
  }

  for (const row of rows) {
    if (!row.selected) continue;
    const bucket = perPosition[row.position] ?? (perPosition[row.position] = { selected: 0, min: 0, max: 0 });
    bucket.selected += 1;
  }

  const totalSelected = rows.filter((row) => row.selected).length;
  const problems: string[] = [];

  for (const position of rules.positions) {
    const selected = perPosition[position.position]?.selected ?? 0;
    if (selected < position.min) problems.push(`Need ${position.min - selected} more ${position.position}.`);
    if (selected > position.max) problems.push(`Too many ${position.position}.`);
  }

  const flexExtras = rules.flexEligiblePositions.reduce((sum, position) => {
    const selected = perPosition[position]?.selected ?? 0;
    const minimum = rules.positions.find((entry) => entry.position === position)?.min ?? 0;
    return sum + Math.max(0, selected - minimum);
  }, 0);

  if (totalSelected < rules.totalMin) problems.push(`Need ${rules.totalMin - totalSelected} more total starters.`);
  if (totalSelected > rules.totalMax) problems.push(`Too many total starters.`);
  if (flexExtras > rules.flexSlots) problems.push(`Flex slots exceeded by ${flexExtras - rules.flexSlots}.`);

  return {
    totalSelected,
    totalMin: rules.totalMin,
    totalMax: rules.totalMax,
    legal: problems.length === 0,
    problems,
    perPosition,
  };
}

function buildRows(args: {
  rosterPlayers: Map<string, { id: string; name: string; position: string; team: string | null }>;
  playersDirectory: Map<string, { name: string; position: string; team: string | null }>;
  projectedScores: Map<string, number>;
  actualScores: Map<string, { score: number; gameSecondsRemaining: number | null }>;
  injuries: Map<string, LineupInjuryDesignation>;
  topStarters: Map<string, number>;
  startRanks: Map<string, number>;
  schedule: Map<string, { opponent: string | null; homeAway: 'home' | 'away' | null; kickoffUtc: number | null; kickoffLocal: string | null }>;
  selectedStarterIds: Set<string>;
  selectedWeek: number | null;
  byeWeeksByTeam: Map<string, number | null>;
}): LineupRosterSnapshot[] {
  const rows: LineupRosterSnapshot[] = [];

  for (const player of args.rosterPlayers.values()) {
    const directoryPlayer = args.playersDirectory.get(player.id) ?? null;
    const name = resolveRosterPlayerName(player.name, directoryPlayer?.name ?? null, player.id);
    const team = player.team ?? directoryPlayer?.team ?? null;
    const position = player.position === 'UNK' ? directoryPlayer?.position ?? 'UNK' : player.position;
    const game = team ? args.schedule.get(team) ?? null : null;
    const injury = args.injuries.get(player.id) ?? null;
    const selected = args.selectedStarterIds.has(player.id);
    const kickoffUtc = game?.kickoffUtc ?? null;
    const locked = Boolean(kickoffUtc !== null && kickoffUtc * 1000 <= Date.now());
    const actualScore = args.actualScores.get(player.id) ?? null;
    const hasStarted = actualScore !== null && (locked || (actualScore.gameSecondsRemaining !== null && actualScore.gameSecondsRemaining !== 3600));
    const byeWeek = team ? args.byeWeeksByTeam.get(team) ?? null : null;
    const isByeWeek = byeWeek !== null && args.selectedWeek !== null && byeWeek === args.selectedWeek;
    const bye = isByeWeek ? 'Bye' : null;
    const availability: LineupRosterSnapshot['availability'] = locked ? 'locked' : bye ? 'bye' : injury ? 'injured' : game ? 'available' : 'unknown';
    const statusText = `${injury ? `Injury ${injury}` : 'No injury designation'} · ${byeWeek === null ? 'Bye week unavailable' : `Bye ${byeWeek}`}${isByeWeek ? ' (this week)' : ''} · ${locked ? 'Locked' : 'Unlocked'} · Kickoff ${game?.kickoffLocal ?? 'unknown'}`;

    rows.push({
      id: player.id,
      name,
      position,
      team,
      rosterStatus: selected ? 'S' : 'B',
      locked,
      selected,
      bye,
      byeWeek,
      opponent: game?.opponent ?? null,
      homeAway: game?.homeAway ?? null,
      kickoffUtc: game?.kickoffUtc ?? null,
      kickoffLocal: game?.kickoffLocal ?? null,
      injury,
      projection: args.projectedScores.get(player.id) ?? null,
      actualPoints: hasStarted ? actualScore.score : null,
      startPercentage: args.topStarters.size > 0 ? args.topStarters.get(player.id) ?? 0 : null,
      rosterRank: args.startRanks.get(player.id) ?? null,
      statusText,
      availability,
      canToggle: !locked && !bye && (injury !== 'Out' || selected),
      group: groupPosition(position),
    });
  }

  const order = ['QB', 'RB', 'WR', 'TE', 'PK', 'DEF', 'OTHER'];
  return rows.sort((left, right) => {
    const leftOrder = order.indexOf(left.group);
    const rightOrder = order.indexOf(right.group);
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    if (left.position !== right.position) return left.position.localeCompare(right.position);
    return left.name.localeCompare(right.name);
  });
}

async function loadLineupPayloads(sessionCookieValue: string | null, selectedWeekParam?: string | null) {
  if (!sessionCookieValue) {
    return { ok: false as const, message: 'Sign in to MFL to load your lineup.' };
  }

  const [leagueResponse, scheduleResponse, liveScoringResponse, playersResponse, primaryResolution] = await Promise.all([
    fetchMflExport('league', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
    fetchMflExport('schedule', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
    fetchMflExport('liveScoring', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
    fetchMflExport('players', { JSON: '1' }, { revalidate: 60 * 60 * 24 }),
    resolvePrimaryFranchiseId(sessionCookieValue),
  ]);

  if (!leagueResponse.ok || !scheduleResponse.ok || !playersResponse.ok) {
    return { ok: false as const, message: 'Lineup data could not be loaded.' };
  }

  const [leaguePayload, schedulePayload, liveScoringPayload, playersPayload] = await Promise.all([
    leagueResponse.json().catch(() => null),
    scheduleResponse.json().catch(() => null),
    liveScoringResponse.ok ? liveScoringResponse.json().catch(() => null) : Promise.resolve(null),
    playersResponse.json().catch(() => null),
  ]);

  let rules: LineupRules;
  try {
    rules = parseLineupRules(leaguePayload);
  } catch {
    return { ok: false as const, message: 'Lineup data could not be loaded.' };
  }
  const schedule = parseScheduleWeeks(schedulePayload);
  const franchiseNames = parseLeagueFranchises(leaguePayload);
  const playersDirectory = parsePlayersDirectory(playersPayload);

  if (!schedule || playersDirectory.size === 0) {
    return { ok: false as const, message: 'Lineup data could not be loaded.' };
  }

  const requestedWeek = parseWeekParam(selectedWeekParam);
  if (requestedWeek === 'invalid') {
    return { ok: false as const, message: `Invalid week selection. Choose a week from ${schedule.weeks[0]} to ${schedule.weeks[schedule.weeks.length - 1]}.` };
  }

  const currentWeek = parseLiveScoringWeek(liveScoringPayload) ?? schedule.currentWeek ?? schedule.weeks[0] ?? null;
  const selectedWeek = requestedWeek ?? chooseDefaultWeek(currentWeek, schedule.weeks);
  if (selectedWeek === null || !schedule.weeks.includes(selectedWeek)) {
    return { ok: false as const, message: 'Selected week is not available.' };
  }

  const franchiseId = primaryResolution?.franchiseId ?? normalizeFranchiseId(process.env.MFL_PRIMARY_FRANCHISE_ID);
  if (!franchiseId) {
    return { ok: false as const, message: 'Sign in to MFL to load your lineup.' };
  }

  const franchiseName = franchiseNames.get(franchiseId) ?? `Franchise ${franchiseId}`;

  const scheduleWeekResponses = await Promise.all(
    schedule.weeks.map((week) => fetchMflSiteExport('nflSchedule', { W: String(week), JSON: '1' }, { revalidate: 60 * 60 })),
  );

  const selectedWeekIndex = schedule.weeks.indexOf(selectedWeek);
  if (selectedWeekIndex < 0 || !scheduleWeekResponses[selectedWeekIndex]?.ok) {
    return { ok: false as const, message: 'Lineup data could not be loaded.' };
  }

  const selectedLiveScoringPromise = selectedWeek === currentWeek
    ? Promise.resolve(null)
    : fetchMflExport('liveScoring', { W: String(selectedWeek), JSON: '1' }, { sessionCookieValue, cache: 'no-store' });

  const [rosterResponse, weeklyResultsResponse, projectedScoresResponse, injuriesResponse, topStartersResponse, selectedLiveScoringResponse] = await Promise.all([
    fetchMflExport('rosters', { FRANCHISE: franchiseId, W: String(selectedWeek), JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
    fetchMflExport('weeklyResults', { W: String(selectedWeek), JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
    fetchMflExport('projectedScores', { JSON: '1', W: String(selectedWeek) }, { sessionCookieValue, cache: 'no-store' }),
    fetchMflSiteExport('injuries', { JSON: '1', W: String(selectedWeek) }, { revalidate: 5 * 60 }),
    fetchMflSiteExport('topStarters', { JSON: '1', W: String(selectedWeek), COUNT: '5000' }, { revalidate: 5 * 60 }),
    selectedLiveScoringPromise,
  ]);

  if (!rosterResponse.ok || !weeklyResultsResponse.ok) {
    return { ok: false as const, message: 'Lineup data could not be loaded.' };
  }

  const [rosterPayload, weeklyResultsPayload, projectedScoresPayload, injuriesPayload, topStartersPayload, selectedLiveScoringPayload, schedulePayloads] = await Promise.all([
    rosterResponse.json().catch(() => null),
    weeklyResultsResponse.json().catch(() => null),
    projectedScoresResponse.json().catch(() => null),
    injuriesResponse.json().catch(() => null),
    topStartersResponse.json().catch(() => null),
    selectedLiveScoringResponse === null
      ? Promise.resolve(liveScoringPayload)
      : selectedLiveScoringResponse.ok
        ? selectedLiveScoringResponse.json().catch(() => null)
        : Promise.resolve(null),
    Promise.all(scheduleWeekResponses.map((response) => response.json().catch(() => null))),
  ]);

  const rosterPlayers = parseRosterPlayers(rosterPayload);
  const projectedScores = parseProjectedScores(projectedScoresPayload);
  const playerScoresResponse = rosterPlayers.size > 0
    ? await fetchMflExport('playerScores', {
      W: String(selectedWeek),
      PLAYERS: [...rosterPlayers.keys()].join(','),
      JSON: '1',
    }, { sessionCookieValue, cache: 'no-store' })
    : null;
  const playerScoresPayload = playerScoresResponse?.ok ? await playerScoresResponse.json().catch(() => null) : null;
  const actualScores = parseActualPlayerScores(playerScoresPayload);
  for (const [playerId, score] of parseActualPlayerScores(selectedLiveScoringPayload ?? liveScoringPayload)) {
    actualScores.set(playerId, score);
  }
  const injuries = parseInjuries(injuriesPayload);
  const topStarters = parseTopStarters(topStartersPayload);
  const startRanks = deriveStartRanks(topStarters, playersDirectory);
  const scheduleByWeek = new Map<number, Set<string>>();
  let scheduleMap = new Map<string, { opponent: string | null; homeAway: 'home' | 'away' | null; kickoffUtc: number | null; kickoffLocal: string | null }>();
  let canDeriveByes = true;

  for (let index = 0; index < schedule.weeks.length; index += 1) {
    const week = schedule.weeks[index];
    const weekSchedule = parseNflSchedule(schedulePayloads[index]);
    if (week === selectedWeek) {
      scheduleMap = weekSchedule;
    } else if (weekSchedule.size === 0) {
      canDeriveByes = false;
    }

    scheduleByWeek.set(week, new Set(weekSchedule.keys()));
  }

  const byeWeeksByTeam = canDeriveByes ? deriveTeamByeWeeks(scheduleByWeek, schedule.weeks) : new Map<string, number | null>();

  const submittedLineup = parseSubmittedLineup(weeklyResultsPayload, franchiseId);
  const selectedStarterIds = submittedLineup.starterIds;

  const rows = buildRows({
    rosterPlayers,
    playersDirectory,
    schedule: scheduleMap,
    projectedScores,
    actualScores,
    injuries,
    topStarters,
    startRanks,
    selectedStarterIds,
    selectedWeek,
    byeWeeksByTeam,
  });

  const summary = summarizeRows(rules, rows);

  return {
    ok: true as const,
    message: summary.legal ? `Week ${selectedWeek} ready for submission.` : `Week ${selectedWeek} needs attention.`,
    franchiseId,
    franchiseName,
    currentWeek,
    selectedWeek,
    availableWeeks: schedule.weeks,
    rules,
    rows,
    summary,
    hasSubmittedLineup: submittedLineup.found,
    submittedAt: null,
    rosterPlayerIds: new Set([...rosterPlayers.keys()]),
    playersById: rows.reduce((map, row) => {
      map.set(row.id, row);
      return map;
    }, new Map<string, LineupRosterSnapshot>()),
    currentStarterIds: [...selectedStarterIds],
  } satisfies LineupSubmissionContext;
}

export async function loadLineupPageState(sessionCookieValue: string | null, selectedWeekParam?: string | null): Promise<LineupPageState> {
  const payload = await loadLineupPayloads(sessionCookieValue, selectedWeekParam);
  if (!payload.ok) return buildErrorState(payload.message);

  return {
    ok: true,
    message: payload.message,
    franchiseId: payload.franchiseId,
    franchiseName: payload.franchiseName,
    currentWeek: payload.currentWeek,
    selectedWeek: payload.selectedWeek,
    availableWeeks: payload.availableWeeks,
    rules: payload.rules,
    rows: payload.rows,
    summary: payload.summary,
    hasSubmittedLineup: payload.hasSubmittedLineup,
    submittedAt: payload.submittedAt,
  };
}

export async function loadLineupSubmissionContext(sessionCookieValue: string | null, selectedWeekParam?: string | null): Promise<LineupSubmissionContext> {
  const payload = await loadLineupPayloads(sessionCookieValue, selectedWeekParam);
  if (!payload.ok) {
    const status: 400 | 401 | 503 = payload.message.toLowerCase().includes('sign in')
      ? 401
      : payload.message.toLowerCase().includes('week')
        ? 400
        : 503;
    throw new LineupLoadError(status, payload.message);
  }

  return payload;
}

export function validateLineupSubmission(
  input: {
    rules: LineupRules;
    playersById: Map<string, LineupRosterSnapshot>;
    rosterPlayerIds: Set<string>;
    starters: string[];
    clear: boolean;
    comments?: string;
  },
): LineupValidationResult {
  if ((input.comments ?? '').length > 280) {
    return { ok: false, status: 400, message: 'Comments must be 280 characters or fewer.' };
  }

  if (input.clear) {
    if (input.starters.length > 0) {
      return { ok: false, status: 400, message: 'Clear submissions must not include starters.' };
    }

    return { ok: true, normalizedStarters: [] };
  }

  if (!input.clear && input.starters.length === 0) {
    return { ok: false, status: 400, message: 'Empty lineup is not allowed. Use clear to submit an intentional empty lineup.' };
  }

  const seen = new Set<string>();
  for (const starterId of input.starters) {
    if (seen.has(starterId)) {
      return { ok: false, status: 400, message: 'Duplicate starters are not allowed.' };
    }
    seen.add(starterId);

    if (!input.rosterPlayerIds.has(starterId)) {
      return { ok: false, status: 400, message: `Player ${starterId} is not on the active roster.` };
    }

    const snapshot = input.playersById.get(starterId);
    if (!snapshot) {
      return { ok: false, status: 400, message: `Player ${starterId} could not be verified.` };
    }

    if (snapshot.availability === 'bye') {
      return { ok: false, status: 400, message: `${snapshot.name} is on bye and cannot be started.` };
    }

    if (snapshot.injury === 'Out' && snapshot.selected !== true) {
      return { ok: false, status: 400, message: `${snapshot.name} is Out and cannot be started.` };
    }

    if (snapshot.locked && snapshot.selected !== true) {
      return { ok: false, status: 409, message: `${snapshot.name} is locked and cannot be changed.` };
    }
  }

  for (const snapshot of input.playersById.values()) {
    if (!snapshot.locked) continue;
    const selected = seen.has(snapshot.id);
    if (selected !== snapshot.selected) {
      return { ok: false, status: 409, message: `${snapshot.name} is locked and cannot be changed.` };
    }
  }

  const selectedRows = input.starters.map((starterId) => input.playersById.get(starterId)).filter((row): row is LineupRosterSnapshot => Boolean(row));
  const selectedByPosition = new Map<string, number>();
  for (const row of selectedRows) {
    const next = (selectedByPosition.get(row.position) ?? 0) + 1;
    selectedByPosition.set(row.position, next);
  }

  const flexPositions = new Set(input.rules.flexEligiblePositions);
  let flexExtras = 0;

  for (const rule of input.rules.positions) {
    const selected = selectedByPosition.get(rule.position) ?? 0;
    if (selected < rule.min || selected > rule.max) {
      return { ok: false, status: 400, message: `Lineup does not satisfy ${rule.position} min/max requirements.` };
    }
    if (flexPositions.has(rule.position)) {
      flexExtras += Math.max(0, selected - rule.min);
    }
  }

  if (flexExtras > input.rules.flexSlots) {
    return { ok: false, status: 400, message: 'Flex requirements are not satisfied.' };
  }

  const totalSelected = input.starters.length;
  if (!input.clear && (totalSelected < input.rules.totalMin || totalSelected > input.rules.totalMax)) {
    return { ok: false, status: 400, message: 'Total starters are outside league limits.' };
  }

  return { ok: true, normalizedStarters: [...input.starters] };
}

export async function importLineupSubmission(args: {
  sessionCookieValue: string;
  franchiseId: string;
  week: number;
  starters: string[];
  comments?: string;
  clear?: boolean;
  playersById: Map<string, LineupRosterSnapshot>;
  rosterPlayerIds: Set<string>;
  rules: LineupRules;
}): Promise<LineupValidationResult & { confirmed?: boolean; submittedAt?: string; actualStarters?: string[] }> {
  const validation = validateLineupSubmission({
    rules: args.rules,
    playersById: args.playersById,
    rosterPlayerIds: args.rosterPlayerIds,
    starters: args.starters,
    clear: Boolean(args.clear),
    comments: args.comments,
  });

  if (!validation.ok) return validation;

  const config = getMflConfig();
  const url = new URL(`https://${config.host}/${config.year}/import`);
  const body = new URLSearchParams();
  body.set('TYPE', 'lineup');
  body.set('L', config.leagueId);
  body.set('W', String(args.week));
  body.set('STARTERS', args.clear ? '' : validation.normalizedStarters.join(','));
  body.set('COMMENTS', args.comments ?? '');

  const response = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Cookie: `MFL_USER_ID=${args.sessionCookieValue}`,
      'User-Agent': config.userAgent,
      Accept: 'application/xml, text/xml, text/plain, application/json;q=0.8, */*;q=0.2',
    },
    body: body.toString(),
  });

  if (response.status === 401 || response.status === 403) {
    return { ok: false, status: 401, message: 'Your MFL session has expired. Sign in again.' };
  }

  if (response.status === 429) {
    return { ok: false, status: 429, message: 'MFL is rate limiting requests. Please try again later.' };
  }

  if (!response.ok) {
    if (response.status >= 500) {
      return { ok: false, status: 503, message: 'MFL is temporarily unavailable.' };
    }

    return { ok: false, status: 400, message: 'Lineup submission failed.' };
  }

  const responseText = await response.text();
  if (/\berror\b|<error[\s>]/i.test(responseText) && !/^ok$/i.test(responseText.trim())) {
    return { ok: false, status: 400, message: 'MFL rejected the lineup submission.' };
  }

  const verifyResponse = await fetchMflExport(
    'weeklyResults',
    { W: String(args.week), JSON: '1' },
    { sessionCookieValue: args.sessionCookieValue, cache: 'no-store' },
  );

  if (!verifyResponse.ok) {
    return { ok: false, status: 503, message: 'Submission was accepted but could not be verified.' };
  }

  const verifyPayload = await verifyResponse.json().catch(() => null);
  const verifiedLineup = parseSubmittedLineup(verifyPayload, args.franchiseId);
  const actualStarters = [...verifiedLineup.starterIds].sort();
  const intendedStarters = [...validation.normalizedStarters].sort();

  if (actualStarters.length !== intendedStarters.length || actualStarters.some((id, index) => id !== intendedStarters[index])) {
    return { ok: false, status: 409, message: 'Lineup import succeeded but verification did not match the submitted starters.' };
  }

  return { ok: true, normalizedStarters: validation.normalizedStarters, confirmed: true, actualStarters };
}
