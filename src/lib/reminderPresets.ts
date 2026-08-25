import { isoStringToLocalDateTime } from './utils';

// ---------------------------------------------------------------------------
// A reminder is now purely "when to notify about a task/event", expressed
// either as a relative offset (e.g. "15 minutes before") or as an absolute
// custom date/time. This module is the single source of truth for those
// presets so the Task and Event reminder pickers stay in sync.
// ---------------------------------------------------------------------------

export type ReminderPresetKey =
  | 'none'
  | 'at_time'
  | '5_before'
  | '15_before'
  | '30_before'
  | '1h_before'
  | '1d_before'
  | 'custom';

export const RELATIVE_PRESETS: { key: ReminderPresetKey; label: string; minutes: number }[] = [
  { key: 'at_time', label: 'At time', minutes: 0 },
  { key: '5_before', label: '5 min before', minutes: 5 },
  { key: '15_before', label: '15 min before', minutes: 15 },
  { key: '30_before', label: '30 min before', minutes: 30 },
  { key: '1h_before', label: '1 hour before', minutes: 60 },
  { key: '1d_before', label: '1 day before', minutes: 1440 },
];

export function presetForOffset(offsetMinutes: number | undefined): ReminderPresetKey {
  if (offsetMinutes === undefined) return 'custom';
  const match = RELATIVE_PRESETS.find((p) => p.minutes === offsetMinutes);
  return match ? match.key : 'custom';
}

export function minutesForPreset(key: ReminderPresetKey): number | undefined {
  return RELATIVE_PRESETS.find((p) => p.key === key)?.minutes;
}

/**
 * Subtracts `minutesBefore` from a local date+time (both interpreted in
 * the device's local timezone) and returns an ISO 8601 UTC timestamp
 * suitable for the `remind_at` column. Never hardcodes a timezone.
 */
export function computeRemindAt(dateISO: string, time: string, minutesBefore: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  const base = new Date(y, m - 1, d, h, min);
  base.setMinutes(base.getMinutes() - minutesBefore);
  return base.toISOString();
}

/**
 * Human label for an already-resolved reminder. Prefers the stored
 * relative preset (so it stays accurate even if displayed far from the
 * parent's own scheduled time); falls back to an absolute local date/time
 * for custom reminders.
 */
export function formatReminderLabel(
  remindAt: string,
  offsetMinutes: number | undefined,
  atLabel = 'At time',
): string {
  if (offsetMinutes !== undefined) {
    const preset = RELATIVE_PRESETS.find((p) => p.minutes === offsetMinutes);
    if (preset) return preset.key === 'at_time' ? atLabel : preset.label;
  }
  const { date, time } = isoStringToLocalDateTime(remindAt);
  const d = new Date(`${date}T${time}`);
  const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
  const timeLabel = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
  return `${dateLabel} at ${timeLabel}`;
}
