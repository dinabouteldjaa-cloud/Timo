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
 * Creates or replaces the single reminder for a task/event.
 *
 * NOTE: this deliberately does NOT use Supabase's `.upsert(..., { onConflict })`.
 * The one-reminder-per-parent guarantee is enforced by PARTIAL unique
 * indexes (`... where task_id is not null` / `... where event_id is not
 * null` — see 0005_reminders_refactor.sql), and PostgREST's `onConflict`
 * option can only generate a plain `ON CONFLICT (column)` clause with no
 * way to repeat that partial predicate. Postgres then can't match it to
 * any constraint and rejects the whole request with `42P10: there is no
 * unique or exclusion constraint matching the ON CONFLICT specification`.
 * A plain select-then-update-or-insert works correctly with partial
 * unique indexes because it never asks Postgres to infer a constraint —
 * the indexes still do their job of preventing duplicates outright; this
 * only changes how the client decides whether to UPDATE or INSERT.
 */
async function upsertReminder(
  userId: string,
  parentColumn: 'task_id' | 'event_id',
  parentId: string,
  schedule: ReminderSchedule,
): Promise<Reminder> {
  const { data: existing, error: findError } = await supabase
    .from('reminders')
    .select('id')
    .eq(parentColumn, parentId)
    .maybeSingle();

  if (findError) throw toSupabaseError('Could not save reminder', findError);

  if (existing) {
    const { data, error } = await supabase
      .from('reminders')
      .update({ remind_at: schedule.remindAt, offset_minutes: schedule.offsetMinutes ?? null })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) throw toSupabaseError('Could not save reminder', error);
    return rowToReminder(data as ReminderRow);
  }

  const { data, error } = await supabase
    .from('reminders')
    .insert({
      user_id: userId,
      task_id: parentColumn === 'task_id' ? parentId : null,
      event_id: parentColumn === 'event_id' ? parentId : null,
      remind_at: schedule.remindAt,
      offset_minutes: schedule.offsetMinutes ?? null,
    })
    .select('*')
    .single();

  if (error) {
    // 23505 = unique_violation — a reminder for this parent was inserted
    // concurrently between the check above and this insert (the partial
    // unique index just did its job). Fall back to updating that row
    // instead of failing the save outright.
    if (error.code === '23505') {
      const { data: retryExisting } = await supabase
        .from('reminders')
        .select('id')
        .eq(parentColumn, parentId)
        .maybeSingle();

      if (retryExisting) {
        const { data: updated, error: updateError } = await supabase
          .from('reminders')
          .update({ remind_at: schedule.remindAt, offset_minutes: schedule.offsetMinutes ?? null })
          .eq('id', retryExisting.id)
          .select('*')
          .single();

        if (!updateError) return rowToReminder(updated as ReminderRow);
      }
    }
    throw toSupabaseError('Could not save reminder', error);
  }

  return rowToReminder(data as ReminderRow);
}

/** Creates or replaces the single reminder for a task. See upsertReminder. */
export async function upsertReminderForTask(
  userId: string,
  taskId: string,
  schedule: ReminderSchedule,
): Promise<Reminder> {
  return upsertReminder(userId, 'task_id', taskId, schedule);
}

/** Creates or replaces the single reminder for a calendar event. See upsertReminder. */
export async function upsertReminderForEvent(
  userId: string,
  eventId: string,
  schedule: ReminderSchedule,
): Promise<Reminder> {
  return upsertReminder(userId, 'event_id', eventId, schedule);
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
