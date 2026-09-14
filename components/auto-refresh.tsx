'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { createAutoRefreshController } from '@/lib/auto-refresh';

function formatRefreshTime(timestamp: number | null): string {
  return timestamp === null ? 'waiting for first refresh' : new Date(timestamp).toLocaleTimeString();
}

export function AutoRefresh() {
  const router = useRouter();
  const controller = useRef<ReturnType<typeof createAutoRefreshController> | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);

  useEffect(() => {
    const refresh = () => {
      router.refresh();
      setLastRefreshed(Date.now());
    };
    const nextController = createAutoRefreshController({
      refresh,
      now: Date.now,
      isVisible: () => document.visibilityState === 'visible',
      setInterval: (callback, delay) => window.setInterval(callback, delay),
      clearInterval: (timer) => window.clearInterval(timer),
      subscribeVisibility: (callback) => {
        document.addEventListener('visibilitychange', callback);
        return () => document.removeEventListener('visibilitychange', callback);
      },
      subscribeFocus: (callback) => {
        window.addEventListener('focus', callback);
        return () => window.removeEventListener('focus', callback);
      },
    });

    controller.current = nextController;
    const initialTimestamp = window.setTimeout(() => setLastRefreshed(Date.now()), 0);
    nextController.start();
    return () => {
      window.clearTimeout(initialTimestamp);
      nextController.stop();
      controller.current = null;
    };
  }, [router]);

  return (
    <div className="auto-refresh" aria-live="polite">
      <button type="button" className="button" onClick={() => controller.current?.refreshNow()}>
        Refresh
      </button>
      <span className="small muted">Auto-refreshes while open</span>
      <span className="small muted">Last refreshed: {formatRefreshTime(lastRefreshed)}</span>
    </div>
  );
}
