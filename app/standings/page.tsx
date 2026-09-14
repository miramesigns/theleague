const rows = [
  { team: 'Red Zone Riot', record: '8-1', pf: '1269.4' },
  { team: 'Gridiron Ghosts', record: '7-2', pf: '1233.8' },
  { team: 'Turbo Tundra', record: '6-3', pf: '1188.1' },
  { team: 'Sunday Sermons', record: '5-4', pf: '1140.6' },
];

export default function StandingsPage() {
  return (
    <main className="grid">
      <div className="banner">
        <div>
          <div className="eyebrow">Standings</div>
          <div className="small muted">Compact ladder view for the league table.</div>
        </div>
        <span className="pill">Top 4</span>
      </div>

      <section className="panel section">
        <table className="table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Record</th>
              <th>PF</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.team}>
                <td>{index + 1}. {row.team}</td>
                <td>{row.record}</td>
                <td>{row.pf}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
