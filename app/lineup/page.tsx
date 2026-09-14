import { LineupEditor } from '@/components/lineup-editor';
import { getMflSessionCookieValue } from '@/lib/mfl-session';
import { loadLineupPageState } from '@/lib/mfl-lineup';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function LineupPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<{ week?: string | string[] }> | { week?: string | string[] };
}>) {
  const params = await searchParams;
  const weekParam = Array.isArray(params?.week) ? params?.week[0] : params?.week ?? null;
  const sessionCookieValue = await getMflSessionCookieValue();
  const state = await loadLineupPageState(sessionCookieValue, weekParam);

  return <LineupEditor state={state} />;
}
