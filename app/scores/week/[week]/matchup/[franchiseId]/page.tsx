import { MatchupDetail } from '@/components/matchup-detail';
import { getMflSessionCookieValue } from '@/lib/mfl-session';
import { loadMatchupDetailState } from '@/lib/mfl-scores';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type MatchupPageProps = {
  params?: Promise<{ week?: string; franchiseId?: string }> | { week?: string; franchiseId?: string };
};

export default async function MatchupPage({ params }: MatchupPageProps) {
  const sessionCookieValue = await getMflSessionCookieValue();
  const resolvedParams = (await Promise.resolve(params)) || {};
  const state = await loadMatchupDetailState(sessionCookieValue, resolvedParams.week, resolvedParams.franchiseId);

  return (
    <main>
      <MatchupDetail {...state} />
    </main>
  );
}
