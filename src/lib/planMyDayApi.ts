import { supabase } from './supabaseClient';
import type { CalendarEvent, Task } from '../types/task';
import type { PlanMyDayResult } from '../types/planMyDay';

// ---------------------------------------------------------------------------
// Calls the plan-my-day Edge Function, which does the actual AI request
// server-side (see supabase/functions/plan-my-day/index.ts). Only the
// structured fields actually needed for scheduling are sent — never full
// task/event objects, descriptions, or other unrelated content. The
// function returns a validated, conflict-free proposal only; accepting it
// still goes through the existing setTaskSchedule action, so RLS applies
// exactly as it does everywhere else.
// ---------------------------------------------------------------------------

async function extractFunctionErrorMessage(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown })?.context;
  if (context && typeof context === 'object' && 'json' in context) {
    try {
      const body = await (context as { json: () => Promise<{ error?: string }> }).json();
      if (body?.error) return body.error;
    } catch {
      // Response body wasn't JSON or already consumed — fall through.
    }
  }
  return null;
}

/**
 * Deterministically computes the earliest time a newly generated plan may
 * start scheduling — roughly 10 minutes from now, rounded UP to the next
 * 5-minute boundary. This exists so a freshly generated plan doesn't go
 * stale by the time the user has actually reviewed it and pressed Accept
 * (the original bug: a first task starting at essentially the current
 * minute was already in the past by the time Accept ran). This is a
 * plain, deterministic calculation — never left to the AI to interpret
 * "about 10 minutes" — and the SAME value is sent to the server, so the
 * prompt's instruction and the server's own post-hoc validation agree on
 * exactly the same boundary rather than drifting apart.
 *
 * Examples: 15:31 -> 15:45, 15:36 -> 15:50, 15:52 -> 16:05, 15:55 ->
 * 16:05 (already on a boundary), 15:59 -> 16:10.
 *
 * Returns null when the rounded target reaches or passes 24:00 — Plan My
 * Day only ever schedules within the CURRENT localDate, so a wrapped
 * value like "00:05" would be silently misread as earlier TODAY rather
 * than tomorrow. There is no valid same-day scheduling window left in
 * that case (roughly the last ~10-15 minutes before midnight); the
 * caller returns everything as Unscheduled instead of asking the AI to
 * schedule into a nonsensical time.
 */
export function computeEarliestStart(now: Date = new Date()): string | null {
  const totalMinutes = now.getHours() * 60 + now.getMinutes() + 10;
  const rounded = Math.ceil(totalMinutes / 5) * 5;
  if (rounded >= 24 * 60) return null;
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export async function planMyDay(tasks: Task[], events: CalendarEvent[]): Promise<PlanMyDayResult> {
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const earliestStart = computeEarliestStart(now);

  if (earliestStart === null) {
    // No valid same-day scheduling window remains (see
    // computeEarliestStart's own comment) — this is already a certain,
    // deterministic outcome, so return it directly without spending an
    // Edge Function/AI call on a request that could only ever come back
    // empty. Fixed events are unaffected — they're rendered entirely
    // client-side from `todaysEvents`, independent of this result.
    return {
      scheduled: [],
      unscheduled: tasks.map((t) => ({ taskId: t.id, reason: 'Not enough time left today.' })),
    };
  }

  const payloadTasks = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    category: t.category,
    estimatedMinutes: t.estimatedMinutes,
    dueTime: t.dueTime,
  }));

  const payloadEvents = events.map((e) => ({
    title: e.title,
    startTime: e.startTime,
    endTime: e.endTime,
    allDay: e.allDay,
  }));

  const { data, error } = await supabase.functions.invoke('plan-my-day', {
    body: { localDate, localTime, earliestStart, tasks: payloadTasks, events: payloadEvents },
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[planMyDayApi] plan failed', error);
    const forwardedMessage = await extractFunctionErrorMessage(error);
    throw new Error(forwardedMessage || "Timo couldn't plan your day right now. Try again.");
  }

  return {
    scheduled: data?.scheduled ?? [],
    unscheduled: data?.unscheduled ?? [],
  };
}
