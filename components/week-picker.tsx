'use client';

import { CircleHelpIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

function buildWeekHref(pathname: string, searchParams: URLSearchParams, week: number): string {
  const nextParams = new URLSearchParams(searchParams);
  nextParams.set('week', String(week));
  const query = nextParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function WeekPicker({
  availableWeeks,
  currentWeek,
  selectedWeek,
}: {
  availableWeeks: number[];
  currentWeek: number;
  selectedWeek: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (value: string) => {
    const nextWeek = Number(value);
    if (!Number.isInteger(nextWeek)) {
      return;
    }

    router.push(buildWeekHref(pathname, new URLSearchParams(searchParams.toString()), nextWeek));
  };

  return (
    <div className="week-picker">
      <div className="week-picker-label-row">
        <Label htmlFor="week-picker-select" className="small muted">
          Week
        </Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="week-picker-help"
              aria-label="About week selection"
            >
              <CircleHelpIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 text-sm">
            <p className="font-medium">Scoreboard week</p>
            <p className="muted small">
              Jump to any available week. Week {currentWeek} is the league&apos;s current week.
            </p>
          </PopoverContent>
        </Popover>
      </div>
      <Select value={String(selectedWeek)} onValueChange={handleChange}>
        <SelectTrigger id="week-picker-select" className="field week-select w-full min-w-0">
          <SelectValue placeholder="Select week" />
        </SelectTrigger>
        <SelectContent>
          {availableWeeks.map((week) => (
            <SelectItem key={week} value={String(week)}>
              Week {week}
              {week === currentWeek ? ' (current)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
