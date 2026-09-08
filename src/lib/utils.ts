import type { Strings } from '../i18n/en';
import type { Locale } from '../i18n/LocaleContext';
import { getWeekStartOffset } from './weekUtils';

export function getGreetingKey(date: Date = new Date()): 'greetingMorning' | 'greetingAfternoon' | 'greetingEvening' {
  const hour = date.getHours();
  if (hour < 12) return 'greetingMorning';
  if (hour < 18) return 'greetingAfternoon';
  return 'greetingEvening';
}

export function formatFriendlyDate(locale: Locale, date: Date = new Date()) {
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/**
 * A short, locale-aware label for a date beyond today — "Tomorrow" (or
 * the caller's localized equivalent) for the very next day, otherwise a
 * short date like "Sep 5" (or the French-formatted equivalent, e.g. "5
 * sept.", via Intl.DateTimeFormat). Used by Tasks > Upcoming, where the
 * date isn't otherwise implied by which list a row is in.
 */
/**
 * A short, locale-aware date-context label for a task row, applied
 * consistently across every Tasks filter (All/Today/Overdue/Upcoming/
 * Completed) — not just Upcoming.
 *   - due today -> the caller's localized "Today"
 *   - due tomorrow -> the caller's localized "Tomorrow"
 *   - due yesterday -> the caller's localized "Yesterday"
 *   - due later within the CURRENT calendar week (Sunday–Saturday,
 *     inclusive, ending this week's Saturday) -> the weekday name via
 *     Intl.DateTimeFormat (never a hard-coded weekday string, so this
 *     works correctly in any locale)
 *   - anything else (further future, or past and not yesterday) -> a
 *     short explicit date via Intl.DateTimeFormat, e.g. "Sep 12" / "12
 *     sept."
 */
export function formatTaskRowDateLabel(
  locale: Locale,
  dateISO: string,
  todayISO: string,
  labels: { today: string; tomorrow: string; yesterday: string },
): string {
  if (dateISO === todayISO) return labels.today;
  if (dateISO === addDays(todayISO, 1)) return labels.tomorrow;
  if (dateISO === addDays(todayISO, -1)) return labels.yesterday;

  const intlLocale = locale === 'fr' ? 'fr-FR' : 'en-US';

  if (dateISO > todayISO) {
    const daysUntilSaturday = 6 - parseISODate(todayISO).getDay();
    const currentWeekEndISO = addDays(todayISO, daysUntilSaturday);
    if (dateISO <= currentWeekEndISO) {
      return new Intl.DateTimeFormat(intlLocale, { weekday: 'long' }).format(parseISODate(dateISO));
    }
  }

  return new Intl.DateTimeFormat(intlLocale, { month: 'short', day: 'numeric' }).format(parseISODate(dateISO));
}

/** Parses a 'YYYY-MM-DD' string as a local date (avoids UTC offset surprises). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Returns the ISO dates of the week containing the given date, starting on `firstDayOfWeek` (0=Sun..6=Sat, defaults to Monday). */
export function getWeekDates(iso: string, firstDayOfWeek: number = 1): string[] {
  const date = parseISODate(iso);
  const offset = getWeekStartOffset(date, firstDayOfWeek);
  const weekStart = new Date(date);
  weekStart.setDate(date.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return toISODate(d);
  });
}

export function formatDuration(minutes: number, t: Strings) {
  if (minutes < 60) return `${minutes} ${t.common.minutes}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * Combines a 'YYYY-MM-DD' date and 'HH:MM' time — both interpreted in the
 * device's local timezone — into an ISO 8601 UTC timestamp suitable for a
 * Postgres `timestamptz` column. Never hardcodes a timezone; always uses
 * whatever timezone the browser/device is currently in.
 */
export function localDateTimeToISOString(dateISO: string, time: string): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min).toISOString();
}

/**
 * Splits a stored UTC timestamp back into local-timezone 'YYYY-MM-DD' date
 * and 'HH:MM' time strings, for populating date/time form inputs.
 */
export function isoStringToLocalDateTime(iso: string): { date: string; time: string } {
  const date = new Date(iso);
  return {
    date: toISODate(date),
    time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
  };
}

/** Formats a stored UTC timestamp as a short local time, e.g. "10:00 AM". */
export function formatLocalTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** Formats a stored UTC timestamp as a short local date, e.g. "Aug 25". */
export function formatLocalShortDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
}

/**
 * Sort comparator for today-scoped task lists (Today's Tasks, Tasks >
 * Today): tasks scheduled for TODAY specifically — via Plan My Day's
 * scheduledDate/scheduledStartTime, which is distinct from dueDate and
 * never itself modified by this comparator — sort chronologically by
 * their scheduled start time. Tasks without a scheduled time for today
 * keep their existing relative order (this relies on Array.prototype.sort
 * being a STABLE sort, guaranteed by the JS spec since ES2019) and always
 * sort after any scheduled ones, never interleaved among them.
 *
 * Works correctly for a recurring occurrence override without any special
 * casing: callers already resolve a recurring entry to its effective
 * task object (the override when one exists, the series parent
 * otherwise) before calling this — that resolved object's own
 * scheduledDate/scheduledStartTime is exactly what's compared here, the
 * same as for any ordinary task.
 */
export function compareByScheduledStartTime(
  a: { scheduledDate?: string; scheduledStartTime?: string },
  b: { scheduledDate?: string; scheduledStartTime?: string },
  todayISO: string,
): number {
  const aTime = a.scheduledDate === todayISO ? a.scheduledStartTime : undefined;
  const bTime = b.scheduledDate === todayISO ? b.scheduledStartTime : undefined;
  if (aTime && bTime) return aTime.localeCompare(bTime);
  if (aTime) return -1;
  if (bTime) return 1;
  return 0;
}
