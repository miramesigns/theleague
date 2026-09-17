import { formatMflAssetLabels, parseMflAssetList } from './mfl-assets.ts';
import { fetchMflExport } from './mfl.ts';
import { formatMflMoney, formatMflTimestamp, splitMflIdList } from './mfl-format.ts';
import { parseBbidTransactionBlob, parseFreeAgentTransactionBlob } from './mfl-waivers.ts';
import { resolvePrimaryFranchiseId } from './mfl-scores.ts';

type RecordValue = Record<string, unknown>;

export type NotificationCategory = 'score' | 'lineup' | 'waiver' | 'trade' | 'league';

export type LeagueNotification = {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  timestamp: number;
  timeLabel: string;
  href: string;
};

export type NotificationsPageState = {
  ok: boolean;
  message: string;
  franchiseId: string | null;
  notifications: LeagueNotification[];
  pushDraftAvailable: boolean;
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

function playerNames(payload: unknown): Map<string, string> {
  const players = records(record(record(payload)?.players)?.player);
  return new Map(players.map((player) => [text(player.id), text(player.name) || `Player ${text(player.id)}`] as const).filter(([id]) => id));
}

function franchiseNames(payload: unknown): Map<string, string> {
  const league = record(record(payload)?.league);
  const franchises = records(record(league?.franchises)?.franchise);
  return new Map(
    franchises
      .map((franchise) => [text(franchise.id), text(franchise.name) || `Franchise ${text(franchise.id)}`] as const)
      .filter(([id]) => Boolean(id)),
  );
}

function playerLabel(id: string, names: Map<string, string>): string {
  return names.get(id) || `Player ${id}`;
}

export function buildNotificationsFromTransactions(
  transactionsPayload: unknown,
  playersPayload: unknown,
  leaguePayload: unknown,
): LeagueNotification[] {
  const players = playerNames(playersPayload);
  const names = franchiseNames(leaguePayload);
  const transactions = records(record(record(transactionsPayload)?.transactions)?.transaction);
  const notifications: LeagueNotification[] = [];

  for (const [index, entry] of transactions.entries()) {
    const type = text(entry.type).toUpperCase();
    const timestamp = numberValue(entry.timestamp) ?? 0;
    const franchiseId = text(entry.franchise);
    const franchiseName = names.get(franchiseId) || (franchiseId ? `Franchise ${franchiseId}` : 'League');
    const blob = text(entry.transaction);
    const id = `${type}-${franchiseId}-${timestamp}-${index}`;

    if (type === 'BBID_WAIVER' || type === 'WAIVER') {
      const parsed = parseBbidTransactionBlob(blob);
      const adds = parsed.addPlayerIds.map((playerId) => playerLabel(playerId, players)).join(', ');
      notifications.push({
        id,
        category: 'waiver',
        title: 'Waiver claim',
        body: `${franchiseName} claimed ${adds || 'a player'}${parsed.bidAmount !== null ? ` for ${formatMflMoney(parsed.bidAmount)}` : ''}`,
        timestamp,
        timeLabel: formatMflTimestamp(timestamp),
        href: '/waivers',
      });
      continue;
    }

    if (type === 'FREE_AGENT') {
      const parsed = parseFreeAgentTransactionBlob(blob);
      const adds = parsed.addPlayerIds.map((playerId) => playerLabel(playerId, players)).join(', ');
      const drops = parsed.dropPlayerIds.map((playerId) => playerLabel(playerId, players)).join(', ');
      notifications.push({
        id,
        category: 'waiver',
        title: 'Free agent move',
        body: `${franchiseName}${adds ? ` added ${adds}` : ''}${drops ? `${adds ? ' and' : ''} dropped ${drops}` : ''}` || `${franchiseName} free-agent activity`,
        timestamp,
        timeLabel: formatMflTimestamp(timestamp),
        href: '/waivers',
      });
      continue;
    }

    if (type === 'TRADE') {
      const partnerId = text(entry.franchise2);
      const partnerName = names.get(partnerId) || `Franchise ${partnerId}`;
      const offered = parseMflAssetList(text(entry.franchise1_gave_up), players);
      const requested = parseMflAssetList(text(entry.franchise2_gave_up), players);
      notifications.push({
        id,
        category: 'trade',
        title: 'Trade completed',
        body: `${franchiseName} ↔ ${partnerName}: ${formatMflAssetLabels(offered)} for ${formatMflAssetLabels(requested)}`,
        timestamp,
        timeLabel: formatMflTimestamp(timestamp),
        href: '/trades',
      });
      continue;
    }

    if (type === 'LOCK_ALL_PLAYERS') {
      notifications.push({
        id,
        category: 'lineup',
        title: 'Lineups locked',
        body: 'MFL locked all players for the current period.',
        timestamp,
        timeLabel: formatMflTimestamp(timestamp),
        href: '/lineup',
      });
      continue;
    }

    if (type === 'PROCESS_WAIVERS') {
      notifications.push({
        id,
        category: 'waiver',
        title: 'Waivers processed',
        body: 'League waivers were processed.',
        timestamp,
        timeLabel: formatMflTimestamp(timestamp),
        href: '/waivers',
      });
      continue;
    }

    if (type === 'IR' || type === 'TAXI') {
      const activated = splitMflIdList(text(entry.activated ?? entry.promoted)).map((playerId) => playerLabel(playerId, players));
      const deactivated = splitMflIdList(text(entry.deactivated ?? entry.demoted)).map((playerId) => playerLabel(playerId, players));
      notifications.push({
        id,
        category: 'league',
        title: type === 'IR' ? 'IR move' : 'Taxi squad move',
        body: `${franchiseName}${activated.length ? ` activated ${activated.join(', ')}` : ''}${deactivated.length ? `${activated.length ? ';' : ''} moved ${deactivated.join(', ')}` : ''}`,
        timestamp,
        timeLabel: formatMflTimestamp(timestamp),
        href: '/roster',
      });
    }
  }

  return notifications
    .filter((entry) => entry.timestamp > 0)
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 60);
}

