"use client";

import { useCallback, useMemo, useSyncExternalStore } from 'react';

import type { LeagueNotification, NotificationsPageState } from '@/lib/mfl-notifications';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

const READ_KEY = 'mfl-companion-notification-reads';
const PREFS_KEY = 'mfl-companion-notification-prefs';

type Prefs = {
  scores: boolean;
  lineup: boolean;
  waiver: boolean;
  trade: boolean;
  league: boolean;
};

const defaultPrefs: Prefs = {
  scores: true,
  lineup: true,
  waiver: true,
  trade: true,
  league: true,
};

type NotificationStore = {
  readIds: string[];
  prefs: Prefs;
};

const listeners = new Set<() => void>();

/** Cached client snapshot — useSyncExternalStore requires referential stability when data is unchanged. */
let cachedSnapshot: NotificationStore = {
  readIds: [],
  prefs: defaultPrefs,
};
let cachedSignature = '';

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizePrefs(value: unknown): Prefs {
  if (!value || typeof value !== 'object') return defaultPrefs;
  const incoming = value as Partial<Prefs>;
  return {
    scores: incoming.scores !== false,
    lineup: incoming.lineup !== false,
    waiver: incoming.waiver !== false,
    trade: incoming.trade !== false,
    league: incoming.league !== false,
  };
}

function getStoreSnapshot(): NotificationStore {
  const storedReads = readJson<unknown>(READ_KEY, null);
  const readIds = Array.isArray(storedReads)
    ? storedReads.filter((id): id is string => typeof id === 'string').slice(-200)
    : [];
  const prefs = normalizePrefs(readJson<unknown>(PREFS_KEY, null));

  const signature = `${readIds.join('\0')}|${prefs.scores}|${prefs.lineup}|${prefs.waiver}|${prefs.trade}|${prefs.league}`;
  if (signature === cachedSignature) {
    return cachedSnapshot;
  }

  cachedSignature = signature;
  cachedSnapshot = { readIds, prefs };
  return cachedSnapshot;
}

const serverSnapshot: NotificationStore = {
  readIds: [],
  prefs: defaultPrefs,
};

function getServerSnapshot() {
  return serverSnapshot;
}

function writeReads(next: string[]) {
  window.localStorage.setItem(READ_KEY, JSON.stringify(next.slice(-200)));
  emit();
}

function writePrefs(next: Prefs) {
  window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  emit();
}

function categoryEnabled(prefs: Prefs, category: LeagueNotification['category']): boolean {
  if (category === 'score') return prefs.scores;
  if (category === 'lineup') return prefs.lineup;
  if (category === 'waiver') return prefs.waiver;
  if (category === 'trade') return prefs.trade;
  return prefs.league;
}

export function NotificationsCenter({ state }: { state: NotificationsPageState }) {
  const store = useSyncExternalStore(subscribe, getStoreSnapshot, getServerSnapshot);
  const { readIds, prefs } = store;

  const visible = useMemo(
    () => state.notifications.filter((entry) => categoryEnabled(prefs, entry.category)),
    [prefs, state.notifications],
  );

  const unreadCount = visible.filter((entry) => !readIds.includes(entry.id)).length;

  const markRead = useCallback((id: string) => {
    if (readIds.includes(id)) return;
    writeReads([...readIds, id]);
  }, [readIds]);

  const markAllRead = () => {
    writeReads([...new Set([...readIds, ...visible.map((entry) => entry.id)])]);
  };

  const updatePref = (key: keyof Prefs, value: boolean) => {
    writePrefs({ ...prefs, [key]: value });
  };

  return (
    <div className="stack notifications-center">
      <section className="panel section">
        <div className="row">
          <div>
            <h2 className="eyebrow">Alerts</h2>
            <div className="small muted">{unreadCount} unread · {visible.length} visible</div>
          </div>
          <Button type="button" variant="outline" onClick={markAllRead}>
            Mark all read
          </Button>
        </div>
        <div className="notification-prefs">
          {([
            ['scores', 'Scores'],
            ['lineup', 'Lineup locks'],
            ['waiver', 'Waivers'],
            ['trade', 'Trades'],
            ['league', 'League'],
          ] as const).map(([key, label]) => (
            <label key={key} className="pref-chip">
              <Switch
                checked={prefs[key]}
                onCheckedChange={(checked) => updatePref(key, checked)}
                aria-label={label}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="panel section">
        <h2 className="eyebrow">Notification center</h2>
        <div className="stack" style={{ marginTop: 10 }}>
          {visible.map((entry) => {
            const unread = !readIds.includes(entry.id);
            return (
              <a
                key={entry.id}
                href={entry.href}
                className={`notification-row${unread ? ' unread' : ''}`}
                onClick={() => markRead(entry.id)}
              >
                <div className="notification-row-top">
                  <strong>{entry.title}</strong>
                  <Badge variant="secondary">{entry.category}</Badge>
                </div>
                <div className="small">{entry.body}</div>
                <div className="small muted">{entry.timeLabel}</div>
              </a>
            );
          })}
          {visible.length === 0 ? (
            <p className="muted small">No alerts for the selected filters.</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
