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
