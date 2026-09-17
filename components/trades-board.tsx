"use client";

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { CompletedTradeCard, TradeCard } from '@/components/trade-card';
import type { MflAsset } from '@/lib/mfl-assets';
import {
  amendDraftFromPendingTrade,
  counterDraftFromPendingTrade,
  isIncomingPendingTrade,
  isOutgoingPendingTrade,
  type TradeRow,
  type TradesPageState,
} from '@/lib/mfl-trades';
import {
  FANTASYCALC_TRADE_CALCULATOR_URL,
  favorLabel,
  formatDelta,
  formatValueNumber,
  KTC_TRADE_CALCULATOR_URL,
} from '@/lib/trade-value-help';

type PendingAction = 'accept' | 'reject' | 'revoke' | null;

function assetLabel(assets: MflAsset[], id: string): string {
  return assets.find((asset) => asset.id === id)?.label || `Player ${id}`;
}

function PlayerAssetPicker({
  label,
  assets,
  selectedIds,
  onChange,
  valueCatalog,
  emptyMessage,
  searchPlaceholder,
}: {
  label: string;
  assets: MflAsset[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  valueCatalog: TradesPageState['valueCatalog'];
  emptyMessage: string;
  searchPlaceholder: string;
}) {
  const [query, setQuery] = useState('');
  const selected = useMemo(
    () => selectedIds.map((id) => assets.find((asset) => asset.id === id) || { kind: 'player' as const, id, label: `Player ${id}` }),
    [assets, selectedIds],
  );

  const available = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets
      .filter((asset) => !selectedIds.includes(asset.id))
      .filter((asset) => !needle || asset.label.toLowerCase().includes(needle) || asset.id.includes(needle))
      .slice(0, 40);
  }, [assets, query, selectedIds]);

  return (
    <div>
      <div className="small muted" style={{ marginBottom: 8 }}>{label}</div>
      {assets.length === 0 ? (
        <p className="muted small">{emptyMessage}</p>
      ) : (
        <div className="trade-asset-picker">
          <input
            className="field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={label}
          />
          {query.trim() || available.length <= 12 ? (
            <div className="trade-asset-search-results">
              {available.map((asset) => {
                const fcValue = valueCatalog?.byMflId[asset.id]?.value;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    className="button ghost trade-asset-option"
                    onClick={() => {
                      onChange([...selectedIds, asset.id]);
                      setQuery('');
                    }}
                  >
                    {asset.label}
                    {typeof fcValue === 'number' ? ` · ${formatValueNumber(fcValue)}` : ''}
                  </button>
                );
              })}
              {available.length === 0 ? <p className="muted small">No matching players.</p> : null}
            </div>
          ) : (
            <select
              className="field"
              value=""
              onChange={(event) => {
                const id = event.target.value;
                if (id) onChange([...selectedIds, id]);
                event.target.value = '';
              }}
            >
              <option value="">Select a player…</option>
              {assets
                .filter((asset) => !selectedIds.includes(asset.id))
                .map((asset) => {
                  const fcValue = valueCatalog?.byMflId[asset.id]?.value;
                  return (
                    <option key={asset.id} value={asset.id}>
                      {asset.label}{typeof fcValue === 'number' ? ` · ${formatValueNumber(fcValue)}` : ''}
                    </option>
                  );
                })}
            </select>
          )}
          {selected.length > 0 ? (
            <div className="trade-selected-assets">
              {selected.map((asset) => {
                const fcValue = valueCatalog?.byMflId[asset.id]?.value;
                return (
                  <span key={asset.id} className="trade-asset-pill">
                    {asset.label}
                    {typeof fcValue === 'number' ? ` · ${formatValueNumber(fcValue)}` : ''}
                    <button
                      type="button"
                      className="trade-asset-remove"
                      onClick={() => onChange(selectedIds.filter((id) => id !== asset.id))}
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
  );
}

export function TradesBoard({ state }: { state: TradesPageState }) {
  const router = useRouter();
  const partners = useMemo(
    () => state.franchises.filter((franchise) => !franchise.isPrimary),
    [state.franchises],
  );

  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? '');
  const [offering, setOffering] = useState<string[]>([]);
  const [requesting, setRequesting] = useState<string[]>([]);
  const [expiresDays, setExpiresDays] = useState(String(state.defaultExpirationDays));
  const [comments, setComments] = useState('');
  const [revokeTradeId, setRevokeTradeId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [pendingTrade, setPendingTrade] = useState<TradeRow | null>(null);
  const draftRef = useRef<HTMLElement | null>(null);

  const partnerName = partners.find((franchise) => franchise.id === partnerId)?.name || 'Partner';
  const isAmend = Boolean(revokeTradeId);
  const requestPool = useMemo(() => {
    const partnerRoster = state.rosterAssetsByFranchiseId[partnerId] ?? [];
    const seen = new Set<string>();
    const pool: MflAsset[] = [];
    for (const asset of [...partnerRoster, ...state.freeAgentAssets]) {
      if (seen.has(asset.id)) continue;
      seen.add(asset.id);
      pool.push(asset);
    }
    return pool;
  }, [partnerId, state.freeAgentAssets, state.rosterAssetsByFranchiseId]);

  const draftValue = useMemo(() => {
    const catalog = state.valueCatalog?.byMflId;
    if (!catalog) return null;

    let giveTotal = 0;
    let getTotal = 0;
    let giveMatched = 0;
    let getMatched = 0;
    const misses: string[] = [];

    for (const id of offering) {
      const hit = catalog[id];
      if (hit) {
        giveTotal += hit.value;
        giveMatched += 1;
      } else {
        misses.push(assetLabel(state.myRosterAssets, id));
      }
    }

    for (const id of requesting) {
      const hit = catalog[id];
      if (hit) {
        getTotal += hit.value;
        getMatched += 1;
      } else {
        misses.push(assetLabel(requestPool, id));
      }
    }

    if (offering.length === 0 && requesting.length === 0) return null;

    const delta = getTotal - giveTotal;
    return {
      giveTotal,
      getTotal,
      delta,
      label: favorLabel(delta, giveTotal, getTotal, 'you'),
      misses,
      settingsNote: state.valueCatalog?.settingsNote ?? '',
      hasValues: giveMatched > 0 || getMatched > 0,
    };
  }, [offering, requestPool, requesting, state.myRosterAssets, state.valueCatalog]);

  const clearAmendMode = () => setRevokeTradeId(null);

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
          requestingPlayerIds: requesting,
          expiresDays: Number(expiresDays) || state.defaultExpirationDays,
          comments,
          revokeTradeId: revokeTradeId || undefined,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) {
        setNotice(payload?.message || 'Trade could not be submitted.');
      } else {
        setNotice(payload?.message || 'Trade submitted to MFL.');
        setOffering([]);
        setRequesting([]);
        setComments('');
        clearAmendMode();
        router.refresh();
      }
    } catch {
      setNotice('Trade could not be submitted.');
    } finally {
      setBusy(false);
      setReviewOpen(false);
    }
  };

  const submitPendingResponse = async () => {
    if (!pendingTrade || !pendingAction) return;
    const tradeId = pendingTrade.mflTradeId || pendingTrade.id;
    setBusy(true);
    setNotice('');
    try {
      const response = await fetch('/api/trades/respond', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          confirmed: true,
          action: pendingAction,
          tradeId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
      if (!response.ok || !payload?.ok) {
        setNotice(payload?.message || `Trade could not be ${pendingAction === 'reject' ? 'declined' : `${pendingAction}ed`}.`);
      } else {
        setNotice(payload?.message || `Trade ${pendingAction === 'reject' ? 'declined' : `${pendingAction}ed`}.`);
        router.refresh();
      }
    } catch {
      setNotice(`Trade could not be ${pendingAction === 'reject' ? 'declined' : `${pendingAction}ed`}.`);
    } finally {
      setBusy(false);
      setPendingAction(null);
      setPendingTrade(null);
    }
  };

  const startCounter = (trade: TradeRow) => {
    const draft = counterDraftFromPendingTrade(trade, state.franchiseId);
    setPartnerId(draft.partnerId || partners[0]?.id || '');
    setOffering(draft.offeringPlayerIds);
    setRequesting(draft.requestingPlayerIds);
    clearAmendMode();
    setNotice('Counter started in Draft trade offer — edit then confirm to send to MFL.');
    requestAnimationFrame(() => {
      draftRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const startAmend = (trade: TradeRow) => {
    const draft = amendDraftFromPendingTrade(trade);
    setPartnerId(draft.partnerId || partners[0]?.id || '');
    setOffering(draft.offeringPlayerIds);
    setRequesting(draft.requestingPlayerIds);
    if (draft.expiresDays) setExpiresDays(String(draft.expiresDays));
    setRevokeTradeId(draft.revokeTradeId);
    setNotice('Amend mode: edit assets, then confirm to revoke the old offer and resend.');
    requestAnimationFrame(() => {
      draftRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const pendingResponseTitle =
    pendingAction === 'accept'
      ? 'Accept this trade?'
      : pendingAction === 'revoke'
        ? 'Cancel this offer?'
        : 'Decline this trade?';

  const pendingResponseMessage =
    pendingAction === 'accept'
      ? 'This will accept the pending trade on MFL.'
      : pendingAction === 'revoke'
        ? 'This will revoke your pending offer on MFL.'
        : 'This will decline the pending trade on MFL.';

  const pendingConfirmLabel =
    pendingAction === 'accept'
      ? 'Confirm accept'
      : pendingAction === 'revoke'
        ? 'Confirm cancel'
        : 'Confirm decline';

  return (
    <div className="stack trades-board">
      {state.pending.length > 0 ? (
        <section className="panel section">
          <h2 className="eyebrow">Pending offers</h2>
          <div className="trade-list">
            {state.pending.map((trade) => {
              const outgoing = isOutgoingPendingTrade(trade, state.franchiseId);
              const incoming = isIncomingPendingTrade(trade, state.franchiseId);
              return (
                <TradeCard
                  key={trade.id}
                  trade={trade}
                  onAccept={
                    incoming
                      ? () => {
                          setPendingTrade(trade);
                          setPendingAction('accept');
                        }
                      : undefined
                  }
                  onDecline={
                    incoming
                      ? () => {
                          setPendingTrade(trade);
                          setPendingAction('reject');
                        }
                      : undefined
                  }
                  onCounter={incoming ? () => startCounter(trade) : undefined}
                  onAmend={outgoing && trade.mflTradeId ? () => startAmend(trade) : undefined}
                  onRevoke={
                    outgoing && trade.mflTradeId
                      ? () => {
                          setPendingTrade(trade);
                          setPendingAction('revoke');
                        }
                      : undefined
                  }
                />
              );
            })}
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

      <section className="panel section" id="draft-trade-offer" ref={draftRef}>
        <h2 className="eyebrow">{isAmend ? 'Amend & resend offer' : 'Draft trade offer'}</h2>
        <p className="small muted">
          {isAmend
            ? 'Editing an outgoing offer. Confirming will revoke the old pending trade on MFL, then submit the new terms.'
            : 'Compose an offer, then confirm to submit it live to MFL.'}
        </p>
        {isAmend ? (
          <div className="actions" style={{ marginTop: 8 }}>
            <button type="button" className="button ghost" onClick={clearAmendMode}>
              Cancel amend
            </button>
          </div>
        ) : null}
        <div className="stack" style={{ marginTop: 12 }}>
          <label className="field-label">
            Partner
            <select
              className="field"
              value={partnerId}
              disabled={isAmend}
              onChange={(event) => {
                const nextPartner = event.target.value;
                setPartnerId(nextPartner);
                const nextPoolIds = new Set([
                  ...(state.rosterAssetsByFranchiseId[nextPartner] ?? []).map((asset) => asset.id),
                  ...state.freeAgentAssets.map((asset) => asset.id),
                ]);
                setRequesting((current) => current.filter((id) => nextPoolIds.has(id)));
              }}
            >
              {partners.map((franchise) => (
                <option key={franchise.id} value={franchise.id}>{franchise.name}</option>
              ))}
            </select>
          </label>

          <PlayerAssetPicker
            label="You offer"
            assets={state.myRosterAssets}
            selectedIds={offering}
            onChange={setOffering}
            valueCatalog={state.valueCatalog}
            emptyMessage="Sign in with a roster to pick assets."
            searchPlaceholder="Search your roster…"
          />

          <PlayerAssetPicker
            label={`You request from ${partnerName}`}
            assets={requestPool}
            selectedIds={requesting}
            onChange={setRequesting}
            valueCatalog={state.valueCatalog}
            emptyMessage="Partner roster / free agents unavailable."
            searchPlaceholder="Search partner roster or free agents…"
          />

          <div className="trade-value-help trade-value-help-draft">
            {draftValue?.hasValues ? (
              <>
                <div className="trade-value-row">
                  <span className="trade-value-label">{draftValue.label}</span>
                  <span className="trade-value-delta">{formatDelta(draftValue.delta)}</span>
                </div>
                <div className="trade-value-sides">
                  <span>You give {formatValueNumber(draftValue.giveTotal)}</span>
                  <span aria-hidden="true">·</span>
                  <span>You get {formatValueNumber(draftValue.getTotal)}</span>
                </div>
                {draftValue.misses.length > 0 ? (
                  <p className="trade-value-misses small muted">Unmatched: {draftValue.misses.join(' • ')}</p>
                ) : null}
              </>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                Select players to see FantasyCalc side totals.
              </p>
            )}
            <div className="trade-value-links">
              <a className="button ghost trade-ext-link" href={KTC_TRADE_CALCULATOR_URL} target="_blank" rel="noreferrer">
                KeepTradeCut
              </a>
              <a className="button ghost trade-ext-link" href={FANTASYCALC_TRADE_CALCULATOR_URL} target="_blank" rel="noreferrer">
                FantasyCalc
              </a>
            </div>
            {state.valueCatalog?.settingsNote ? (
              <p className="trade-value-settings small muted">{state.valueCatalog.settingsNote}</p>
            ) : null}
          </div>

          <label className="field-label">
            Expires in days
            <input className="field" type="number" min={1} max={30} value={expiresDays} onChange={(event) => setExpiresDays(event.target.value)} />
          </label>

          <label className="field-label">
            Comments
            <input className="field" value={comments} onChange={(event) => setComments(event.target.value)} maxLength={280} />
          </label>

          <div className="actions">
            <button
              type="button"
              className="button primary"
              onClick={() => setReviewOpen(true)}
              disabled={!partnerId || (offering.length === 0 && requesting.length === 0)}
            >
              {isAmend ? 'Review amend & resend' : 'Review offer'}
            </button>
          </div>
          {notice ? <p className="small muted" role="status">{notice}</p> : null}
        </div>
      </section>

      <ConfirmDialog
        open={reviewOpen}
        busy={busy}
        title={isAmend ? 'Confirm amend & resend' : 'Confirm trade offer'}
        message={
          isAmend
            ? `Revoke the current pending offer and send updated terms to ${partnerName} on MFL?`
            : `Send this offer to ${partnerName} on MFL?`
        }
        confirmLabel={isAmend ? 'Confirm resend' : 'Confirm send'}
        onCancel={() => setReviewOpen(false)}
        onConfirm={submitProposal}
      />

      <ConfirmDialog
        open={Boolean(pendingAction && pendingTrade)}
        busy={busy}
        title={pendingResponseTitle}
        message={pendingResponseMessage}
        confirmLabel={pendingConfirmLabel}
        onCancel={() => {
          setPendingAction(null);
          setPendingTrade(null);
        }}
        onConfirm={submitPendingResponse}
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
