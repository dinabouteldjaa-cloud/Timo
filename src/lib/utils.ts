import type { Strings } from '../i18n/en';
import type { Locale } from '../i18n/LocaleContext';

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

/** Returns the ISO dates (Mon–Sun) of the week containing the given date. */
export function getWeekDates(iso: string): string[] {
  const date = parseISODate(iso);
  const offset = (date.getDay() + 6) % 7; // Monday-first
  const monday = new Date(date);
  monday.setDate(date.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toISODate(d);
  });
}

export function formatDuration(minutes: number, t: Strings) {
  if (minutes < 60) return `${minutes} ${t.common.minutes}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${rest}`;
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
