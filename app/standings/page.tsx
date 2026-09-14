import { getMflSessionCookieValue } from '@/lib/mfl-session';
import { groupStandingsByDivision, loadStandingsPageState, type StandingRow } from '@/lib/mfl-standings';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function decimal(value: number): string {
  return value.toFixed(1);
}

function percentage(value: number): string {
  const normalized = value > 1 ? value / 100 : value;
  return normalized.toFixed(3).replace(/^0/, '');
}

function gamesBack(value: number): string {
  return value === 0 ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function StandingCard({ row }: { row: StandingRow }) {
  const metrics = [
    ['PCT', percentage(row.winPct)],
    ['GB', gamesBack(row.gamesBack)],
    ['STRK', row.streak ?? '—'],
    ['PF', decimal(row.pointsFor)],
    ['AVG PF', decimal(row.averagePointsFor)],
    ['PA', decimal(row.pointsAgainst)],
    ['AVG PA', decimal(row.averagePointsAgainst)],
    ['DIV W-L-T', row.divisionRecord],
    ['NON DIV W-L-T', row.nonDivisionRecord],
    ['PWR', row.powerRank === null ? '—' : String(row.powerRank)],
  ];

  return (
    <article className={`standing-card${row.isPrimary ? ' primary' : ''}`}>
      <header className="standing-card-head">
        <span className="standing-rank">{row.rank}</span>
        <div>
          <div className="team-name">{row.teamName}</div>
          <div className="standing-record">{row.record}</div>
        </div>
        {row.isPrimary ? <span className="tag live">My team</span> : null}
      </header>
      <dl className="standing-metrics">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export default async function StandingsPage() {
  const state = await loadStandingsPageState(await getMflSessionCookieValue());
  const divisions = groupStandingsByDivision(state.rows);

  return (
    <main className="grid standings-view">
      <div className="banner">
        <div>
          <div className="eyebrow">Standings</div>
          <div className="small muted">{state.message}</div>
        </div>
        <span className="pill">{state.rows.length} teams</span>
      </div>

      {!state.ok ? (
        <section className="panel section"><p className="muted">{state.message}</p></section>
      ) : (
        <section className="panel section standings-panel">
          <div className="standings-scroll">
            <table className="table standings-table">
              <thead>
                <tr>
                  <th scope="col">Team</th>
                  <th scope="col">W-L-T</th>
                  <th scope="col">PCT</th>
                  <th scope="col">GB</th>
                  <th scope="col">STRK</th>
                  <th scope="col">PF</th>
                  <th scope="col">AVG PF</th>
                  <th scope="col">PA</th>
                  <th scope="col">AVG PA</th>
                  <th scope="col">DIV W-L-T</th>
                  <th scope="col">NON DIV W-L-T</th>
                  <th scope="col">PWR</th>
                </tr>
              </thead>
              {divisions.map((division) => (
                <tbody key={division.name}>
                  <tr className="standings-division-row"><th colSpan={12} scope="colgroup">{division.name} Division</th></tr>
                  {division.rows.map((row) => (
                    <tr key={row.franchiseId} className={row.isPrimary ? 'primary' : undefined}>
                      <th scope="row">{row.rank}. {row.teamName}</th>
                      <td>{row.record}</td>
                      <td>{percentage(row.winPct)}</td>
                      <td>{gamesBack(row.gamesBack)}</td>
                      <td>{row.streak ?? '—'}</td>
                      <td>{decimal(row.pointsFor)}</td>
                      <td>{decimal(row.averagePointsFor)}</td>
                      <td>{decimal(row.pointsAgainst)}</td>
                      <td>{decimal(row.averagePointsAgainst)}</td>
                      <td>{row.divisionRecord}</td>
                      <td>{row.nonDivisionRecord}</td>
                      <td>{row.powerRank ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>

          <div className="standings-cards" aria-label="Mobile league standings">
            {divisions.map((division) => (
              <section className="standing-division" key={division.name}>
                <h2>{division.name} Division</h2>
                <div className="standing-division-cards">
                  {division.rows.map((row) => <StandingCard key={row.franchiseId} row={row} />)}
                </div>
              </section>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
