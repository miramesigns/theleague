"use client";

import { useMemo, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { WeekPicker } from '@/components/week-picker';
import { formatLineupRowMeta } from '@/lib/mfl-lineup';
import type { LineupPageState, LineupRosterSnapshot } from '@/lib/mfl-lineup';

type DraftState = Record<string, boolean>;

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'PK', 'DEF', 'OTHER'] as const;

function groupRows(rows: LineupRosterSnapshot[]) {
  return POSITION_ORDER.map((position) => ({
    position,
    rows: rows.filter((row) => row.group === position),
  })).filter((group) => group.rows.length > 0);
}

function buildInitialDraft(rows: LineupRosterSnapshot[]): DraftState {
  return Object.fromEntries(rows.map((row) => [row.id, row.selected])) as DraftState;
}

function summarizeDraft(state: LineupPageState, draft: DraftState) {
  const rules = state.rules;
  if (!rules) {
    return null;
  }

  const byPosition: Record<string, { selected: number; min: number; max: number }> = {};
  for (const rule of rules.positions) {
    byPosition[rule.position] = { selected: 0, min: rule.min, max: rule.max };
  }

  const selectedRows = state.rows.filter((row) => draft[row.id]);
  for (const row of selectedRows) {
    const entry = byPosition[row.position] ?? (byPosition[row.position] = { selected: 0, min: 0, max: 0 });
    entry.selected += 1;
  }

  const problems: string[] = [];
  for (const rule of rules.positions) {
    const selected = byPosition[rule.position]?.selected ?? 0;
    if (selected < rule.min) problems.push(`Need ${rule.min - selected} more ${rule.position}.`);
    if (selected > rule.max) problems.push(`Too many ${rule.position}.`);
  }

  const totalSelected = selectedRows.length;
  const flexExtras = rules.flexEligiblePositions.reduce((sum, position) => {
    const entry = byPosition[position];
    const minimum = rules.positions.find((rule) => rule.position === position)?.min ?? 0;
    return sum + Math.max(0, (entry?.selected ?? 0) - minimum);
  }, 0);

  if (totalSelected < rules.totalMin) problems.push(`Need ${rules.totalMin - totalSelected} more total starters.`);
  if (totalSelected > rules.totalMax) problems.push(`Too many total starters.`);
  if (flexExtras > rules.flexSlots) problems.push(`Flex slots exceeded by ${flexExtras - rules.flexSlots}.`);

  return {
    byPosition,
    selectedRows,
    totalSelected,
    legal: problems.length === 0,
    problems,
  };
}

function statusTone(availability: LineupRosterSnapshot['availability']) {
  if (availability === 'locked') return 'var(--danger)';
  if (availability === 'bye') return '#f59e0b';
  if (availability === 'injured') return '#f97316';
  if (availability === 'unknown') return 'var(--muted)';
  return 'var(--success)';
}

