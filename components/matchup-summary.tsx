import type { MatchupTeam } from '@/lib/mfl-scores';

function formatCount(value: number | null): string {
  return value === null ? '—' : String(value);
}

function chanceLabel(team: MatchupTeam): string {
  if (team.summary.winChanceMode === 'exact') {
    return 'Win chance';
  }

  return 'Estimated win chance';
}

export function MatchupSummary({ team, showUnavailableChance = false }: { team: MatchupTeam; showUnavailableChance?: boolean }) {
  const hasCounts = team.summary.played !== null || team.summary.playing !== null || team.summary.yetToPlay !== null;
  const showChance = team.summary.winChance !== null || showUnavailableChance;

  if (
    !hasCounts &&
    !showChance
  ) {
    return null;
  }

  return (
    <div className="matchup-summary">
      {hasCounts ? (
        <div className="matchup-summary-row">
          <span className="meta">Starter phases</span>
          <span>
            {formatCount(team.summary.played)} played · {formatCount(team.summary.playing)} playing · {formatCount(team.summary.yetToPlay)} yet to play
          </span>
        </div>
      ) : null}
      {showChance ? (
        <div className="matchup-summary-row">
          <span className="meta">{chanceLabel(team)}</span>
          <span>{team.summary.winChance === null ? '—' : `${team.summary.winChance}%`}</span>
        </div>
      ) : null}
    </div>
  );
}
