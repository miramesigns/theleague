import type { MflAsset } from './mfl-assets.ts';
import {
  buildFantasyCalcIndexes,
  FANTASYCALC_SETTINGS_NOTE,
  matchFuturePickToFantasyCalc,
  matchMflPlayerToFantasyCalc,
  type FantasyCalcCatalogEntry,
} from './fantasycalc-values.ts';

export const KTC_TRADE_CALCULATOR_URL = 'https://keeptradecut.com/trade-calculator';
export const FANTASYCALC_TRADE_CALCULATOR_URL = 'https://fantasycalc.com/trade-calculator';

export type TradeSideValue = {
  total: number;
  matched: number;
  assets: Array<{
    id: string;
    label: string;
    value: number | null;
    fantasyCalcId: number | null;
    via: 'mflId' | 'fuzzy' | null;
  }>;
  misses: string[];
};

export type TradeValueRead = {
  give: TradeSideValue;
  get: TradeSideValue;
  delta: number;
  label: string;
  settingsNote: string;
  perspective: 'you' | 'franchise';
  links: {
    ktcCalculator: string;
    fantasyCalcCalculator: string;
  };
};

export type TradeValueCatalog = {
  settingsNote: string;
  byMflId: Record<string, { value: number; name: string; fantasyCalcId: number }>;
};

const CLOSE_ABS = 300;
const CLOSE_PCT = 0.08;

export function favorLabel(delta: number, giveTotal: number, getTotal: number, perspective: 'you' | 'franchise'): string {
  const maxSide = Math.max(giveTotal, getTotal, 1);
  const close = Math.abs(delta) <= CLOSE_ABS || Math.abs(delta) / maxSide <= CLOSE_PCT;

  if (perspective === 'you') {
    if (close) return 'FantasyCalc: close';
    if (delta > 0) return 'FantasyCalc: favors you';
    return 'FantasyCalc: favors them';
  }

  if (close) return 'FantasyCalc: close';
  if (delta > 0) return 'FantasyCalc: favors receiver';
  return 'FantasyCalc: favors giver';
}

export function valueTradeSide(
  assets: MflAsset[],
  indexes: ReturnType<typeof buildFantasyCalcIndexes>,
  playerMeta: Map<string, { name: string; position?: string | null; team?: string | null }> = new Map(),
): TradeSideValue {
  const valued: TradeSideValue['assets'] = [];
  const misses: string[] = [];
  let total = 0;
  let matched = 0;

  for (const asset of assets) {
    if (asset.kind === 'player') {
      const meta = playerMeta.get(asset.id);
      const match = matchMflPlayerToFantasyCalc(
        {
          id: asset.id,
          name: meta?.name || asset.label,
          position: meta?.position,
          team: meta?.team,
        },
        indexes,
      );
      if (match.ok) {
        total += match.entry.value;
        matched += 1;
        valued.push({
          id: asset.id,
          label: asset.label,
          value: match.entry.value,
          fantasyCalcId: match.entry.fantasyCalcId,
          via: match.via,
        });
      } else {
        misses.push(asset.label);
        valued.push({
          id: asset.id,
          label: asset.label,
          value: null,
          fantasyCalcId: null,
          via: null,
        });
      }
      continue;
    }

    if (asset.kind === 'futurePick') {
      const match = matchFuturePickToFantasyCalc(asset.year, asset.round, indexes);
      if (match.ok) {
        total += match.entry.value;
        matched += 1;
        valued.push({
          id: asset.id,
          label: `${asset.label} ≈ ${match.entry.name}`,
          value: match.entry.value,
          fantasyCalcId: match.entry.fantasyCalcId,
          via: match.via,
        });
      } else {
        misses.push(asset.label);
        valued.push({
          id: asset.id,
          label: asset.label,
          value: null,
          fantasyCalcId: null,
          via: null,
        });
      }
      continue;
    }

    misses.push(asset.label);
    valued.push({
      id: asset.id,
      label: asset.label,
      value: null,
      fantasyCalcId: null,
      via: null,
    });
  }

  return { total, matched, assets: valued, misses };
}

export function buildTradeValueRead(input: {
  giveAssets: MflAsset[];
  getAssets: MflAsset[];
  indexes: ReturnType<typeof buildFantasyCalcIndexes>;
  playerMeta?: Map<string, { name: string; position?: string | null; team?: string | null }>;
  perspective?: 'you' | 'franchise';
}): TradeValueRead {
  const perspective = input.perspective ?? 'you';
  const give = valueTradeSide(input.giveAssets, input.indexes, input.playerMeta);
  const get = valueTradeSide(input.getAssets, input.indexes, input.playerMeta);
  const delta = get.total - give.total;

  return {
    give,
    get,
    delta,
    label: favorLabel(delta, give.total, get.total, perspective),
    settingsNote: FANTASYCALC_SETTINGS_NOTE,
    perspective,
    links: {
      ktcCalculator: KTC_TRADE_CALCULATOR_URL,
      fantasyCalcCalculator: FANTASYCALC_TRADE_CALCULATOR_URL,
    },
  };
}

/** Split a pending/completed trade into give/get from the primary franchise view when possible. */
export function perspectiveAssetsForTrade(input: {
  franchiseId: string;
  partnerId: string;
  offered: MflAsset[];
  requested: MflAsset[];
  primaryFranchiseId: string | null;
}): { give: MflAsset[]; get: MflAsset[]; perspective: 'you' | 'franchise' } {
  const primary = input.primaryFranchiseId;
  if (primary && primary === input.franchiseId) {
    return { give: input.offered, get: input.requested, perspective: 'you' };
  }
  if (primary && primary === input.partnerId) {
    return { give: input.requested, get: input.offered, perspective: 'you' };
  }
  return { give: input.offered, get: input.requested, perspective: 'franchise' };
}

export function buildTradeValueCatalog(entries: FantasyCalcCatalogEntry[]): TradeValueCatalog {
  const byMflId: TradeValueCatalog['byMflId'] = {};
  for (const entry of entries) {
    if (entry.mflId && /^\d+$/.test(entry.mflId)) {
      byMflId[entry.mflId] = {
        value: entry.value,
        name: entry.name,
        fantasyCalcId: entry.fantasyCalcId,
      };
    }
  }
  return { settingsNote: FANTASYCALC_SETTINGS_NOTE, byMflId };
}

export function formatValueNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function formatDelta(delta: number): string {
  const abs = formatValueNumber(Math.abs(delta));
  if (delta > 0) return `+${abs}`;
  if (delta < 0) return `−${abs}`;
  return '0';
}
