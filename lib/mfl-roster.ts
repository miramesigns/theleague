import { fetchMflExport, fetchMflSiteExport } from './mfl.ts';
import { resolvePrimaryFranchiseId } from './mfl-scores.ts';

type RecordValue = Record<string, unknown>;

export type RosterScheduleInputs = {
  weeks: number[];
  teamsByWeek: Map<number, Set<string>>;
};

export type RosterRow = {
  id: string;
  name: string;
  position: string | null;
  team: string | null;
  ytdPoints: number | null;
  byeWeek: number | null;
  salary: number | null;
  contractYear: number | null;
  status: string;
};

export type RosterPageState = {
  ok: boolean;
  message: string;
  franchiseId: string | null;
  franchiseName: string | null;
  rows: RosterRow[];
  summary: { rosterCount: number; ytdPoints: number | null; salary: number | null };
};

export type RosterPayloads = {
  franchiseId: string;
  franchiseName: string | null;
  roster: unknown;
  players: unknown;
  scores: unknown;
  salaries: unknown;
  schedule?: RosterScheduleInputs | null;
};

function record(value: unknown): RecordValue | null {
  return value && typeof value === 'object' ? value as RecordValue : null;
}

function array(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value && typeof value === 'object' ? [value] : [];
}

function records(value: unknown): RecordValue[] {
  return array(value).filter((entry): entry is RecordValue => Boolean(record(entry)));
}

