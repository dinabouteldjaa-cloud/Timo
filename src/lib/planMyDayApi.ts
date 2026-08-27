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

export async function planMyDay(tasks: Task[], events: CalendarEvent[]): Promise<PlanMyDayResult> {
  const now = new Date();
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const localTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

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
    body: { localDate, localTime, tasks: payloadTasks, events: payloadEvents },
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
