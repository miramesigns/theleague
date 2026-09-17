"use client";

import { formatMflAssetLabels } from '@/lib/mfl-assets';
import type { TradeRow } from '@/lib/mfl-trades';
import {
  FANTASYCALC_TRADE_CALCULATOR_URL,
  formatDelta,
  formatValueNumber,
  KTC_TRADE_CALCULATOR_URL,
  type TradeValueRead,
} from '@/lib/trade-value-help';

function TradeValueHelp({
  valueRead,
  playerNames,
}: {
  valueRead: TradeValueRead;
  playerNames: string[];
}) {
  const giveLabel = valueRead.perspective === 'you' ? 'You give' : 'Giver';
  const getLabel = valueRead.perspective === 'you' ? 'You get' : 'Receiver';
  const missNote = [...valueRead.give.misses, ...valueRead.get.misses];

  return (
    <div className="trade-value-help">
      <div className="trade-value-row">
        <span className="trade-value-label">{valueRead.label}</span>
        <span className="trade-value-delta">{formatDelta(valueRead.delta)}</span>
      </div>
      <div className="trade-value-sides">
        <span>
          {giveLabel} {formatValueNumber(valueRead.give.total)}
          {valueRead.give.misses.length > 0 ? '*' : ''}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          {getLabel} {formatValueNumber(valueRead.get.total)}
          {valueRead.get.misses.length > 0 ? '*' : ''}
        </span>
      </div>
      {missNote.length > 0 ? (
        <p className="trade-value-misses small muted">
          Unmatched: {missNote.join(' • ')}
        </p>
      ) : null}
      <div className="trade-value-links">
        <a className="button ghost trade-ext-link" href={KTC_TRADE_CALCULATOR_URL} target="_blank" rel="noreferrer">
          KeepTradeCut
        </a>
        <a className="button ghost trade-ext-link" href={FANTASYCALC_TRADE_CALCULATOR_URL} target="_blank" rel="noreferrer">
          FantasyCalc
        </a>
      </div>
      {playerNames.length > 0 ? (
        <p className="trade-value-hint small muted">
          Manual check: {playerNames.join(' / ')}
        </p>
      ) : null}
      <p className="trade-value-settings small muted">{valueRead.settingsNote}</p>
    </div>
  );
}

function playerLabelsForManual(trade: TradeRow): string[] {
  return [...trade.offered, ...trade.requested]
    .filter((asset) => asset.kind === 'player')
    .map((asset) => asset.label);
}

export function TradeCard({
  trade,
  onAccept,
  onDecline,
  onCounter,
  onRevoke,
  onAmend,
}: {
  trade: TradeRow;
  onAccept?: () => void;
  onDecline?: () => void;
  onCounter?: () => void;
  onRevoke?: () => void;
  onAmend?: () => void;
}) {
  const isPending = trade.status === 'pending';
  const hasIncomingActions = Boolean(onAccept || onDecline || onCounter);
  const hasOutgoingActions = Boolean(onRevoke || onAmend);
  const showActions = isPending && (hasIncomingActions || hasOutgoingActions);

  return (
    <article className={`trade-card${isPending ? ' trade-card-pending' : ''}`}>
      <div className="trade-parties">
        <div className="trade-side trade-side-gives">
          <div className="trade-franchise">{trade.franchiseName}</div>
          <div className="trade-direction">Gives</div>
          <div className="trade-assets">{formatMflAssetLabels(trade.offered)}</div>
        </div>
        <div className="trade-arrow" aria-hidden="true">→</div>
        <div className="trade-side trade-side-receives">
          <div className="trade-franchise">{trade.partnerName}</div>
          <div className="trade-direction">Gets</div>
          <div className="trade-assets">{formatMflAssetLabels(trade.requested)}</div>
        </div>
      </div>
      <div className="trade-meta">
        <span>{trade.timeLabel}</span>
        {trade.expiresLabel ? <span>· expires {trade.expiresLabel}</span> : null}
        {trade.byCommish ? <span className="trade-commish">commissioner assisted</span> : null}
        {isPending ? <span className="trade-status-pending">Pending</span> : null}
        {hasOutgoingActions ? <span className="trade-status-pending">Your offer</span> : null}
      </div>
      {trade.valueRead ? (
        <TradeValueHelp valueRead={trade.valueRead} playerNames={playerLabelsForManual(trade)} />
      ) : null}
      {showActions ? (
        <div className="trade-actions">
          {onAccept ? (
            <button type="button" className="button primary trade-action-btn" onClick={onAccept}>
              Accept
            </button>
          ) : null}
          {onDecline ? (
            <button type="button" className="button ghost trade-action-btn" onClick={onDecline}>
              Decline
            </button>
          ) : null}
          {onCounter ? (
            <button type="button" className="button ghost trade-action-btn" onClick={onCounter}>
              Counter
            </button>
          ) : null}
          {onAmend ? (
            <button type="button" className="button primary trade-action-btn" onClick={onAmend}>
              Amend &amp; resend
            </button>
          ) : null}
          {onRevoke ? (
            <button type="button" className="button ghost trade-action-btn" onClick={onRevoke}>
              Cancel offer
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function CompletedTradeCard({ trade }: { trade: TradeRow }) {
  return (
    <article className="trade-card">
      <div className="trade-parties">
        <div className="trade-side trade-side-gives">
          <div className="trade-franchise">{trade.franchiseName}</div>
          <div className="trade-direction">Gives</div>
          <div className="trade-assets">{formatMflAssetLabels(trade.offered)}</div>
        </div>
        <div className="trade-arrow" aria-hidden="true">→</div>
        <div className="trade-side trade-side-receives">
          <div className="trade-franchise">{trade.partnerName}</div>
          <div className="trade-direction">Gets</div>
          <div className="trade-assets">{formatMflAssetLabels(trade.requested)}</div>
        </div>
      </div>
      <div className="trade-meta">
        <span>{trade.timeLabel}</span>
        {trade.byCommish ? <span className="trade-commish">commissioner assisted</span> : null}
      </div>
    </article>
  );
}
