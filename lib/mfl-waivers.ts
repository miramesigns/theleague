import { fetchMflExport } from './mfl.ts';
import { formatMflMoney, formatMflTimestamp, splitMflIdList } from './mfl-format.ts';
import { resolvePrimaryFranchiseId } from './mfl-scores.ts';

type RecordValue = Record<string, unknown>;

export type FreeAgentRow = {
  id: string;
  name: string;
  position: string;
  team: string;
  salary: number | null;
  contractYear: number | null;
  status: string;
};

export type WaiverRules = {
  waiverType: string;
  bbidMinimum: number | null;
  bbidIncrement: number | null;
  bbidTiebreaker: string | null;
  maxWaiverRounds: number | null;
  bbidConditional: boolean;
};

export type FranchiseFaabRow = {
  franchiseId: string;
  name: string;
  bbidAvailableBalance: number | null;
  waiverSortOrder: number | null;
  isPrimary: boolean;
};

export type WaiverClaimRow = {
  id: string;
  timestamp: number;
  timeLabel: string;
  franchiseId: string;
  franchiseName: string;
  type: string;
  addPlayerIds: string[];
  dropPlayerIds: string[];
  bidAmount: number | null;
  summary: string;
};

export type PendingWaiverRow = {
  id: string;
  franchiseId: string;
  franchiseName: string;
  playerId: string | null;
  playerName: string | null;
  dropPlayerIds: string[];
  bidAmount: number | null;
  comments: string | null;
  rawSummary: string;
};

export type WaiversPageState = {
  ok: boolean;
  message: string;
  authenticated: boolean;
  franchiseId: string | null;
  franchiseName: string | null;
  myBalance: number | null;
  /** Current MFL league week when known (from live scoring); drives waiver window copy. */
  currentWeek: number | null;
  rules: WaiverRules | null;
  freeAgents: FreeAgentRow[];
  recentClaims: WaiverClaimRow[];
  pendingClaims: PendingWaiverRow[];
  faabBoard: FranchiseFaabRow[];
};

