export function getSessionCookieOptions() {
  // LAN / local HTTP cannot use Secure cookies; enable only on HTTPS hosts (e.g. Vercel).
  const secure =
    process.env.MFL_COOKIE_SECURE === "true" ||
    process.env.VERCEL === "1" ||
    process.env.NODE_ENV === "production" && process.env.MFL_COOKIE_SECURE !== "false" && Boolean(process.env.MFL_FORCE_SECURE_COOKIES);

  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: Boolean(secure),
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  };
}
