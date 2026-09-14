import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MFL_LOGIN_USER_AGENT,
  attemptMflLogin,
  buildMflLoginBody,
  buildMflLoginUrl,
  buildMflHtmlLoginBody,
  buildMflHtmlLoginUrl,
  extractMflUserIdFromXml,
  normalizeSessionCookieValue,
  type MflFetchLike,
  type ResponseLike,
  extractMflSessionCookie,
} from '../lib/mfl-login.ts';
import { POST as submitLoginForm } from '../app/api/auth/login-form/route.ts';
import { POST as submitLogoutForm } from '../app/api/auth/logout/route.ts';
import { getSessionCookieOptions } from '../app/api/auth/login/session-cookie.ts';
import { hasSensitiveCredentialQueryKey } from '../app/more/query-cleanup.ts';
import { describeLoginAuthState } from '../lib/mfl-auth.ts';

const loginConfig = {
  leagueId: '35743',
  year: '2026',
  host: 'www42.myfantasyleague.com',
};

test('extractMflSessionCookie reads a dedicated getSetCookie header list', () => {
  const headers = {
    get: () => null,
    getSetCookie: () => ['OTHER=value; Path=/', 'MFL_USER_ID=session-token-123; Path=/; HttpOnly'],
  };

  assert.equal(extractMflSessionCookie(headers), 'session-token-123');
});

test('extractMflSessionCookie handles a combined set-cookie header', () => {
  const headers = {
    get: (name: string) => {
      if (name === 'set-cookie') {
        return 'OTHER=value; Path=/, MFL_USER_ID=session-token-456; Path=/; HttpOnly';
      }

      return null;
    },
  };

  assert.equal(extractMflSessionCookie(headers), 'session-token-456');
});

test('extractMflSessionCookie decodes URL-encoded cookie values', () => {
  const headers = {
    get: () => null,
    getSetCookie: () => ['MFL_USER_ID=abc%2Bxyz; Path=/'],
  };

  assert.equal(extractMflSessionCookie(headers), 'abc+xyz');
});

test('extractMflUserIdFromXml reads API status body', () => {
  assert.equal(
    extractMflUserIdFromXml('<?xml version="1.0"?><status MFL_USER_ID="tok+en">OK</status>'),
    'tok+en',
  );
});

test('normalizeSessionCookieValue leaves plain tokens alone', () => {
  assert.equal(normalizeSessionCookieValue('plain-token'), 'plain-token');
});

test('attemptMflLogin prefers API XML body when Set-Cookie is missing', async () => {
  const fetchMock: MflFetchLike = async (url) => {
    const href = String(url);
    if (href.includes('api.myfantasyleague.com')) {
      return {
        status: 200,
        headers: { get: () => null },
        text: async () => '<status MFL_USER_ID="xml-session-1">OK</status>',
      } as ResponseLike;
    }

    throw new Error(`unexpected url ${href}`);
  };

  const result = await attemptMflLogin(
    { username: 'demo-user', password: 'demo-pass' },
    fetchMock,
    1000,
    loginConfig,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.sessionCookieValue, 'xml-session-1');
  }
});

test('attemptMflLogin classifies a cookie-bearing upstream response as success', async () => {
  let capturedUrl: string | undefined;
  let capturedInit: RequestInit | undefined;

  const fetchMock: MflFetchLike = async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;

    return {
      status: 200,
      headers: {
        get: (name: string) => {
          if (name === 'set-cookie') {
            return 'MFL_USER_ID=session-token-789; Path=/; HttpOnly';
          }

          return null;
        },
      },
    } as ResponseLike;
  };

  const result = await attemptMflLogin(
    { username: 'demo-user', password: 'demo-pass' },
    fetchMock,
    1000,
    loginConfig,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.sessionCookieValue, 'session-token-789');
    assert.equal(result.upstreamStatus, 200);
  }
  assert.equal(capturedUrl, buildMflLoginUrl(loginConfig).toString());
  assert.equal(capturedInit?.method, 'POST');
  assert.equal(capturedInit?.redirect, 'manual');
  assert.equal(capturedInit?.headers && new Headers(capturedInit.headers).get('User-Agent'), MFL_LOGIN_USER_AGENT);
  assert.equal(capturedInit?.headers && new Headers(capturedInit.headers).get('Content-Type'), 'application/x-www-form-urlencoded');
  assert.equal(capturedInit?.body, buildMflLoginBody({ username: 'demo-user', password: 'demo-pass' }, loginConfig));
});

