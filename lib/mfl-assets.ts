import { splitMflIdList } from './mfl-format.ts';

export type MflAsset =
  | { kind: 'player'; id: string; label: string }
  | { kind: 'futurePick'; id: string; label: string; franchiseId: string; year: string; round: string }
  | { kind: 'draftPick'; id: string; label: string; round: string; pick: string }
  | { kind: 'unknown'; id: string; label: string };

export function parseMflAssetToken(token: string, playerNames: Map<string, string> = new Map()): MflAsset {
  const id = token.trim();
  if (!id) {
    return { kind: 'unknown', id: '', label: 'Unknown asset' };
  }

  const futurePick = /^FP_(\d{4})_(\d{4})_(\d+)$/i.exec(id);
  if (futurePick) {
    const [, franchiseId, year, round] = futurePick;
    return {
      kind: 'futurePick',
      id,
      franchiseId,
      year,
      round,
      label: `${year} R${round} (from ${franchiseId})`,
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
      label: `Draft pick R${round}.${pick}`,
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

export function parseMflAssetList(value: string | null | undefined, playerNames: Map<string, string> = new Map()): MflAsset[] {
  return splitMflIdList(value).map((token) => parseMflAssetToken(token, playerNames));
}

export function formatMflAssetLabels(assets: MflAsset[]): string {
  if (assets.length === 0) return '—';
  return assets.map((asset) => asset.label).join(' • ');
}
