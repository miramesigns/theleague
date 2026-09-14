import { NextResponse } from 'next/server.js';

import { getMflConfig } from '../../../../lib/mfl.ts';
import { attemptMflLogin, readMflLoginCredentials } from '../../../../lib/mfl-login.ts';
import { MFL_SESSION_COOKIE_NAME } from '../../../../lib/mfl-session.ts';
import { getSessionCookieOptions } from './session-cookie.ts';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const credentials = await readMflLoginCredentials(request);
  if (!credentials) {
    return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 });
  }

  const result = await attemptMflLogin(credentials, undefined, undefined, getMflConfig());
  if (!result.ok) {
    console.warn('[auth/login] failed', { kind: result.kind, status: result.status });
    return NextResponse.json(
      { ok: false, message: result.kind === 'invalid-login' ? 'Invalid login.' : 'Login service unavailable.' },
      { status: result.status }
    );
  }

  const response = NextResponse.json({
    ok: true,
    message: 'Login successful.',
  });

  try {
    response.cookies.set(MFL_SESSION_COOKIE_NAME, result.sessionCookieValue, getSessionCookieOptions());
  } catch {
    console.error('[auth/login] cookie set failed');
    return NextResponse.json(
      { ok: false, message: 'Login succeeded upstream but the session cookie could not be stored.' },
      { status: 500 },
    );
  }

  console.info('[auth/login] ok', { upstreamStatus: result.upstreamStatus });
  return response;
}
