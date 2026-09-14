export default function Loading() {
  return (
    <main className="grid scores-view" aria-busy="true" aria-live="polite">
      <div className="banner scores-banner">
        <div>
          <div className="eyebrow">Scores</div>
          <div className="skeleton line" />
        </div>
        <div className="skeleton pill-skeleton" />
      </div>

      <div className="matchup-list">
        {Array.from({ length: 3 }).map((_, index) => (
          <article key={index} className="panel matchup-card skeleton-card">
            <div className="skeleton line short" />
            <div className="matchup-grid">
              <div className="team-card skeleton-team" />
              <div className="team-card skeleton-team" />
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
