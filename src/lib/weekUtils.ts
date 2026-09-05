// ---------------------------------------------------------------------------
// Shared week-DISPLAY-ORDER utilities. This controls only which day is
// shown first in a week — it never changes the internal weekday numbering
// (0=Sunday..6=Saturday) used by recurrenceDaysOfWeek, the recurrence
// engine, or Brain Dump's schema. "Every weekday" stays [1,2,3,4,5]
// regardless of display order, since that array is defined in terms of
// these fixed numbers, never display position.
// ---------------------------------------------------------------------------

/**
 * The 7 weekday numbers (0=Sun..6=Sat) in DISPLAY order for a given first
 * day of the week.
 *   getOrderedWeekdays(1) -> [1,2,3,4,5,6,0]  (Monday-first)
 *   getOrderedWeekdays(0) -> [0,1,2,3,4,5,6]  (Sunday-first)
 *   getOrderedWeekdays(6) -> [6,0,1,2,3,4,5]  (Saturday-first)
 */
export function getOrderedWeekdays(firstDayOfWeek: number): number[] {
  return Array.from({ length: 7 }, (_, i) => (firstDayOfWeek + i) % 7);
}

/**
 * How many days before `date` the week (as displayed, given
 * firstDayOfWeek) actually starts — i.e. the grid offset needed so a
 * month/week view aligns its first column with the chosen first day.
 *   getWeekStartOffset(date, 1) -> Monday-first offset (0 when date IS a Monday)
 *   getWeekStartOffset(date, 0) -> Sunday-first offset (0 when date IS a Sunday)
 */
export function getWeekStartOffset(date: Date, firstDayOfWeek: number): number {
  return (date.getDay() - firstDayOfWeek + 7) % 7;
}
