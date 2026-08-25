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
}

export type CalendarEventType = 'event' | 'meeting';

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
