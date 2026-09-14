import { NextResponse } from 'next/server.js';

import { fetchMflExport } from '@/lib/mfl';
import { getMflSessionCookieValue } from '@/lib/mfl-session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'liveScoring';
  const params: Record<string, string> = {};

  for (const [key, value] of url.searchParams.entries()) {
    if (key !== 'type') {
      params[key] = value;
    }
  }

  const sessionCookieValue = await getMflSessionCookieValue();
  const upstream = await fetchMflExport(type, params, { sessionCookieValue, cache: 'no-store' });
  const body = await upstream.text();

  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      'X-MFL-Proxy': 'server-only',
    },
  });
}
