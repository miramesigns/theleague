"use client";

import { useCallback, useMemo, useSyncExternalStore } from 'react';

import type { LeagueNotification, NotificationsPageState } from '@/lib/mfl-notifications';

const READ_KEY = 'mfl-companion-notification-reads';
const PREFS_KEY = 'mfl-companion-notification-prefs';
const PUSH_DRAFT_KEY = 'mfl-companion-push-draft';

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
  pushStatus: string;
};

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
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

function getStoreSnapshot(): NotificationStore {
  const storedReads = readJson<unknown>(READ_KEY, []);
  const readIds = Array.isArray(storedReads) ? storedReads.filter((id): id is string => typeof id === 'string') : [];
  const storedPrefs = readJson<Partial<Prefs> | null>(PREFS_KEY, null);
  const prefs = storedPrefs ? { ...defaultPrefs, ...storedPrefs } : defaultPrefs;
  const draft = typeof window === 'undefined' ? null : window.localStorage.getItem(PUSH_DRAFT_KEY);
  return {
    readIds,
    prefs,
    pushStatus: draft
      ? 'Web Push preference drafted locally. Outbound delivery remains gated.'
      : 'Push stays draft/opt-in. No paid vendor.',
  };
}

const serverSnapshot: NotificationStore = {
  readIds: [],
  prefs: defaultPrefs,
  pushStatus: 'Push stays draft/opt-in. No paid vendor.',
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

function writePushDraft(prefs: Prefs) {
  window.localStorage.setItem(PUSH_DRAFT_KEY, JSON.stringify({
    optedInAt: new Date().toISOString(),
    prefs,
    note: 'Draft only — no push endpoint is registered to a paid vendor or remote sender yet.',
  }));
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
  const { readIds, prefs, pushStatus } = store;

  const visible = useMemo(
    () => state.notifications.filter((entry) => categoryEnabled(prefs, entry.category)),
    [prefs, state.notifications],
  );

  const unreadCount = visible.filter((entry) => !readIds.includes(entry.id)).length;

  const markRead = useCallback((id: string) => {
    const next = readIds.includes(id) ? readIds : [...readIds, id];
    writeReads(next);
  }, [readIds]);

  const markAllRead = () => {
    writeReads([...new Set([...readIds, ...visible.map((entry) => entry.id)])]);
  };

  const updatePref = (key: keyof Prefs, value: boolean) => {
    writePrefs({ ...prefs, [key]: value });
  };

  const draftPushOptIn = async () => {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        writePushDraft(prefs);
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        window.localStorage.setItem(PUSH_DRAFT_KEY, JSON.stringify({
          optedInAt: null,
          denied: true,
          prefs,
        }));
        emit();
        return;
      }

      writePushDraft(prefs);
    } catch {
      // Keep in-app center usable even if permission APIs throw.
    }
  };

  return (
    <div className="stack notifications-center">
      <section className="panel section">
        <div className="row">
          <div>
            <h2 className="eyebrow">Alerts</h2>
            <div className="small muted">{unreadCount} unread · {visible.length} visible</div>
          </div>
          <button type="button" className="button ghost" onClick={markAllRead}>Mark all read</button>
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
              <input type="checkbox" checked={prefs[key]} onChange={(event) => updatePref(key, event.target.checked)} />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className="panel section">
        <h2 className="eyebrow">Web Push (optional draft)</h2>
        <p className="small muted" style={{ marginTop: 8 }}>{pushStatus}</p>
        <div className="actions" style={{ marginTop: 12 }}>
          <button type="button" className="button primary" onClick={draftPushOptIn} disabled={!state.pushDraftAvailable}>
            Draft opt-in
          </button>
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
                  <span className="pill">{entry.category}</span>
                </div>
                <div className="small">{entry.body}</div>
                <div className="small muted">{entry.timeLabel}</div>
              </a>
            );
          })}
          {visible.length === 0 ? <p className="muted small">No alerts for the selected filters.</p> : null}
        </div>
      </section>
    </div>
  );
}
