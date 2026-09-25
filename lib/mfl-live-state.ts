import { fetchMflSiteExport } from './mfl.ts';
import type { PlayerGameState } from './player-detail.ts';
import { describePlayerGameState } from './player-detail.ts';

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === 'object') {
    return [value];
  }

  return [];
}

function toJsonArray(value: unknown): Record<string, unknown>[] {
  return toArray(value).filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object');
}

function extractText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['#text', 'id', 'name', 'team']) {
      const nested = record[key];
      if (typeof nested === 'string' && nested.trim()) {
        return nested.trim();
      }
    }
  }

  return '';
}

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseHomeAway(value: unknown): 'home' | 'away' | null {
  const text = extractText(value).toLowerCase();
  if (text === '1' || text === 'home' || text === 'true') return 'home';
  if (text === '0' || text === 'away' || text === 'false') return 'away';
  return null;
}

/** Compact kickoff for matchup cards, e.g. `Sun 1:00`. */
export function formatCompactKickoffEt(kickoffUtcSeconds: number): string | null {
  const date = new Date(kickoffUtcSeconds * 1000);
  if (Number.isNaN(date.getTime())) return null;

  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  }).format(date);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;
  if (!hour || !minute) return null;

  return `${weekday} ${hour}:${minute}`;
}

export type NflScheduleGame = PlayerGameState & {
  opponent: string | null;
  homeAway: 'home' | 'away' | null;
  kickoffCue: string | null;
};

export function formatScheduleCue(game: Pick<NflScheduleGame, 'opponent' | 'homeAway' | 'kickoffCue'>): string | null {
  if (!game.opponent) {
    return game.kickoffCue;
  }

  const vs = game.homeAway === 'away' ? `@ ${game.opponent}` : game.homeAway === 'home' ? `vs ${game.opponent}` : `vs ${game.opponent}`;
  return game.kickoffCue ? `${vs} · ${game.kickoffCue}` : vs;
}

export function parseNflScheduleGames(schedulePayload: unknown): Map<string, NflScheduleGame> | null {
  const scheduleRoot = toRecord(schedulePayload)?.nflSchedule;
  const matchups = toJsonArray(toRecord(scheduleRoot)?.matchup);

  if (matchups.length === 0) {
    return null;
  }

  const gamesByTeam = new Map<string, NflScheduleGame>();

  for (const matchup of matchups) {
    const gameSecondsRemaining = safeNumber(matchup.gameSecondsRemaining);
    const kickoff = safeNumber(matchup.kickoff);
    const teams = toJsonArray(matchup.team);

    if (teams.length !== 2) {
      return null;
    }

    for (const team of teams) {
      const teamId = extractText(team.id);
      if (!teamId || gamesByTeam.has(teamId)) {
        return null;
      }

      const opponentTeam = teams.find((candidate) => extractText(candidate.id) !== teamId) ?? null;
      const opponent = extractText(opponentTeam?.id) || null;
      const homeAway = parseHomeAway(team.isHome);
      const kickoffCue = kickoff !== null ? formatCompactKickoffEt(kickoff) : null;

      gamesByTeam.set(teamId, {
        gameSecondsRemaining,
        kickoff,
        opponent,
        homeAway,
        kickoffCue,
      });
    }
  }

  return gamesByTeam.size > 0 ? gamesByTeam : null;
}

export async function loadNflScheduleGames(week?: number | null): Promise<Map<string, NflScheduleGame> | null> {
  const params: Record<string, string> = { JSON: '1' };

  if (week !== null && week !== undefined) {
    params.W = String(week);
  }

  const response = await fetchMflSiteExport('nflSchedule', params, { cache: 'no-store' });
  if (!response.ok) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  return parseNflScheduleGames(payload);
}

export function isYetToPlayGame(gameSecondsRemaining: number | null | undefined, liveStateText?: string | null): boolean {
  if (gameSecondsRemaining === 3600) return true;
  if (liveStateText === 'Yet to play') return true;
  return false;
}

export function addPlayerLiveState<T extends { id: string; gameSecondsRemaining: number | null }>(
  players: T[],
  teamByPlayerId: Map<string, string | null | undefined>,
  gamesByTeam: Map<string, NflScheduleGame> | null,
  nowMs = Date.now(),
): Array<T & { liveStateText: string; scheduleCue: string | null }> {
  return players.map((player) => {
    const team = teamByPlayerId.get(player.id) ?? null;
    const game = team ? gamesByTeam?.get(team) ?? null : null;
    const liveStateText = describePlayerGameState(game ?? { gameSecondsRemaining: player.gameSecondsRemaining, kickoff: null }, nowMs);
    const scheduleCue = game ? formatScheduleCue(game) : null;

    return {
      ...player,
      liveStateText,
      scheduleCue,
    };
  });
}
