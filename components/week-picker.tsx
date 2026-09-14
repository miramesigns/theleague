'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ChangeEvent } from 'react';

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

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextWeek = Number(event.target.value);
    if (!Number.isInteger(nextWeek)) {
      return;
    }

    router.push(buildWeekHref(pathname, new URLSearchParams(searchParams.toString()), nextWeek));
  };

  return (
    <label className="week-picker" htmlFor="week-picker-select">
      <span className="small muted">Week</span>
      <select id="week-picker-select" className="field week-select" value={String(selectedWeek)} onChange={handleChange}>
        {availableWeeks.map((week) => (
          <option key={week} value={week}>
            Week {week}{week === currentWeek ? ' (current)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
