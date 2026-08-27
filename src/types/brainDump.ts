import type { CalendarEventType, TaskCategory, TaskPriority } from './task';

export type BrainDumpSuggestionType = 'task' | 'event';

/**
 * A single AI-generated suggestion, shown on the Review screen before the
 * user chooses to create anything. Nothing here is persisted directly —
 * approved suggestions are converted into normal NewTaskInput/NewEventInput
 * objects and created through the existing addTask/addEvent flow.
 */
export interface BrainDumpSuggestion {
  /** Client-side id for list management only (not a database id). */
  id: string;
  type: BrainDumpSuggestionType;
  title: string;
  description?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM — task due time, or event start time
  endTime?: string; // HH:MM — event end time only
  priority?: TaskPriority;
  category?: TaskCategory;
  estimatedMinutes?: number;
  eventType?: CalendarEventType;
  location?: string;
  confidence?: number;
  /** Whether this suggestion is currently selected for creation. */
  included: boolean;
  /** Simple title+date match against existing items — not semantic dedup. */
  possibleDuplicate?: boolean;
}
