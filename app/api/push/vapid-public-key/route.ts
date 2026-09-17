import { NextResponse } from 'next/server';
import { getVapidPublicKey } from '@/lib/push-subscription-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const key = getVapidPublicKey();
    return NextResponse.json({ publicKey: key });
  } catch {
    return NextResponse.json({ ok: false, message: 'Push is not configured.' }, { status: 503 });
  }
}
