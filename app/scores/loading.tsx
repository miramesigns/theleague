import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main className="grid scores-view" aria-busy="true" aria-live="polite">
      <div className="banner scores-banner">
        <div>
          <div className="eyebrow">Scores</div>
          <Skeleton className="h-3.5 w-[min(280px,70vw)] rounded-full" />
        </div>
        <Skeleton className="h-9 w-[110px] rounded-full" />
      </div>

      <div className="matchup-list">
        {Array.from({ length: 3 }).map((_, index) => (
          <article key={index} className="panel matchup-card skeleton-card">
            <Skeleton className="h-3.5 w-[180px] rounded-full" />
            <div className="matchup-grid">
              <Skeleton className="team-card skeleton-team h-full min-h-[72px] rounded-[18px]" />
              <Skeleton className="team-card skeleton-team h-full min-h-[72px] rounded-[18px]" />
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
