import type { MatchupDetailState, MatchupTeam, MatchupPlayer } from '@/lib/mfl-scores';
import { groupPlayersByPosition } from '@/lib/player-detail';
import { MatchupSummary } from '@/components/matchup-summary';

function formatScore(score: number | null): string {
  return score === null ? 'TBD' : score.toFixed(1);
}

function groupPlayers(players: MatchupPlayer[]) {
  return {
    starters: players.filter((player) => player.status === 'starter'),
    bench: players.filter((player) => player.status !== 'starter'),
  };
}

function PlayerRow({ player, source }: { player: MatchupPlayer; source: MatchupDetailState['source'] }) {
  const score = source === 'schedule' ? 'TBD' : formatScore(player.score);
  const liveStateText = source === 'live' ? player.liveStateText || 'Yet to play' : player.status;

  return (
    <div className="player-row">
      <div className="player-main">
        <div className="player-name">{player.name}</div>
        <div className="player-meta">{player.position} · {player.id}</div>
      </div>
      <div className="player-side">
        <div className="player-score">{score}</div>
        <div className="player-meta">{liveStateText}</div>
      </div>
    </div>
  );
}

function TeamScoreCard({ team, isPrimary }: { team: MatchupTeam; isPrimary: boolean }) {
  return (
    <section className={`matchup-score-card${isPrimary ? ' primary' : ''}`} aria-label={`${team.teamName} score`}>
      <div className="matchup-score-card-head">
        <div>
          <div className="eyebrow">{team.isHome ? 'Home' : 'Away'}</div>
          <div className="team-name">{team.teamName}</div>
        </div>
        <span className={`tag ${team.status.toLowerCase()}`}>{team.status}</span>
      </div>
      <div className="team-score">{formatScore(team.score)}</div>
      <MatchupSummary team={team} showUnavailableChance={team.summary.winChance === null} />
    </section>
  );
}

function PositionComparison({ position, homePlayers, awayPlayers, source }: {
  position: string;
  homePlayers: MatchupPlayer[];
  awayPlayers: MatchupPlayer[];
  source: MatchupDetailState['source'];
}) {
  const rowCount = Math.max(homePlayers.length, awayPlayers.length, 1);

  return (
    <section className="matchup-position-group">
      <h3 className="section-label">{position}</h3>
      <div className="matchup-position-grid">
        {Array.from({ length: rowCount }, (_, index) => (
          <div className="matchup-player-pair" key={`${position}-${index}`}>
            {homePlayers[index] ? <PlayerRow player={homePlayers[index]} source={source} /> : <div className="player-row player-row-empty">—</div>}
            {awayPlayers[index] ? <PlayerRow player={awayPlayers[index]} source={source} /> : <div className="player-row player-row-empty">—</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

function RosterComparison({ label, homePlayers, awayPlayers, source }: {
  label: string;
  homePlayers: MatchupPlayer[];
  awayPlayers: MatchupPlayer[];
  source: MatchupDetailState['source'];
}) {
  const homeGroups = groupPlayersByPosition(homePlayers);
  const awayGroups = groupPlayersByPosition(awayPlayers);
  const positions = [...new Set([...homeGroups.map((group) => group.position), ...awayGroups.map((group) => group.position)])];
  const homeByPosition = new Map(homeGroups.map((group) => [group.position, group.players]));
  const awayByPosition = new Map(awayGroups.map((group) => [group.position, group.players]));

  return (
    <section className="panel section matchup-roster-comparison">
      <h2>{label}</h2>
      {positions.length > 0 ? (
        <div className="stack">
          {positions.map((position) => (
            <PositionComparison
              key={position}
              position={position}
              homePlayers={homeByPosition.get(position) ?? []}
              awayPlayers={awayByPosition.get(position) ?? []}
              source={source}
            />
          ))}
        </div>
      ) : (
        <div className="small muted">No {label.toLowerCase()} details available for this state.</div>
      )}
    </section>
  );
}

export function MatchupDetail({ source, message, currentWeek, selectedWeek, matchup }: MatchupDetailState) {
  if (source === 'error' || !matchup) {
    return (
      <section className="grid matchup-detail-view">
        <div className="banner login-state error" role="alert">
          <div>
            <div className="small" style={{ fontWeight: 700 }}>Matchup details could not be loaded.</div>
            <div className="small muted">{message}</div>
          </div>
          <a className="button primary" href="/scores">Back to scores</a>
        </div>
      </section>
    );
  }

  const statusLabel = source === 'live' ? 'Live feed' : source === 'results' ? 'Results' : source === 'schedule' ? 'Schedule' : 'Unavailable';
  const homePlayers = groupPlayers(matchup.home.players);
  const awayPlayers = groupPlayers(matchup.away.players);

  return (
    <section className="grid matchup-detail-view">
      <div className="banner scores-banner">
        <div>
          <div className="eyebrow">Matchup detail</div>
          <div className="small muted">{message}</div>
        </div>
        <div className="scores-controls">
          {currentWeek !== null && selectedWeek !== null ? <span className="pill">Week {selectedWeek}</span> : null}
          <span className="pill">{statusLabel}</span>
        </div>
      </div>

      <article className="panel section matchup-header">
        <div className="row">
          <div>
            <div className="eyebrow">Current score</div>
            <div className="small muted">{matchup.home.teamName} vs {matchup.away.teamName}</div>
          </div>
          {matchup.primaryTeamId ? <span className="pill">My matchup</span> : null}
        </div>

        <div className="matchup-score-cards">
          <TeamScoreCard team={matchup.home} isPrimary={matchup.home.teamId === matchup.primaryTeamId} />
          <TeamScoreCard team={matchup.away} isPrimary={matchup.away.teamId === matchup.primaryTeamId} />
        </div>
      </article>

      <div className="matchup-comparison-head" aria-hidden="true">
        <div>{matchup.home.teamName}</div>
        <div>{matchup.away.teamName}</div>
      </div>

      <RosterComparison label="Starters" homePlayers={homePlayers.starters} awayPlayers={awayPlayers.starters} source={source} />
      <RosterComparison label="Bench / Reserves" homePlayers={homePlayers.bench} awayPlayers={awayPlayers.bench} source={source} />
    </section>
  );
}
