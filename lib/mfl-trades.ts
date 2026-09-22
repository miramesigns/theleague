import {
  buildDraftPickAsset,
  buildFuturePickAsset,
  formatMflAssetLabels,
  isSelectableTradeAsset,
  parseMflAssetList,
  parseMflAssetToken,
  sortTradeAssets,
  sortTradePickerAssets,
  type MflAsset,
} from './mfl-assets.ts';
import { buildFantasyCalcIndexes, fetchFantasyCalcCatalog, type FantasyCalcCatalogEntry } from './fantasycalc-values.ts';
import { fetchMflExport } from './mfl.ts';
import { formatMflTimestamp } from './mfl-format.ts';
import { resolvePrimaryFranchiseId } from './mfl-scores.ts';
import {
  buildTradeValueCatalog,
  buildTradeValueRead,
  perspectiveAssetsForTrade,
  type TradeValueCatalog,
  type TradeValueRead,
} from './trade-value-help.ts';

type RecordValue = Record<string, unknown>;

export type TradeFranchiseOption = {
  id: string;
  name: string;
  isPrimary: boolean;
};

export type TradeRow = {
  id: string;
  /** Raw MFL pendingTrades trade_id when available (for respond/revoke). */
  mflTradeId: string | null;
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
  valueRead?: TradeValueRead | null;
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
  /** Roster players + owned draft picks per franchise (for draft pickers). */
  rosterAssetsByFranchiseId: Record<string, MflAsset[]>;
  freeAgentAssets: MflAsset[];
  valueCatalog: TradeValueCatalog | null;
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
  // MFL JSON wraps XML attributes in @attributes
  const attrs = record(item['@attributes']);
  if (attrs) {
    for (const key of ['id', 'name', '#text', '$t']) {
      const candidate = attrs[key];
      if (typeof candidate === 'string' || typeof candidate === 'number') {
        const next = String(candidate).trim();
        if (next) return next;
      }
    }
  }
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

function normalizeFranchiseId(value: unknown): string {
  const id = text(value);
  if (!id) return '';
  // Keep digits only when MFL sends odd wrappers; still allow pure numeric ids.
  const digits = /^\d+$/.test(id) ? id : id.replace(/\D/g, '');
  if (!digits) return id.padStart(4, '0');
  return digits.padStart(4, '0');
}

/** MFL often puts XML attrs on the element itself — read top-level then @attributes. */
function entryValue(entry: RecordValue, ...keys: string[]): unknown {
  const attrs = record(entry['@attributes']);
  for (const key of keys) {
    const direct = entry[key];
    if (direct !== undefined && direct !== null && !(typeof direct === 'string' && !direct.trim())) {
      return direct;
    }
    const fromAttrs = attrs?.[key];
    if (fromAttrs !== undefined && fromAttrs !== null && !(typeof fromAttrs === 'string' && !fromAttrs.trim())) {
      return fromAttrs;
    }
  }
  for (const key of keys) {
    if (entry[key] !== undefined && entry[key] !== null) return entry[key];
    if (attrs && attrs[key] !== undefined && attrs[key] !== null) return attrs[key];
  }
  return undefined;
}

function resolveFranchiseName(names: Map<string, string>, id: string): string {
  if (!id) return 'Unknown franchise';
  return names.get(id) || names.get(id.padStart(4, '0')) || `Franchise ${id}`;
}

/** True when the string contains at least one ASCII letter or digit. */
export function franchiseNameHasAlphanumeric(value: string): boolean {
  return /[0-9A-Za-z]/.test(value);
}

/**
 * Readable UI label for a franchise.
 * Emoji-only (no letters/digits) names fall back to abbrev, then `Franchise {id}`.
 * Keeps real emoji names available upstream; trade cards / pickers should not be emoji-only.
 */
export function franchiseDisplayLabel(input: {
  name?: string | null;
  abbrev?: string | null;
  id?: string | null;
}): string {
  const name = (input.name ?? '').trim();
  const abbrev = (input.abbrev ?? '').trim();
  const id = (input.id ?? '').trim();

  if (name && franchiseNameHasAlphanumeric(name)) return name;
  if (abbrev) return abbrev;
  if (id) return `Franchise ${id}`;
  return name || 'Unknown franchise';
}

/**
 * Compact label for dense scoreboard grids.
 * Prefers franchise abbrev; otherwise falls back to display label (emoji → abbrev/id), truncated when long.
 */
export function shortFranchiseLabel(input: {
  name?: string | null;
  abbrev?: string | null;
  id?: string | null;
  maxLength?: number;
}): string {
  const maxLength = input.maxLength ?? 10;
  const abbrev = (input.abbrev ?? '').trim();
  const label = abbrev || franchiseDisplayLabel(input);
  if (label.length <= maxLength) return label;
  return `${label.slice(0, Math.max(1, maxLength - 1))}…`;
}

function mflErrorMessage(payload: unknown): string | null {
  return text(record(payload)?.error) || null;
}

function playerNames(payload: unknown): Map<string, string> {
  const players = records(record(record(payload)?.players)?.player);
  return new Map(players.map((player) => [text(player.id), text(player.name) || `Player ${text(player.id)}`] as const).filter(([id]) => id));
}

function playerMetaMap(payload: unknown): Map<string, { name: string; position: string | null; team: string | null }> {
  const players = records(record(record(payload)?.players)?.player);
  const map = new Map<string, { name: string; position: string | null; team: string | null }>();
  for (const player of players) {
    const id = text(player.id);
    if (!id) continue;
    map.set(id, {
      name: text(player.name) || `Player ${id}`,
      position: text(player.position) || null,
      team: text(player.team) || null,
    });
  }
  return map;
}

function emptyTradesState(partial: Partial<TradesPageState> & Pick<TradesPageState, 'ok' | 'message' | 'authenticated'>): TradesPageState {
  return {
    franchiseId: null,
    franchiseName: null,
    defaultExpirationDays: 7,
    franchises: [],
    pending: [],
    recent: [],
    tradeBait: [],
    myRosterAssets: [],
    rosterAssetsByFranchiseId: {},
    freeAgentAssets: [],
    valueCatalog: null,
    ...partial,
  };
}

export function attachTradeValueReads(
  trades: TradeRow[],
  indexes: ReturnType<typeof buildFantasyCalcIndexes>,
  playerMeta: Map<string, { name: string; position?: string | null; team?: string | null }>,
  primaryFranchiseId: string | null,
): TradeRow[] {
  return trades.map((trade) => {
    const perspective = perspectiveAssetsForTrade({
      franchiseId: trade.franchiseId,
      partnerId: trade.partnerId,
      offered: trade.offered,
      requested: trade.requested,
      primaryFranchiseId,
    });
    return {
      ...trade,
      valueRead: buildTradeValueRead({
        giveAssets: perspective.give,
        getAssets: perspective.get,
        indexes,
        playerMeta,
        perspective: perspective.perspective,
      }),
    };
  });
}

function franchiseDirectory(payload: unknown): Map<string, string> {
  const league = record(record(payload)?.league);
  const franchises = records(record(league?.franchises)?.franchise);
  return new Map(
    franchises
      .map((franchise) => {
        const attrs = record(franchise['@attributes']);
        const id = normalizeFranchiseId(franchise.id ?? attrs?.id ?? franchise.franchise_id);
        const name = franchiseDisplayLabel({
          name: text(franchise.name ?? attrs?.name ?? franchise.franchise_name),
          abbrev: text(franchise.abbrev ?? attrs?.abbrev ?? franchise.abbreviation),
          id,
        });
        return [id, name] as const;
      })
      .filter(([id, name]) => Boolean(id) && Boolean(name)),
  );
}

/** MFL future-pick board order: franchise ids ascending (0001 = pick 1 in every round). */
export function draftOrderFranchiseIdsFromLeague(payload: unknown): string[] {
  const names = franchiseDirectory(payload);
  return [...names.keys()].sort((left, right) => left.localeCompare(right));
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
  draftOrderFranchiseIds: string[] = [],
): TradeRow[] {
  const players = playerNames(playersPayload);
  const transactions = records(record(record(transactionsPayload)?.transactions)?.transaction);

  return transactions
    .filter((entry) => text(entryValue(entry, 'type')).toUpperCase() === 'TRADE')
    .map((entry, index) => {
      const franchiseId = normalizeFranchiseId(entryValue(entry, 'franchise', 'franchise1'));
      const partnerId = normalizeFranchiseId(entryValue(entry, 'franchise2', 'partner'));
      const offered = parseMflAssetList(text(entryValue(entry, 'franchise1_gave_up')), { playerNames: players, franchiseNames: names, draftOrderFranchiseIds });
      const requested = parseMflAssetList(text(entryValue(entry, 'franchise2_gave_up')), { playerNames: players, franchiseNames: names, draftOrderFranchiseIds });
      const timestamp = numberValue(entryValue(entry, 'timestamp')) ?? 0;
      const expiresAt = numberValue(entryValue(entry, 'expires'));
      const franchiseName = resolveFranchiseName(names, franchiseId);
      const partnerName = resolveFranchiseName(names, partnerId);

      return {
        id: `trade-${franchiseId}-${partnerId}-${timestamp}-${index}`,
        mflTradeId: null,
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
        byCommish: text(entryValue(entry, 'by_commish')) === '1',
      } satisfies TradeRow;
    })
    .sort((left, right) => right.timestamp - left.timestamp);
}

export function parsePendingTrades(
  pendingPayload: unknown,
  playersPayload: unknown,
  names: Map<string, string>,
  draftOrderFranchiseIds: string[] = [],
): TradeRow[] {
  if (!pendingPayload || mflErrorMessage(pendingPayload)) return [];

  const players = playerNames(playersPayload);
  const root = record(pendingPayload);
  const pendingRoot = record(root?.pendingTrades) ?? root;
  const entries = records(pendingRoot?.pendingTrade ?? pendingRoot?.trade ?? pendingRoot?.transaction);

  return entries.map((entry, index) => {
    // MFL pendingTrades uses offeringteam (giver) + offeredto (receiver) — not franchise/franchise2.
    const franchiseId = normalizeFranchiseId(
      entryValue(
        entry,
        'offeringteam',
        'offering_team',
        'franchise',
        'franchise1',
        'will_give_up_franchise',
        'offeredby',
        'offeredBy',
      ),
    );
    const partnerId = normalizeFranchiseId(
      entryValue(
        entry,
        'offeredto',
        'offered_to',
        'franchise2',
        'partner',
        'will_receive_franchise',
        'receiving_franchise',
      ),
    );
    const offered = parseMflAssetList(
      text(entryValue(entry, 'franchise1_gave_up', 'will_give_up', 'offered', 'gives')),
      { playerNames: players, franchiseNames: names, draftOrderFranchiseIds },
    );
    const requested = parseMflAssetList(
      text(entryValue(entry, 'franchise2_gave_up', 'will_receive', 'requested', 'gets')),
      { playerNames: players, franchiseNames: names, draftOrderFranchiseIds },
    );
    const timestamp = numberValue(entryValue(entry, 'timestamp')) ?? 0;
    const expiresAt = numberValue(entryValue(entry, 'expires', 'expiration'));
    const tradeId = text(entryValue(entry, 'trade_id', 'id'));
    const mflTradeId = /^\d+$/.test(tradeId) ? tradeId : null;
    const franchiseName = resolveFranchiseName(names, franchiseId);
    const partnerName = resolveFranchiseName(names, partnerId);

    return {
      id: mflTradeId
        ? `pending-${mflTradeId}`
        : `pending-${franchiseId || 'unk'}-${partnerId || 'unk'}-${timestamp}-${index}`,
      mflTradeId,
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
      byCommish: text(entryValue(entry, 'by_commish')) === '1',
    } satisfies TradeRow;
  }).sort((left, right) => right.timestamp - left.timestamp);
}

export function parseTradeBait(
  baitPayload: unknown,
  playersPayload: unknown,
  names: Map<string, string>,
  draftOrderFranchiseIds: string[] = [],
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
      const assets = parseMflAssetList(text(franchise.willGiveUp ?? franchise.will_give_up ?? franchise.assets ?? franchise.player), { playerNames: players, franchiseNames: names, draftOrderFranchiseIds });
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
    const assets = parseMflAssetList(text(entry.willGiveUp ?? entry.will_give_up ?? entry.assets ?? entry.player), { playerNames: players, franchiseNames: names, draftOrderFranchiseIds });
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


function appendUniqueAssets(target: MflAsset[], incoming: MflAsset[]): void {
  const seen = new Set(target.map((asset) => asset.id));
  for (const asset of incoming) {
    if (!asset.id || seen.has(asset.id)) continue;
    seen.add(asset.id);
    target.push(asset);
  }
}

function mergeAssetLists(...lists: MflAsset[][]): MflAsset[] {
  const merged: MflAsset[] = [];
  for (const list of lists) appendUniqueAssets(merged, list);
  return sortTradeAssets(merged);
}

/**
 * Owned future picks from MFL `futureDraftPicks`.
 * Id is FP_{originalFranchise}_{year}_{round}; bucketed by current owner.
 */
export function parseFutureDraftPicksByFranchise(
  payload: unknown,
  franchiseNames: Map<string, string> = new Map(),
  draftOrderFranchiseIds: string[] = [],
): Record<string, MflAsset[]> {
  if (!payload || mflErrorMessage(payload)) return {};
  const root = record(payload);
  const picksRoot = record(root?.futureDraftPicks) ?? root;
  const byFranchise: Record<string, MflAsset[]> = {};
  const order = draftOrderFranchiseIds.length > 0 ? draftOrderFranchiseIds : [];

  for (const franchise of records(picksRoot?.franchise)) {
    const ownerId = normalizeFranchiseId(franchise.id ?? record(franchise['@attributes'])?.id);
    if (!ownerId) continue;
    const assets: MflAsset[] = [];
    for (const pick of records(franchise.futureDraftPick ?? franchise.futureDraftPicks ?? franchise.pick)) {
      const year = text(entryValue(pick, 'year'));
      const round = text(entryValue(pick, 'round'));
      // Live league 35743 uses originalPickFor.
      const originalFranchiseId = normalizeFranchiseId(
        entryValue(
          pick,
          'originalPickFor',
          'originalPickFor',
          'original_pick_for',
          'originalFranchise',
          'franchise',
        ),
      );
      if (!year || !round || !originalFranchiseId) continue;
      assets.push(
        buildFuturePickAsset({
          originalFranchiseId,
          year,
          round,
          franchiseNames,
          draftOrderFranchiseIds: order,
        }),
      );
    }
    if (assets.length > 0) byFranchise[ownerId] = sortTradeAssets(assets);
  }

  return byFranchise;
}

/**
 * Best-effort parse of MFL `assets` export for current-year DP_ / future FP_.
 * Requires an authenticated session; shape varies by season.
 */
export function parseAssetsExportByFranchise(
  payload: unknown,
  franchiseNames: Map<string, string> = new Map(),
  draftYear?: string | null,
  draftOrderFranchiseIds: string[] = [],
): Record<string, MflAsset[]> {
  if (!payload || mflErrorMessage(payload)) return {};
  const root = record(payload);
  const assetsRoot = record(root?.assets) ?? root;
  const byFranchise: Record<string, MflAsset[]> = {};
  const order = draftOrderFranchiseIds.length > 0 ? draftOrderFranchiseIds : [];

  for (const franchise of records(assetsRoot?.franchise)) {
    const ownerId = normalizeFranchiseId(franchise.id ?? record(franchise['@attributes'])?.id);
    if (!ownerId) continue;
    const assets: MflAsset[] = [];

    const pickNodes = [
      ...records(franchise.pick),
      ...records(franchise.draftPick),
      ...records(franchise.currentYearDraftPick),
      ...records(franchise.futureDraftPick),
      ...records(franchise.futureDraftPicks),
    ];
    for (const pick of pickNodes) {
      const rawId = text(entryValue(pick, 'id', 'encoded', 'asset', 'pick'));
      if (rawId && /^(FP|DP)_/i.test(rawId)) {
        assets.push(parseMflAssetToken(rawId, { franchiseNames, draftYear, draftOrderFranchiseIds: order }));
        continue;
      }
      const year = text(entryValue(pick, 'year'));
      const round = text(entryValue(pick, 'round'));
      const slot = text(entryValue(pick, 'pick', 'slot'));
      const originalFranchiseId = normalizeFranchiseId(
        entryValue(
          pick,
          'originalPickFor',
          'originalPickFor',
          'original_pick_for',
          'originalFranchise',
          'franchise',
        ),
      );
      if (year && round && originalFranchiseId) {
        assets.push(buildFuturePickAsset({ originalFranchiseId, year, round, franchiseNames, draftOrderFranchiseIds: order }));
      } else if (round && slot) {
        assets.push(buildDraftPickAsset(round, slot, draftYear));
      }
    }

    const pickOnly = assets.filter((asset) => asset.kind === 'futurePick' || asset.kind === 'draftPick');
    if (pickOnly.length > 0) byFranchise[ownerId] = sortTradeAssets(pickOnly);
  }

  return byFranchise;
}

function mergePicksIntoRosterAssets(
  rosterAssetsByFranchiseId: Record<string, MflAsset[]>,
  ...pickMaps: Array<Record<string, MflAsset[]>>
): Record<string, MflAsset[]> {
  const franchiseIds = new Set<string>([
    ...Object.keys(rosterAssetsByFranchiseId),
    ...pickMaps.flatMap((map) => Object.keys(map)),
  ]);
  const merged: Record<string, MflAsset[]> = {};
  for (const franchiseId of franchiseIds) {
    merged[franchiseId] = mergeAssetLists(
      rosterAssetsByFranchiseId[franchiseId] ?? [],
      ...pickMaps.map((map) => map[franchiseId] ?? []),
    );
  }
  return merged;
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

function parseAllRosterAssets(rosterPayload: unknown, playersPayload: unknown): Record<string, MflAsset[]> {
  const players = playerNames(playersPayload);
  const franchises = records(record(record(rosterPayload)?.rosters)?.franchise);
  const byFranchise: Record<string, MflAsset[]> = {};
  for (const franchise of franchises) {
    const franchiseId = normalizeFranchiseId(franchise.id ?? record(franchise['@attributes'])?.id);
    if (!franchiseId) continue;
    const assets: MflAsset[] = [];
    for (const player of records(franchise.player)) {
      const id = text(player.id);
      if (!id) continue;
      assets.push({
        kind: 'player',
        id,
        label: players.get(id) || `Player ${id}`,
      });
    }
    byFranchise[franchiseId] = assets;
  }
  return byFranchise;
}

function parseFreeAgentAssets(freeAgentsPayload: unknown, playersPayload: unknown): MflAsset[] {
  if (!freeAgentsPayload || mflErrorMessage(freeAgentsPayload)) return [];
  const players = playerNames(playersPayload);
  const root = record(freeAgentsPayload);
  const unit = record(record(root?.freeAgents)?.leagueUnit) ?? record(root?.freeAgents);
  const assets: MflAsset[] = [];
  for (const player of records(unit?.player)) {
    const id = text(player.id);
    if (!id) continue;
    assets.push({
      kind: 'player',
      id,
      label: players.get(id) || `Player ${id}`,
    });
  }
  return assets.sort((left, right) => left.label.localeCompare(right.label));
}

/** True when a label is the unresolved `Player {id}` fallback. */
export function isPlaceholderPlayerLabel(label: string, id: string): boolean {
  return !label.trim() || label.trim() === `Player ${id}`;
}

function rememberPlayerName(map: Map<string, string>, id: string, label: string | null | undefined) {
  if (!id || !label) return;
  const trimmed = label.trim();
  if (!trimmed || isPlaceholderPlayerLabel(trimmed, id)) return;
  const existing = map.get(id);
  if (existing && !isPlaceholderPlayerLabel(existing, id)) return;
  map.set(id, trimmed);
}

function rememberAssetNames(map: Map<string, string>, assets: MflAsset[] | undefined) {
  if (!assets) return;
  for (const asset of assets) {
    if (!asset.id || !asset.label) continue;
    if (asset.kind === 'player') {
      rememberPlayerName(map, asset.id, asset.label);
      continue;
    }
    if (!map.has(asset.id)) map.set(asset.id, asset.label);
  }
}

/**
 * Broad player-name index for draft chips: my roster + all franchise rosters + FA
 * + pending/recent/bait labels + FantasyCalc catalog names.
 */
export function buildTradeDraftNameById(input: {
  myRosterAssets?: MflAsset[];
  rosterAssetsByFranchiseId?: Record<string, MflAsset[]>;
  freeAgentAssets?: MflAsset[];
  valueCatalog?: TradeValueCatalog | null;
  pending?: TradeRow[];
  recent?: TradeRow[];
  tradeBait?: TradeBaitRow[];
}): Map<string, string> {
  const map = new Map<string, string>();

  rememberAssetNames(map, input.myRosterAssets);
  for (const assets of Object.values(input.rosterAssetsByFranchiseId ?? {})) {
    rememberAssetNames(map, assets);
  }
  rememberAssetNames(map, input.freeAgentAssets);

  for (const trade of [...(input.pending ?? []), ...(input.recent ?? [])]) {
    rememberAssetNames(map, trade.offered);
    rememberAssetNames(map, trade.requested);
  }
  for (const bait of input.tradeBait ?? []) {
    rememberAssetNames(map, bait.assets);
  }

  const catalog = input.valueCatalog?.byMflId;
  if (catalog) {
    for (const [id, entry] of Object.entries(catalog)) {
      rememberPlayerName(map, id, entry.name);
    }
  }

  return map;
}

/** Resolve a selected-chip label; never prefer `Player {id}` when a real name exists. */
export function resolveTradeDraftAssetLabel(id: string, nameById: Map<string, string>, poolAssets: MflAsset[] = []): string {
  const fromPool = poolAssets.find((asset) => asset.id === id)?.label;
  if (fromPool && !isPlaceholderPlayerLabel(fromPool, id)) return fromPool;
  const fromMap = nameById.get(id);
  if (fromMap && !isPlaceholderPlayerLabel(fromMap, id)) return fromMap;
  if (fromPool) return fromPool;
  const parsed = parseMflAssetToken(id);
  if (parsed.kind === 'futurePick' || parsed.kind === 'draftPick') return parsed.label;
  return `Player ${id}`;
}

/**
 * Prefill a counter draft from the primary franchise view: same terms as an outgoing offer.
 * You offer what you would give; you request what you would get.
 */

/**
 * Assets the signed-in franchise can offer: rostered players + owned picks only.
 * Free agents are never included.
 */
export function buildTradeOfferPool(myRosterAssets: MflAsset[]): MflAsset[] {
  return sortTradePickerAssets(myRosterAssets.filter(isSelectableTradeAsset));
}

/**
 * Assets that can be requested from a partner: that franchise's rostered players + owned picks only.
 * Free agents are excluded from trade pickers (use FA/waiver flows instead).
 */
export function buildTradeRequestPool(
  rosterAssetsByFranchiseId: Record<string, MflAsset[]>,
  partnerFranchiseId: string,
): MflAsset[] {
  const partnerAssets = rosterAssetsByFranchiseId[partnerFranchiseId] ?? [];
  return sortTradePickerAssets(partnerAssets.filter(isSelectableTradeAsset));
}

export function counterDraftFromPendingTrade(
  trade: TradeRow,
  primaryFranchiseId: string | null,
): { partnerId: string; offeringPlayerIds: string[]; requestingPlayerIds: string[]; revokeTradeId: null } {
  const perspective = perspectiveAssetsForTrade({
    franchiseId: trade.franchiseId,
    partnerId: trade.partnerId,
    offered: trade.offered,
    requested: trade.requested,
    primaryFranchiseId,
  });
  const otherId =
    primaryFranchiseId && primaryFranchiseId === trade.franchiseId
      ? trade.partnerId
      : primaryFranchiseId && primaryFranchiseId === trade.partnerId
        ? trade.franchiseId
        : trade.partnerId || trade.franchiseId;

  return {
    partnerId: otherId,
    offeringPlayerIds: perspective.give.filter(isSelectableTradeAsset).map((asset) => asset.id),
    requestingPlayerIds: perspective.get.filter(isSelectableTradeAsset).map((asset) => asset.id),
    revokeTradeId: null,
  };
}

/**
 * Prefill an amend draft for an outgoing pending offer (same partner + assets).
 * Submitting should revoke the old trade_id then propose new terms.
 */
export function amendDraftFromPendingTrade(
  trade: TradeRow,
): {
  partnerId: string;
  offeringPlayerIds: string[];
  requestingPlayerIds: string[];
  revokeTradeId: string | null;
  expiresDays: number | null;
} {
  const now = Math.floor(Date.now() / 1000);
  const expiresDays =
    trade.expiresAt && trade.expiresAt > now
      ? Math.max(1, Math.ceil((trade.expiresAt - now) / (24 * 60 * 60)))
      : null;

  return {
    partnerId: trade.partnerId,
    offeringPlayerIds: trade.offered.filter(isSelectableTradeAsset).map((asset) => asset.id),
    requestingPlayerIds: trade.requested.filter(isSelectableTradeAsset).map((asset) => asset.id),
    revokeTradeId: trade.mflTradeId,
    expiresDays,
  };
}

/** True when the signed-in franchise originated this pending offer. */
export function isOutgoingPendingTrade(trade: TradeRow, primaryFranchiseId: string | null): boolean {
  return Boolean(primaryFranchiseId && trade.franchiseId === primaryFranchiseId);
}

/** True when the signed-in franchise is the target of this pending offer. */
export function isIncomingPendingTrade(trade: TradeRow, primaryFranchiseId: string | null): boolean {
  return Boolean(primaryFranchiseId && trade.partnerId === primaryFranchiseId);
}

export type TradeCardSideView = {
  label: string;
  assets: MflAsset[];
  /** Shown above the direction label for neutral (non-primary) trades. */
  franchiseName?: string;
};

export type TradeCardSides = {
  left: TradeCardSideView;
  right: TradeCardSideView;
  /**
   * Prominent other-franchise label for You get / You give cards
   * (e.g. "from Shadow" / "to Shadow"). Null when franchise names sit on columns.
   */
  partnerTitle: string | null;
  /** Secondary partner hint in the meta row; omitted when partnerTitle already names them. */
  partnerMeta: string | null;
};

/** Card copy from the signed-in franchise view: You get / You give, else Offers / Asks for. */
export function tradeCardSides(
  trade: Pick<TradeRow, 'franchiseId' | 'partnerId' | 'franchiseName' | 'partnerName' | 'offered' | 'requested'>,
  primaryFranchiseId: string | null,
): TradeCardSides {
  const perspective = perspectiveAssetsForTrade({
    franchiseId: trade.franchiseId,
    partnerId: trade.partnerId,
    offered: trade.offered,
    requested: trade.requested,
    primaryFranchiseId,
  });

  if (perspective.perspective === 'you') {
    const outgoing = Boolean(primaryFranchiseId && trade.franchiseId === primaryFranchiseId);
    const otherName = outgoing ? trade.partnerName : trade.franchiseName;
    return {
      left: { label: 'You get', assets: perspective.get },
      right: { label: 'You give', assets: perspective.give },
      // Keep the other franchise scannable at the top of the card (not only in tiny meta).
      partnerTitle: otherName ? (outgoing ? `to ${otherName}` : `from ${otherName}`) : null,
      partnerMeta: null,
    };
  }

  return {
    left: { label: 'Offers', assets: trade.offered, franchiseName: trade.franchiseName },
    right: { label: 'Asks for', assets: trade.requested },
    partnerTitle: null,
    partnerMeta: trade.partnerName ? `with ${trade.partnerName}` : null,
  };
}

export function parseTradesPageState(input: {
  league: unknown;
  players: unknown;
  transactions: unknown;
  pendingTrades: unknown | null;
  tradeBait: unknown | null;
  roster: unknown | null;
  freeAgents?: unknown | null;
  futureDraftPicks?: unknown | null;
  assets?: unknown | null;
  primaryFranchiseId: string | null;
  authenticated: boolean;
  fantasyCalcEntries?: FantasyCalcCatalogEntry[];
}): TradesPageState {
  const names = franchiseDirectory(input.league);
  const draftOrderFranchiseIds = draftOrderFranchiseIdsFromLeague(input.league);
  const league = record(record(input.league)?.league);
  const defaultExpirationDays = integerValue(league?.defaultTradeExpirationDays) ?? 7;
  const franchises = franchiseOptions(input.league, input.primaryFranchiseId);
  const recent = parseCompletedTrades(input.transactions, input.players, names, draftOrderFranchiseIds);
  const pendingRaw = input.pendingTrades
    ? parsePendingTrades(input.pendingTrades, input.players, names, draftOrderFranchiseIds)
    : [];
  const tradeBait = input.tradeBait
    ? parseTradeBait(input.tradeBait, input.players, names, draftOrderFranchiseIds)
    : [];
  const rosterPlayersByFranchiseId = input.roster ? parseAllRosterAssets(input.roster, input.players) : {};
  const futurePicksByFranchiseId = input.futureDraftPicks
    ? parseFutureDraftPicksByFranchise(input.futureDraftPicks, names, draftOrderFranchiseIds)
    : {};
  const assetsPicksByFranchiseId = input.assets
    ? parseAssetsExportByFranchise(input.assets, names, text(league?.year) || null, draftOrderFranchiseIds)
    : {};
  const rosterAssetsByFranchiseId = mergePicksIntoRosterAssets(
    rosterPlayersByFranchiseId,
    futurePicksByFranchiseId,
    assetsPicksByFranchiseId,
  );
  const myRosterAssets = input.primaryFranchiseId
    ? rosterAssetsByFranchiseId[input.primaryFranchiseId] ?? (input.roster ? parseMyRosterAssets(input.roster, input.players) : [])
    : [];
  const freeAgentAssets = input.freeAgents ? parseFreeAgentAssets(input.freeAgents, input.players) : [];
  const mine = franchises.find((franchise) => franchise.isPrimary) ?? null;
  const fantasyEntries = input.fantasyCalcEntries ?? [];
  const indexes = buildFantasyCalcIndexes(fantasyEntries);
  const meta = playerMetaMap(input.players);
  const pending = fantasyEntries.length > 0
    ? attachTradeValueReads(pendingRaw, indexes, meta, input.primaryFranchiseId)
    : pendingRaw;
  const valueCatalog = fantasyEntries.length > 0 ? buildTradeValueCatalog(fantasyEntries) : null;

  if (recent.length === 0 && pending.length === 0 && tradeBait.length === 0 && franchises.length === 0) {
    return emptyTradesState({
      ok: false,
      message: 'Trade board data could not be loaded from MFL.',
      authenticated: input.authenticated,
      franchiseId: input.primaryFranchiseId,
      franchiseName: mine?.name ?? null,
      defaultExpirationDays,
      valueCatalog,
      rosterAssetsByFranchiseId,
      freeAgentAssets,
    });
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
    rosterAssetsByFranchiseId,
    freeAgentAssets,
    valueCatalog,
  };
}

export async function loadTradesPageState(sessionCookieValue: string | null): Promise<TradesPageState> {
  const authenticated = Boolean(sessionCookieValue);
  const options = { sessionCookieValue: sessionCookieValue ?? undefined, cache: 'no-store' as const };

  try {
    const [primary, leagueResponse, playersResponse, transactionsResponse, baitResponse, pendingResponse, rosterResponse, freeAgentsResponse, futureDraftPicksResponse, assetsResponse, fantasyCalcEntries] = await Promise.all([
      resolvePrimaryFranchiseId(sessionCookieValue),
      fetchMflExport('league', { JSON: '1' }, options),
      fetchMflExport('players', { JSON: '1' }, { revalidate: 60 * 60 * 24 }),
      fetchMflExport('transactions', { JSON: '1', TRANS_TYPE: 'TRADE', COUNT: '40' }, options),
      fetchMflExport('tradeBait', { JSON: '1' }, options),
      authenticated
        ? fetchMflExport('pendingTrades', { JSON: '1' }, options)
        : Promise.resolve(null),
      fetchMflExport('rosters', { JSON: '1' }, options),
      fetchMflExport('freeAgents', { JSON: '1' }, options),
      fetchMflExport('futureDraftPicks', { JSON: '1' }, options),
      // Current-year DP_ picks (session required). Omitted when logged out.
      authenticated
        ? fetchMflExport('assets', { JSON: '1' }, options)
        : Promise.resolve(null),
      fetchFantasyCalcCatalog(),
    ]);

    if (!leagueResponse.ok || !playersResponse.ok || !transactionsResponse.ok) {
      return emptyTradesState({
        ok: false,
        message: 'Trade board data could not be loaded from MFL.',
        authenticated,
        franchiseId: primary?.franchiseId ?? null,
        valueCatalog: fantasyCalcEntries.length > 0 ? buildTradeValueCatalog(fantasyCalcEntries) : null,
      });
    }

    const read = (response: Response | null) => (response?.ok ? response.json().catch(() => null) : Promise.resolve(null));

    const [league, players, transactions, tradeBait, pendingTrades, roster, freeAgents, futureDraftPicks, assets] = await Promise.all([
      read(leagueResponse),
      read(playersResponse),
      read(transactionsResponse),
      read(baitResponse),
      pendingResponse ? read(pendingResponse) : Promise.resolve(null),
      rosterResponse.ok ? read(rosterResponse) : Promise.resolve(null),
      freeAgentsResponse.ok ? read(freeAgentsResponse) : Promise.resolve(null),
      futureDraftPicksResponse.ok ? read(futureDraftPicksResponse) : Promise.resolve(null),
      assetsResponse && assetsResponse.ok ? read(assetsResponse) : Promise.resolve(null),
    ]);

    return parseTradesPageState({
      league,
      players,
      transactions,
      pendingTrades,
      tradeBait,
      roster,
      freeAgents,
      futureDraftPicks,
      assets,
      primaryFranchiseId: primary?.franchiseId ?? null,
      authenticated,
      fantasyCalcEntries,
    });
  } catch {
    return emptyTradesState({
      ok: false,
      message: 'Trade board data could not be loaded from MFL.',
      authenticated,
    });
  }
}
