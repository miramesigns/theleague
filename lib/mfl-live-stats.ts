/**
 * MFL live box-score stats (`live_stats_WW.txt`) → STATS column strings.
 *
 * Source (verified): `https://api.myfantasyleague.com/fflnetdynamic{YEAR}/live_stats_{WW}.txt`
 * Example: `CC 5|CY 100|#C 1|RC 15` → `Rec: 5/100, 1 ReTD (15)`
 */

export type MflLiveStatBag = Record<string, string>;

function parseStatValue(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // TD-length lists like "40,13,11" are kept as strings via getStatText.
  if (trimmed.includes(',')) return null;
  const value = Number.parseFloat(trimmed);
  return Number.isFinite(value) ? value : null;
}

function getStatNumber(bag: MflLiveStatBag, key: string): number | null {
  const raw = bag[key];
  if (raw === undefined) return null;
  return parseStatValue(raw);
}

function getStatText(bag: MflLiveStatBag, key: string): string | null {
  const raw = bag[key]?.trim();
  return raw ? raw : null;
}

function formatYards(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function formatCount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function appendTdClause(parts: string[], count: number | null, label: string, lengths: string | null) {
  if (count === null || count <= 0) return;
  const clause = `${formatCount(count)} ${label}`;
  parts.push(lengths ? `${clause} (${lengths})` : clause);
}

/**
 * Parse one `live_stats_WW.txt` document into id → raw stat bags.
 * Lines look like: `17075|#C 1|CC 5|CY 100|RC 15|Team GBP`
 * Defense/team rows use NFL abbreviations as the id (`GBP`, `ATL`, …).
 */
export function parseMflLiveStats(source: string): Map<string, MflLiveStatBag> {
  const byId = new Map<string, MflLiveStatBag>();

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const segments = trimmed.split('|');
    const id = segments[0]?.trim();
    if (!id) continue;

    const bag: MflLiveStatBag = {};
    for (const segment of segments.slice(1)) {
      const separator = segment.indexOf(' ');
      if (separator <= 0) continue;
      const key = segment.slice(0, separator).trim();
      const value = segment.slice(separator + 1).trim();
      if (!key || !value || key === 'Team') continue;
      bag[key] = value;
    }

    if (Object.keys(bag).length > 0) {
      byId.set(id, bag);
    }
  }

  return byId;
}

function formatPassLine(bag: MflLiveStatBag): string | null {
  const completions = getStatNumber(bag, 'PC');
  const attempts = getStatNumber(bag, 'PA');
  const yards = getStatNumber(bag, 'PY');
  const touchdowns = getStatNumber(bag, 'PASS_TD') ?? getStatNumber(bag, '#P');
  const interceptions = getStatNumber(bag, 'IN');
  const lengths = getStatText(bag, 'PS');

  if (
    (completions === null || completions === 0) &&
    (attempts === null || attempts === 0) &&
    (yards === null || yards === 0) &&
    (touchdowns === null || touchdowns === 0) &&
    (interceptions === null || interceptions === 0)
  ) {
    return null;
  }

  // "Pass: 19/29, 253 Yd, 3 PaTD (40,13,11), 1 Int"
  const head =
    completions !== null || attempts !== null
      ? `Pass: ${formatCount(completions ?? 0)}/${formatCount(attempts ?? 0)}`
      : 'Pass:';
  const tail: string[] = [];

  if (yards !== null) {
    tail.push(`${formatYards(yards)} Yd`);
  }

  appendTdClause(tail, touchdowns, 'PaTD', lengths);

  if (interceptions !== null && interceptions > 0) {
    tail.push(`${formatCount(interceptions)} Int`);
  }

  if (head === 'Pass:') {
    return tail.length > 0 ? `Pass: ${tail.join(', ')}` : null;
  }

  return tail.length > 0 ? `${head}, ${tail.join(', ')}` : head;
}

function formatRushLine(bag: MflLiveStatBag): string | null {
  const attempts = getStatNumber(bag, 'RA');
  const yards = getStatNumber(bag, 'RY');
  const touchdowns = getStatNumber(bag, '#R');
  const lengths = getStatText(bag, 'RS');

  if (
    (attempts === null || attempts === 0) &&
    (yards === null || yards === 0) &&
    (touchdowns === null || touchdowns === 0)
  ) {
    return null;
  }

  const parts: string[] = [`Rush: ${formatCount(attempts ?? 0)}/${formatYards(yards ?? 0)}`];
  appendTdClause(parts, touchdowns, 'RuTD', lengths);
  return parts.join(', ');
}

function formatRecLine(bag: MflLiveStatBag): string | null {
  const catches = getStatNumber(bag, 'CC');
  const yards = getStatNumber(bag, 'CY');
  const touchdowns = getStatNumber(bag, '#C');
  const lengths = getStatText(bag, 'RC');

  if (
    (catches === null || catches === 0) &&
    (yards === null || yards === 0) &&
    (touchdowns === null || touchdowns === 0)
  ) {
    return null;
  }

  const parts: string[] = [`Rec: ${formatCount(catches ?? 0)}/${formatYards(yards ?? 0)}`];
  appendTdClause(parts, touchdowns, 'ReTD', lengths);
  return parts.join(', ');
}

