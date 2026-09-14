import { fetchMflExport } from './mfl.ts';
import { resolvePrimaryFranchiseId } from './mfl-scores.ts';

type JsonRecord = Record<string, unknown>;

export type StandingRow = {
  rank: number;
  franchiseId: string;
  teamName: string;
  divisionId: string;
  divisionName: string;
  record: string;
  winPct: number;
  gamesBack: number;
  streak: string | null;
  pointsFor: number;
  averagePointsFor: number;
  pointsAgainst: number;
  averagePointsAgainst: number;
  divisionRecord: string;
  nonDivisionRecord: string;
  powerRank: number | null;
  isPrimary: boolean;
};

export type StandingsPageState = {
  ok: boolean;
  message: string;
  rows: StandingRow[];
};

function toRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' ? value as JsonRecord : null;
}

function toRecords(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter((entry): entry is JsonRecord => Boolean(entry) && typeof entry === 'object');
  return value && typeof value === 'object' ? [value as JsonRecord] : [];
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function number(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function count(value: unknown): number {
  const parsed = number(value);
  return parsed !== null && parsed >= 0 ? Math.trunc(parsed) : 0;
}

function record(wins: number, losses: number, ties: number): string {
  return `${wins}-${losses}-${ties}`;
}

function parseLeagueDirectory(payload: unknown): {
  names: Map<string, string>;
  franchiseDivisions: Map<string, string>;
  divisionNames: Map<string, string>;
} {
  const league = toRecord(toRecord(payload)?.league);
  const franchises = toRecords(toRecord(league?.franchises)?.franchise);
  const names = new Map<string, string>();
  const franchiseDivisions = new Map<string, string>();
  const divisionNames = new Map<string, string>();

  for (const division of toRecords(toRecord(league?.divisions)?.division)) {
    const id = text(division.id);
    if (id) divisionNames.set(id, text(division.name) || `Division ${id}`);
  }

  for (const franchise of franchises) {
    const id = text(franchise.id);
    if (!id) continue;
    names.set(id, text(franchise.name) || `Franchise ${id}`);
    franchiseDivisions.set(id, text(franchise.division ?? franchise.division_id));
  }
  return { names, franchiseDivisions, divisionNames };
}

export function parseStandings(
  payload: unknown,
  names: Map<string, string>,
  primaryFranchiseId: string | null,
  franchiseDivisions = new Map<string, string>(),
  divisionNames = new Map<string, string>(),
): StandingRow[] {
  const root = toRecord(payload);
  const standings = toRecord(root?.leagueStandings ?? root?.standings);
  const franchises = toRecords(standings?.franchise);

  const parsed = franchises.map((franchise) => {
    const franchiseId = text(franchise.id);
    const wins = count(franchise.h2hw ?? franchise.wins);
    const losses = count(franchise.h2hl ?? franchise.losses);
    const ties = count(franchise.h2ht ?? franchise.ties);
    const games = wins + losses + ties;
    const pointsFor = number(franchise.pf) ?? 0;
    const pointsAgainst = number(franchise.pa) ?? 0;
    const divisionWins = count(franchise.divw);
    const divisionLosses = count(franchise.divl);
    const divisionTies = count(franchise.divt);
    const nonDivisionWins = count(franchise.nondivw ?? franchise.non_divw);
    const nonDivisionLosses = count(franchise.nondivl ?? franchise.non_divl);
    const nonDivisionTies = count(franchise.nondivt ?? franchise.non_divt);
    const divisionId = franchiseDivisions.get(franchiseId) || text(franchise.division ?? franchise.division_id) || 'league';

    return {
      rank: 0,
      franchiseId,
      teamName: names.get(franchiseId) ?? `Franchise ${franchiseId}`,
      divisionId,
      divisionName: divisionNames.get(divisionId) ?? 'League',
      record: record(wins, losses, ties),
      winPct: number(franchise.h2hpct ?? franchise.pct) ?? (games > 0 ? (wins + ties / 2) / games : 0),
      gamesBack: number(franchise.h2hgb ?? franchise.gb) ?? 0,
      streak: text(franchise.h2hstreak ?? franchise.h2hstrk ?? franchise.strk ?? franchise.streak) || null,
      pointsFor,
      averagePointsFor: number(franchise.avgpf) ?? (games > 0 ? pointsFor / games : 0),
      pointsAgainst,
      averagePointsAgainst: number(franchise.avgpa) ?? (games > 0 ? pointsAgainst / games : 0),
      divisionRecord: record(divisionWins, divisionLosses, divisionTies),
      nonDivisionRecord: record(nonDivisionWins, nonDivisionLosses, nonDivisionTies),
      powerRank: number(franchise.pwr ?? franchise.power_rank),
      isPrimary: franchiseId === primaryFranchiseId,
      wins,
      losses,
    };
  }).filter((row) => row.franchiseId);

  const divisionLeaders = new Map<string, { wins: number; losses: number }>();
  for (const row of parsed) {
    const best = divisionLeaders.get(row.divisionId);
    if (!best || row.wins - row.losses > best.wins - best.losses) {
      divisionLeaders.set(row.divisionId, { wins: row.wins, losses: row.losses });
    }
  }

  const divisionRanks = new Map<string, number>();
  return parsed.map((row, index) => {
    const rank = (divisionRanks.get(row.divisionId) ?? 0) + 1;
    const leader = divisionLeaders.get(row.divisionId);
    divisionRanks.set(row.divisionId, rank);
    return {
      ...row,
      rank,
      gamesBack: number(franchises[index]?.h2hgb ?? franchises[index]?.gb) ?? (leader ? Math.max(0, ((leader.wins - row.wins) + (row.losses - leader.losses)) / 2) : 0),
    };
  }).map(({ wins: _wins, losses: _losses, ...row }) => row);
}

export function groupStandingsByDivision(rows: StandingRow[]) {
  const preferredOrder = ['Money', 'Power', 'Respect'];
  const groups = new Map<string, StandingRow[]>();
  for (const row of rows) groups.set(row.divisionName, [...(groups.get(row.divisionName) ?? []), row]);

  return [...groups.entries()]
    .sort(([left], [right]) => {
      const leftIndex = preferredOrder.indexOf(left);
      const rightIndex = preferredOrder.indexOf(right);
      if (leftIndex >= 0 || rightIndex >= 0) return (leftIndex < 0 ? preferredOrder.length : leftIndex) - (rightIndex < 0 ? preferredOrder.length : rightIndex);
      return left.localeCompare(right);
    })
    .map(([name, divisionRows]) => ({ name, rows: divisionRows }));
}

export async function loadStandingsPageState(sessionCookieValue: string | null): Promise<StandingsPageState> {
  if (!sessionCookieValue) return { ok: false, message: 'Sign in to MFL to load league standings.', rows: [] };

  try {
    const [leagueResponse, standingsResponse, primary] = await Promise.all([
      fetchMflExport('league', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      fetchMflExport('leagueStandings', { JSON: '1' }, { sessionCookieValue, cache: 'no-store' }),
      resolvePrimaryFranchiseId(sessionCookieValue),
    ]);

    if (!leagueResponse.ok || !standingsResponse.ok) throw new Error('MFL standings request failed');
    const [leaguePayload, standingsPayload] = await Promise.all([leagueResponse.json(), standingsResponse.json()]);
    const directory = parseLeagueDirectory(leaguePayload);
    const rows = parseStandings(standingsPayload, directory.names, primary?.franchiseId ?? null, directory.franchiseDivisions, directory.divisionNames);
    if (rows.length === 0) throw new Error('MFL returned no standings');

    return { ok: true, message: 'Current league standings from MFL.', rows };
  } catch {
    return { ok: false, message: 'League standings could not be loaded. Refresh and try again.', rows: [] };
  }
}
