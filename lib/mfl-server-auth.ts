import { attemptMflLogin } from './mfl-login.ts';
import { getMflConfig } from './mfl.ts';

/**
 * Server-side MFL login for background jobs (cron / GitHub Actions).
 * Uses MFL_USERNAME + MFL_PASSWORD. Never logs the password.
 */
export async function loginMflFromEnv(): Promise<
  | { ok: true; sessionCookieValue: string }
  | { ok: false; message: string; status: number }
> {
  const username = process.env.MFL_USERNAME?.trim();
  const password = process.env.MFL_PASSWORD?.trim();

  if (!username || !password) {
    return {
      ok: false,
      status: 503,
      message: 'MFL_USERNAME and MFL_PASSWORD must be configured for background push polling.',
    };
  }

  const config = getMflConfig();
  const result = await attemptMflLogin(
    { username, password },
    fetch,
    undefined,
    {
      leagueId: config.leagueId,
      year: config.year,
      host: config.host,
    },
  );

  if (!result.ok) {
    console.error('[mfl-server-auth] login failed', {
      kind: result.kind,
      status: result.status,
      username,
    });
    return {
      ok: false,
      status: result.status,
      message:
        result.kind === 'invalid-login'
          ? 'MFL server login failed (invalid credentials).'
          : 'MFL server login failed (upstream unavailable).',
    };
  }

  return { ok: true, sessionCookieValue: result.sessionCookieValue };
}
