"use client";

import { useMemo, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { formatMflMoney, type FreeAgentRow, type WaiversPageState } from '@/lib/mfl-waivers';
import { getWaiverWindow } from '@/lib/waiver-window';

const POSITIONS = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PK', 'Def'] as const;

export function WaiversBoard({ state }: { state: WaiversPageState }) {
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState<(typeof POSITIONS)[number]>('ALL');
  const [selected, setSelected] = useState<FreeAgentRow | null>(null);
  const [bidAmount, setBidAmount] = useState<string>('');
  const [dropId, setDropId] = useState('');
  const [comments, setComments] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const minimumBid = state.rules?.bbidMinimum ?? 0;
  const waiverWindow = useMemo(() => getWaiverWindow(state.currentWeek), [state.currentWeek]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.freeAgents.filter((row) => {
      if (position !== 'ALL' && row.position.toLowerCase() !== position.toLowerCase()) return false;
      if (!needle) return true;
      return `${row.name} ${row.team} ${row.position}`.toLowerCase().includes(needle);
    }).slice(0, 80);
  }, [position, query, state.freeAgents]);

  const startClaim = (row: FreeAgentRow) => {
    setSelected(row);
    setBidAmount(String(minimumBid || 0));
    setDropId('');
    setComments('');
    setNotice('');
  };

  const submitClaim = async () => {
    if (!selected) return;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/waivers/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          confirmed: true,
          playerId: selected.id,
          bidAmount: Number(bidAmount),
          dropPlayerIds: dropId ? [dropId] : [],
          comments,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (response.status === 501) {
        setNotice(payload?.message || 'Claim draft saved. Live MFL submit stays gated.');
      } else if (!response.ok) {
        setNotice(payload?.message || 'Claim could not be queued.');
      } else {
        setNotice(payload?.message || 'Claim submitted.');
      }
    } catch {
      setNotice('Claim could not be queued.');
    } finally {
      setBusy(false);
      setReviewOpen(false);
    }
  };

  return (
    <div className="stack waiver-board">
      <section className="panel section">
        <div className="row">
          <div>
            <h2 className="eyebrow">FAAB / rules</h2>
            <div className="small muted">FAAB from MFL; claim window is league schedule.</div>
          </div>
          <span className="pill">{state.rules?.waiverType || 'Rules'}</span>
        </div>
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="stat-row"><span>My balance</span><strong>{formatMflMoney(state.myBalance)}</strong></div>
          <div className="stat-row"><span>Minimum bid</span><strong>{formatMflMoney(state.rules?.bbidMinimum ?? null)}</strong></div>
          <div className="stat-row"><span>Increment</span><strong>{formatMflMoney(state.rules?.bbidIncrement ?? null)}</strong></div>
          <div className="stat-row">
            <span>Waiver window</span>
            <strong style={{ textAlign: 'right' }}>{waiverWindow.label}</strong>
          </div>
          {waiverWindow.note ? <p className="small muted" style={{ margin: 0 }}>{waiverWindow.note}</p> : null}
        </div>
      </section>

      {state.pendingClaims.length > 0 ? (
        <section className="panel section">
          <h2 className="eyebrow">Pending claims</h2>
          <div className="stack" style={{ marginTop: 10 }}>
            {state.pendingClaims.map((claim) => (
              <div key={claim.id} className="stat-row">
                <span>{claim.rawSummary}</span>
                <strong>{claim.bidAmount !== null ? formatMflMoney(claim.bidAmount) : 'Bid'}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel section">
        <div className="row">
          <div>
            <h2 className="eyebrow">Free agents</h2>
            <div className="small muted">{state.freeAgents.length} available · showing {filtered.length}</div>
          </div>
        </div>
        <div className="waiver-filters">
          <input
            className="field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search player, team, position"
            aria-label="Search free agents"
          />
          <div className="waiver-position-row">
            {POSITIONS.map((entry) => (
              <button
                key={entry}
                type="button"
                className={`button ghost${position === entry ? ' active-filter' : ''}`}
                onClick={() => setPosition(entry)}
              >
                {entry}
              </button>
            ))}
          </div>
        </div>
        <div className="stack waiver-fa-list">
          {filtered.map((row) => (
            <button key={row.id} type="button" className="waiver-fa-row" onClick={() => startClaim(row)}>
              <div>
                <strong>{row.name}</strong>
                <div className="small muted">{row.team} · {row.position} · {row.status}</div>
              </div>
              <div className="waiver-fa-meta">
                <span className="pill">Claim</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 ? <p className="muted small">No free agents match this filter.</p> : null}
        </div>
      </section>

      {selected ? (
        <section className="panel section">
          <h2 className="eyebrow">Draft claim</h2>
          <p className="small muted">Builds a bid locally. Live MFL submit requires confirmation and currently returns a safe 501 stub.</p>
          <div className="stack" style={{ marginTop: 12 }}>
            <div className="stat-row"><span>Player</span><strong>{selected.name}</strong></div>
            <label className="field-label">
              FAAB bid
              <input className="field" type="number" min={0} step={state.rules?.bbidIncrement || 1} value={bidAmount} onChange={(event) => setBidAmount(event.target.value)} />
            </label>
            <label className="field-label">
              Drop player id (optional)
              <input className="field" value={dropId} onChange={(event) => setDropId(event.target.value)} placeholder="MFL player id to drop" />
            </label>
            <label className="field-label">
              Comments
              <input className="field" value={comments} onChange={(event) => setComments(event.target.value)} maxLength={280} />
            </label>
            <div className="actions">
              <button type="button" className="button ghost" onClick={() => setSelected(null)}>Cancel</button>
              <button type="button" className="button primary" onClick={() => setReviewOpen(true)}>Review claim</button>
            </div>
            {notice ? <p className="small muted" role="status">{notice}</p> : null}
          </div>
        </section>
      ) : null}

      <section className="panel section">
        <h2 className="eyebrow">Recent waiver / FA activity</h2>
        <div className="stack" style={{ marginTop: 10 }}>
          {state.recentClaims.slice(0, 20).map((claim) => (
            <div key={claim.id} className="activity-row">
              <div>
                <strong>{claim.summary}</strong>
                <div className="small muted">{claim.timeLabel}</div>
              </div>
            </div>
          ))}
          {state.recentClaims.length === 0 ? <p className="muted small">No recent waiver activity.</p> : null}
        </div>
      </section>

      <section className="panel section">
        <h2 className="eyebrow">FAAB balances</h2>
        <div className="stack" style={{ marginTop: 10 }}>
          {state.faabBoard.map((row) => (
            <div key={row.franchiseId} className={`stat-row${row.isPrimary ? ' primary-row' : ''}`}>
              <span>{row.name}{row.isPrimary ? ' (you)' : ''}</span>
              <strong>{formatMflMoney(row.bbidAvailableBalance)}</strong>
            </div>
          ))}
        </div>
      </section>

      <ConfirmDialog
        open={reviewOpen}
        busy={busy}
        title="Confirm waiver claim draft"
        message={selected ? `Queue a ${formatMflMoney(Number(bidAmount) || 0)} claim for ${selected.name}? Live MFL write stays disabled until this stub is intentionally enabled.` : ''}
        confirmLabel="Confirm draft"
        onCancel={() => setReviewOpen(false)}
        onConfirm={submitClaim}
      />
    </div>
  );
}
