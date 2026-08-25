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

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO date
  startTime: string; // "10:00"
  endTime: string; // "10:30"
  type: 'event' | 'task';
  location?: string;
}
