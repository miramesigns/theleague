import { NextResponse } from 'next/server';

import { hasValidCronAuthorization } from '@/lib/access-control';
import { runPushPoll } from '@/lib/push-poll';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function handlePoll(request: Request) {
  if (!hasValidCronAuthorization(request.headers.get('authorization'))) {
    return NextResponse.json({ ok: false, message: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const result = await runPushPoll();
    const status = result.ok ? 200 : result.status ?? 500;
    return NextResponse.json(result, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Push poll failed.';
    console.error('[push/poll]', message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}

/** Vercel Cron uses GET; GitHub Actions may POST. */
export async function GET(request: Request) {
  return handlePoll(request);
}

export async function POST(request: Request) {
  return handlePoll(request);
}
