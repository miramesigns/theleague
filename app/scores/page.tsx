import { ScoreBoard } from '@/components/score-board';
import { getMflSessionCookieValue } from '@/lib/mfl-session';
import { loadScoresPageState } from '@/lib/mfl-scores';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ScoresPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>> | Record<string, string | string[] | undefined>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ScoresPage({ searchParams }: ScoresPageProps) {
  const sessionCookieValue = await getMflSessionCookieValue();
  const params = (await Promise.resolve(searchParams)) || {};
  const { week } = params;
  const state = await loadScoresPageState(sessionCookieValue, first(week));

  return (
    <main>
      <ScoreBoard {...state} />
    </main>
  );
}
