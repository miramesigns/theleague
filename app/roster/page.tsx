import { mockRoster } from '@/lib/mock-data';

export default function RosterPage() {
  return (
    <main className="grid">
      <div className="banner">
        <div>
          <div className="eyebrow">Roster</div>
          <div className="small muted">Current sample roster and projections.</div>
        </div>
        <span className="pill">10-man core</span>
      </div>

      <section className="panel section">
        <table className="table">
          <thead>
            <tr>
              <th>Player</th>
              <th>Pos</th>
              <th>Team</th>
              <th>Proj</th>
            </tr>
          </thead>
          <tbody>
            {mockRoster.map((player) => (
              <tr key={player.id}>
                <td>{player.name}</td>
                <td>{player.pos}</td>
                <td>{player.team}</td>
                <td>{player.projection.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
