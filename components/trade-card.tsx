"use client";

import { formatMflAssetLabels } from '@/lib/mfl-assets';
import type { TradeRow } from '@/lib/mfl-trades';

export function TradeCard({ trade }: { trade: TradeRow }) {
  const isPending = trade.status === 'pending';

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
      </div>
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
