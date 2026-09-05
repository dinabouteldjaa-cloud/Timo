import type { CalendarEventType, TaskCategory, TaskPriority } from './task';
import type { ReminderPickerValue } from '../components/ui/ReminderPicker';
import type { RecurrencePickerValue } from '../components/ui/RecurrencePicker';

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
  /**
   * Reuses the EXACT same value shape as the existing Add Task/Event
   * reminder picker, so the Review card can embed the real <ReminderPicker>
   * component unchanged. { preset: 'none', ... } means no reminder — this
   * is the default; a reminder is only ever populated here when the AI
   * detected explicit reminder intent in the text (see brainDumpApi.ts).
   */
  reminder: ReminderPickerValue;
  /**
   * Reuses the EXACT same value shape as the existing Add Task/Event
   * recurrence picker, so the Review card can embed the real
   * <RecurrencePicker> component unchanged. { type: 'none', ... } means
   * one-off (not recurring) — the default; recurrence is only ever
   * populated here when the AI detected explicit repetition wording in
   * the text (see brainDumpApi.ts).
   */
  recurrence: RecurrencePickerValue;
}
