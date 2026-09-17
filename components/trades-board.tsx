"use client";

import { useMemo, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { CompletedTradeCard, TradeCard } from '@/components/trade-card';
import type { TradesPageState } from '@/lib/mfl-trades';

export function TradesBoard({ state }: { state: TradesPageState }) {
  const partners = useMemo(
    () => state.franchises.filter((franchise) => !franchise.isPrimary),
    [state.franchises],
  );

  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? '');
  const [offering, setOffering] = useState<string[]>([]);
  const [requestingText, setRequestingText] = useState('');
  const [expiresDays, setExpiresDays] = useState(String(state.defaultExpirationDays));
  const [comments, setComments] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const submitProposal = async () => {
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/trades/propose', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          confirmed: true,
          partnerFranchiseId: partnerId,
          offeringPlayerIds: offering,
          requestingPlayerIds: requestingText
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean),
          expiresDays: Number(expiresDays) || state.defaultExpirationDays,
          comments,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (response.status === 501) {
        setNotice(payload?.message || 'Trade draft saved. Live MFL submit stays gated.');
      } else if (!response.ok) {
        setNotice(payload?.message || 'Trade could not be queued.');
      } else {
        setNotice(payload?.message || 'Trade submitted.');
      }
    } catch {
      setNotice('Trade could not be queued.');
    } finally {
      setBusy(false);
      setReviewOpen(false);
    }
  };

  const partnerName = partners.find((franchise) => franchise.id === partnerId)?.name || 'Partner';

  return (
    <div className="stack trades-board">
      {state.pending.length > 0 ? (
        <section className="panel section">
          <h2 className="eyebrow">Pending offers</h2>
          <div className="trade-list">
            {state.pending.map((trade) => (
              <TradeCard key={trade.id} trade={trade} />
            ))}
          </div>
        </section>
      ) : (
        <section className="panel section">
          <h2 className="eyebrow">Pending offers</h2>
          <p className="small muted" style={{ marginTop: 8 }}>
            No pending trades returned for this session. MFL only exposes pendingTrades to authenticated league members.
          </p>
        </section>
      )}

      <RecentTradesSection recent={state.recent} />

      {state.tradeBait.length > 0 ? (
        <section className="panel section">
          <h2 className="eyebrow">Trade bait</h2>
          <div className="stack" style={{ marginTop: 10 }}>
            {state.tradeBait.map((bait) => (
              <div key={bait.id} className="activity-row">
                <strong>{bait.summary}</strong>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel section">
        <h2 className="eyebrow">Draft trade offer</h2>
        <p className="small muted">Compose locally. Live MFL submit requires confirmation and currently returns a safe 501 stub.</p>
        <div className="stack" style={{ marginTop: 12 }}>
          <label className="field-label">
            Partner
            <select className="field" value={partnerId} onChange={(event) => setPartnerId(event.target.value)}>
              {partners.map((franchise) => (
                <option key={franchise.id} value={franchise.id}>{franchise.name}</option>
              ))}
            </select>
          </label>

          <div>
            <div className="small muted" style={{ marginBottom: 8 }}>You offer</div>
            {state.myRosterAssets.length === 0 ? (
              <p className="muted small">Sign in with a roster to pick assets.</p>
            ) : (
              <div className="trade-asset-picker">
                <select
                  className="field"
                  value=""
                  onChange={(event) => {
                    const id = event.target.value;
                    if (id && !offering.includes(id)) {
                      setOffering((current) => [...current, id]);
                    }
                    event.target.value = '';
                  }}
                >
                  <option value="">Select a player…</option>
                  {state.myRosterAssets
                    .filter((asset) => !offering.includes(asset.id))
                    .map((asset) => (
                      <option key={asset.id} value={asset.id}>{asset.label}</option>
                    ))}
                </select>
                {offering.length > 0 ? (
                  <div className="trade-selected-assets">
                    {offering.map((id) => {
                      const asset = state.myRosterAssets.find((a) => a.id === id);
                      if (!asset) return null;
                      return (
                        <span key={id} className="trade-asset-pill">
                          {asset.label}
                          <button
                            type="button"
                            className="trade-asset-remove"
                            onClick={() => setOffering((current) => current.filter((item) => item !== id))}
                            aria-label={`Remove ${asset.label}`}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <label className="field-label">
            Request player ids from {partnerName} (comma-separated)
            <input
              className="field"
              value={requestingText}
              onChange={(event) => setRequestingText(event.target.value)}
              placeholder="e.g. 11671,12801"
            />
          </label>

          <label className="field-label">
            Expires in days
            <input className="field" type="number" min={1} max={30} value={expiresDays} onChange={(event) => setExpiresDays(event.target.value)} />
          </label>

          <label className="field-label">
            Comments
            <input className="field" value={comments} onChange={(event) => setComments(event.target.value)} maxLength={280} />
          </label>

          <div className="actions">
            <button type="button" className="button primary" onClick={() => setReviewOpen(true)} disabled={!partnerId}>
              Review offer
            </button>
          </div>
          {notice ? <p className="small muted" role="status">{notice}</p> : null}
        </div>
      </section>

      <ConfirmDialog
        open={reviewOpen}
        busy={busy}
        title="Confirm trade draft"
        message={`Queue a draft offer to ${partnerName}? Live MFL write stays disabled until this stub is intentionally enabled.`}
        confirmLabel="Confirm draft"
        onCancel={() => setReviewOpen(false)}
        onConfirm={submitProposal}
      />
    </div>
  );
}

function RecentTradesSection({ recent }: { recent: TradesPageState['recent'] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? recent : recent.slice(0, 3);
  const hasMore = recent.length > 3;

  return (
    <section className="panel section">
      <h2 className="eyebrow">Recent trades</h2>
      <div className="trade-list">
        {visible.map((trade) => (
          <CompletedTradeCard key={trade.id} trade={trade} />
        ))}
        {recent.length === 0 ? <p className="muted small">No completed trades found.</p> : null}
      </div>
      {hasMore ? (
        <button
          type="button"
          className="button ghost trade-show-more"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Show less' : `Show all ${recent.length} trades`}
        </button>
      ) : null}
    </section>
  );
}
