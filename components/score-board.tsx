import Link from 'next/link';

import { WeekPicker } from '@/components/week-picker';
import type { MatchupCard, MatchupTeam, ScoresPageState } from '@/lib/mfl-scores';
import { MatchupSummary } from '@/components/matchup-summary';
import { shortFranchiseLabel } from '@/lib/mfl-trades';

function formatScore(score: number | null): string {
  return score === null ? 'TBD' : score.toFixed(1);
}

function formatCompactScore(score: number | null): string {
  if (score === null) {
    return '–';
  }

  const rounded = Math.round(score * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function matchupLabel(matchup: MatchupCard): string {
  if (matchup.home.status === 'Live' || matchup.away.status === 'Live') {
    return 'Live';
  }

  if (matchup.home.status === 'Scheduled' || matchup.away.status === 'Scheduled') {
    return 'Scheduled';
  }

  return 'Final';
}

function teamBadge(teamStatus: MatchupCard['home']['status']): string {
  if (teamStatus === 'Live') {
    return 'Live';
  }

  if (teamStatus === 'Scheduled') {
    return 'TBD';
  }

  return 'Final';
}

function compactTeamLabel(team: MatchupTeam): string {
  return shortFranchiseLabel({
    name: team.teamName,
    abbrev: team.teamAbbrev,
    id: team.teamId,
    maxLength: 10,
  });
}

function TeamCell({ team }: { team: MatchupCard['home'] }) {
  return (
    <div className="team-card">
      <div className="team-card-head">
        <span className="team-role">{team.isHome ? 'Home' : 'Away'}</span>
        <span className={`tag ${team.status.toLowerCase()}`}>{teamBadge(team.status)}</span>
      </div>
      <div className="team-name">{team.teamName}</div>
      <div className="team-score">{formatScore(team.score)}</div>
      <MatchupSummary team={team} showUnavailableChance={team.summary.winChance === null} />
      <div className="team-foot">
        <span className="meta">{team.result ? team.result : team.status === 'Scheduled' ? 'Scheduled matchup' : 'Scored via MFL'}</span>
        <span className="meta">{team.isHome ? 'Home' : 'Away'}</span>
      </div>
    </div>
  );
}

function MiniMatchupRow({
  matchup,
  href,
}: {
  matchup: MatchupCard;
  href: string;
}) {
  const homeLabel = compactTeamLabel(matchup.home);
  const awayLabel = compactTeamLabel(matchup.away);
  const scoreText = `${formatCompactScore(matchup.home.score)}–${formatCompactScore(matchup.away.score)}`;

  return (
    <Link
      href={href}
      className={`scoreboard-mini-matchup${matchup.isPrimary ? ' primary' : ''}`}
      aria-label={`${homeLabel} ${scoreText} ${awayLabel}`}
    >
      <span className="scoreboard-mini-a">{homeLabel}</span>
      <span className="scoreboard-mini-s">{scoreText}</span>
      <span className="scoreboard-mini-b">{awayLabel}</span>
    </Link>
  );
}

export function ScoreBoard({
  source,
  message,
  currentWeek,
  selectedWeek,
  availableWeeks,
  matchups,
  primaryFranchiseId,
}: ScoresPageState) {
  const pillLabel =
    source === 'live'
      ? 'Live feed'
      : source === 'results'
        ? 'Results'
        : source === 'schedule'
          ? 'Schedule'
          : 'Live unavailable';

  const weekHrefBase = selectedWeek ?? currentWeek ?? 0;

  return (
    <section className="grid scores-view">
      <div className="banner scores-banner scoreboard-banner">
        <div className="scoreboard-week-row">
          {currentWeek !== null && selectedWeek !== null && availableWeeks.length > 0 ? (
            <div className="scoreboard-week-picker">
              <WeekPicker availableWeeks={availableWeeks} currentWeek={currentWeek} selectedWeek={selectedWeek} />
            </div>
          ) : (
            <div className="small muted">{message}</div>
          )}

          <span className={`pill scoreboard-feed-pill${source === 'live' ? ' live' : ''}`}>{pillLabel}</span>
        </div>

        {matchups.length > 0 ? (
          <div className="scoreboard-week-summary" role="list" aria-label="Week matchup summary">
            {matchups.map((matchup) => {
              const href = `/scores/week/${weekHrefBase}/matchup/${matchup.hrefFranchiseId}`;
              return (
                <div key={`${matchup.home.teamId}-${matchup.away.teamId}`} role="listitem">
                  <MiniMatchupRow matchup={matchup} href={href} />
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {source === 'error' ? (
        <div className="banner login-state error" role="alert">
          <div>
            <div className="small" style={{ fontWeight: 700 }}>Live data could not be loaded.</div>
            <div className="small muted">Use the header Sign in button, then refresh this page.</div>
          </div>
          <a className="button primary" href="/scores?auth=open">Sign in</a>
        </div>
      ) : null}

      {matchups.length > 0 ? (
        <div className="matchup-list">
          {matchups.map((matchup, index) => {
            const label = matchup.isPrimary ? 'My matchup' : `Matchup ${index + 1}`;
            const href = `/scores/week/${weekHrefBase}/matchup/${matchup.hrefFranchiseId}`;

            return (
              <Link
                key={`${matchup.home.teamId}-${matchup.away.teamId}`}
                href={href}
                className={`matchup-link${matchup.isPrimary ? ' primary' : ''}`}
                aria-label={`${label} ${matchup.home.teamName} vs ${matchup.away.teamName}`}
              >
                <article className={`panel matchup-card${matchup.isPrimary ? ' primary' : ''}`}>
                  <div className="matchup-card-head">
                    <div>
                      <div className="eyebrow">{label}</div>
                      <div className="small muted">{matchupLabel(matchup)}</div>
                    </div>
                    <span className={`tag ${matchupLabel(matchup).toLowerCase()}`}>{matchupLabel(matchup)}</span>
                  </div>

                  <div className="matchup-grid">
                    <TeamCell team={matchup.home} />
                    <TeamCell team={matchup.away} />
                  </div>

                  {matchup.isPrimary && primaryFranchiseId ? (
                    <div className="small muted">Highlighted for franchise {primaryFranchiseId}</div>
                  ) : null}
                </article>
              </Link>
            );
          })}
        </div>
      ) : source === 'error' ? null : (
        <div className="banner login-state error" role="alert">
          <div>
            <div className="small" style={{ fontWeight: 700 }}>No matchups could be rendered.</div>
            <div className="small muted">The selected week did not match the expected 12-team / 6-matchup shape.</div>
          </div>
          <a className="button primary" href="/scores?auth=open">Sign in</a>
        </div>
      )}
    </section>
  );
}
