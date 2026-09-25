import { Fragment } from 'react';
import { formatRosterSalary, groupRosterRows } from '@/lib/mfl-roster';
import { getMflSessionCookieValue } from '@/lib/mfl-session';
import { loadAllRostersPageState } from '@/lib/mfl-all-rosters';
import { AutoRefresh } from '@/components/auto-refresh';
import { FranchisePicker } from '@/components/franchise-picker';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function display(value: string | number | null): string {
  return value === null ? 'Unavailable' : String(value);
}

export default async function AllRostersPage({
  searchParams,
}: {
  searchParams: Promise<{ franchise?: string | string[] | undefined }>;
}) {
  const query = await searchParams;
  const requestedFranchiseId = Array.isArray(query.franchise) ? query.franchise[0] : query.franchise;
  const state = await loadAllRostersPageState(await getMflSessionCookieValue(), requestedFranchiseId);
  const selected = state.selectedFranchise;
  const groups = selected ? groupRosterRows(selected.rows) : [];

  return (
    <main className="grid roster-view">
      <div className="banner">
        <div>
          <div className="eyebrow">All Rosters</div>
          <div className="small muted">Every league franchise · current as of page load</div>
        </div>
        <span className="pill">{state.franchises.length} teams</span>
      </div>

      {!state.ok ? <section className="panel section"><p className="muted">{state.message}</p></section> : (
        <>
          <section className="panel section all-rosters-controls">
            <FranchisePicker
              franchises={state.franchises}
              selectedFranchiseId={state.selectedFranchiseId}
            />
            <AutoRefresh />
          </section>

          {selected ? <section className="panel section roster-panel">
            <div className="banner roster-team-banner">
              <div>
                <div className="eyebrow">Selected franchise</div>
                <h2>{selected.name}</h2>
              </div>
              <span className="pill">{selected.rows.length} players</span>
            </div>
            <div className="roster-scroll">
              <table className="table roster-table">
                <thead><tr><th>Player</th><th>NFL</th><th>YTD</th><th>Bye</th><th>Salary</th><th>Contract</th></tr></thead>
               <tbody>{groups.map((group) => <Fragment key={`${group.position}-table`}>
                 <tr key={`${group.position}-table-header`} className="roster-position-header">
                   <th colSpan={6} scope="colgroup"><span>{group.position}</span><span>{group.rows.length} players</span></th>
                 </tr>
                 {group.rows.map((player) => <tr key={player.id}>
                   <td data-label="Player"><strong>{player.name}</strong><span className="roster-status">{player.status}</span></td>
                  <td data-label="NFL"><strong>{display(player.team)} / {display(player.position)}</strong></td>
                  <td data-label="YTD">{display(player.ytdPoints)}</td>
                  <td data-label="Bye">{display(player.byeWeek)}</td>
                  <td data-label="Salary">{formatRosterSalary(player.salary)}</td>
                  <td data-label="Contract">{display(player.contractYear)}</td>
                 </tr>)}
               </Fragment>)}</tbody>
               </table>
               <div className="roster-compact-list" aria-label={`${selected.name} compact roster list`}>
                 {groups.map((group) => <div key={`${group.position}-compact`} className="roster-position-group">
                   <div className="roster-position-header"><strong>{group.position}</strong><span>{group.rows.length} players</span></div>
                   {group.rows.map((player) => <div key={player.id} className="roster-compact-row">
                   <div className="roster-compact-main"><strong>{player.name}</strong><span><strong>{display(player.team)} · {display(player.position)}</strong></span></div>
                   <div className="roster-compact-metrics"><span>YTD {display(player.ytdPoints)}</span><span>Bye {display(player.byeWeek)}</span><span>Salary {formatRosterSalary(player.salary)}</span><span>Contract {display(player.contractYear)}</span></div>
                   </div>)}
                 </div>)}
              </div>
            </div>
            <footer className="roster-footer"><span>{selected.summary.rosterCount} rostered</span><span>YTD total: {display(selected.summary.ytdPoints)}</span><span>Salary total: {formatRosterSalary(selected.summary.salary)}</span></footer>
          </section> : <section className="panel section"><p className="muted">Selected franchise roster is unavailable.</p></section>}
        </>
      )}
    </main>
  );
}
