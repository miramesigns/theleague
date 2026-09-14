export default function TradesPage() {
  return (
    <main className="grid">
      <div className="banner">
        <div>
          <div className="eyebrow">Trades</div>
          <div className="small muted">Offer board and acceptance flow placeholder.</div>
        </div>
        <span className="pill">Negotiation lane</span>
      </div>

      <section className="panel section">
        <div className="stack">
          <div className="stat-row"><span>Pending offers</span><strong>2</strong></div>
          <div className="stat-row"><span>Last counter</span><strong>RB + WR</strong></div>
          <div className="stat-row"><span>Review window</span><strong>24h</strong></div>
        </div>
      </section>
    </main>
  );
}
