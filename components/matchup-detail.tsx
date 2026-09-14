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
        <div className="player-meta">
          {player.position} · {player.id}
        </div>
      </div>
      <div className="player-side">
        <div className="player-score">{score}</div>
        <div className="player-meta">{liveStateText}</div>
      </div>
    </div>
  );
}

function PositionGroup({ label, players, source }: { label: string; players: MatchupPlayer[]; source: MatchupDetailState['source'] }) {
  return (
    <div>
      <div className="section-label">{label}</div>
      <div className="player-list">
        {players.map((player) => (
          <PlayerRow key={player.id} player={player} source={source} />
        ))}
      </div>
    </div>
  );
}

function TeamPanel({ team, source, primaryTeamId }: { team: MatchupTeam; source: MatchupDetailState['source']; primaryTeamId: string | null }) {
  const grouped = groupPlayers(team.players);
  const starterGroups = groupPlayersByPosition(grouped.starters);
  const benchGroups = groupPlayersByPosition(grouped.bench);

  return (
    <section className={`panel section matchup-team${team.teamId === primaryTeamId ? ' primary' : ''}`}>
      <div className="matchup-team-head">
        <div>
          <div className="eyebrow">{team.isHome ? 'Home' : 'Away'}</div>
          <div className="team-name">{team.teamName}</div>
        </div>
        <div className="team-side-score">
          <div className="team-score">{formatScore(team.score)}</div>
          <span className={`tag ${team.status.toLowerCase()}`}>{team.status}</span>
        </div>
      </div>

      <div className="stack">
        <div>
          <div className="section-label">Starters</div>
          {starterGroups.length > 0 ? (
            <div className="stack">
              {starterGroups.map((group) => (
                <PositionGroup key={group.position} label={group.position} players={group.players} source={source} />
              ))}
            </div>
          ) : (
            <div className="small muted">No starter details available for this state.</div>
          )}
        </div>

        <div>
          <div className="section-label">Bench / Reserves</div>
          {benchGroups.length > 0 ? (
            <div className="stack">
              {benchGroups.map((group) => (
                <PositionGroup key={group.position} label={group.position} players={group.players} source={source} />
              ))}
            </div>
          ) : (
            <div className="small muted">No bench or reserve details available for this state.</div>
          )}
        </div>
      </div>
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

  const statusLabel =
    source === 'live'
      ? 'Live feed'
      : source === 'results'
        ? 'Results'
        : source === 'schedule'
          ? 'Schedule'
          : 'Unavailable';

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

        <div className="matchup-scoreline">
          <div>
            <div className="small muted">{matchup.home.teamName}</div>
            <div className="team-score">{formatScore(matchup.home.score)}</div>
          </div>
          <div className="matchup-vs">vs</div>
          <div style={{ textAlign: 'right' }}>
            <div className="small muted">{matchup.away.teamName}</div>
            <div className="team-score">{formatScore(matchup.away.score)}</div>
          </div>
        </div>

        <div className="matchup-header-summaries">
          <MatchupSummary team={matchup.home} showUnavailableChance={matchup.home.summary.winChance === null} />
          <MatchupSummary team={matchup.away} showUnavailableChance={matchup.away.summary.winChance === null} />
        </div>
      </article>

      <div className="matchup-columns">
        <TeamPanel team={matchup.home} source={source} primaryTeamId={matchup.primaryTeamId} />
        <TeamPanel team={matchup.away} source={source} primaryTeamId={matchup.primaryTeamId} />
      </div>
    </section>
  );
}