function record(value: unknown): RecordValue | null {
  return value && typeof value === 'object' ? (value as RecordValue) : null;
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
  for (const key of ['#text', '$t', 'name', 'id']) {
    const candidate = item[key];
    if (typeof candidate === 'string' || typeof candidate === 'number') {
      const next = String(candidate).trim();
      if (next) return next;
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

function mflErrorMessage(payload: unknown): string | null {
  const root = record(payload);
  const error = root?.error;
  const message = text(error);
  return message || null;
}

function playerMap(payload: unknown): Map<string, { name: string; position: string; team: string }> {
  const root = record(payload);
  const players = records(record(root?.players)?.player);
  const map = new Map<string, { name: string; position: string; team: string }>();
  for (const player of players) {
    const id = text(player.id);
    if (!id) continue;
    map.set(id, {
      name: text(player.name) || `Player ${id}`,
      position: text(player.position) || '—',
      team: text(player.team) || 'FA',
    });
  }
  return map;
}

function franchiseDirectory(payload: unknown): Map<string, string> {
  const league = record(record(payload)?.league);
  const franchises = records(record(league?.franchises)?.franchise);
  return new Map(
    franchises
      .map((franchise) => [text(franchise.id), text(franchise.name) || `Franchise ${text(franchise.id)}`] as const)
      .filter(([id]) => Boolean(id)),
  );
}

export function parseWaiverRules(leaguePayload: unknown): WaiverRules | null {
  const league = record(record(leaguePayload)?.league);
  if (!league) return null;

  return {
    waiverType: text(league.currentWaiverType ?? league.waiverType) || 'Unknown',
    bbidMinimum: numberValue(league.bbidMinimum),
    bbidIncrement: numberValue(league.bbidIncrement),
    bbidTiebreaker: text(league.bbidTiebreaker) || null,
    maxWaiverRounds: integerValue(league.maxWaiverRounds),
    bbidConditional: text(league.bbidConditional).toLowerCase() === 'yes',
  };
}

export function parseFaabBoard(leaguePayload: unknown, primaryFranchiseId: string | null): FranchiseFaabRow[] {
  const league = record(record(leaguePayload)?.league);
  const franchises = records(record(league?.franchises)?.franchise);

  return franchises
    .map((franchise) => {
      const franchiseId = text(franchise.id);
      return {
        franchiseId,
        name: text(franchise.name) || `Franchise ${franchiseId}`,
        bbidAvailableBalance: numberValue(franchise.bbidAvailableBalance),
        waiverSortOrder: integerValue(franchise.waiverSortOrder),
        isPrimary: franchiseId === primaryFranchiseId,
      } satisfies FranchiseFaabRow;
    })
    .filter((row) => row.franchiseId)
    .sort((left, right) => {
      const leftOrder = left.waiverSortOrder ?? Number.POSITIVE_INFINITY;
      const rightOrder = right.waiverSortOrder ?? Number.POSITIVE_INFINITY;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      return left.name.localeCompare(right.name);
    });
}

export function parseFreeAgents(freeAgentsPayload: unknown, playersPayload: unknown): FreeAgentRow[] {
  const names = playerMap(playersPayload);
  const root = record(freeAgentsPayload);
  const unit = record(record(root?.freeAgents)?.leagueUnit) ?? record(root?.freeAgents);
  const players = records(unit?.player);

  return players
    .map((player) => {
      const id = text(player.id);
      const info = names.get(id);
      return {
        id,
        name: info?.name || `Player ${id}`,
        position: info?.position || text(player.position) || '—',
        team: info?.team || text(player.team) || 'FA',
        salary: numberValue(player.salary),
        contractYear: integerValue(player.contractYear ?? player.contract_year),
        status: text(player.status) || 'available',
      } satisfies FreeAgentRow;
    })
    .filter((row) => row.id)
    .sort((left, right) => {
      const positionCompare = left.position.localeCompare(right.position);
      if (positionCompare !== 0) return positionCompare;
      return left.name.localeCompare(right.name);
    });
}

/** BBID transaction string: "addId,|bidAmount|dropId," or "addId,|bidAmount|" */
export function parseBbidTransactionBlob(blob: string): {
  addPlayerIds: string[];
  dropPlayerIds: string[];
  bidAmount: number | null;
} {
  const trimmed = blob.trim();
  if (!trimmed) {
    return { addPlayerIds: [], dropPlayerIds: [], bidAmount: null };
  }

  const parts = trimmed.split('|').map((part) => part.trim());
  const addPlayerIds = splitMflIdList(parts[0] || '');
  const bidAmount = numberValue(parts[1]);
  const dropPlayerIds = splitMflIdList(parts[2] || '');
  return { addPlayerIds, dropPlayerIds, bidAmount };
}

/** FREE_AGENT transaction string often looks like "|dropIds," or "addIds|dropIds," */
export function parseFreeAgentTransactionBlob(blob: string): {
  addPlayerIds: string[];
  dropPlayerIds: string[];
} {
  const trimmed = blob.trim();
  if (!trimmed) return { addPlayerIds: [], dropPlayerIds: [] };
  const parts = trimmed.split('|');
  if (parts.length === 1) {
    return { addPlayerIds: splitMflIdList(parts[0]), dropPlayerIds: [] };
  }
  return {
    addPlayerIds: splitMflIdList(parts[0] || ''),
    dropPlayerIds: splitMflIdList(parts[1] || ''),
  };
}

function playerLabel(id: string, names: Map<string, { name: string; position: string; team: string }>): string {
  const info = names.get(id);
  return info ? `${info.name} (${info.position})` : `Player ${id}`;
}

export function parseRecentWaiverClaims(
  transactionsPayload: unknown,
  playersPayload: unknown,
  names: Map<string, string>,
): WaiverClaimRow[] {
  const players = playerMap(playersPayload);
  const root = record(transactionsPayload);
  const transactions = records(record(root?.transactions)?.transaction);

  return transactions
    .filter((entry) => {
      const type = text(entry.type).toUpperCase();
      return type === 'BBID_WAIVER' || type === 'FREE_AGENT' || type === 'WAIVER' || type === 'PROCESS_WAIVERS';
    })
    .map((entry, index) => {
      const type = text(entry.type).toUpperCase() || 'WAIVER';
      const franchiseId = text(entry.franchise);
      const franchiseName = names.get(franchiseId) || (franchiseId ? `Franchise ${franchiseId}` : 'League');
      const timestamp = numberValue(entry.timestamp) ?? 0;
      const blob = text(entry.transaction);

      let addPlayerIds: string[] = [];
      let dropPlayerIds: string[] = [];
      let bidAmount: number | null = null;

      if (type === 'BBID_WAIVER' || type === 'WAIVER') {
        const parsed = parseBbidTransactionBlob(blob);
        addPlayerIds = parsed.addPlayerIds;
        dropPlayerIds = parsed.dropPlayerIds;
        bidAmount = parsed.bidAmount;
      } else if (type === 'FREE_AGENT') {
        const parsed = parseFreeAgentTransactionBlob(blob);
        addPlayerIds = parsed.addPlayerIds;
        dropPlayerIds = parsed.dropPlayerIds;
      }

      const adds = addPlayerIds.map((id) => playerLabel(id, players)).join(', ');
      const drops = dropPlayerIds.map((id) => playerLabel(id, players)).join(', ');
      let summary = type.replace(/_/g, ' ');
      if (type === 'PROCESS_WAIVERS') {
        summary = 'Waivers processed';
      } else if (adds && bidAmount !== null) {
        summary = `${franchiseName} claimed ${adds} for ${formatMflMoney(bidAmount)}${drops ? ` (dropped ${drops})` : ''}`;
      } else if (adds) {
        summary = `${franchiseName} added ${adds}${drops ? ` (dropped ${drops})` : ''}`;
      } else if (drops) {
        summary = `${franchiseName} dropped ${drops}`;
      }

      return {
        id: `${type}-${franchiseId}-${timestamp}-${index}`,
        timestamp,
        timeLabel: formatMflTimestamp(timestamp),
        franchiseId,
        franchiseName,
        type,
        addPlayerIds,
        dropPlayerIds,
        bidAmount,
        summary,
      } satisfies WaiverClaimRow;
    })
    .sort((left, right) => right.timestamp - left.timestamp);
}

export function parsePendingWaivers(
  pendingPayload: unknown,
  playersPayload: unknown,
  names: Map<string, string>,
): PendingWaiverRow[] {
  const error = mflErrorMessage(pendingPayload);
  if (error) return [];

  const players = playerMap(playersPayload);
  const root = record(pendingPayload);
  const pendingRoot = record(root?.pendingWaivers) ?? root;
  const rows: PendingWaiverRow[] = [];

  const franchises = records(pendingRoot?.franchise);
  if (franchises.length > 0) {
    for (const franchise of franchises) {
      const franchiseId = text(franchise.id ?? franchise.franchise_id);
      const franchiseName = names.get(franchiseId) || text(franchise.name) || `Franchise ${franchiseId}`;
      const claims = records(franchise.waiver ?? franchise.pendingWaiver ?? franchise.claim ?? franchise.player);
      for (const [index, claim] of claims.entries()) {
        const playerId = text(claim.id ?? claim.player ?? claim.player_id) || null;
        const bidAmount = numberValue(claim.bid ?? claim.bidAmount ?? claim.amount ?? claim.salary);
        const dropPlayerIds = splitMflIdList(text(claim.drop ?? claim.drops ?? claim.to_drop));
        rows.push({
          id: `${franchiseId}-${playerId || 'claim'}-${index}`,
          franchiseId,
          franchiseName,
          playerId,
          playerName: playerId ? playerLabel(playerId, players) : null,
          dropPlayerIds,
          bidAmount,
          comments: text(claim.comments ?? claim.comment) || null,
          rawSummary: `${franchiseName}${playerId ? ` on ${playerLabel(playerId, players)}` : ''}${bidAmount !== null ? ` · ${formatMflMoney(bidAmount)}` : ''}`,
        });
      }
    }
    return rows;
  }

  const flatClaims = records(pendingRoot?.pendingWaiver ?? pendingRoot?.waiver ?? pendingRoot?.claim);
  return flatClaims.map((claim, index) => {
    const franchiseId = text(claim.franchise ?? claim.franchise_id);
    const franchiseName = names.get(franchiseId) || `Franchise ${franchiseId || '?'}`;
    const playerId = text(claim.id ?? claim.player ?? claim.player_id) || null;
    const bidAmount = numberValue(claim.bid ?? claim.bidAmount ?? claim.amount);
    const dropPlayerIds = splitMflIdList(text(claim.drop ?? claim.drops));
    return {
      id: `flat-${franchiseId}-${playerId || index}`,
      franchiseId,
      franchiseName,
      playerId,
      playerName: playerId ? playerLabel(playerId, players) : null,
      dropPlayerIds,
      bidAmount,
      comments: text(claim.comments ?? claim.comment) || null,
      rawSummary: `${franchiseName}${playerId ? ` on ${playerLabel(playerId, players)}` : ''}${bidAmount !== null ? ` · ${formatMflMoney(bidAmount)}` : ''}`,
    } satisfies PendingWaiverRow;
  });
}

function parseLiveScoringWeek(payload: unknown): number | null {
  const live = record(record(payload)?.liveScoring);
  return integerValue(live?.week);
}

export function parseWaiversPageState(input: {
  league: unknown;
  freeAgents: unknown;
  players: unknown;
  transactions: unknown;
  pendingWaivers: unknown | null;
  primaryFranchiseId: string | null;
  authenticated: boolean;
  currentWeek?: number | null;
  liveScoring?: unknown | null;
}): WaiversPageState {
  const names = franchiseDirectory(input.league);
  const rules = parseWaiverRules(input.league);
  const faabBoard = parseFaabBoard(input.league, input.primaryFranchiseId);
  const freeAgents = parseFreeAgents(input.freeAgents, input.players);
  const recentClaims = parseRecentWaiverClaims(input.transactions, input.players, names);
  const pendingClaims = input.pendingWaivers
    ? parsePendingWaivers(input.pendingWaivers, input.players, names)
    : [];
  const currentWeek = input.currentWeek ?? parseLiveScoringWeek(input.liveScoring ?? null);

  const mine = faabBoard.find((row) => row.isPrimary) ?? null;

  if (freeAgents.length === 0 && recentClaims.length === 0 && !rules) {
    return {
      ok: false,
      message: 'Waiver and free-agent data could not be loaded from MFL.',
      authenticated: input.authenticated,
      franchiseId: input.primaryFranchiseId,
      franchiseName: mine?.name ?? null,
      myBalance: mine?.bbidAvailableBalance ?? null,
      currentWeek,
      rules: null,
      freeAgents: [],
      recentClaims: [],
      pendingClaims: [],
      faabBoard: [],
    };
  }

  return {
    ok: true,
    message: input.authenticated
      ? 'Live free agents, FAAB rules, and recent waiver activity from MFL.'
      : 'Sign in to see pending claims and draft a bid.',
    authenticated: input.authenticated,
    franchiseId: input.primaryFranchiseId,
    franchiseName: mine?.name ?? null,
    myBalance: mine?.bbidAvailableBalance ?? null,
    currentWeek,
    rules,
    freeAgents,
    recentClaims,
    pendingClaims,
    faabBoard,
  };
}

export async function loadWaiversPageState(sessionCookieValue: string | null): Promise<WaiversPageState> {
  const authenticated = Boolean(sessionCookieValue);
  const options = { sessionCookieValue: sessionCookieValue ?? undefined, cache: 'no-store' as const };

  try {
    const [primary, leagueResponse, freeAgentsResponse, playersResponse, transactionsResponse, pendingResponse, liveScoringResponse] = await Promise.all([
      resolvePrimaryFranchiseId(sessionCookieValue),
      fetchMflExport('league', { JSON: '1' }, options),
      fetchMflExport('freeAgents', { JSON: '1' }, options),
      fetchMflExport('players', { JSON: '1' }, { revalidate: 60 * 60 * 24 }),
      fetchMflExport('transactions', { JSON: '1', TRANS_TYPE: 'BBID_WAIVER', COUNT: '40' }, options),
      authenticated
        ? fetchMflExport('pendingWaivers', { JSON: '1' }, options)
        : Promise.resolve(null),
      fetchMflExport('liveScoring', { JSON: '1' }, { ...options, revalidate: 75 }),
    ]);

    if (!leagueResponse.ok || !freeAgentsResponse.ok || !playersResponse.ok) {
      return {
        ok: false,
        message: 'Waiver and free-agent data could not be loaded from MFL.',
        authenticated,
        franchiseId: primary?.franchiseId ?? null,
        franchiseName: null,
        myBalance: null,
        currentWeek: null,
        rules: null,
        freeAgents: [],
        recentClaims: [],
        pendingClaims: [],
        faabBoard: [],
      };
    }

    const read = (response: Response | null) => (response?.ok ? response.json().catch(() => null) : Promise.resolve(null));
    const [league, freeAgents, players, transactions, pendingWaivers, liveScoring] = await Promise.all([
      read(leagueResponse),
      read(freeAgentsResponse),
      read(playersResponse),
      read(transactionsResponse),
      pendingResponse ? read(pendingResponse) : Promise.resolve(null),
      read(liveScoringResponse),
    ]);

    // Also pull FREE_AGENT activity for the recent board.
    const freeAgentTxResponse = await fetchMflExport('transactions', { JSON: '1', TRANS_TYPE: 'FREE_AGENT', COUNT: '20' }, options);
    const freeAgentTx = freeAgentTxResponse.ok ? await freeAgentTxResponse.json().catch(() => null) : null;
    const mergedTransactions = {
      transactions: {
        transaction: [
          ...records(record(record(transactions)?.transactions)?.transaction),
          ...records(record(record(freeAgentTx)?.transactions)?.transaction),
        ],
      },
    };

    return parseWaiversPageState({
      league,
      freeAgents,
      players,
      transactions: mergedTransactions,
      pendingWaivers,
      primaryFranchiseId: primary?.franchiseId ?? null,
      authenticated,
      liveScoring,
    });
  } catch {
    return {
      ok: false,
      message: 'Waiver and free-agent data could not be loaded from MFL.',
      authenticated,
      franchiseId: null,
      franchiseName: null,
      myBalance: null,
      currentWeek: null,
      rules: null,
      freeAgents: [],
      recentClaims: [],
      pendingClaims: [],
      faabBoard: [],
    };
  }
}

export { formatMflMoney };