export function LineupEditor({ state }: { state: LineupPageState }) {
  const [draft, setDraft] = useState<DraftState>(() => buildInitialDraft(state.rows));
  const [comments, setComments] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>('');
  const [result, setResult] = useState<{ confirmedAt: string; week: number; starters: string[] } | null>(null);

  const draftSummary = useMemo(() => summarizeDraft(state, draft), [draft, state]);
  const groupedRows = useMemo(() => groupRows(state.rows), [state.rows]);
  const selectedIds = useMemo(() => state.rows.filter((row) => draft[row.id]).map((row) => row.id), [draft, state.rows]);
  const hasSubmittedStarters = useMemo(() => state.rows.some((row) => row.selected), [state.rows]);

  const updateSelection = (playerId: string) => {
    const row = state.rows.find((entry) => entry.id === playerId);
    if (!row || !row.canToggle || busy) {
      return;
    }

    setDraft((current) => ({ ...current, [playerId]: !current[playerId] }));
    setNotice('');
    setResult(null);
  };

  const submit = async (clear = false) => {
    if (!state.selectedWeek) {
      return;
    }

    setBusy(true);
    setNotice('');

    const starters = clear ? [] : selectedIds;
    try {
      const response = await fetch('/api/mfl/lineup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ week: state.selectedWeek, starters, comments, clear }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string; confirmed?: boolean; submittedAt?: string; starters?: string[] } | null;

      if (!response.ok || !payload?.ok) {
        setNotice(payload?.message || 'Lineup submission failed.');
        return;
      }

      setResult({
        confirmedAt: payload.submittedAt || new Date().toISOString(),
        week: state.selectedWeek,
        starters: payload.starters || starters,
      });
      setNotice(clear ? 'Lineup cleared.' : 'Lineup confirmed.');
    } catch {
      setNotice('Lineup submission failed.');
    } finally {
      setBusy(false);
      setReviewOpen(false);
      setClearOpen(false);
    }
  };

  if (!state.ok || !state.rules) {
    return (
      <main className="grid lineup-view">
        <div className="banner login-state error" role="alert">
          <div>
            <div className="small" style={{ fontWeight: 700 }}>Submit Lineup</div>
            <div className="small muted">{state.message}</div>
          </div>
          <a className="button primary" href="/scores?auth=open">Sign in</a>
        </div>
      </main>
    );
  }

  const statusLabel = result
    ? `Confirmed ${new Date(result.confirmedAt).toLocaleString()} · Week ${result.week}`
    : state.submittedAt
      ? `Submitted ${new Date(state.submittedAt).toLocaleString()}`
      : 'Draft loaded';

  return (
    <main className="grid lineup-view">
      <div className="banner lineup-banner">
        <div>
          <div className="eyebrow">Submit Lineup</div>
          <div className="small muted">{state.franchiseName || `Franchise ${state.franchiseId ?? ''}`}</div>
        </div>
        <div className="scores-controls">
          {state.currentWeek && state.selectedWeek ? (
            <WeekPicker availableWeeks={state.availableWeeks} currentWeek={state.currentWeek} selectedWeek={state.selectedWeek} />
          ) : null}
          <span className="pill">{statusLabel}</span>
        </div>
      </div>

      <section className="panel section stack">
        <div className="row">
          <div>
            <div className="eyebrow">Roster status</div>
            <div className="small muted">Select starters, review the bands, then submit. Locked, bye, and injury states are never guessed.</div>
          </div>
          <span className="pill">{draftSummary?.legal ? 'Ready' : 'Needs fixes'}</span>
        </div>

        {groupedRows.map((group) => (
          <div key={group.position} className="stack">
            <div className="section-label">{group.position}</div>
            <div className="lineup-group">
              {group.rows.map((row) => {
                const selected = Boolean(draft[row.id]);
                const meta = formatLineupRowMeta(row);
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`lineup-option${selected ? ' selected' : ''}${!row.canToggle ? ' disabled' : ''}`}
                    onClick={() => updateSelection(row.id)}
                    disabled={busy || !row.canToggle}
                    aria-pressed={selected}
                    aria-label={`${meta.ariaLabel} ${selected ? 'Starter' : 'Bench'}. ${row.statusText}.`}
                  >
                    <div className="lineup-option-main">
                      <strong>{row.name}</strong>
                      <span className="player-meta">{meta.compactText}</span>
                    </div>
                    <div className="lineup-option-side">
                      <span className={`tag ${selected ? 'live' : 'scheduled'}`} style={{ color: statusTone(row.availability) }}>
                        {selected ? 'Starter' : 'Bench'}
                      </span>
                      <span className="player-meta">{row.statusText}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="panel section stack">
        <div className="row">
          <div>
            <div className="eyebrow">Summary</div>
            <div className="small muted">{draftSummary?.totalSelected ?? 0} selected · {state.rules.totalMin}-{state.rules.totalMax} required</div>
          </div>
          <span className="pill">{draftSummary?.legal ? 'Legal' : 'Illegal'}</span>
        </div>

        <div className="lineup-summary-grid">
          {state.rules.positions.map((rule) => {
            const selected = draftSummary?.byPosition[rule.position]?.selected ?? 0;
            return (
              <div key={rule.position} className="stat-row lineup-stat">
                <span>{rule.position}</span>
                <strong>{selected} / {rule.min}-{rule.max}</strong>
              </div>
            );
          })}
        </div>

        {draftSummary?.problems.length ? (
          <div className="banner login-state error" role="alert">
            <div className="stack">
              {draftSummary.problems.map((problem) => <div key={problem} className="small">{problem}</div>)}
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel section stack">
        <div className="row">
          <div>
            <div className="eyebrow">Comments</div>
            <div className="small muted">Optional, 280 characters max.</div>
          </div>
          <span className="pill">{comments.length}/280</span>
        </div>
        <textarea
          className="field lineup-comments"
          maxLength={280}
          rows={4}
          value={comments}
          onChange={(event) => setComments(event.target.value)}
          placeholder="Optional message for the league"
        />
      </section>

      {notice ? (
        <div className={`banner login-state ${notice.toLowerCase().includes('failed') ? 'error' : 'success'}`} role="status">
          <div className="small">{notice}</div>
        </div>
      ) : null}

      <div className="lineup-footer panel section">
        <div className="actions">
          <button type="button" className="button primary" onClick={() => setReviewOpen(true)} disabled={busy || !draftSummary?.legal}>
            Review &amp; Submit
          </button>
          {hasSubmittedStarters ? (
            <button type="button" className="button ghost" onClick={() => setClearOpen(true)} disabled={busy}>
              Clear submitted lineup
            </button>
          ) : null}
        </div>
      </div>

      {reviewOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setReviewOpen(false)}>
          <div className="modal lineup-review" role="dialog" aria-modal="true" aria-labelledby="review-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="review-title">Review lineup</h3>
            <div className="stack">
              {groupedRows.map((group) => {
                const selected = group.rows.filter((row) => draft[row.id]);
                if (selected.length === 0) {
                  return null;
                }

                return (
                  <div key={group.position}>
                    <div className="section-label">{group.position}</div>
                    <div className="review-list">
                      {selected.map((row) => {
                        const meta = formatLineupRowMeta(row);

                        return (
                          <div key={row.id} className="review-row">
                            <div>
                              <strong>{row.name}</strong>
                              <div className="player-meta">{meta.compactText}</div>
                            </div>
                            <span className="tag live">Starter</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="actions" style={{ marginTop: 14 }}>
              <button type="button" className="button ghost" onClick={() => setReviewOpen(false)} disabled={busy}>Cancel</button>
              <button type="button" className="button primary" onClick={() => submit(false)} disabled={busy || !draftSummary?.legal}>
                {busy ? 'Submitting...' : 'Confirm submit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={clearOpen}
        busy={busy}
        title="Clear submitted lineup?"
        message="This intentionally submits an empty lineup. It cannot be done accidentally."
        confirmLabel="Confirm clear"
        onCancel={() => setClearOpen(false)}
        onConfirm={() => submit(true)}
      />
    </main>
  );
}
