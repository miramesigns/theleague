export default function Loading() {
  return (
    <main className="grid matchup-detail-view" aria-busy="true" aria-live="polite">
      <div className="banner scores-banner">
        <div>
          <div className="eyebrow">Matchup detail</div>
          <div className="skeleton line" />
        </div>
        <div className="skeleton pill-skeleton" />
      </div>

      <article className="panel section matchup-header skeleton-card">
        <div className="skeleton line short" />
        <div className="matchup-scoreline">
          <div className="skeleton team-score-skeleton" />
          <div className="skeleton line tiny" />
          <div className="skeleton team-score-skeleton" />
        </div>
      </article>

      <div className="matchup-columns">
        <div className="panel section skeleton-team-detail" />
        <div className="panel section skeleton-team-detail" />
      </div>
    </main>
  );
}
