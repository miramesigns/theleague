/**
 * FantasyCalc public dynasty values (no API key).
 * Docs: https://fantasycalc.com/api-docs
 * League defaults: 12-team dynasty, 1QB (confirmed via MFL starters QB limit=1), PPR, no TEP.
 */

export const FANTASYCALC_VALUES_URL =
  'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=1&numTeams=12&ppr=1&tep=none';

export const FANTASYCALC_CACHE_SECONDS = 60 * 60;

export const FANTASYCALC_SETTINGS_NOTE = 'FantasyCalc: 12-team dynasty · 1QB · PPR (MFL starters QB limit=1)';

export type FantasyCalcPlayer = {
  id: number;
  name: string;
  mflId: string | null;
  position: string;
  maybeTeam: string | null;
};

export type FantasyCalcValueRow = {
  player: FantasyCalcPlayer;
  value: number;
  overallRank: number | null;
};

export type FantasyCalcCatalogEntry = {
  fantasyCalcId: number;
  mflId: string | null;
  name: string;
  position: string;
  team: string | null;
  value: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseFantasyCalcValuesPayload(payload: unknown): FantasyCalcCatalogEntry[] {
  if (!Array.isArray(payload)) return [];

  const entries: FantasyCalcCatalogEntry[] = [];
  for (const row of payload) {
    const item = record(row);
    const player = record(item?.player);
    if (!item || !player) continue;

    const fantasyCalcId = numberValue(player.id);
    const value = numberValue(item.value);
    if (fantasyCalcId === null || value === null) continue;

    const mflIdRaw = text(player.mflId);
    entries.push({
      fantasyCalcId,
      mflId: mflIdRaw || null,
      name: text(player.name) || `Player ${fantasyCalcId}`,
      position: text(player.position).toUpperCase() || 'UNK',
      team: text(player.maybeTeam) || null,
      value,
    });
  }

  return entries;
}

export function buildFantasyCalcIndexes(entries: FantasyCalcCatalogEntry[]) {
  const byMflId = new Map<string, FantasyCalcCatalogEntry>();
  const byNameKey = new Map<string, FantasyCalcCatalogEntry[]>();

  for (const entry of entries) {
    if (entry.mflId && /^\d+$/.test(entry.mflId)) {
      byMflId.set(entry.mflId, entry);
    }
    const key = normalizePlayerNameKey(entry.name);
    if (!key) continue;
    const bucket = byNameKey.get(key) ?? [];
    bucket.push(entry);
    byNameKey.set(key, bucket);
  }

  return { byMflId, byNameKey, entries };
}

/** "London, Drake" / "Drake London" / "Ja'Marr Chase" → comparable key */
export function normalizePlayerNameKey(name: string): string {
  let cleaned = name.trim().toLowerCase();
  const lastFirst = /^([^,]+),\s*(.+)$/.exec(cleaned);
  if (lastFirst) {
    cleaned = `${lastFirst[2]} ${lastFirst[1]}`;
  }
  return cleaned
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** MFL uses GBP/NOS/JAC; FantasyCalc uses GB/NO/JAX */
export function normalizeNflTeam(team: string | null | undefined): string {
  const raw = (team || '').trim().toUpperCase();
  if (!raw || raw === 'FA' || raw === 'UNK') return '';
  const map: Record<string, string> = {
    GBP: 'GB',
    GNB: 'GB',
    NOS: 'NO',
    NOR: 'NO',
    KCC: 'KC',
    SFO: 'SF',
    TAM: 'TB',
    TBB: 'TB',
    NEP: 'NE',
    RAM: 'LAR',
    LAR: 'LAR',
    LA: 'LAR',
    SD: 'LAC',
    LAC: 'LAC',
    JAC: 'JAX',
    JAX: 'JAX',
    ARZ: 'ARI',
    ARI: 'ARI',
    WSH: 'WAS',
    WAS: 'WAS',
    LV: 'LV',
    LVR: 'LV',
    OAK: 'LV',
  };
  return map[raw] || raw;
}

export type MflPlayerRef = {
  id: string;
  name: string;
  position?: string | null;
  team?: string | null;
};

export type FantasyCalcMatch =
  | { ok: true; entry: FantasyCalcCatalogEntry; via: 'mflId' | 'fuzzy' }
  | { ok: false; reason: string };

export function matchMflPlayerToFantasyCalc(
  player: MflPlayerRef,
  indexes: ReturnType<typeof buildFantasyCalcIndexes>,
): FantasyCalcMatch {
  const byId = indexes.byMflId.get(player.id);
  if (byId) return { ok: true, entry: byId, via: 'mflId' };

  const key = normalizePlayerNameKey(player.name);
  if (!key) return { ok: false, reason: 'empty name' };

  const candidates = indexes.byNameKey.get(key) ?? [];
  if (candidates.length === 0) return { ok: false, reason: 'name miss' };

  const pos = (player.position || '').trim().toUpperCase();
  const team = normalizeNflTeam(player.team);

  let filtered = candidates;
  if (pos) {
    const byPos = filtered.filter((entry) => entry.position === pos);
    if (byPos.length > 0) filtered = byPos;
  }
  if (team) {
    const byTeam = filtered.filter((entry) => normalizeNflTeam(entry.team) === team);
    if (byTeam.length > 0) filtered = byTeam;
  }

  if (filtered.length === 1) return { ok: true, entry: filtered[0], via: 'fuzzy' };
  if (filtered.length > 1) {
    // Prefer skill positions over PICK noise if somehow colliding
    const skill = filtered.find((entry) => entry.position !== 'PICK');
    if (skill) return { ok: true, entry: skill, via: 'fuzzy' };
    return { ok: true, entry: filtered[0], via: 'fuzzy' };
  }

  return { ok: false, reason: 'ambiguous name' };
}

/**
 * Best-effort pick values: FantasyCalc uses synthetic ids like FP_2027_mid_0,
 * not MFL FP_{franchise}_{year}_{round}. Map to Mid (or Early/Late unknown → Mid).
 */
export function matchFuturePickToFantasyCalc(
  year: string,
  round: string,
  indexes: ReturnType<typeof buildFantasyCalcIndexes>,
): FantasyCalcMatch {
  const roundNum = Number.parseInt(round, 10);
  if (!Number.isFinite(roundNum) || roundNum < 1) {
    return { ok: false, reason: 'bad pick round' };
  }

  const ordinal = roundNum === 1 ? '1st' : roundNum === 2 ? '2nd' : roundNum === 3 ? '3rd' : `${roundNum}th`;
  const midExact = `${year} ${ordinal} (Mid)`;
  const generic = `${year} ${ordinal}`;

  const mid = indexes.entries.find((entry) => entry.position === 'PICK' && entry.name === midExact);
  if (mid) return { ok: true, entry: mid, via: 'fuzzy' };

  const plain = indexes.entries.find((entry) => entry.position === 'PICK' && entry.name === generic);
  if (plain) return { ok: true, entry: plain, via: 'fuzzy' };

  return { ok: false, reason: 'pick miss' };
}

export async function fetchFantasyCalcCatalog(): Promise<FantasyCalcCatalogEntry[]> {
  try {
    const response = await fetch(FANTASYCALC_VALUES_URL, {
      headers: { Accept: 'application/json' },
      next: { revalidate: FANTASYCALC_CACHE_SECONDS },
    });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => null);
    return parseFantasyCalcValuesPayload(payload);
  } catch {
    return [];
  }
}
