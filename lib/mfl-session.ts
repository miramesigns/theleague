import { cookies } from 'next/headers.js';

import { MFL_SESSION_COOKIE_NAME } from './mfl-session-constants.ts';

export { MFL_SESSION_COOKIE_NAME } from './mfl-session-constants.ts';

export async function getMflSessionCookieValue(): Promise<string | null> {
  return (await cookies()).get(MFL_SESSION_COOKIE_NAME)?.value ?? null;
}
