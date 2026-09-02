import type { CalendarEvent, Task } from '../types/task';
import { getOccurrencesInRange, type RecurrenceRule } from './recurrence';

export interface TaskOccurrence {
  /** Stable key for React lists and for completion/skip lookups: `${seriesId}::${date}`. */
  virtualId: string;
  date: string;
  /** The row to actually render — an override task if one exists for this date, else the series parent. */
  task: Task;
  /** The recurring parent's id (or the task's own id, if it isn't recurring). */
  seriesId: string;
  isRecurring: boolean;
  /** Whether this specific occurrence has been completed. */
  completed: boolean;
}

export interface EventOccurrence {
  virtualId: string;
  date: string;
  event: CalendarEvent;
  seriesId: string;
  isRecurring: boolean;
}

function toRule(item: {
  recurrenceType: Task['recurrenceType'];
  recurrenceDaysOfWeek?: number[];
  recurrenceEndDate?: string;
}): RecurrenceRule {
  return {
    type: item.recurrenceType ?? 'none',
    daysOfWeek: item.recurrenceDaysOfWeek,
    endDate: item.recurrenceEndDate,
  };
}

/**
 * Expands a list of tasks (which may include ordinary tasks, recurring
 * series parents, and occurrence-override tasks) into concrete
 * occurrences within [rangeStartISO, rangeEndISO].
 *
 * completions/skips are `${taskId}::${date}` key sets — see
 * src/lib/tasksApi.ts's fetchTaskOccurrenceCompletions/fetchTaskOccurrenceSkips.
 */
export function expandTaskOccurrences(
  tasks: Task[],
  rangeStartISO: string,
  rangeEndISO: string,
  completions: Set<string>,
  skips: Set<string>,
): TaskOccurrence[] {
  const overrideByKey = new Map<string, Task>();
  for (const task of tasks) {
    if (task.recurrenceParentId && task.recurrenceOccurrenceDate) {
      overrideByKey.set(`${task.recurrenceParentId}::${task.recurrenceOccurrenceDate}`, task);
    }
  }

  const results: TaskOccurrence[] = [];

  for (const task of tasks) {
    // Override rows are only ever shown attached to their series' date
    // slot (handled via overrideByKey above) — never as their own
    // separate standalone occurrence too.
    if (task.recurrenceParentId) continue;

    const rule = toRule(task);

    if (rule.type === 'none') {
      if (task.dueDate && task.dueDate >= rangeStartISO && task.dueDate <= rangeEndISO) {
        results.push({
          virtualId: `${task.id}::${task.dueDate}`,
          date: task.dueDate,
          task,
          seriesId: task.id,
          isRecurring: false,
          completed: task.status === 'completed',
        });
      }
      continue;
    }

    if (!task.dueDate) continue; // a series needs a first-occurrence date to recur from

    for (const date of getOccurrencesInRange(task.dueDate, rule, rangeStartISO, rangeEndISO)) {
      const key = `${task.id}::${date}`;
      if (skips.has(key)) continue;

      const override = overrideByKey.get(key);
      const effective = override ?? task;
      const completed = override ? override.status === 'completed' : completions.has(key);

      results.push({
        virtualId: key,
        date,
        task: effective,
        seriesId: task.id,
        isRecurring: true,
        completed,
      });
    }
  }

  return results;
}

/** Same idea as expandTaskOccurrences, for calendar events (no completion concept). */
export function expandEventOccurrences(
  events: CalendarEvent[],
  rangeStartISO: string,
  rangeEndISO: string,
  skips: Set<string>,
): EventOccurrence[] {
  const overrideByKey = new Map<string, CalendarEvent>();
  for (const event of events) {
    if (event.recurrenceParentId && event.recurrenceOccurrenceDate) {
      overrideByKey.set(`${event.recurrenceParentId}::${event.recurrenceOccurrenceDate}`, event);
    }
  }

  const results: EventOccurrence[] = [];

  for (const event of events) {
    if (event.recurrenceParentId) continue;

    const rule = toRule(event);

    if (rule.type === 'none') {
      if (event.eventDate >= rangeStartISO && event.eventDate <= rangeEndISO) {
        results.push({
          virtualId: `${event.id}::${event.eventDate}`,
          date: event.eventDate,
          event,
          seriesId: event.id,
          isRecurring: false,
        });
      }
      continue;
    }

    for (const date of getOccurrencesInRange(event.eventDate, rule, rangeStartISO, rangeEndISO)) {
      const key = `${event.id}::${date}`;
      if (skips.has(key)) continue;

      results.push({
        virtualId: key,
        date,
        event: overrideByKey.get(key) ?? event,
        seriesId: event.id,
        isRecurring: true,
      });
    }
  }

  return results;
}

/** Whether `dateISO` is a valid occurrence date of this specific task/event (single-date check, no range needed). */
export function isDateAnOccurrence(
  item: { dueDate?: string; eventDate?: string } & {
    recurrenceType: Task['recurrenceType'];
    recurrenceDaysOfWeek?: number[];
    recurrenceEndDate?: string;
  },
  dateISO: string,
): boolean {
  const base = item.dueDate ?? item.eventDate;
  if (!base) return false;
  return getOccurrencesInRange(base, toRule(item), dateISO, dateISO).length > 0;
}
