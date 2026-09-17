import { NextRequest, NextResponse } from 'next/server';

import {
  hasValidCronAuthorization,
  isCronPushPath,
  isPublicCompanionPath,
  unauthenticatedDestination,
} from './lib/access-control';
import { MFL_SESSION_COOKIE_NAME } from './lib/mfl-session-constants';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicCompanionPath(pathname) || request.cookies.has(MFL_SESSION_COOKIE_NAME)) {
    return NextResponse.next();
  }

  // Vercel cron / GitHub Actions call push poll|send with Bearer CRON_SECRET (no session cookie).
  if (isCronPushPath(pathname) && hasValidCronAuthorization(request.headers.get('authorization'))) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, message: 'Sign in required.' }, {
      status: 401,
      headers: { 'Cache-Control': 'private, no-store, max-age=0, must-revalidate' },
    });
  }

  return NextResponse.redirect(new URL(unauthenticatedDestination(pathname), request.url));
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image).*)',
  ],
};
