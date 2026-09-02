export type TaskStatus = 'todo' | 'in_progress' | 'completed';

export type TaskPriority = 'low' | 'medium' | 'high';

export type TaskCategory =
  | 'work'
  | 'personal'
  | 'health'
  | 'errands'
  | 'learning'
  | 'other';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  dueDate?: string; // ISO date, e.g. 2026-08-24
  dueTime?: string; // e.g. "10:00"
  estimatedMinutes?: number;
  // A planned execution window, set by accepting a Plan My Day proposal
  // (see supabase/migrations/0010_task_scheduling.sql). Distinct from
  // dueDate/dueTime, which remain the task's actual deadline. All three
  // fields are present together or not at all — scheduledDate exists
  // specifically so a stale (past-day) schedule is never mistaken for
  // today's; the app must compare scheduledDate to today before treating
  // a task as scheduled "now".
  scheduledDate?: string; // "YYYY-MM-DD"
  scheduledStartTime?: string; // "HH:MM"
  scheduledEndTime?: string; // "HH:MM"
  // Recurrence (see supabase/migrations/0011_recurring_tasks_events.sql).
  // 'none' (the default) means an ordinary, non-recurring task — every
  // task created before this feature existed behaves exactly as before.
  recurrenceType: RecurrenceType;
  recurrenceDaysOfWeek?: number[]; // 0=Sun..6=Sat, only used for 'custom'
  recurrenceEndDate?: string; // inclusive last date the series applies to
  // Set only on a real task that overrides ONE occurrence of a series —
  // see src/lib/occurrences.ts for how this is used.
  recurrenceParentId?: string;
  recurrenceOccurrenceDate?: string;
}

export type CalendarEventType = 'event' | 'meeting';

export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  eventDate: string; // ISO date, e.g. 2026-08-24
  startTime?: string; // "10:00" — absent when allDay is true
  endTime?: string; // "10:30" — absent when allDay is true
  allDay: boolean;
  location?: string;
  eventType: CalendarEventType;
  // Recurrence — see the Task interface above for the same fields' meaning.
  recurrenceType: RecurrenceType;
  recurrenceDaysOfWeek?: number[];
  recurrenceEndDate?: string;
  recurrenceParentId?: string;
  recurrenceOccurrenceDate?: string;
}

/**
 * A reminder is purely "when Timo should notify the user about a Task or
 * Event" — notification-scheduling metadata, not a standalone item. It
 * always belongs to exactly one parent (never both, never neither) and
 * has no content or completion state of its own.
 */
export interface Reminder {
  id: string;
  // ISO 8601 timestamp (stored as timestamptz in Postgres, always UTC on
  // the wire). Built from — and displayed using — the device's local
  // timezone via the native Date object; never hardcode a timezone.
  remindAt: string;
  // The relative preset used to derive remindAt (0 = at time, 5 = 5 min
  // before, etc.), if any. Undefined means an absolute/custom time with
  // no relative meaning to re-derive.
  offsetMinutes?: number;
  taskId?: string;
  eventId?: string;
}

export type FocusSessionStatus = 'completed' | 'ended_early';

/**
 * A persisted record of a finished Focus session (see
 * supabase/migrations/0009_focus_sessions.sql). The live countdown itself
 * lives only in React state; a record like this is only ever written once
 * a session actually finishes (naturally or via "End session").
 */
export interface FocusSessionRecord {
  id: string;
  taskId?: string;
  startedAt: string; // ISO timestamp
  endedAt: string; // ISO timestamp
  plannedMinutes: number;
  // Seconds, not minutes — see the migration's notes on why this is more
  // accurate for short/early-ended sessions. Round only at display time.
  actualSeconds: number;
  status: FocusSessionStatus;
}
