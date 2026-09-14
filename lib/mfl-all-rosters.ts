import { fetchMflExport, fetchMflSiteExport } from './mfl.ts';
import { resolvePrimaryFranchiseId } from './mfl-scores.ts';
import {
  parseNflScheduleTeams,
  parseRosterPageState,
  parseScheduleWeeks,
  type RosterPageState,
  type RosterScheduleInputs,
} from './mfl-roster.ts';

type RecordValue = Record<string, unknown>;

export type AllRostersFranchise = {
  id: string;
  name: string;
  rows: RosterPageState['rows'];
  summary: RosterPageState['summary'];
};

export type AllRostersPageState = {
  ok: boolean;
  message: string;
  authenticatedFranchiseId: string | null;
  selectedFranchiseId: string | null;
  franchises: AllRostersFranchise[];
  selectedFranchise: AllRostersFranchise | null;
};

export type AllRostersPayloads = {
  authenticatedFranchiseId: string | null;
  league: unknown;
  rosters: Record<string, unknown>;
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

function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  const item = record(value);
  if (!item) return '';
  for (const key of ['#text', 'name', 'id', 'franchise_name']) {
    const candidate = item[key];
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      if (String(candidate).trim()) return String(candidate).trim();
    }
  }
  return '';
}

function records(value: unknown): RecordValue[] {
  return array(value).filter((entry): entry is RecordValue => Boolean(record(entry)));
}

function parseFranchises(payload: unknown): { id: string; name: string }[] {
  const league = record(record(payload)?.league);
  const franchises = records(record(league?.franchises)?.franchise);
  return franchises
    .map((franchise) => ({ id: text(franchise.id ?? franchise.franchise_id), name: text(franchise.name ?? franchise.franchise_name) }))
    .filter((franchise) => franchise.id && franchise.name);
}

function emptyState(message: string, authenticatedFranchiseId: string | null = null): AllRostersPageState {
  return {
    ok: false,
    message,
    authenticatedFranchiseId,
    selectedFranchiseId: null,
    franchises: [],
    selectedFranchise: null,
  };
}

export function parseAllRostersPageState(payloads: AllRostersPayloads): AllRostersPageState {
  const franchises = parseFranchises(payloads.league);
  if (franchises.length !== 12) {
    return emptyState('All league rosters could not be loaded.', payloads.authenticatedFranchiseId);
  }

  const franchiseStates = franchises.map((franchise) => {
    const state = parseRosterPageState({
      franchiseId: franchise.id,
      franchiseName: franchise.name,
      roster: payloads.rosters[franchise.id],
      players: payloads.players,
      scores: payloads.scores,
      salaries: payloads.salaries,
      schedule: payloads.schedule,
    });
    return { id: franchise.id, name: franchise.name, rows: state.rows, summary: state.summary } satisfies AllRostersFranchise;
  });
  const selectedFranchiseId = franchiseStates.some(({ id }) => id === payloads.authenticatedFranchiseId)
    ? payloads.authenticatedFranchiseId
    : franchiseStates[0]?.id ?? null;
  const selectedFranchise = franchiseStates.find(({ id }) => id === selectedFranchiseId) ?? null;

  return {
    ok: true,
    message: '',
    authenticatedFranchiseId: payloads.authenticatedFranchiseId,
    selectedFranchiseId,
    franchises: franchiseStates,
    selectedFranchise,
  };
}

export function selectAllRostersFranchise(state: AllRostersPageState, requestedId: string | null | undefined): AllRostersFranchise | null {
  const selected = state.franchises.find(({ id }) => id === requestedId) ?? state.selectedFranchise;
  return selected ?? null;
}

function withSelection(state: AllRostersPageState, requestedId: string | null | undefined): AllRostersPageState {
  const selected = selectAllRostersFranchise(state, requestedId);
  return { ...state, selectedFranchiseId: selected?.id ?? null, selectedFranchise: selected };
}

async function readJson(response: Response): Promise<unknown> {
  return response.ok ? response.json().catch(() => null) : null;
}

async function fetchMflSiteSchedule(week: number): Promise<unknown> {
  const response = await fetchMflSiteExport('nflSchedule', { W: String(week), JSON: '1' }, { cache: 'no-store' });
  return readJson(response);
}

export async function loadAllRostersPageState(
  sessionCookieValue: string | null,
  requestedFranchiseId?: string | null,
): Promise<AllRostersPageState> {
  if (!sessionCookieValue?.trim()) return emptyState('Sign in to MFL to view all league rosters.');

  try {
    const options = { sessionCookieValue, cache: 'no-store' as const };
    const [resolution, leagueResponse, playersResponse, scoresResponse, salariesResponse, scheduleResponse] = await Promise.all([
      resolvePrimaryFranchiseId(sessionCookieValue),
      fetchMflExport('league', { JSON: '1' }, options),
      fetchMflExport('players', { JSON: '1' }, options),
      fetchMflExport('playerScores', { W: 'YTD', JSON: '1' }, options),
      fetchMflExport('salaries', { JSON: '1' }, options),
      fetchMflExport('schedule', { JSON: '1' }, options),
    ]);
    if (!leagueResponse.ok || !playersResponse.ok) return emptyState('All league rosters could not be loaded.');

    const [league, players, scores, salaries, schedule] = await Promise.all([
      readJson(leagueResponse), readJson(playersResponse), readJson(scoresResponse), readJson(salariesResponse), readJson(scheduleResponse),
    ]);
    const franchises = parseFranchises(league);
    if (franchises.length !== 12) return emptyState('All league rosters could not be loaded.');

    const rosterResponses = await Promise.all(franchises.map(({ id }) => fetchMflExport('rosters', { FRANCHISE: id, JSON: '1' }, options)));
    const rosterPayloads = await Promise.all(rosterResponses.map(readJson));
    const weeks = parseScheduleWeeks(schedule);
    const schedulePayloads = await Promise.all(weeks.map(fetchMflSiteSchedule));
    const scheduleInputs: RosterScheduleInputs = {
      weeks,
      teamsByWeek: new Map(weeks.map((week, index) => [week, parseNflScheduleTeams(schedulePayloads[index])])),
    };
    const state = parseAllRostersPageState({
      authenticatedFranchiseId: resolution?.franchiseId ?? null,
      league,
      rosters: Object.fromEntries(franchises.map(({ id }, index) => [id, rosterPayloads[index]])),
      players,
      scores,
      salaries,
      schedule: scheduleInputs,
    });
    return withSelection(state, requestedFranchiseId);
  } catch {
    return emptyState('All league rosters could not be loaded.');
  }
}
