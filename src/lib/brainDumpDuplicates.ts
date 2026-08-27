import type { CalendarEvent, Task } from '../types/task';
import type { BrainDumpSuggestion } from '../types/brainDump';

/**
 * Deliberately simple for V1 — an exact (case-insensitive) title match on
 * the same date against the user's existing tasks/events. Not semantic
 * dedup; just enough to flag the obvious case without ever auto-merging
 * or deleting anything. The user decides what to do with the flag.
 */
export function isPossibleDuplicate(
  suggestion: Pick<BrainDumpSuggestion, 'type' | 'title' | 'date'>,
  tasks: Task[],
  events: CalendarEvent[],
): boolean {
  const title = suggestion.title.trim().toLowerCase();
  if (!title) return false;

  if (suggestion.type === 'task') {
    return tasks.some(
      (task) =>
        task.title.trim().toLowerCase() === title &&
        (!suggestion.date || task.dueDate === suggestion.date),
    );
  }

  return events.some(
    (event) =>
      event.title.trim().toLowerCase() === title &&
      (!suggestion.date || event.eventDate === suggestion.date),
  );
}
