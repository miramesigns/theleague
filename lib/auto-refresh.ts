export const AUTO_REFRESH_INTERVAL_MS = 60_000;
export const AUTO_REFRESH_MINIMUM_MS = 15_000;

type RefreshTimer = number;

export type AutoRefreshOptions = {
  refresh: () => void;
  now: () => number;
  isVisible: () => boolean;
  setInterval: (callback: () => void, delay: number) => RefreshTimer;
  clearInterval: (timer: RefreshTimer) => void;
  subscribeVisibility: (callback: () => void) => () => void;
  subscribeFocus: (callback: () => void) => () => void;
  intervalMs?: number;
  minimumMs?: number;
};

export function createAutoRefreshController(options: AutoRefreshOptions) {
  const intervalMs = options.intervalMs ?? AUTO_REFRESH_INTERVAL_MS;
  const minimumMs = options.minimumMs ?? AUTO_REFRESH_MINIMUM_MS;
  let lastRefreshAt = options.now();
  let timer: RefreshTimer | null = null;
  let unsubscribeVisibility: (() => void) | null = null;
  let unsubscribeFocus: (() => void) | null = null;

  const refreshIfDue = () => {
    if (!options.isVisible() || options.now() - lastRefreshAt < minimumMs) return;
    refreshNow();
  };

  const intervalRefresh = () => {
    if (!options.isVisible() || options.now() - lastRefreshAt < intervalMs) return;
    refreshNow();
  };

  function refreshNow() {
    lastRefreshAt = options.now();
    options.refresh();
  }

  return {
    start() {
      if (timer !== null) return;
      timer = options.setInterval(intervalRefresh, intervalMs);
      unsubscribeVisibility = options.subscribeVisibility(refreshIfDue);
      unsubscribeFocus = options.subscribeFocus(refreshIfDue);
    },
    stop() {
      if (timer === null) return;
      options.clearInterval(timer);
      timer = null;
      unsubscribeVisibility?.();
      unsubscribeVisibility = null;
      unsubscribeFocus?.();
      unsubscribeFocus = null;
    },
    refreshNow,
  };
}