export function buildScoreAlertNotifications(
  liveScoringPayload: unknown,
  leaguePayload: unknown,
  primaryFranchiseId: string | null,
): LeagueNotification[] {
  const names = franchiseNames(leaguePayload);
  const root = record(liveScoringPayload);
  const live = record(root?.liveScoring);
  if (!live) return [];

  const week = numberValue(live.week);
  const matchups = records(live.matchup);
  const now = Math.floor(Date.now() / 1000);
  const notifications: LeagueNotification[] = [];

  for (const [index, matchup] of matchups.entries()) {
    const franchises = records(matchup.franchise);
    if (franchises.length < 2) continue;
    const ids = franchises.map((franchise) => text(franchise.id));
    if (primaryFranchiseId && !ids.includes(primaryFranchiseId)) continue;

    const scores = franchises.map((franchise) => ({
      id: text(franchise.id),
      name: names.get(text(franchise.id)) || text(franchise.name) || `Franchise ${text(franchise.id)}`,
      score: numberValue(franchise.score) ?? 0,
      status: text(franchise.isHome),
      seconds: numberValue(franchise.gameSecondsRemaining) ?? 0,
    }));

    const myTeam = primaryFranchiseId ? scores.find((team) => team.id === primaryFranchiseId) : scores[0];
    const opponent = scores.find((team) => team.id !== myTeam?.id) ?? scores[1];
    if (!myTeam || !opponent) continue;

    const liveGame = scores.some((team) => team.seconds > 0 && team.seconds < 3600 * 4);
    if (!liveGame && week === null) continue;

    notifications.push({
      id: `score-${week ?? 'x'}-${myTeam.id}-${opponent.id}-${index}`,
      category: 'score',
      title: week ? `Week ${week} score update` : 'Score update',
      body: `${myTeam.name} ${myTeam.score.toFixed(1)} vs ${opponent.name} ${opponent.score.toFixed(1)}`,
      timestamp: now - index,
      timeLabel: 'Live board',
      href: `/scores${week ? `?week=${week}` : ''}`,
    });
  }

  return notifications;
}

