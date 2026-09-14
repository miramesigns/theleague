"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { getMflConfig } from "@/lib/mfl";
import { attemptMflLogin } from "@/lib/mfl-login";
import { buildLoginRedirectPath } from "@/lib/mfl-auth";
import { MFL_SESSION_COOKIE_NAME } from "@/lib/mfl-session";
import { getSessionCookieOptions } from "@/app/api/auth/login/session-cookie";

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    redirect(buildLoginRedirectPath('missing'));
  }

  const result = await attemptMflLogin(
    { username, password },
    undefined,
    undefined,
    getMflConfig(),
  );

  if (!result.ok) {
    redirect(result.kind === "invalid-login" ? buildLoginRedirectPath('invalid') : buildLoginRedirectPath('unavailable'));
  }

  const jar = await cookies();
  try {
    jar.set(MFL_SESSION_COOKIE_NAME, result.sessionCookieValue, getSessionCookieOptions());
  } catch {
    redirect(buildLoginRedirectPath('cookie'));
  }

  redirect(buildLoginRedirectPath('ok'));
}
