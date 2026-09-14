const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'PK', 'Def'] as const;

export type PlayerGameState = {
  gameSecondsRemaining: number | null;
  kickoff: number | null;
};

type GroupablePlayer = {
  position: string;
};

export function normalizePlayerPosition(position: string): string {
  const normalized = position.trim().toUpperCase();

  if (normalized === 'QB' || normalized === 'RB' || normalized === 'WR' || normalized === 'TE') {
    return normalized;
  }

  if (normalized === 'PK' || normalized === 'K') {
    return 'PK';
  }

  if (normalized === 'DEF' || normalized === 'DST' || normalized === 'D/ST') {
    return 'Def';
  }

  return position.trim() || 'UNK';
}

function formatClockLeft(secondsLeft: number): string {
  const minutes = Math.floor(secondsLeft / 60).toString().padStart(2, '0');
  const seconds = Math.floor(secondsLeft % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function deriveRegulationQuarterClock(gameSecondsRemaining: number): string | null {
  if (!Number.isFinite(gameSecondsRemaining) || gameSecondsRemaining <= 0 || gameSecondsRemaining >= 3600) {
    return null;
  }

  if (gameSecondsRemaining > 2700) {
    return `Q1 ${formatClockLeft(gameSecondsRemaining - 2700)}`;
  }

  if (gameSecondsRemaining > 1800) {
    return `Q2 ${formatClockLeft(gameSecondsRemaining - 1800)}`;
  }

  if (gameSecondsRemaining > 900) {
    return `Q3 ${formatClockLeft(gameSecondsRemaining - 900)}`;
  }

  return `Q4 ${formatClockLeft(gameSecondsRemaining)}`;
}

export function describePlayerGameState(game: PlayerGameState | null, nowMs = Date.now()): string {
  if (!game) {
    return 'Yet to play';
  }

  const seconds = game.gameSecondsRemaining;
  if (seconds === 0) {
    return 'Final';
  }

  if (seconds === 3600) {
    return 'Yet to play';
  }

  const quarterClock = typeof seconds === 'number' ? deriveRegulationQuarterClock(seconds) : null;
  if (quarterClock) {
    return `Playing · ${quarterClock} left`;
  }

  const isStarted = typeof game.kickoff === 'number' && game.kickoff * 1000 <= nowMs;
  return isStarted ? 'Live' : 'In progress';
}

export function groupPlayersByPosition<T extends GroupablePlayer>(players: T[]) {
  const buckets = new Map<string, T[]>();
  const order: string[] = [];

  for (const player of players) {
    const position = normalizePlayerPosition(player.position);
    if (!buckets.has(position)) {
      buckets.set(position, []);
      order.push(position);
    }

    buckets.get(position)?.push(player);
  }

  const knownPositions = POSITION_ORDER.filter((position) => buckets.has(position));
  const unknownPositions = order.filter((position) => !POSITION_ORDER.includes(position as (typeof POSITION_ORDER)[number]));

  return [...knownPositions, ...unknownPositions].map((position) => ({
    position,
    players: buckets.get(position) ?? [],
  }));
}
