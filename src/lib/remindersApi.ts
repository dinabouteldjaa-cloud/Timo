import { supabase } from './supabaseClient';
import { toSupabaseError } from './supabaseErrors';
import type { Reminder } from '../types/task';

// ---------------------------------------------------------------------------
// Supabase `reminders` row shape (snake_case, matches
// supabase/migrations/0004_reminders.sql) and mapping to/from the app's
// `Reminder` type so the rest of the app never has to deal with the DB's
// column naming.
// ---------------------------------------------------------------------------

interface ReminderRow {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  remind_at: string;
  completed: boolean;
  completed_at: string | null;
  task_id: string | null;
  event_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? undefined,
    remindAt: row.remind_at,
    completed: row.completed,
    completedAt: row.completed_at ?? undefined,
    taskId: row.task_id ?? undefined,
    eventId: row.event_id ?? undefined,
  };
}

export interface ReminderInput {
  title: string;
  notes?: string;
  remindAt: string; // ISO 8601 timestamp, built from the device's local timezone
  taskId?: string;
  eventId?: string;
}

export async function fetchReminders(userId: string): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', userId)
    .order('remind_at', { ascending: true });

  if (error) throw toSupabaseError('Could not load reminders', error);
  return (data as ReminderRow[]).map(rowToReminder);
}

export async function createReminder(userId: string, input: ReminderInput): Promise<Reminder> {
  const { data, error } = await supabase
    .from('reminders')
    .insert({
      user_id: userId,
      title: input.title.trim(),
      notes: input.notes?.trim() || null,
      remind_at: input.remindAt,
      task_id: input.taskId || null,
      event_id: input.eventId || null,
    })
    .select('*')
    .single();

  if (error) throw toSupabaseError('Could not create reminder', error);
  return rowToReminder(data as ReminderRow);
}

export async function updateReminder(reminderId: string, input: ReminderInput): Promise<Reminder> {
  const { data, error } = await supabase
    .from('reminders')
    .update({
      title: input.title.trim(),
      notes: input.notes?.trim() || null,
      remind_at: input.remindAt,
      task_id: input.taskId || null,
      event_id: input.eventId || null,
    })
    .eq('id', reminderId)
    .select('*')
    .single();

  if (error) throw toSupabaseError('Could not update reminder', error);
  return rowToReminder(data as ReminderRow);
}

export async function setReminderCompleted(reminderId: string, completed: boolean): Promise<Reminder> {
  const { data, error } = await supabase
    .from('reminders')
    .update({
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq('id', reminderId)
    .select('*')
    .single();

  if (error) throw toSupabaseError('Could not update reminder', error);
  return rowToReminder(data as ReminderRow);
}

export async function deleteReminder(reminderId: string): Promise<void> {
  const { error } = await supabase.from('reminders').delete().eq('id', reminderId);
  if (error) throw toSupabaseError('Could not delete reminder', error);
}
