// ---------------------------------------------------------------------------
// Recurrence is stored as a RULE on the parent task/event, never as
// hundreds of pre-generated future rows (see 0011_recurring_tasks_events.sql).
// This module computes, on demand, which dates a rule actually falls on —
// used by Today/Tasks/Calendar/Plan My Day to expand a series into the
// specific occurrences relevant to whatever date range is on screen.
// ---------------------------------------------------------------------------

import type { RecurrenceType } from '../types/task';

export type { RecurrenceType };

export interface RecurrenceRule {
  type: RecurrenceType;
  /** 0 = Sunday .. 6 = Saturday. Only meaningful for type === 'custom'. */
  daysOfWeek?: number[];
  /** Inclusive last date the series applies to. Undefined/null = never ends. */
  endDate?: string;
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Whether `dateISO` is a valid occurrence of a series whose first instance was on `baseDateISO`. */
export function isOccurrence(baseDateISO: string, rule: RecurrenceRule, dateISO: string): boolean {
  if (dateISO < baseDateISO) return false;
  if (rule.endDate && dateISO > rule.endDate) return false;

  if (rule.type === 'none') return dateISO === baseDateISO;

  const base = parseISO(baseDateISO);
  const date = parseISO(dateISO);

  switch (rule.type) {
    case 'daily':
      return true;
    case 'weekly':
      return date.getDay() === base.getDay();
    case 'monthly': {
      // Preserve the intended day-of-month; if the target month is too
      // short to have that day (e.g. the 31st in a 30-day month), fall
      // back to that month's last day rather than silently skipping it.
      const targetDay = base.getDate();
      const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      const effectiveDay = Math.min(targetDay, lastDayOfTargetMonth);
      return date.getDate() === effectiveDay;
    }
    case 'custom':
      return (rule.daysOfWeek ?? []).includes(date.getDay());
    default:
      return false;
  }
}

/** All occurrence dates (inclusive) of a series that fall within [rangeStartISO, rangeEndISO]. */
export function getOccurrencesInRange(
  baseDateISO: string,
  rule: RecurrenceRule,
  rangeStartISO: string,
  rangeEndISO: string,
): string[] {
  if (rule.type === 'none') {
    return baseDateISO >= rangeStartISO && baseDateISO <= rangeEndISO ? [baseDateISO] : [];
  }

  const effectiveStart = baseDateISO > rangeStartISO ? baseDateISO : rangeStartISO;
  const effectiveEnd = rule.endDate && rule.endDate < rangeEndISO ? rule.endDate : rangeEndISO;
  if (effectiveStart > effectiveEnd) return [];

  const results: string[] = [];
  let cursor = parseISO(effectiveStart);
  const endDate = parseISO(effectiveEnd);
  // Defensive cap — a misconfigured/very wide range can never hang the UI.
  let guard = 0;
  while (cursor <= endDate && guard < 3660) {
    const iso = formatISO(cursor);
    if (isOccurrence(baseDateISO, rule, iso)) results.push(iso);
    cursor = addDays(cursor, 1);
    guard++;
  }
  return results;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Short, human label for Task/Event Details, e.g. "Every Monday", "Sun,
 * Tue, Thu". Null for non-recurring.
 *
 * workingDays (default Mon-Fri, for any caller without profile access —
 * see AppStateContext.workingDays) is DISPLAY LABEL ONLY: it decides
 * whether a custom recurrence's exact day set matches what this user
 * calls "weekday" closely enough to show the friendly "Every weekday"
 * phrase, instead of spelling out the day list. It never affects
 * isOccurrence/getOccurrencesInRange or any actual date calculation.
 */
export function describeRecurrence(
  rule: RecurrenceRule,
  baseDateISO: string,
  workingDays: number[] = [1, 2, 3, 4, 5],
): string | null {
  switch (rule.type) {
    case 'none':
      return null;
    case 'daily':
      return 'Daily';
    case 'weekly':
      return `Every ${WEEKDAY_LONG[parseISO(baseDateISO).getDay()]}`;
    case 'monthly':
      return 'Monthly';
    case 'custom': {
      const days = [...(rule.daysOfWeek ?? [])].sort((a, b) => a - b);
      if (days.length === 7) return 'Every day';
      const sortedWorkingDays = [...workingDays].sort((a, b) => a - b);
      const matchesWorkingDays =
        days.length === sortedWorkingDays.length && days.every((d, i) => d === sortedWorkingDays[i]);
      if (matchesWorkingDays) return 'Every weekday';
      if (days.length === 0) return null;
      return days.map((d) => WEEKDAY_SHORT[d]).join(', ');
    }
    default:
      return null;
  }
}

export const emptyRecurrenceRule = (): RecurrenceRule => ({ type: 'none' });