function formatKickLine(bag: MflLiveStatBag): string | null {
  const made = getStatNumber(bag, '#F');
  const attempts = getStatNumber(bag, '#A');
  const lengths = getStatText(bag, 'FG');
  const xp = getStatNumber(bag, 'EP');
  const xpAttempts = getStatNumber(bag, 'EA');
  const missed = getStatNumber(bag, '#M');

  const hasFg = (made !== null && made > 0) || (attempts !== null && attempts > 0) || Boolean(lengths);
  const hasXp = (xp !== null && xp > 0) || (xpAttempts !== null && xpAttempts > 0);

  if (!hasFg && !hasXp) {
    return null;
  }

  const parts: string[] = [];

  if (hasFg) {
    const madeText = formatCount(made ?? 0);
    const attemptText = formatCount(attempts ?? made ?? 0);
    let fg = `FG: ${madeText}/${attemptText}`;
    if (lengths) {
      fg += ` (${lengths})`;
    }
    parts.push(fg);
  }

  if (hasXp) {
    if (xpAttempts !== null) {
      parts.push(`${formatCount(xp ?? 0)}/${formatCount(xpAttempts)} XP`);
    } else if (xp !== null) {
      parts.push(`${formatCount(xp)} XP`);
    }
  }

  if (missed !== null && missed > 0 && !hasFg) {
    parts.push(`${formatCount(missed)} FG Miss`);
  }

  return parts.join(', ');
}

function formatDefLine(bag: MflLiveStatBag): string | null {
  const parts: string[] = [];
  const sacks = getStatNumber(bag, 'SK');
  const ints = getStatNumber(bag, 'IC');
  const fumbleRecoveries = getStatNumber(bag, 'FC');
  const safeties = getStatNumber(bag, 'SF') ?? getStatNumber(bag, 'SF1');
  const defTds = getStatNumber(bag, '#T') ?? getStatNumber(bag, '#D');
  const pointsAllowed = getStatNumber(bag, 'TPA') ?? getStatNumber(bag, 'OPA');

  if (sacks !== null && sacks > 0) parts.push(`${formatCount(sacks)} Sk`);
  if (ints !== null && ints > 0) parts.push(`${formatCount(ints)} Int`);
  if (fumbleRecoveries !== null && fumbleRecoveries > 0) parts.push(`${formatCount(fumbleRecoveries)} FR`);
  if (safeties !== null && safeties > 0) parts.push(`${formatCount(safeties)} Sfty`);
  if (defTds !== null && defTds > 0) parts.push(`${formatCount(defTds)} TD`);
  if (pointsAllowed !== null) parts.push(`${formatCount(pointsAllowed)} PA`);

  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Build an MFL-style STATS string from a raw live_stats bag.
 * Returns null when there is nothing meaningful to show (yet to play / empty).
 */
export function formatMflLiveStatsString(bag: MflLiveStatBag | null | undefined): string | null {
  if (!bag || Object.keys(bag).length === 0) {
    return null;
  }

  const lines = [
    formatPassLine(bag),
    formatRushLine(bag),
    formatRecLine(bag),
    formatKickLine(bag),
    formatDefLine(bag),
  ].filter((line): line is string => Boolean(line));

  if (lines.length === 0) {
    return null;
  }

  return lines.join('; ');
}

/**
 * Resolve a player's STATS string from an id-keyed live_stats map.
 * Defenses are stored under NFL team abbreviations in live_stats.
 */
export function resolvePlayerLiveStatsText(
  statsById: Map<string, MflLiveStatBag>,
  player: { id: string; position?: string | null; nflTeam?: string | null; team?: string | null },
): string | null {
  const direct = statsById.get(player.id);
  if (direct) {
    return formatMflLiveStatsString(direct);
  }

  const position = (player.position ?? '').trim().toLowerCase();
  const team = (player.nflTeam ?? player.team ?? '').trim().toUpperCase();
  if (team && (position === 'def' || position === 'dst' || position === 'd/st' || position === 'tm')) {
    return formatMflLiveStatsString(statsById.get(team) ?? null);
  }

  return null;
}

/**
 * Prefer a preformatted liveScoring `updatedStats` value when MFL already sent
 * a display string; otherwise treat pipe/equals bags as raw stats.
 */
export function coerceUpdatedStatsText(updatedStats: unknown): string | null {
  if (typeof updatedStats !== 'string') return null;
  const trimmed = updatedStats.trim();
  if (!trimmed) return null;

  if (/^(Pass|Rush|Rec|FG):/i.test(trimmed) || /\b(ReTD|RuTD|PaTD)\b/.test(trimmed)) {
    return trimmed;
  }

  // Raw delta style: "CC=5|CY=100|#C=1|RC=15" or "CC 5|CY 100"
  if (trimmed.includes('|') || trimmed.includes('=')) {
    const normalized = trimmed
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => (part.includes('=') ? part.replace('=', ' ') : part))
      .join('|');
    const bag = parseMflLiveStats(`x|${normalized}`).get('x');
    return formatMflLiveStatsString(bag ?? null);
  }

  return null;
}
