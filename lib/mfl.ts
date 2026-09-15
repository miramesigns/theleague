import { MFL_SESSION_COOKIE_NAME } from './mfl-session-constants.ts';
import type { MflConfig } from './types.ts';

const defaults: MflConfig = {
  leagueId: '35743',
  year: '2026',
  host: 'www42.myfantasyleague.com',
  userAgent: 'PlugGrokBot',
};

export function getMflConfig(): MflConfig {
  return {
    leagueId: process.env.MFL_LEAGUE_ID?.trim() || defaults.leagueId,
    year: process.env.MFL_YEAR?.trim() || defaults.year,
    host: process.env.MFL_HOST?.trim() || defaults.host,
    userAgent: process.env.MFL_USER_AGENT?.trim() || defaults.userAgent,
  };
}

export function buildMflExportUrl(type: string, params: Record<string, string> = {}): URL {
  const config = getMflConfig();
  const url = new URL(`https://${config.host}/${config.year}/export`);
  url.searchParams.set('TYPE', type);
  url.searchParams.set('L', config.leagueId);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

export function buildMflSiteExportUrl(type: string, params: Record<string, string> = {}): URL {
  const config = getMflConfig();
  const url = new URL(`https://api.myfantasyleague.com/${config.year}/export`);
  url.searchParams.set('TYPE', type);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url;
}

export function buildMflLiveProjectionUrl(week: number): URL {
  const config = getMflConfig();
  const paddedWeek = String(week).padStart(2, '0');
  return new URL(`https://${config.host}/fflnetdynamic${config.year}/live_proj_${paddedWeek}.txt`);
}

export type FetchMflExportOptions = {
  sessionCookieValue?: string | null;
  cache?: RequestCache;
  revalidate?: number;
};

export async function fetchMflExport(
  type: string,
  params: Record<string, string> = {},
  options: FetchMflExportOptions = {},
) {
  const config = getMflConfig();
  const url = buildMflExportUrl(type, params);
  const headers = new Headers({
    'User-Agent': config.userAgent,
    Accept: 'application/xml, text/xml, text/plain, application/json;q=0.8, */*;q=0.2',
  });

  if (options.sessionCookieValue?.trim()) {
    headers.set('Cookie', `${MFL_SESSION_COOKIE_NAME}=${options.sessionCookieValue.trim()}`);
  }

  const init: RequestInit & { next?: { revalidate?: number } } = { headers };

  if (options.revalidate !== undefined) {
    init.next = { revalidate: options.revalidate };
  }

  if (options.cache) {
    init.cache = options.cache;
  } else if (options.revalidate === undefined) {
    init.cache = 'no-store';
  }

  return fetch(url, init);
}

export async function fetchMflSiteExport(
  type: string,
  params: Record<string, string> = {},
  options: FetchMflExportOptions = {},
) {
  const config = getMflConfig();
  const url = buildMflSiteExportUrl(type, params);
  const headers = new Headers({
    'User-Agent': config.userAgent,
    Accept: 'application/xml, text/xml, text/plain, application/json;q=0.8, */*;q=0.2',
  });

  if (options.sessionCookieValue?.trim()) {
    headers.set('Cookie', `${MFL_SESSION_COOKIE_NAME}=${options.sessionCookieValue.trim()}`);
  }

  const init: RequestInit & { next?: { revalidate?: number } } = { headers };

  if (options.revalidate !== undefined) {
    init.next = { revalidate: options.revalidate };
  }

  if (options.cache) {
    init.cache = options.cache;
  } else if (options.revalidate === undefined) {
    init.cache = 'no-store';
  }

  return fetch(url, init);
}

export async function fetchMflLiveProjections(week: number, options: FetchMflExportOptions = {}) {
  const config = getMflConfig();
  const headers = new Headers({
    'User-Agent': config.userAgent,
    Accept: 'text/plain, */*;q=0.5',
  });

  if (options.sessionCookieValue?.trim()) {
    headers.set('Cookie', `${MFL_SESSION_COOKIE_NAME}=${options.sessionCookieValue.trim()}`);
  }

  return fetch(buildMflLiveProjectionUrl(week), {
    headers,
    cache: options.cache ?? 'no-store',
  });
}
