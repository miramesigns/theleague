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

export function parseNflScheduleGames(schedulePayload: unknown): Map<string, PlayerGameState> | null {
  const scheduleRoot = toRecord(schedulePayload)?.nflSchedule;
  const matchups = toJsonArray(toRecord(scheduleRoot)?.matchup);

  if (matchups.length === 0) {
    return null;
  }

  const gamesByTeam = new Map<string, PlayerGameState>();

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

      gamesByTeam.set(teamId, {
        gameSecondsRemaining,
        kickoff,
      });
    }
  }

  return gamesByTeam.size > 0 ? gamesByTeam : null;
}

export async function loadNflScheduleGames(week?: number | null): Promise<Map<string, PlayerGameState> | null> {
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

export function addPlayerLiveState<T extends { id: string; gameSecondsRemaining: number | null }>(
  players: T[],
  teamByPlayerId: Map<string, string | null | undefined>,
  gamesByTeam: Map<string, PlayerGameState> | null,
  nowMs = Date.now(),
): Array<T & { liveStateText: string }> {
  return players.map((player) => {
    const team = teamByPlayerId.get(player.id) ?? null;
    const game = team ? gamesByTeam?.get(team) ?? null : null;
    const liveStateText = describePlayerGameState(game ?? { gameSecondsRemaining: player.gameSecondsRemaining, kickoff: null }, nowMs);

    return {
      ...player,
      liveStateText,
    };
  });
}
