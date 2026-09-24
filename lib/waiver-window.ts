/**
 * League waiver claim window (policy, not MFL settings).
 *
 * Default: Monday 8:00 AM ET → Wednesday 10:00 PM ET
 * Exception: weeks with a Wednesday night NFL game close Tuesday 10:00 PM ET
 *            (still open Monday 8:00 AM ET).
 *
 * 2026 Wednesday NFL games (verified):
 * - Week 1: Wed Sep 9 — NE @ SEA
 * - Week 12: Wed Nov 25 — GB @ LAR (Thanksgiving Eve)
 */

export const WAIVER_WINDOW_OPEN_LABEL = 'Mon 8am';
export const WAIVER_WINDOW_DEFAULT_CLOSE_LABEL = 'Wed 10pm ET';
export const WAIVER_WINDOW_EARLY_CLOSE_LABEL = 'Tue 10pm ET';

/** 2026 NFL weeks with a Wednesday night game — waiver window closes Tue 10pm ET. */
export const WAIVER_WINDOW_EARLY_CLOSE_WEEKS_2026 = [1, 12] as const;

export type WaiverWindowInfo = {
  /** Compact label for the FAAB panel, e.g. "Mon 8am – Wed 10pm ET". */
  label: string;
  /** True when this week closes Tuesday because of a Wed NFL game. */
  closesEarly: boolean;
  /** Week used to compute the window, if known. */
  week: number | null;
  /**
   * Extra note when week is unknown — remind that Wed-game weeks close Tue.
   * Empty when an effective week-specific label is shown.
   */
  note: string;
};

export function isEarlyCloseWaiverWeek(week: number | null | undefined, seasonYear = 2026): boolean {
  if (week === null || week === undefined || !Number.isInteger(week) || week < 1) return false;
  if (seasonYear !== 2026) return false;
  return (WAIVER_WINDOW_EARLY_CLOSE_WEEKS_2026 as readonly number[]).includes(week);
}

export function formatWaiverWindowLabel(closesEarly: boolean): string {
  const close = closesEarly ? WAIVER_WINDOW_EARLY_CLOSE_LABEL : WAIVER_WINDOW_DEFAULT_CLOSE_LABEL;
  return `${WAIVER_WINDOW_OPEN_LABEL} – ${close}`;
}

/**
 * Effective waiver window for a league week.
 * Pass `week` when known (e.g. from live scoring); otherwise returns the
 * default Mon–Wed copy plus a short exception note.
 */
export function getWaiverWindow(week: number | null | undefined, seasonYear = 2026): WaiverWindowInfo {
  const knownWeek = typeof week === 'number' && Number.isInteger(week) && week >= 1 ? week : null;

  if (knownWeek === null) {
    return {
      label: formatWaiverWindowLabel(false),
      closesEarly: false,
      week: null,
      note: 'Weeks with a Wed NFL game close Tue 10pm ET.',
    };
  }

  const closesEarly = isEarlyCloseWaiverWeek(knownWeek, seasonYear);
  return {
    label: formatWaiverWindowLabel(closesEarly),
    closesEarly,
    week: knownWeek,
    note: '',
  };
}