test('attemptMflLogin falls back to HTML host login', async () => {
  const fetchMock: MflFetchLike = async (url) => {
    const href = String(url);
    if (href.includes('api.myfantasyleague.com')) {
      return {
        status: 200,
        headers: { get: () => null },
        text: async () => '<status>ERROR</status>',
      } as ResponseLike;
    }

    if (href.includes('www42.myfantasyleague.com')) {
      return {
        status: 302,
        headers: {
          get: () => null,
          getSetCookie: () => ['MFL_USER_ID=html-session; Path=/'],
        },
      } as ResponseLike;
    }

    throw new Error(`unexpected url ${href}`);
  };

  const result = await attemptMflLogin(
    { username: 'demo-user', password: 'demo-pass' },
    fetchMock,
    1000,
    loginConfig,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.sessionCookieValue, 'html-session');
  }
});

test('attemptMflLogin maps a 200 response without a cookie to invalid login', async () => {
  const fetchMock: MflFetchLike = async () => ({
    status: 200,
    headers: {
      get: () => null,
    },
    text: async () => '<status>ERROR</status>',
  } as ResponseLike);

  const result = await attemptMflLogin(
    { username: 'demo-user', password: 'demo-pass' },
    fetchMock,
    1000,
    loginConfig,
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.kind, 'invalid-login');
    assert.equal(result.status, 401);
  }
});

test('attemptMflLogin maps upstream failures to 502', async () => {
  const fetchMock: MflFetchLike = async () => ({
    status: 503,
    headers: {
      get: () => null,
    },
    text: async () => '',
  } as ResponseLike);

  const result = await attemptMflLogin(
    { username: 'demo-user', password: 'demo-pass' },
    fetchMock,
    1000,
    loginConfig,
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.kind, 'upstream-failure');
    assert.equal(result.status, 502);
  }
});

test('buildMflLoginBody uses API XML fields', () => {
  const params = new URLSearchParams(
    buildMflLoginBody({ username: 'demo-user', password: 'demo-pass' }, loginConfig),
  );

  assert.equal(params.get('USERNAME'), 'demo-user');
  assert.equal(params.get('PASSWORD'), 'demo-pass');
  assert.equal(params.get('XML'), '1');
  assert.equal(params.get('LEAGUE_ID'), loginConfig.leagueId);
});

test('buildMflHtmlLoginBody keeps the HTML form fields', () => {
  const params = new URLSearchParams(
    buildMflHtmlLoginBody({ username: 'demo-user', password: 'demo-pass' }, loginConfig),
  );

  assert.equal(params.get('REMEMBER'), 'No');
  assert.equal(params.get('URL'), `https://${loginConfig.host}/${loginConfig.year}`);
  assert.equal(buildMflHtmlLoginUrl(loginConfig).toString(), `https://${loginConfig.host}/${loginConfig.year}/login`);
});

test('getSessionCookieOptions stays non-secure for local HTTP by default', () => {
  const original = { ...process.env };
  const env = process.env as Record<string, string | undefined>;
  try {
    env.NODE_ENV = 'production';
    delete env.VERCEL;
    delete env.MFL_COOKIE_SECURE;
    delete env.MFL_FORCE_SECURE_COOKIES;
    assert.equal(getSessionCookieOptions().secure, false);

    env.MFL_COOKIE_SECURE = 'true';
    assert.equal(getSessionCookieOptions().secure, true);
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in original)) delete env[key];
    }
    Object.assign(process.env, original);
  }
});

