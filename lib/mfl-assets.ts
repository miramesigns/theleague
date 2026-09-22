import { splitMflIdList } from './mfl-format.ts';

export type MflAsset =
  | { kind: 'player'; id: string; label: string }
  | { kind: 'futurePick'; id: string; label: string; franchiseId: string; year: string; round: string }
  | { kind: 'draftPick'; id: string; label: string; round: string; pick: string }
  | { kind: 'unknown'; id: string; label: string };

export type MflAssetParseOptions = {
  playerNames?: Map<string, string>;
  franchiseNames?: Map<string, string>;
  /** Optional season year prefix for current-year DP_ labels. */
  draftYear?: string | null;
};

/** 1 → 1st, 2 → 2nd, 3 → 3rd, … */
export function formatRoundOrdinal(round: string | number): string {
  const n = typeof round === 'number' ? round : Number.parseInt(String(round), 10);
  if (!Number.isFinite(n) || n <= 0) return `R${round}`;
  const mod100 = n % 100;
  const mod10 = n % 10;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? 'th' : mod10 === 1 ? 'st' : mod10 === 2 ? 'nd' : mod10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

/** Human label like `2027 2nd (Shadow)`. */
export function formatFuturePickLabel(year: string, round: string, franchiseLabel?: string | null): string {
  const roundLabel = formatRoundOrdinal(round);
  const team = (franchiseLabel ?? '').trim();
  return team ? `${year} ${roundLabel} (${team})` : `${year} ${roundLabel}`;
}

/**
 * Current-year draft pick label.
 * MFL encodes DP_{roundIndex}_{pick} with a 0-based round index.
 */
export function formatDraftPickLabel(round: string, pick: string, draftYear?: string | null): string {
  const roundIndex = Number.parseInt(round, 10);
  const displayRound = Number.isFinite(roundIndex) ? formatRoundOrdinal(roundIndex + 1) : `R${round}`;
  const yearPrefix = draftYear?.trim() ? `${draftYear.trim()} ` : '';
  return `${yearPrefix}${displayRound} (#${pick})`;
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
}): MflAsset {
  const franchiseId = input.originalFranchiseId.padStart(4, '0');
  const teamName =
    input.franchiseNames?.get(franchiseId) ||
    input.franchiseNames?.get(input.originalFranchiseId) ||
    `Franchise ${franchiseId}`;
  return {
    kind: 'futurePick',
    id: buildFuturePickId(franchiseId, input.year, input.round),
    franchiseId,
    year: input.year,
    round: input.round,
    label: formatFuturePickLabel(input.year, input.round, teamName),
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
  const franchiseNames = options.franchiseNames ?? new Map<string, string>();

  const id = token.trim();
  if (!id) {
    return { kind: 'unknown', id: '', label: 'Unknown asset' };
  }

  const futurePick = /^FP_(\d{4})_(\d{4})_(\d+)$/i.exec(id);
  if (futurePick) {
    const [, franchiseId, year, round] = futurePick;
    const teamName = franchiseNames.get(franchiseId) || `Franchise ${franchiseId}`;
    return {
      kind: 'futurePick',
      id,
      franchiseId,
      year,
      round,
      label: formatFuturePickLabel(year, round, teamName),
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

/** Players A–Z, then current-year picks, then future picks. */
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
