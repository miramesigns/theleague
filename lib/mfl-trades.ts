import { formatMflAssetLabels, parseMflAssetList, type MflAsset } from './mfl-assets.ts';
import { fetchMflExport } from './mfl.ts';
import { formatMflTimestamp } from './mfl-format.ts';
import { resolvePrimaryFranchiseId } from './mfl-scores.ts';

type RecordValue = Record<string, unknown>;

export type TradeFranchiseOption = {
  id: string;
  name: string;
  isPrimary: boolean;
};

export type TradeRow = {
  id: string;
  timestamp: number;
  timeLabel: string;
  expiresAt: number | null;
  expiresLabel: string | null;
  franchiseId: string;
  franchiseName: string;
  partnerId: string;
  partnerName: string;
  offered: MflAsset[];
  requested: MflAsset[];
  summary: string;
  status: 'completed' | 'pending' | 'bait';
  byCommish: boolean;
};

export type TradeBaitRow = {
  id: string;
  franchiseId: string;
  franchiseName: string;
  assets: MflAsset[];
  comments: string | null;
  summary: string;
};

export type TradesPageState = {
  ok: boolean;
  message: string;
  authenticated: boolean;
  franchiseId: string | null;
  franchiseName: string | null;
  defaultExpirationDays: number;
  franchises: TradeFranchiseOption[];
  pending: TradeRow[];
  recent: TradeRow[];
  tradeBait: TradeBaitRow[];
  myRosterAssets: MflAsset[];
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
  return text(record(payload)?.error) || null;
}

