import { NextResponse } from "next/server.js";

import { getMflConfig } from '../../../../lib/mfl.ts';
import { attemptMflLogin } from '../../../../lib/mfl-login.ts';
import { buildLoginRedirectPath, type LoginAuthQuery } from '../../../../lib/mfl-auth.ts';
import { MFL_SESSION_COOKIE_NAME } from '../../../../lib/mfl-session.ts';
import { getSessionCookieOptions } from '../login/session-cookie.ts';

export const dynamic = "force-dynamic";

function publicOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!host || host.startsWith("0.0.0.0")) {
    return "http://127.0.0.1:3017";
  }
  const proto = request.headers.get("x-forwarded-proto") || "http";
  return proto + "://" + host;
}

function redirectToScores(request: Request, auth: Exclude<LoginAuthQuery, 'open'>) {
  return NextResponse.redirect(new URL(buildLoginRedirectPath(auth), publicOrigin(request)), 303);
}

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return redirectToScores(request, "missing");
  }

  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    return redirectToScores(request, "missing");
  }

  const result = await attemptMflLogin(
    { username, password },
    undefined,
    undefined,
    getMflConfig(),
  );

  if (!result.ok) {
    return redirectToScores(
      request,
      result.kind === "invalid-login" ? "invalid" : "unavailable",
    );
  }

  const response = redirectToScores(request, "ok");
  try {
    response.cookies.set(
      MFL_SESSION_COOKIE_NAME,
      result.sessionCookieValue,
      getSessionCookieOptions(),
    );
  } catch {
    console.error("[auth/login-form] cookie set failed");
    return redirectToScores(request, "cookie");
  }

  return response;
}
