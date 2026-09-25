"use client";

import { EllipsisIcon } from 'lucide-react';

import type { MflAsset } from '@/lib/mfl-assets';
import { tradeCardSides, type TradeRow } from '@/lib/mfl-trades';
import {
  FANTASYCALC_TRADE_CALCULATOR_URL,
  formatDelta,
  formatValueNumber,
  KTC_TRADE_CALCULATOR_URL,
  type TradeValueRead,
} from '@/lib/trade-value-help';
import { PlayerInfoChip } from '@/components/player-info-chip';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

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

function TradeAssetList({ assets }: { assets: MflAsset[] }) {
  if (assets.length === 0) {
    return <div className="trade-assets muted">—</div>;
  }

  return (
    <div className="trade-assets trade-asset-chip-list">
      {assets.map((asset) =>
        asset.kind === 'player' ? (
          <PlayerInfoChip
            key={asset.id}
            player={{ name: asset.label }}
            triggerClassName="player-info-chip-inline"
          />
        ) : (
          <span key={asset.id} className="trade-asset-static">
            {asset.label}
          </span>
        ),
      )}
    </div>
  );
}

function TradeParties({
  sides,
}: {
  sides: ReturnType<typeof tradeCardSides>;
}) {
  return (
    <div className="trade-parties">
      <div className="trade-side trade-side-gets">
        {sides.left.franchiseName ? (
          <div className="trade-franchise">{sides.left.franchiseName}</div>
        ) : null}
        <div className="trade-direction">{sides.left.label}</div>
        <TradeAssetList assets={sides.left.assets} />
      </div>
      <div className="trade-arrow" aria-hidden="true">→</div>
      <div className="trade-side trade-side-gives">
        {sides.right.franchiseName ? (
          <div className="trade-franchise">{sides.right.franchiseName}</div>
        ) : null}
        <div className="trade-direction">{sides.right.label}</div>
        <TradeAssetList assets={sides.right.assets} />
      </div>
    </div>
  );
}

function TradePartnerTitle({ title }: { title: string }) {
  return <h3 className="trade-partner-title">{title}</h3>;
}

export function TradeCard({
  trade,
  primaryFranchiseId,
  onAccept,
  onDecline,
  onCounter,
  onRevoke,
  onAmend,
}: {
  trade: TradeRow;
  primaryFranchiseId: string | null;
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
  const sides = tradeCardSides(trade, primaryFranchiseId);
  const overflowActions = [
    onCounter ? { label: 'Counter', onClick: onCounter } : null,
    onAmend ? { label: 'Amend & resend', onClick: onAmend } : null,
    onRevoke ? { label: 'Cancel offer', onClick: onRevoke } : null,
  ].filter((action): action is { label: string; onClick: () => void } => Boolean(action));

  return (
    <article className={`trade-card${isPending ? ' trade-card-pending' : ''}`}>
      {sides.partnerTitle ? <TradePartnerTitle title={sides.partnerTitle} /> : null}
      <TradeParties sides={sides} />
      <div className="trade-meta">
        {sides.partnerMeta ? <span>{sides.partnerMeta}</span> : null}
        {sides.partnerMeta ? <span aria-hidden="true">·</span> : null}
        <span>{trade.timeLabel}</span>
        {trade.expiresLabel ? <span>· expires {trade.expiresLabel}</span> : null}
        {trade.byCommish ? <span className="trade-commish">commissioner assisted</span> : null}
        {isPending ? <Badge variant="secondary">Pending</Badge> : null}
        {hasOutgoingActions ? <Badge variant="outline">Your offer</Badge> : null}
      </div>
      {trade.valueRead ? (
        <TradeValueHelp valueRead={trade.valueRead} playerNames={playerLabelsForManual(trade)} />
      ) : null}
      {showActions ? (
        <div className="trade-actions">
          {onAccept ? (
            <Button type="button" className="trade-action-btn" onClick={onAccept}>
              Accept
            </Button>
          ) : null}
          {onDecline ? (
            <Button type="button" variant="outline" className="trade-action-btn" onClick={onDecline}>
              Decline
            </Button>
          ) : null}
          {overflowActions.length > 0 ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="trade-action-more"
                  aria-label="More trade actions"
                >
                  <EllipsisIcon />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-44 p-1.5">
                {overflowActions.map((action) => (
                  <Button
                    key={action.label}
                    type="button"
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={action.onClick}
                  >
                    {action.label}
                  </Button>
                ))}
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function CompletedTradeCard({
  trade,
  primaryFranchiseId,
}: {
  trade: TradeRow;
  primaryFranchiseId: string | null;
}) {
  const sides = tradeCardSides(trade, primaryFranchiseId);

  return (
    <article className="trade-card">
      {sides.partnerTitle ? <TradePartnerTitle title={sides.partnerTitle} /> : null}
      <TradeParties sides={sides} />
      <div className="trade-meta">
        {sides.partnerMeta ? <span>{sides.partnerMeta}</span> : null}
        {sides.partnerMeta ? <span aria-hidden="true">·</span> : null}
        <span>{trade.timeLabel}</span>
        {trade.byCommish ? <span className="trade-commish">commissioner assisted</span> : null}
      </div>
    </article>
  );
}