function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  const item = record(value);
  if (!item) return '';
  for (const key of ['#text', 'name', 'id', 'position', 'team', 'franchise_name']) {
    const candidate = item[key];
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      if (String(candidate).trim()) return String(candidate).trim();
    }
  }
  return '';
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function integerValue(value: unknown): number | null {
  const parsed = numberValue(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function exportEntries(payload: unknown, roots: string[]): RecordValue[] {
  const root = record(payload);
  const target = roots.includes('playerScores') ? 'playerScore' : roots.includes('league') ? 'franchise' : 'player';
  const visit = (value: unknown): RecordValue[] => {
    const current = record(value);
    if (!current) return [];
    const direct = records(current[target]);
    if (direct.length || current[target] !== undefined) return direct;
    for (const nested of Object.values(current)) {
      const found = visit(nested);
      if (found.length) return found;
    }
    return [];
  };

  for (const key of roots) {
    const entries = visit(root?.[key]);
    if (entries.length) return entries;
  }
  return [];
}

function idOf(entry: RecordValue): string {
  return text(entry.id ?? entry.player_id ?? entry.playerId);
}

function nameOf(entry: RecordValue): string {
  return text(entry.name ?? entry.player_name) || 'Unavailable';
}

function parseFranchiseName(payload: unknown, franchiseId: string): string | null {
  const franchises = exportEntries(payload, ['league']);
  const franchise = franchises.find((entry) => text(entry.id ?? entry.franchise_id) === franchiseId);
  return franchise ? text(franchise.name ?? franchise.franchise_name) || null : null;
}

function statusText(value: unknown): string {
  const status = text(value).toUpperCase();
  if (status === 'S') return 'Starter';
  if (status === 'B') return 'Bench';
  if (status === 'IR') return 'IR';
  if (status === 'TAXI') return 'Taxi';
  if (status === 'RESERVE') return 'Reserve';
  return status || 'Unavailable';
}

function unavailableSummary(rows: RosterRow[], key: 'ytdPoints' | 'salary'): number | null {
  return rows.length > 0 && rows.every((row) => row[key] !== null)
    ? rows.reduce((total, row) => total + (row[key] ?? 0), 0)
    : null;
}

export function parseScheduleWeeks(payload: unknown): number[] {
  const schedule = record(record(payload)?.schedule);
  const entries = records(schedule?.weeklySchedule ?? schedule?.week ?? schedule?.weeks);
  return [...new Set(entries.map((entry) => integerValue(entry.week ?? entry.W ?? entry.number)).filter((week): week is number => week !== null))]
    .sort((left, right) => left - right);
}

export function parseNflScheduleTeams(payload: unknown): Set<string> {
  const schedule = record(record(payload)?.nflSchedule);
  const matchups = records(schedule?.matchup);
  const teams = new Set<string>();
  for (const matchup of matchups) {
    for (const team of records(matchup.team)) {
      const id = text(team.id ?? team.team_id ?? team.teamId);
      if (id) teams.add(id);
    }
  }
  return teams;
}

async function fetchMflSiteSchedule(week: number): Promise<unknown> {
  const response = await fetchMflSiteExport('nflSchedule', { W: String(week), JSON: '1' }, { revalidate: 60 * 60 });
  return response.ok ? response.json().catch(() => null) : null;
}

export function formatRosterSalary(value: number | null): string {
  return value === null
    ? 'Unavailable'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

export function deriveRosterByeWeeks({ weeks, teamsByWeek }: RosterScheduleInputs): Map<string, number | null> {
  const availableWeeks = [...new Set(weeks)].sort((left, right) => left - right);
  if (availableWeeks.length === 0 || availableWeeks.some((week) => !(teamsByWeek.get(week)?.size))) return new Map();

  const teams = new Map<string, Set<number>>();
  for (const week of availableWeeks) {
    for (const team of teamsByWeek.get(week) ?? []) {
      const presentWeeks = teams.get(team) ?? new Set<number>();
      presentWeeks.add(week);
      teams.set(team, presentWeeks);
    }
  }

  return new Map([...teams].map(([team, presentWeeks]) => {
    const missingWeeks = availableWeeks.filter((week) => !presentWeeks.has(week));
    return [team, missingWeeks.length === 1 ? missingWeeks[0] : null];
  }));
}

export function parseRosterPageState(payloads: RosterPayloads): RosterPageState {
  const rosterEntries = exportEntries(payloads.roster, ['rosters']);
  const playerEntries = exportEntries(payloads.players, ['players']);
  const scoreEntries = exportEntries(payloads.scores, ['playerScores']);
  const salaryEntries = exportEntries(payloads.salaries, ['salaries']);
  const playerById = new Map(playerEntries.map((entry) => [idOf(entry), entry]));
  const scoreById = new Map(scoreEntries.map((entry) => [idOf(entry), numberValue(entry.score ?? entry.points ?? entry.total)]));
  const salaryById = new Map(salaryEntries.map((entry) => [idOf(entry), entry]));
  const byeWeeks = payloads.schedule ? deriveRosterByeWeeks(payloads.schedule) : new Map<string, number | null>();

  const rows = rosterEntries.map((roster) => {
    const id = idOf(roster);
    const player = playerById.get(id) ?? {};
    const salary = salaryById.get(id) ?? {};
    const ytdPoints = scoreById.get(id) ?? null;
    return {
      id,
      name: nameOf(player) !== 'Unavailable' ? nameOf(player) : nameOf(roster),
      position: text(player.position ?? roster.position) || null,
      team: text(player.team ?? player.nflTeam) || null,
      ytdPoints,
      byeWeek: byeWeeks.get(text(player.team ?? player.nflTeam)) ?? null,
      salary: numberValue(salary.salary ?? roster.salary),
      contractYear: integerValue(salary.contractYear ?? salary.contract_year ?? roster.contractYear),
      status: statusText(roster.status),
    } satisfies RosterRow;
  }).filter((row) => row.id);

  return {
    ok: true,
    message: '',
    franchiseId: payloads.franchiseId,
    franchiseName: payloads.franchiseName,
    rows,
    summary: {
      rosterCount: rows.length,
      ytdPoints: unavailableSummary(rows, 'ytdPoints'),
      salary: unavailableSummary(rows, 'salary'),
    },
  };
}

export async function loadRosterPageState(sessionCookieValue: string | null): Promise<RosterPageState> {
  if (!sessionCookieValue) {
    return { ok: false, message: 'Sign in to MFL to load your roster.', franchiseId: null, franchiseName: null, rows: [], summary: { rosterCount: 0, ytdPoints: null, salary: null } };
  }

  const resolution = await resolvePrimaryFranchiseId(sessionCookieValue);
  if (!resolution) {
    return { ok: false, message: 'Your MFL owner roster could not be identified.', franchiseId: null, franchiseName: null, rows: [], summary: { rosterCount: 0, ytdPoints: null, salary: null } };
  }

  const options = { sessionCookieValue, cache: 'no-store' as const };
  const [leagueResponse, rosterResponse, playersResponse, scoresResponse, salariesResponse, scheduleResponse] = await Promise.all([
    fetchMflExport('league', { JSON: '1' }, options),
    fetchMflExport('rosters', { FRANCHISE: resolution.franchiseId, JSON: '1' }, options),
    fetchMflExport('players', { JSON: '1' }, { revalidate: 60 * 60 * 24 }),
    fetchMflExport('playerScores', { W: 'YTD', JSON: '1' }, options),
    fetchMflExport('salaries', { JSON: '1' }, options),
    fetchMflExport('schedule', { JSON: '1' }, options),
  ]);

  if (!rosterResponse.ok || !playersResponse.ok) {
    return { ok: false, message: 'Roster data could not be loaded.', franchiseId: resolution.franchiseId, franchiseName: null, rows: [], summary: { rosterCount: 0, ytdPoints: null, salary: null } };
  }

  const read = (response: Response) => response.ok ? response.json().catch(() => null) : Promise.resolve(null);
  const [league, roster, players, scores, salaries, schedule] = await Promise.all([
    read(leagueResponse), read(rosterResponse), read(playersResponse), read(scoresResponse), read(salariesResponse), read(scheduleResponse),
  ]);
  const weeks = parseScheduleWeeks(schedule);
  const schedulePayloads = await Promise.all(weeks.map(fetchMflSiteSchedule));
  const scheduleInputs: RosterScheduleInputs = {
    weeks,
    teamsByWeek: new Map(weeks.map((week, index) => [week, parseNflScheduleTeams(schedulePayloads[index])])),
  };
  const state = parseRosterPageState({
    franchiseId: resolution.franchiseId,
    franchiseName: parseFranchiseName(league, resolution.franchiseId),
    roster, players, scores, salaries, schedule: scheduleInputs,
  });
  return state.rows.length ? state : { ...state, ok: false, message: 'Roster data could not be loaded.' };
}
