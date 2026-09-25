"use client";

import type { MouseEvent, ReactNode } from 'react';

import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';

/** Optional player fields already present on roster/lineup/matchup/trade models. */
export type PlayerInfo = {
  name: string;
  position?: string | null;
  team?: string | null;
  status?: string | null;
  byeWeek?: number | string | null;
  salary?: string | null;
  ytdPoints?: number | string | null;
  contractYear?: number | string | null;
  injury?: string | null;
  score?: number | string | null;
  projection?: number | string | null;
};

function hasText(value: string | number | null | undefined): value is string | number {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="player-info-detail-row">
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function PlayerInfoChip({
  player,
  className,
  triggerClassName,
  children,
  onTriggerClick,
}: {
  player: PlayerInfo;
  className?: string;
  triggerClassName?: string;
  /** Optional custom trigger content; defaults to the player name. */
  children?: ReactNode;
  /** Called after the trigger click (e.g. stopPropagation for nested buttons). */
  onTriggerClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const details: Array<{ label: string; value: string | number }> = [];
  if (hasText(player.position)) details.push({ label: 'Position', value: player.position });
  if (hasText(player.team)) details.push({ label: 'NFL', value: player.team });
  if (hasText(player.status)) details.push({ label: 'Status', value: player.status });
  if (hasText(player.injury)) details.push({ label: 'Injury', value: player.injury });
  if (hasText(player.byeWeek)) details.push({ label: 'Bye', value: player.byeWeek });
  if (hasText(player.salary)) details.push({ label: 'Salary', value: player.salary });
  if (hasText(player.ytdPoints)) details.push({ label: 'YTD', value: player.ytdPoints });
  if (hasText(player.contractYear)) details.push({ label: 'Contract', value: player.contractYear });
  if (hasText(player.score)) details.push({ label: 'Score', value: player.score });
  if (hasText(player.projection)) details.push({ label: 'Proj', value: player.projection });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn('player-info-chip', triggerClassName)}
          aria-label={`Player info: ${player.name}`}
          onClick={onTriggerClick}
        >
          {children ?? player.name}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn('player-info-popover w-[min(18rem,calc(100vw-2rem))]', className)}>
        <PopoverHeader>
          <PopoverTitle>{player.name}</PopoverTitle>
          {hasText(player.position) || hasText(player.team) ? (
            <PopoverDescription>
              {[player.position, player.team].filter(hasText).join(' · ')}
            </PopoverDescription>
          ) : null}
        </PopoverHeader>
        {details.length > 0 ? (
          <div className="player-info-details">
            {details.map((detail) => (
              <DetailRow key={detail.label} label={detail.label} value={detail.value} />
            ))}
          </div>
        ) : (
          <p className="muted small">No extra details available for this player.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
