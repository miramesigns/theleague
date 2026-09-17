"use client";

import { useCallback, useEffect, useState } from 'react';

const CATEGORIES = [
  { key: 'scores' as const, label: 'Scores' },
  { key: 'lineup' as const, label: 'Lineup' },
  { key: 'waiver' as const, label: 'Waivers' },
  { key: 'trade' as const, label: 'Trades' },
  { key: 'league' as const, label: 'League' },
];

export function PushSubscribe() {
  const [supported] = useState<boolean>(() =>
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window,
  );
  const [permission, setPermission] = useState<NotificationPermission | 'default'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default',
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CATEGORIES.map((c) => [c.key, true])),
  );

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setSubscribed(Boolean(sub));
      });
    });
  }, [supported]);

  const registerSW = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    return reg;
  }, []);

  const subscribe = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      const reg = await registerSW();
      if (!reg) {
        setError('Push is not supported in this browser.');
        return;
      }

      const res = await fetch('/api/push/vapid-public-key');
      const { publicKey } = (await res.json().catch(() => ({}))) as { publicKey?: string };
      if (!publicKey) {
        setError('Push is not configured.');
        return;
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
      });

      const selectedCategories = CATEGORIES.filter((c) => categories[c.key]).map((c) => c.key);

      const r = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          expirationTime: sub.expirationTime,
          keys: {
            p256dh: arrayBufferToBase64(sub.getKey('p256dh')!),
            auth: arrayBufferToBase64(sub.getKey('auth')!),
          },
          categories: selectedCategories,
        }),
      });

      if (!r.ok) {
        const data = (await r.json().catch(() => null)) as { message?: string } | null;
        setError(data?.message || 'Subscribe failed.');
        await sub.unsubscribe();
        return;
      }

      setSubscribed(true);
      setPermission('granted');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Subscribe failed.');
    } finally {
      setBusy(false);
    }
  }, [registerSW, categories]);

  const unsubscribe = useCallback(async () => {
    setError('');
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unsubscribe failed.');
    } finally {
      setBusy(false);
    }
  }, []);

  if (supported === false) {
    return <p className="small muted">Push notifications are not supported in this browser.</p>;
  }

  return (
    <div className="stack">
      <div className="row">
        <div>
          <div className="eyebrow">Push notifications</div>
          <div className="small muted">
            Pushes mirror MFL email-style events (trade proposals/results, waivers, IR/taxi, lineup locks, and optional scores) when you are subscribed.
          </div>
        </div>
        {subscribed ? (
          <button type="button" className="button ghost" onClick={unsubscribe} disabled={busy}>
            {busy ? 'Working…' : 'Disable push'}
          </button>
        ) : (
          <button type="button" className="button primary" onClick={subscribe} disabled={busy || permission === 'denied'}>
            {busy ? 'Working…' : 'Enable push'}
          </button>
        )}
      </div>

      {permission === 'denied' ? (
        <p className="small muted">Notification permission was denied. Re-enable it in browser settings to use push.</p>
      ) : null}

      {subscribed ? (
        <div className="stack">
          <p className="small muted">You are subscribed. Choose categories:</p>
          <div className="push-categories">
            {CATEGORIES.map((c) => (
              <label key={c.key} className="push-category">
                <input
                  type="checkbox"
                  checked={categories[c.key]}
                  onChange={(e) => setCategories((prev) => ({ ...prev, [c.key]: e.target.checked }))}
                  disabled={busy}
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
          <p className="small muted">
            Changes apply on next subscribe. To update categories, disable and re-enable push.
          </p>
        </div>
      ) : null}

      {error ? <p className="small" style={{ color: 'var(--danger)' }}>{error}</p> : null}

      <p className="small muted">
        iPhone: add this site to your Home Screen for reliable Web Push on iOS. Desktop browsers work after Enable push.
      </p>
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
