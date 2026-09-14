export const MFL_LOGIN_USER_AGENT = 'PlugGrokBot' as const;
export const MFL_LOGIN_TIMEOUT_MS = 12000;

export type MflLoginConfig = {
  leagueId: string;
  year: string;
  host: string;
};

const defaultMflLoginConfig: MflLoginConfig = {
  leagueId: '35743',
  year: '2026',
  host: 'www42.myfantasyleague.com',
};

export type MflLoginCredentials = {
  username: string;
  password: string;
};

export type MflLoginResult =
  | {
      ok: true;
      sessionCookieValue: string;
      upstreamStatus: number;
    }
  | {
      ok: false;
      status: 400 | 401 | 502;
      kind: 'invalid-request' | 'invalid-login' | 'upstream-failure';
    };

export type HeaderSource = {
  get(name: string): string | null;
  getSetCookie?: () => string[];
};

export type ResponseLike = {
  status: number;
  headers: HeaderSource;
  text?: () => Promise<string>;
};

export type MflFetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<ResponseLike>;

function trimOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function splitSetCookieHeader(headerValue: string): string[] {
  return headerValue
    .split(/,\s*(?=[^;,=\s]+=[^;,]+)/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function collectSetCookieHeaders(headers: HeaderSource): string[] {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie().map((value) => value.trim()).filter(Boolean);
  }

  const header = headers.get('set-cookie');
  return header ? splitSetCookieHeader(header) : [];
}

export function extractCookieValue(setCookieHeader: string, cookieName: string): string | null {
  const [pair] = setCookieHeader.split(';', 1);
  const equalsIndex = pair.indexOf('=');
  if (equalsIndex <= 0) {
    return null;
  }

  const name = pair.slice(0, equalsIndex).trim();
  if (name !== cookieName) {
    return null;
  }

  const value = pair.slice(equalsIndex + 1).trim();
  return value ? normalizeSessionCookieValue(value) : null;
}

/** Decode URL-encoded cookie values MFL sometimes returns (%2B, etc.). */
export function normalizeSessionCookieValue(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function extractMflSessionCookie(headers: HeaderSource): string | null {
  for (const header of collectSetCookieHeaders(headers)) {
    const value = extractCookieValue(header, 'MFL_USER_ID');
    if (value) {
      return value;
    }
  }

  return null;
}

/** Parse <status MFL_USER_ID="...">OK</status> from the official API login. */
export function extractMflUserIdFromXml(body: string): string | null {
  const match = body.match(/MFL_USER_ID\s*=\s*"([^"]+)"/i) || body.match(/MFL_USER_ID\s*=\s*'([^']+)'/i);
  if (!match?.[1]) {
    return null;
  }
  return normalizeSessionCookieValue(match[1]);
}

export function buildMflLoginBody(
  credentials: MflLoginCredentials,
  config: MflLoginConfig = defaultMflLoginConfig,
): string {
  const body = new URLSearchParams();
  body.set('USERNAME', credentials.username);
  body.set('PASSWORD', credentials.password);
  body.set('XML', '1');
  body.set('LEAGUE_ID', config.leagueId);
  return body.toString();
}

/** Prefer the official API host; HTML wwwN login is a fallback. */
export function buildMflLoginUrl(config: MflLoginConfig = defaultMflLoginConfig): URL {
  return new URL(`https://api.myfantasyleague.com/${config.year}/login`);
}

export function buildMflHtmlLoginUrl(config: MflLoginConfig = defaultMflLoginConfig): URL {
  return new URL(`https://${config.host}/${config.year}/login`);
}

export function buildMflHtmlLoginBody(
  credentials: MflLoginCredentials,
  config: MflLoginConfig = defaultMflLoginConfig,
): string {
  const body = new URLSearchParams();
  body.set('USERNAME', credentials.username);
  body.set('PASSWORD', credentials.password);
  body.set('REMEMBER', 'No');
  body.set('LEAGUE_ID', config.leagueId);
  body.set('URL', `https://${config.host}/${config.year}`);
  return body.toString();
}

function toLoginPayload(value: unknown): MflLoginCredentials | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const username = trimOrNull(record.username ?? record.userId ?? record.USERNAME);
  const password = trimOrNull(record.password ?? record.PASSWORD);

  if (!username || !password) {
    return null;
  }

  return { username, password };
}

export async function readMflLoginCredentials(request: Request): Promise<MflLoginCredentials | null> {
  const contentType = request.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = (await request.json().catch(() => null)) as unknown;
    return toLoginPayload(payload);
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return null;
    }

    return toLoginPayload(Object.fromEntries(formData.entries()));
  }

  return null;
}

async function readResponseSession(
  response: ResponseLike,
): Promise<string | null> {
  const fromCookie = extractMflSessionCookie(response.headers as HeaderSource);
  if (fromCookie) {
    return fromCookie;
  }

  if (typeof response.text === 'function') {
    const body = await response.text();
    return extractMflUserIdFromXml(body);
  }

  return null;
}

export async function attemptMflLogin(
  credentials: MflLoginCredentials,
  fetchImpl: MflFetchLike = fetch as MflFetchLike,
  timeoutMs: number = MFL_LOGIN_TIMEOUT_MS,
  config: MflLoginConfig = defaultMflLoginConfig,
): Promise<MflLoginResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // 1) Official API XML login (cookie and/or XML body)
    const apiResponse = await fetchImpl(buildMflLoginUrl(config), {
      method: 'POST',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': MFL_LOGIN_USER_AGENT,
      },
      body: buildMflLoginBody(credentials, config),
    });

    const apiSession = await readResponseSession(apiResponse);
    if (apiSession) {
      return {
        ok: true,
        sessionCookieValue: apiSession,
        upstreamStatus: apiResponse.status,
      };
    }

    // 2) Fallback: HTML form on league host
    const htmlResponse = await fetchImpl(buildMflHtmlLoginUrl(config), {
      method: 'POST',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': MFL_LOGIN_USER_AGENT,
      },
      body: buildMflHtmlLoginBody(credentials, config),
    });

    const htmlSession = await readResponseSession(htmlResponse);
    if (htmlSession) {
      return {
        ok: true,
        sessionCookieValue: htmlSession,
        upstreamStatus: htmlResponse.status,
      };
    }

    if (apiResponse.status >= 500 || htmlResponse.status >= 500) {
      return {
        ok: false,
        status: 502,
        kind: 'upstream-failure',
      };
    }

    return {
      ok: false,
      status: 401,
      kind: 'invalid-login',
    };
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : null;
    console.error('[mfl-login] upstream request failed', {
      name: error instanceof Error ? error.name : 'unknown',
      message: error instanceof Error ? error.message : 'unknown',
      cause: cause ? { name: cause.name, message: cause.message } : undefined,
    });
    return {
      ok: false,
      status: 502,
      kind: 'upstream-failure',
    };
  } finally {
    clearTimeout(timeout);
  }
}
