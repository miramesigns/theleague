export default function MorePage() {
  return (
    <main className="grid">
      <div className="banner">
        <div>
          <div className="eyebrow">More</div>
          <div className="small muted">Roster and standings.</div>
        </div>
        <span className="pill">Sign in from the header</span>
      </div>

      <section className="panel section">
        <div className="stack">
          <a className="button" href="/roster">Roster</a>
          <a className="button" href="/standings">Standings</a>
        </div>
      </section>
    </main>
  );
}
