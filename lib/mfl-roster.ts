import { fetchMflExport } from './mfl.ts';
import { resolvePrimaryFranchiseId } from './mfl-scores.ts';

type RecordValue = Record<string, unknown>;

export type RosterRow = {
  id: string;
  name: string;
  position: string | null;
  team: string | null;
  ytdPoints: number | null;
  byeWeek: number | null;
  salary: number | null;
  contractYear: number | null;
  tradeAvailability: 'Available' | 'Not listed' | 'Unavailable';
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

type RosterPayloads = {
  franchiseId: string;
  franchiseName: string | null;
  roster: unknown;
  players: unknown;
  scores: unknown;
  salaries: unknown;
  tradeBait: unknown;
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

function hasExportShape(payload: unknown, key: string): boolean {
  const current = record(payload);
  if (!current) return false;
  if (current[key] !== undefined) return true;
  return Object.values(current).some((nested) => hasExportShape(nested, key));
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

export function parseRosterPageState(payloads: RosterPayloads): RosterPageState {
  const rosterEntries = exportEntries(payloads.roster, ['rosters']);
  const playerEntries = exportEntries(payloads.players, ['players']);
  const scoreEntries = exportEntries(payloads.scores, ['playerScores']);
  const salaryEntries = exportEntries(payloads.salaries, ['salaries']);
  const tradeEntries = exportEntries(payloads.tradeBait, ['tradeBait']);
  const playerById = new Map(playerEntries.map((entry) => [idOf(entry), entry]));
  const scoreById = new Map(scoreEntries.map((entry) => [idOf(entry), numberValue(entry.score ?? entry.points ?? entry.total)]));
  const salaryById = new Map(salaryEntries.map((entry) => [idOf(entry), entry]));
  const tradeIds = new Set(tradeEntries.map(idOf).filter(Boolean));
  const tradeExportAvailable = hasExportShape(payloads.tradeBait, 'tradeBait');

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
      byeWeek: integerValue(player.bye_week ?? player.byeWeek ?? player.bye),
      salary: numberValue(salary.salary ?? roster.salary),
      contractYear: integerValue(salary.contractYear ?? salary.contract_year ?? roster.contractYear),
      tradeAvailability: !tradeExportAvailable ? 'Unavailable' : tradeIds.has(id) ? 'Available' : 'Not listed',
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
  const [leagueResponse, rosterResponse, playersResponse, scoresResponse, salariesResponse, tradeBaitResponse] = await Promise.all([
    fetchMflExport('league', { JSON: '1' }, options),
    fetchMflExport('rosters', { FRANCHISE: resolution.franchiseId, JSON: '1' }, options),
    fetchMflExport('players', { JSON: '1' }, { revalidate: 60 * 60 * 24 }),
    fetchMflExport('playerScores', { W: 'YTD', JSON: '1' }, options),
    fetchMflExport('salaries', { JSON: '1' }, options),
    fetchMflExport('tradeBait', { JSON: '1' }, options),
  ]);

  if (!rosterResponse.ok || !playersResponse.ok) {
    return { ok: false, message: 'Roster data could not be loaded.', franchiseId: resolution.franchiseId, franchiseName: null, rows: [], summary: { rosterCount: 0, ytdPoints: null, salary: null } };
  }

  const read = (response: Response) => response.ok ? response.json().catch(() => null) : Promise.resolve(null);
  const [league, roster, players, scores, salaries, tradeBait] = await Promise.all([
    read(leagueResponse), read(rosterResponse), read(playersResponse), read(scoresResponse), read(salariesResponse), read(tradeBaitResponse),
  ]);
  const state = parseRosterPageState({
    franchiseId: resolution.franchiseId,
    franchiseName: parseFranchiseName(league, resolution.franchiseId),
    roster, players, scores, salaries, tradeBait,
  });
  return state.rows.length ? state : { ...state, ok: false, message: 'Roster data could not be loaded.' };
}
