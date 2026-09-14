import { NextResponse } from 'next/server.js';

import { MFL_SESSION_COOKIE_NAME } from '../../../../lib/mfl-session.ts';
import { getSessionCookieOptions } from '../login/session-cookie.ts';

export const dynamic = 'force-dynamic';

function publicOrigin(request: Request): string {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  if (!host || host.startsWith('0.0.0.0')) {
    return 'http://127.0.0.1:3017';
  }
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  return `${proto}://${host}`;
}

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/scores', publicOrigin(request)), 303);
  response.cookies.set(MFL_SESSION_COOKIE_NAME, '', {
    ...getSessionCookieOptions(),
    maxAge: 0,
  });
  return response;
}
