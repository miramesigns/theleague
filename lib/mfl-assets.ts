import { splitMflIdList } from './mfl-format.ts';

export type MflAsset =
  | { kind: 'player'; id: string; label: string }
  | {
      kind: 'futurePick';
      id: string;
      label: string;
      franchiseId: string;
      year: string;
      round: string;
      /** 1-based slot within the round (MFL board row order). */
      pick: string;
    }
  | { kind: 'draftPick'; id: string; label: string; round: string; pick: string }
  | { kind: 'unknown'; id: string; label: string };

export type MflAssetParseOptions = {
  playerNames?: Map<string, string>;
  franchiseNames?: Map<string, string>;
  /**
   * Franchise ids in MFL draft-board order (row 1 = pick 1 within each round).
   * Defaults to numeric franchise id when omitted (0004 → pick 4).
   */
  draftOrderFranchiseIds?: string[];
  /** Optional season year for current-year DP_ labels. */
  draftYear?: string | null;
};

/** 1 → 1st, 2 → 2nd, 3 → 3rd, … (kept for non-pick UI copy). */
export function formatRoundOrdinal(round: string | number): string {
  const n = typeof round === 'number' ? round : Number.parseInt(String(round), 10);
  if (!Number.isFinite(n) || n <= 0) return `R${round}`;
  const mod100 = n % 100;
  const mod10 = n % 10;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? 'th' : mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/**
 * MFL future-pick board slot for an original franchise.
 * Row order within each round IS the pick number; for this league that matches
 * franchise id order (0001 → pick 1 … 0012 → pick 12). Prefer an explicit
 * draftOrderFranchiseIds list when available.
 */
export function draftPickSlotForFranchise(
  originalFranchiseId: string,
  draftOrderFranchiseIds?: string[] | null,
): number {
  const padded = originalFranchiseId.padStart(4, '0');
  const numeric = Number.parseInt(padded, 10);
  const numericSlot = Number.isFinite(numeric) && numeric > 0 ? numeric : 0;

  if (draftOrderFranchiseIds && draftOrderFranchiseIds.length > 0) {
    // Incomplete franchise maps (e.g. only teams present in a fixture) invent
    // wrong slots — only trust the list when it covers the franchise id space.
    const maxId = Math.max(
      ...draftOrderFranchiseIds.map((id) => Number.parseInt(id.padStart(4, '0'), 10) || 0),
    );
    const orderLooksComplete = maxId > 0 && draftOrderFranchiseIds.length >= maxId;
    if (orderLooksComplete) {
      const index = draftOrderFranchiseIds.findIndex(
        (id) => id.padStart(4, '0') === padded || id === originalFranchiseId,
      );
      if (index >= 0) return index + 1;
    }
  }

  return numericSlot;
}

/**
 * Compact MFL-board label: `Rd 1, pick 4 (2027)`.
 * Optional original-team hint: `Rd 1, pick 4 (2027 · Ashy Elbows)`.
 */
export function formatFuturePickLabel(
  year: string,
  round: string,
  pickSlot: string | number,
  originalFranchiseLabel?: string | null,
): string {
  const roundNumber = Number.parseInt(String(round), 10);
  const slotNumber = typeof pickSlot === 'number' ? pickSlot : Number.parseInt(String(pickSlot), 10);
  const roundPart = Number.isFinite(roundNumber) && roundNumber > 0 ? String(roundNumber) : String(round);
  const slotPart = Number.isFinite(slotNumber) && slotNumber > 0 ? String(slotNumber) : String(pickSlot);
  const team = (originalFranchiseLabel ?? '').trim();
  const yearPart = year.trim();
  if (team && yearPart) return `Rd ${roundPart}, pick ${slotPart} (${yearPart} · ${team})`;
  if (yearPart) return `Rd ${roundPart}, pick ${slotPart} (${yearPart})`;
  if (team) return `Rd ${roundPart}, pick ${slotPart} (${team})`;
  return `Rd ${roundPart}, pick ${slotPart}`;
}

/**
 * Current-year draft pick label.
 * MFL encodes DP_{roundIndex}_{pick} with a 0-based round index; pick is already the slot.
 */
export function formatDraftPickLabel(round: string, pick: string, draftYear?: string | null): string {
  const roundIndex = Number.parseInt(round, 10);
  const displayRound = Number.isFinite(roundIndex) ? roundIndex + 1 : Number.parseInt(round, 10);
  const roundPart = Number.isFinite(displayRound) && displayRound > 0 ? String(displayRound) : String(round);
  const yearPart = draftYear?.trim();
  return yearPart ? `Rd ${roundPart}, pick ${pick} (${yearPart})` : `Rd ${roundPart}, pick ${pick}`;
}

export function buildFuturePickId(franchiseId: string, year: string, round: string): string {
  return `FP_${franchiseId.padStart(4, '0')}_${year}_${round}`;
}

export function buildDraftPickId(round: string, pick: string): string {
  return `DP_${round}_${pick}`;
}

export function buildFuturePickAsset(input: {
  originalFranchiseId: string;
  year: string;
  round: string;
  franchiseNames?: Map<string, string>;
  draftOrderFranchiseIds?: string[];
  /** When true, append a short original-team hint after the year. Default false. */
  includeOriginalTeam?: boolean;
}): MflAsset {
  const franchiseId = input.originalFranchiseId.padStart(4, '0');
  const pickSlot = draftPickSlotForFranchise(franchiseId, input.draftOrderFranchiseIds);
  const teamName = input.includeOriginalTeam
    ? input.franchiseNames?.get(franchiseId) ||
      input.franchiseNames?.get(input.originalFranchiseId) ||
      null
    : null;
  return {
    kind: 'futurePick',
    id: buildFuturePickId(franchiseId, input.year, input.round),
    franchiseId,
    year: input.year,
    round: input.round,
    pick: String(pickSlot),
    label: formatFuturePickLabel(input.year, input.round, pickSlot, teamName),
  };
}

export function buildDraftPickAsset(round: string, pick: string, draftYear?: string | null): MflAsset {
  return {
    kind: 'draftPick',
    id: buildDraftPickId(round, pick),
    round,
    pick,
    label: formatDraftPickLabel(round, pick, draftYear),
  };
}

export function isSelectableTradeAsset(asset: MflAsset): boolean {
  return asset.kind === 'player' || asset.kind === 'futurePick' || asset.kind === 'draftPick';
}

function resolveParseOptions(
  playerNamesOrOptions: Map<string, string> | MflAssetParseOptions = new Map(),
): MflAssetParseOptions {
  return playerNamesOrOptions instanceof Map
    ? { playerNames: playerNamesOrOptions }
    : playerNamesOrOptions;
}

export function parseMflAssetToken(
  token: string,
  playerNamesOrOptions: Map<string, string> | MflAssetParseOptions = new Map(),
): MflAsset {
  const options = resolveParseOptions(playerNamesOrOptions);
  const playerNames = options.playerNames ?? new Map<string, string>();

  const id = token.trim();
  if (!id) {
    return { kind: 'unknown', id: '', label: 'Unknown asset' };
  }

  const futurePick = /^FP_(\d{4})_(\d{4})_(\d+)$/i.exec(id);
  if (futurePick) {
    const [, franchiseId, year, round] = futurePick;
    const pickSlot = draftPickSlotForFranchise(franchiseId, options.draftOrderFranchiseIds);
    return {
      kind: 'futurePick',
      id,
      franchiseId,
      year,
      round,
      pick: String(pickSlot),
      label: formatFuturePickLabel(year, round, pickSlot),
    };
  }

  const draftPick = /^DP_(\d+)_(\d+)$/i.exec(id);
  if (draftPick) {
    const [, round, pick] = draftPick;
    return {
      kind: 'draftPick',
      id,
      round,
      pick,
      label: formatDraftPickLabel(round, pick, options.draftYear),
    };
  }

  if (/^\d+$/.test(id)) {
    return {
      kind: 'player',
      id,
      label: playerNames.get(id) || `Player ${id}`,
    };
  }

  return { kind: 'unknown', id, label: id };
}

export function parseMflAssetList(
  value: string | null | undefined,
  playerNamesOrOptions: Map<string, string> | MflAssetParseOptions = new Map(),
): MflAsset[] {
  const options = resolveParseOptions(playerNamesOrOptions);
  return splitMflIdList(value).map((token) => parseMflAssetToken(token, options));
}

export function formatMflAssetLabels(assets: MflAsset[]): string {
  if (assets.length === 0) return '—';
  return assets.map((asset) => asset.label).join(' • ');
}

export function isDraftPickAsset(asset: MflAsset): boolean {
  return asset.kind === 'futurePick' || asset.kind === 'draftPick';
}

/** Split tradeable assets into draft picks vs roster players (unknowns ignored). */
export function partitionTradePickerAssets(assets: MflAsset[]): {
  picks: MflAsset[];
  players: MflAsset[];
} {
  const picks: MflAsset[] = [];
  const players: MflAsset[] = [];
  for (const asset of assets) {
    if (asset.kind === 'futurePick' || asset.kind === 'draftPick') picks.push(asset);
    else if (asset.kind === 'player') players.push(asset);
  }
  return {
    picks: sortTradePickerPicks(picks),
    players: [...players].sort((left, right) => left.label.localeCompare(right.label)),
  };
}

function sortTradePickerPicks(assets: MflAsset[]): MflAsset[] {
  return [...assets].sort((left, right) => {
    if (left.kind === 'draftPick' && right.kind === 'futurePick') return -1;
    if (left.kind === 'futurePick' && right.kind === 'draftPick') return 1;
    if (left.kind === 'futurePick' && right.kind === 'futurePick') {
      const yearDiff = left.year.localeCompare(right.year);
      if (yearDiff !== 0) return yearDiff;
      const roundDiff = Number(left.round) - Number(right.round);
      if (roundDiff !== 0) return roundDiff;
      const pickDiff = Number(left.pick) - Number(right.pick);
      if (pickDiff !== 0) return pickDiff;
    }
    if (left.kind === 'draftPick' && right.kind === 'draftPick') {
      const roundDiff = Number(left.round) - Number(right.round);
      if (roundDiff !== 0) return roundDiff;
      const pickDiff = Number(left.pick) - Number(right.pick);
      if (pickDiff !== 0) return pickDiff;
    }
    return left.label.localeCompare(right.label);
  });
}

/**
 * Picker order: draft picks first (visible without scrolling past the roster),
 * then roster players A–Z.
 */
export function sortTradePickerAssets(assets: MflAsset[]): MflAsset[] {
  const { picks, players } = partitionTradePickerAssets(assets);
  return [...picks, ...players];
}

/** Players A–Z, then current-year picks, then future picks (history / summaries). */
export function sortTradeAssets(assets: MflAsset[]): MflAsset[] {
  return [...assets].sort((left, right) => {
    const rank = (asset: MflAsset) => {
      if (asset.kind === 'player') return 0;
      if (asset.kind === 'draftPick') return 1;
      if (asset.kind === 'futurePick') return 2;
      return 3;
    };
    const rankDiff = rank(left) - rank(right);
    if (rankDiff !== 0) return rankDiff;
    if (left.kind === 'futurePick' && right.kind === 'futurePick') {
      const yearDiff = left.year.localeCompare(right.year);
      if (yearDiff !== 0) return yearDiff;
      const roundDiff = Number(left.round) - Number(right.round);
      if (roundDiff !== 0) return roundDiff;
      const pickDiff = Number(left.pick) - Number(right.pick);
      if (pickDiff !== 0) return pickDiff;
    }
    if (left.kind === 'draftPick' && right.kind === 'draftPick') {
      const roundDiff = Number(left.round) - Number(right.round);
      if (roundDiff !== 0) return roundDiff;
      const pickDiff = Number(left.pick) - Number(right.pick);
      if (pickDiff !== 0) return pickDiff;
    }
    return left.label.localeCompare(right.label);
  });
}