function playerNames(payload: unknown): Map<string, string> {
  const players = records(record(record(payload)?.players)?.player);
  return new Map(players.map((player) => [text(player.id), text(player.name) || `Player ${text(player.id)}`] as const).filter(([id]) => id));
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

function franchiseOptions(payload: unknown, primaryFranchiseId: string | null): TradeFranchiseOption[] {
  const names = franchiseDirectory(payload);
  return [...names.entries()]
    .map(([id, name]) => ({ id, name, isPrimary: id === primaryFranchiseId }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function parseCompletedTrades(
  transactionsPayload: unknown,
  playersPayload: unknown,
  names: Map<string, string>,
): TradeRow[] {
  const players = playerNames(playersPayload);
  const transactions = records(record(record(transactionsPayload)?.transactions)?.transaction);

  return transactions
    .filter((entry) => text(entry.type).toUpperCase() === 'TRADE')
    .map((entry, index) => {
      const franchiseId = text(entry.franchise);
      const partnerId = text(entry.franchise2);
      const offered = parseMflAssetList(text(entry.franchise1_gave_up), players);
      const requested = parseMflAssetList(text(entry.franchise2_gave_up), players);
      const timestamp = numberValue(entry.timestamp) ?? 0;
      const expiresAt = numberValue(entry.expires);
      const franchiseName = names.get(franchiseId) || `Franchise ${franchiseId}`;
      const partnerName = names.get(partnerId) || `Franchise ${partnerId}`;

      return {
        id: `trade-${franchiseId}-${partnerId}-${timestamp}-${index}`,
        timestamp,
        timeLabel: formatMflTimestamp(timestamp),
        expiresAt,
        expiresLabel: expiresAt ? formatMflTimestamp(expiresAt) : null,
        franchiseId,
        franchiseName,
        partnerId,
        partnerName,
        offered,
        requested,
        summary: `${franchiseName} traded ${formatMflAssetLabels(offered)} to ${partnerName} for ${formatMflAssetLabels(requested)}`,
        status: 'completed' as const,
        byCommish: text(entry.by_commish) === '1',
      } satisfies TradeRow;
    })
    .sort((left, right) => right.timestamp - left.timestamp);
}

export function parsePendingTrades(
  pendingPayload: unknown,
  playersPayload: unknown,
  names: Map<string, string>,
): TradeRow[] {
  if (!pendingPayload || mflErrorMessage(pendingPayload)) return [];

  const players = playerNames(playersPayload);
  const root = record(pendingPayload);
  const pendingRoot = record(root?.pendingTrades) ?? root;
  const entries = records(pendingRoot?.pendingTrade ?? pendingRoot?.trade ?? pendingRoot?.transaction);

  return entries.map((entry, index) => {
    const franchiseId = text(entry.franchise ?? entry.franchise1 ?? entry.will_give_up_franchise);
    const partnerId = text(entry.franchise2 ?? entry.partner ?? entry.will_receive_franchise);
    const offered = parseMflAssetList(
      text(entry.franchise1_gave_up ?? entry.will_give_up ?? entry.offered ?? entry.gives),
      players,
    );
    const requested = parseMflAssetList(
      text(entry.franchise2_gave_up ?? entry.will_receive ?? entry.requested ?? entry.gets),
      players,
    );
    const timestamp = numberValue(entry.timestamp) ?? 0;
    const expiresAt = numberValue(entry.expires ?? entry.expiration);
    const franchiseName = names.get(franchiseId) || `Franchise ${franchiseId || '?'}`;
    const partnerName = names.get(partnerId) || `Franchise ${partnerId || '?'}`;

    return {
      id: `pending-${franchiseId}-${partnerId}-${timestamp}-${index}`,
      timestamp,
      timeLabel: formatMflTimestamp(timestamp),
      expiresAt,
      expiresLabel: expiresAt ? formatMflTimestamp(expiresAt) : null,
      franchiseId,
      franchiseName,
      partnerId,
      partnerName,
      offered,
      requested,
      summary: `${franchiseName} offers ${formatMflAssetLabels(offered)} to ${partnerName} for ${formatMflAssetLabels(requested)}`,
      status: 'pending' as const,
      byCommish: text(entry.by_commish) === '1',
    } satisfies TradeRow;
  }).sort((left, right) => right.timestamp - left.timestamp);
}

export function parseTradeBait(
  baitPayload: unknown,
  playersPayload: unknown,
  names: Map<string, string>,
): TradeBaitRow[] {
  if (!baitPayload || mflErrorMessage(baitPayload)) return [];

  const players = playerNames(playersPayload);
  const root = record(baitPayload);
  const baitRoot = record(root?.tradeBaits ?? root?.tradeBait) ?? root;
  const franchises = records(baitRoot?.franchise);
  const flat = records(baitRoot?.tradeBait ?? baitRoot?.bait);

  if (franchises.length > 0) {
    return franchises.flatMap((franchise, franchiseIndex) => {
      const franchiseId = text(franchise.id);
      const franchiseName = names.get(franchiseId) || text(franchise.name) || `Franchise ${franchiseId}`;
      const assets = parseMflAssetList(text(franchise.willGiveUp ?? franchise.will_give_up ?? franchise.assets ?? franchise.player), players);
      const comments = text(franchise.comments ?? franchise.comment) || null;
      if (assets.length === 0 && !comments) return [];
      return [{
        id: `bait-${franchiseId}-${franchiseIndex}`,
        franchiseId,
        franchiseName,
        assets,
        comments,
        summary: `${franchiseName}: ${formatMflAssetLabels(assets)}${comments ? ` — ${comments}` : ''}`,
      } satisfies TradeBaitRow];
    });
  }

  return flat.map((entry, index) => {
    const franchiseId = text(entry.franchise ?? entry.franchise_id);
    const franchiseName = names.get(franchiseId) || `Franchise ${franchiseId || '?'}`;
    const assets = parseMflAssetList(text(entry.willGiveUp ?? entry.will_give_up ?? entry.assets ?? entry.player), players);
    const comments = text(entry.comments ?? entry.comment) || null;
    return {
      id: `bait-flat-${franchiseId}-${index}`,
      franchiseId,
      franchiseName,
      assets,
      comments,
      summary: `${franchiseName}: ${formatMflAssetLabels(assets)}${comments ? ` — ${comments}` : ''}`,
    } satisfies TradeBaitRow;
  });
}

function parseMyRosterAssets(rosterPayload: unknown, playersPayload: unknown): MflAsset[] {
  const players = playerNames(playersPayload);
  const root = record(rosterPayload);
  const franchise = records(record(root?.rosters)?.franchise)[0] ?? null;
  const rosterPlayers = records(franchise?.player);
  const assets: MflAsset[] = [];
  for (const player of rosterPlayers) {
    const id = text(player.id);
    if (!id) continue;
    assets.push({
      kind: 'player',
      id,
      label: players.get(id) || `Player ${id}`,
    });
  }
  return assets;
}

export function parseTradesPageState(input: {
  league: unknown;
  players: unknown;
  transactions: unknown;
  pendingTrades: unknown | null;
  tradeBait: unknown | null;
  roster: unknown | null;
  primaryFranchiseId: string | null;
  authenticated: boolean;
}): TradesPageState {
  const names = franchiseDirectory(input.league);
  const league = record(record(input.league)?.league);
  const defaultExpirationDays = integerValue(league?.defaultTradeExpirationDays) ?? 7;
  const franchises = franchiseOptions(input.league, input.primaryFranchiseId);
  const recent = parseCompletedTrades(input.transactions, input.players, names);
  const pending = input.pendingTrades ? parsePendingTrades(input.pendingTrades, input.players, names) : [];
  const tradeBait = input.tradeBait ? parseTradeBait(input.tradeBait, input.players, names) : [];
  const myRosterAssets = input.roster ? parseMyRosterAssets(input.roster, input.players) : [];
  const mine = franchises.find((franchise) => franchise.isPrimary) ?? null;

  if (recent.length === 0 && pending.length === 0 && tradeBait.length === 0 && franchises.length === 0) {
    return {
      ok: false,
      message: 'Trade board data could not be loaded from MFL.',
      authenticated: input.authenticated,
      franchiseId: input.primaryFranchiseId,
      franchiseName: mine?.name ?? null,
      defaultExpirationDays,
      franchises: [],
      pending: [],
      recent: [],
      tradeBait: [],
      myRosterAssets: [],
    };
  }

  return {
    ok: true,
    message: input.authenticated
      ? 'Live trade history from MFL. Pending offers appear when MFL returns them for your session.'
      : 'Sign in to draft a trade offer.',
    authenticated: input.authenticated,
    franchiseId: input.primaryFranchiseId,
    franchiseName: mine?.name ?? null,
    defaultExpirationDays,
    franchises,
    pending,
    recent,
    tradeBait,
    myRosterAssets,
  };
}

export async function loadTradesPageState(sessionCookieValue: string | null): Promise<TradesPageState> {
  const authenticated = Boolean(sessionCookieValue);
  const options = { sessionCookieValue: sessionCookieValue ?? undefined, cache: 'no-store' as const };

  try {
    const [primary, leagueResponse, playersResponse, transactionsResponse, baitResponse, pendingResponse] = await Promise.all([
      resolvePrimaryFranchiseId(sessionCookieValue),
      fetchMflExport('league', { JSON: '1' }, options),
      fetchMflExport('players', { JSON: '1' }, { revalidate: 60 * 60 * 24 }),
      fetchMflExport('transactions', { JSON: '1', TRANS_TYPE: 'TRADE', COUNT: '40' }, options),
      fetchMflExport('tradeBait', { JSON: '1' }, options),
      authenticated
        ? fetchMflExport('pendingTrades', { JSON: '1' }, options)
        : Promise.resolve(null),
    ]);

    if (!leagueResponse.ok || !playersResponse.ok || !transactionsResponse.ok) {
      return {
        ok: false,
        message: 'Trade board data could not be loaded from MFL.',
        authenticated,
        franchiseId: primary?.franchiseId ?? null,
        franchiseName: null,
        defaultExpirationDays: 7,
        franchises: [],
        pending: [],
        recent: [],
        tradeBait: [],
        myRosterAssets: [],
      };
    }

    const read = (response: Response | null) => (response?.ok ? response.json().catch(() => null) : Promise.resolve(null));
    const rosterResponse = primary?.franchiseId
      ? await fetchMflExport('rosters', { FRANCHISE: primary.franchiseId, JSON: '1' }, options)
      : null;

    const [league, players, transactions, tradeBait, pendingTrades, roster] = await Promise.all([
      read(leagueResponse),
      read(playersResponse),
      read(transactionsResponse),
      read(baitResponse),
      pendingResponse ? read(pendingResponse) : Promise.resolve(null),
      rosterResponse ? read(rosterResponse) : Promise.resolve(null),
    ]);

    return parseTradesPageState({
      league,
      players,
      transactions,
      pendingTrades,
      tradeBait,
      roster,
      primaryFranchiseId: primary?.franchiseId ?? null,
      authenticated,
    });
  } catch {
    return {
      ok: false,
      message: 'Trade board data could not be loaded from MFL.',
      authenticated,
      franchiseId: null,
      franchiseName: null,
      defaultExpirationDays: 7,
      franchises: [],
      pending: [],
      recent: [],
      tradeBait: [],
      myRosterAssets: [],
    };
  }
}
