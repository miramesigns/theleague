import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <main className="grid matchup-detail-view" aria-busy="true" aria-live="polite">
      <div className="banner scores-banner">
        <div>
          <div className="eyebrow">Matchup detail</div>
          <Skeleton className="h-3.5 w-[min(280px,70vw)] rounded-full" />
        </div>
        <Skeleton className="h-9 w-[110px] rounded-full" />
      </div>

      <article className="panel section matchup-header skeleton-card">
        <Skeleton className="h-3.5 w-[180px] rounded-full" />
        <div className="matchup-scoreline">
          <Skeleton className="team-score-skeleton h-16 w-full rounded-[18px]" />
          <Skeleton className="h-3.5 w-[68px] rounded-full" />
          <Skeleton className="team-score-skeleton h-16 w-full rounded-[18px]" />
        </div>
      </article>

      <div className="matchup-columns">
        <Skeleton className="panel section skeleton-team-detail min-h-[180px] rounded-[22px]" />
        <Skeleton className="panel section skeleton-team-detail min-h-[180px] rounded-[22px]" />
      </div>
    </main>
  );
}
