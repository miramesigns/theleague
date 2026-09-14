import { getMflSessionCookieValue } from '@/lib/mfl-session';
import { formatRosterSalary, loadRosterPageState } from '@/lib/mfl-roster';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function display(value: string | number | null): string {
  return value === null ? 'Unavailable' : String(value);
}

export default async function RosterPage() {
  const state = await loadRosterPageState(await getMflSessionCookieValue());

  return (
    <main className="grid roster-view">
      <div className="banner">
        <div>
          <div className="eyebrow">Roster</div>
          <div className="small muted">{state.franchiseName ?? 'Authenticated MFL owner roster'}</div>
        </div>
        <span className="pill">{state.rows.length} players</span>
      </div>

      {!state.ok ? <section className="panel section"><p className="muted">{state.message}</p></section> : (
      <section className="panel section roster-panel">
        <div className="roster-scroll">
        <table className="table roster-table">
          <thead>
            <tr>
              <th>Player</th>
              <th>NFL</th>
              <th>YTD</th>
              <th>Bye</th>
              <th>Salary</th>
              <th>Contract</th>
            </tr>
          </thead>
          <tbody>
            {state.rows.map((player) => (
              <tr key={player.id}>
                <td data-label="Player"><strong>{player.name}</strong><span className="roster-status">{player.status}</span></td>
                <td data-label="NFL">{display(player.team)} / {display(player.position)}</td>
                <td data-label="YTD">{display(player.ytdPoints)}</td>
                <td data-label="Bye">{display(player.byeWeek)}</td>
                <td data-label="Salary">{formatRosterSalary(player.salary)}</td>
                <td data-label="Contract">{display(player.contractYear)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="roster-compact-list" aria-label="Compact roster list">
          {state.rows.map((player) => (
            <div key={player.id} className="roster-compact-row">
              <div className="roster-compact-main">
                <strong>{player.name}</strong>
                <span><strong>{display(player.team)} · {display(player.position)}</strong></span>
              </div>
              <div className="roster-compact-metrics">
                <span>YTD {display(player.ytdPoints)}</span>
                <span>Bye {display(player.byeWeek)}</span>
                <span>Salary {formatRosterSalary(player.salary)}</span>
                <span>Contract {display(player.contractYear)}</span>
              </div>
            </div>
          ))}
        </div>
        </div>
        <footer className="roster-footer">
          <span>{state.summary.rosterCount} rostered</span>
          <span>YTD total: {display(state.summary.ytdPoints)}</span>
          <span>Salary total: {formatRosterSalary(state.summary.salary)}</span>
        </footer>
      </section>
      )}
    </main>
  );
}
