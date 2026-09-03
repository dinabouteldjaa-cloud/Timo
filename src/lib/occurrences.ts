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
      // Completion for a recurring occurrence — whether resolved through
      // an override or computed virtually — always comes from
      // task_occurrence_completions, keyed on (seriesId, date). `key`
      // here is already exactly that pair: this loop only ever reaches
      // series parents (override rows are skipped via the
      // `recurrenceParentId` check above), so `task.id` in `key` IS the
      // series id. An override's own `status` column is a leftover of
      // it being an ordinary task row and must never become an
      // independent completion source — otherwise toggling completion
      // (which always writes to task_occurrence_completions, see
      // AppStateContext's setTaskOccurrenceCompletion) could silently
      // have no visible effect for an edited occurrence.
      const completed = completions.has(key);

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

export interface CompletedTaskOccurrence extends TaskOccurrence {
  completedAt: string;
}

/**
 * Resolves completed recurring occurrences DIRECTLY from stored
 * completion records (task_occurrence_completions), instead of
 * expanding a wide — or unbounded — date range and filtering for
 * completed ones. Each completion record already tells us exactly
 * which (series, date) pair was completed, so this only ever does a
 * couple of O(1) map lookups per record, regardless of how far back
 * completion history goes or how long a series has existed. This is
 * what makes it safe to use for a full "Completed history" view without
 * ever calling getOccurrencesInRange over a huge span.
 *
 * Used only by the Completed tab's history — expandTaskOccurrences and
 * its forward-looking, range-based expansion (used by Today/Upcoming/
 * Overdue/All) are completely untouched by this.
 */
export function resolveCompletedTaskOccurrences(
  tasks: Task[],
  completionRecords: Map<string, string>,
  skips: Set<string>,
): CompletedTaskOccurrence[] {
  const tasksById = new Map<string, Task>();
  const overrideByKey = new Map<string, Task>();
  for (const task of tasks) {
    tasksById.set(task.id, task);
    if (task.recurrenceParentId && task.recurrenceOccurrenceDate) {
      overrideByKey.set(`${task.recurrenceParentId}::${task.recurrenceOccurrenceDate}`, task);
    }
  }

  const results: CompletedTaskOccurrence[] = [];

  for (const [key, completedAt] of completionRecords) {
    // An occurrence explicitly removed via "This occurrence" delete
    // must never surface, even if it happens to have a completion
    // record from before it was removed — consistent with skips always
    // being excluded everywhere else in the app (see
    // expandTaskOccurrences above).
    if (skips.has(key)) continue;

    const [seriesId, date] = key.split('::');
    const seriesParent = tasksById.get(seriesId);
    // The series no longer exists locally — in practice this shouldn't
    // happen, since task_occurrence_completions rows cascade-delete
    // with their series (see 0011_recurring_tasks_events.sql), but skip
    // defensively rather than rendering a broken row.
    if (!seriesParent) continue;

    const effective = overrideByKey.get(key) ?? seriesParent;

    results.push({
      virtualId: key,
      date,
      task: effective,
      seriesId,
      isRecurring: true,
      completed: true,
      completedAt,
    });
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