test('hasSensitiveCredentialQueryKey matches credential-like query keys', () => {
  assert.equal(hasSensitiveCredentialQueryKey(new URLSearchParams('username=demo-user')), true);
  assert.equal(hasSensitiveCredentialQueryKey(new URLSearchParams('password=demo-pass')), true);
  assert.equal(hasSensitiveCredentialQueryKey(new URLSearchParams('returnTo=/more')), false);
});

test('describeLoginAuthState uses safe banner copy and keeps the modal open on failures', () => {
  const success = describeLoginAuthState('ok');
  assert.equal(success?.banner?.title, 'Sign in successful.');
  assert.equal(success?.openModal, false);

  const invalid = describeLoginAuthState('invalid');
  assert.equal(invalid?.banner?.title, 'Login was not successful.');
  assert.equal(invalid?.banner?.detail, 'Invalid credentials or MFL access could not be verified.');
  assert.equal(invalid?.openModal, true);

  const missing = describeLoginAuthState('missing');
  assert.equal(missing?.banner?.title, 'Login was not successful.');
  assert.equal(missing?.banner?.detail, 'Please enter both fields to continue.');
  assert.equal(missing?.openModal, true);
  assert.equal(JSON.stringify(missing).includes('password'), false);
});

test('logout form clears the companion-only MFL session and returns to scores', async () => {
  const response = await submitLogoutForm(new Request('http://10.0.0.9:3017/api/auth/logout', {
    method: 'POST',
    headers: { host: '10.0.0.9:3017' },
  }));

  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), 'http://10.0.0.9:3017/scores');
  const cookie = response.headers.get('set-cookie') ?? '';
  assert.match(cookie, /MFL_USER_ID=/);
  assert.match(cookie, /Max-Age=0/i);
});

test('login form POST redirects to scores with safe auth states and stores the session cookie', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url) => {
    const href = String(url);

    if (href.includes('api.myfantasyleague.com')) {
      return {
        status: 200,
        headers: {
          get: (name: string) => (name === 'set-cookie' ? 'MFL_USER_ID=session-token-123; Path=/; HttpOnly' : null),
        },
      } as ResponseLike;
    }

    throw new Error(`unexpected url ${href}`);
  }) as typeof fetch;

  try {
    const makeLoginRequest = (username: string, password: string) => new Request('https://example.com/api/auth/login-form', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password }),
    });

    const okResponse = await submitLoginForm(makeLoginRequest('demo-user', 'demo-pass'));
    assert.equal(okResponse.status, 303);
    assert.match(okResponse.headers.get('location') ?? '', /\/scores\?auth=ok$/);
    assert.match(okResponse.headers.get('set-cookie') ?? '', /MFL_USER_ID=session-token-123/);
    assert.match(okResponse.headers.get('set-cookie') ?? '', /HttpOnly/i);

    const missingResponse = await submitLoginForm(makeLoginRequest('', ''));
    assert.equal(missingResponse.status, 303);
    assert.match(missingResponse.headers.get('location') ?? '', /\/scores\?auth=missing$/);

    globalThis.fetch = (async () => new Response('<status>ERROR</status>', { status: 200 })) as typeof fetch;

    const invalidResponse = await submitLoginForm(makeLoginRequest('demo-user', 'demo-pass'));
    assert.equal(invalidResponse.status, 303);
    assert.match(invalidResponse.headers.get('location') ?? '', /\/scores\?auth=invalid$/);

    globalThis.fetch = (async () => new Response('', { status: 503 })) as typeof fetch;

    const unavailableResponse = await submitLoginForm(makeLoginRequest('demo-user', 'demo-pass'));
    assert.equal(unavailableResponse.status, 303);
    assert.match(unavailableResponse.headers.get('location') ?? '', /\/scores\?auth=unavailable$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
