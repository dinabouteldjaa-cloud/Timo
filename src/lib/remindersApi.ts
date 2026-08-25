import { supabase } from './supabaseClient';
import { toSupabaseError } from './supabaseErrors';
import type { Reminder } from '../types/task';

// ---------------------------------------------------------------------------
// Supabase `reminders` row shape (snake_case, matches
// supabase/migrations/0004_reminders.sql as refactored by
// supabase/migrations/0005_reminders_refactor.sql) and mapping to/from the
// app's `Reminder` type.
//
// A reminder is now purely notification-scheduling metadata owned by
// exactly one parent — a Task or a Calendar Event — never both, never
// neither (enforced by a DB CHECK constraint), and at most one per parent
// (enforced by partial UNIQUE indexes). There is no standalone reminders
// UX anymore: reminders are only ever created/edited/cleared from the
// Task or Event sheet that owns them.
// ---------------------------------------------------------------------------

interface ReminderRow {
  id: string;
  user_id: string;
  remind_at: string;
  offset_minutes: number | null;
  task_id: string | null;
  event_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    remindAt: row.remind_at,
    offsetMinutes: row.offset_minutes ?? undefined,
    taskId: row.task_id ?? undefined,
    eventId: row.event_id ?? undefined,
  };
}

export interface ReminderSchedule {
  remindAt: string; // ISO 8601 timestamp, built from the device's local timezone
  offsetMinutes?: number; // relative preset used, if any — undefined for a custom/absolute time
}

/** Loads every reminder the signed-in user owns, across all their tasks and events. */
export async function fetchReminders(userId: string): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', userId);

  if (error) throw toSupabaseError('Could not load reminders', error);
  return (data as ReminderRow[]).map(rowToReminder);
}

/**
 * Creates or replaces the single reminder for a task. Relies on the
 * partial UNIQUE index on (task_id) to make this a safe upsert — at most
 * one reminder per task can ever exist.
 */
export async function upsertReminderForTask(
  userId: string,
  taskId: string,
  schedule: ReminderSchedule,
): Promise<Reminder> {
  const { data, error } = await supabase
    .from('reminders')
    .upsert(
      {
        user_id: userId,
        task_id: taskId,
        event_id: null,
        remind_at: schedule.remindAt,
        offset_minutes: schedule.offsetMinutes ?? null,
      },
      { onConflict: 'task_id' },
    )
    .select('*')
    .single();

  if (error) throw toSupabaseError('Could not save reminder', error);
  return rowToReminder(data as ReminderRow);
}

/** Creates or replaces the single reminder for a calendar event. See upsertReminderForTask. */
export async function upsertReminderForEvent(
  userId: string,
  eventId: string,
  schedule: ReminderSchedule,
): Promise<Reminder> {
  const { data, error } = await supabase
    .from('reminders')
    .upsert(
      {
        user_id: userId,
        task_id: null,
        event_id: eventId,
        remind_at: schedule.remindAt,
        offset_minutes: schedule.offsetMinutes ?? null,
      },
      { onConflict: 'event_id' },
    )
    .select('*')
    .single();

  if (error) throw toSupabaseError('Could not save reminder', error);
  return rowToReminder(data as ReminderRow);
}

/** Removes the reminder for a task, if one exists (setting Reminder to "None"). */
export async function clearReminderForTask(taskId: string): Promise<void> {
  const { error } = await supabase.from('reminders').delete().eq('task_id', taskId);
  if (error) throw toSupabaseError('Could not remove reminder', error);
}

/** Removes the reminder for an event, if one exists (setting Reminder to "None"). */
export async function clearReminderForEvent(eventId: string): Promise<void> {
  const { error } = await supabase.from('reminders').delete().eq('event_id', eventId);
  if (error) throw toSupabaseError('Could not remove reminder', error);
}

// Deleting a task or event cascades to its reminder at the database level
// (ON DELETE CASCADE, see 0005_reminders_refactor.sql) — no explicit
// client-side delete call is needed or provided here.