export function parseNotificationsPageState(input: {
  transactions: unknown;
  players: unknown;
  league: unknown;
  liveScoring: unknown | null;
  primaryFranchiseId: string | null;
}): NotificationsPageState {
  const fromTx = buildNotificationsFromTransactions(input.transactions, input.players, input.league);
  const fromScores = input.liveScoring
    ? buildScoreAlertNotifications(input.liveScoring, input.league, input.primaryFranchiseId)
    : [];

  const notifications = [...fromScores, ...fromTx]
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 80);

  return {
    ok: notifications.length > 0,
    message: notifications.length > 0
      ? 'In-app alerts from recent MFL activity. Push delivery stays draft/opt-in.'
      : 'No recent league activity to surface yet.',
    franchiseId: input.primaryFranchiseId,
    notifications,
    pushDraftAvailable: true,
  };
}

function transactionKey(entry: RecordValue): string {
  return [
    text(entry.type),
    text(entry.franchise),
    text(entry.franchise2),
    text(entry.timestamp),
    text(entry.transaction),
    text(entry.franchise1_gave_up),
    text(entry.franchise2_gave_up),
  ].join('|');
}

function mergeTransactionPayloads(...payloads: unknown[]): unknown {
  const seen = new Set<string>();
  const merged: RecordValue[] = [];
  for (const payload of payloads) {
    for (const entry of records(record(record(payload)?.transactions)?.transaction)) {
      const key = transactionKey(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(entry);
    }
  }
  return { transactions: { transaction: merged } };
}

export async function loadNotificationsPageState(sessionCookieValue: string | null): Promise<NotificationsPageState> {
  const options = { sessionCookieValue: sessionCookieValue ?? undefined, cache: 'no-store' as const };

  try {
    const [primary, leagueResponse, playersResponse, generalTxResponse, waiverTxResponse, tradeTxResponse, liveResponse] = await Promise.all([
      resolvePrimaryFranchiseId(sessionCookieValue),
      fetchMflExport('league', { JSON: '1' }, options),
      fetchMflExport('players', { JSON: '1' }, { revalidate: 60 * 60 * 24 }),
      fetchMflExport('transactions', { JSON: '1', COUNT: '60' }, options),
      fetchMflExport('transactions', { JSON: '1', TRANS_TYPE: 'BBID_WAIVER', COUNT: '30' }, options),
      fetchMflExport('transactions', { JSON: '1', TRANS_TYPE: 'TRADE', COUNT: '30' }, options),
      fetchMflExport('liveScoring', { JSON: '1' }, { ...options, revalidate: 75 }),
    ]);

    if (!leagueResponse.ok || !playersResponse.ok || !generalTxResponse.ok) {
      return {
        ok: false,
        message: 'Notifications could not be loaded from MFL.',
        franchiseId: primary?.franchiseId ?? null,
        notifications: [],
        pushDraftAvailable: true,
      };
    }

    const read = (response: Response) => (response.ok ? response.json().catch(() => null) : Promise.resolve(null));
    const [league, players, generalTx, waiverTx, tradeTx, liveScoring] = await Promise.all([
      read(leagueResponse),
      read(playersResponse),
      read(generalTxResponse),
      read(waiverTxResponse),
      read(tradeTxResponse),
      read(liveResponse),
    ]);

    return parseNotificationsPageState({
      transactions: mergeTransactionPayloads(generalTx, waiverTx, tradeTx),
      players,
      league,
      liveScoring,
      primaryFranchiseId: primary?.franchiseId ?? null,
    });
  } catch {
    return {
      ok: false,
      message: 'Notifications could not be loaded from MFL.',
      franchiseId: null,
      notifications: [],
      pushDraftAvailable: true,
    };
  }
}
