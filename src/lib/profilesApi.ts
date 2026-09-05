import { supabase } from './supabaseClient';
import { toSupabaseError } from './supabaseErrors';

// ---------------------------------------------------------------------------
// Supabase `profiles` row (see supabase/migrations/0001_init.sql plus
// first_day_of_week from 0013_first_day_of_week.sql and working_days from
// 0014_working_days.sql). Deliberately narrow: this file only ever
// reads/writes the preference fields Timo actually uses today.
// `display_name` stays sourced from Supabase Auth's user_metadata (see
// AuthContext/ProfilePage) — not moved here.
//
// first_day_of_week and working_days are two INDEPENDENT preferences —
// first_day_of_week is display order only; working_days defines what
// "weekday" actually means for this user (e.g. Sunday-Thursday vs
// Monday-Friday). Neither is derived from the other anywhere in this file.
// ---------------------------------------------------------------------------

export interface Profile {
  firstDayOfWeek: number; // 0=Sun..6=Sat — DISPLAY ORDER ONLY, see RecurrencePicker/weekUtils
  workingDays: number[]; // 0=Sun..6=Sat — what "weekday" means for this user, see recurrence.ts/Brain Dump
}

interface ProfileRow {
  first_day_of_week: number;
  working_days: number[];
}

/**
 * Loads the signed-in user's preference row. Callers should apply their
 * own defensive fallback if this throws or a value is somehow
 * missing/invalid (Monday for firstDayOfWeek, [1,2,3,4,5] for
 * workingDays) — that fallback lives in AppStateContext, not here, since
 * this function's only job is to report what's actually in the database.
 */
export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('first_day_of_week, working_days')
    .eq('id', userId)
    .single();

  if (error) throw toSupabaseError('Could not load profile', error);
  const row = data as ProfileRow;
  return { firstDayOfWeek: row.first_day_of_week, workingDays: row.working_days };
}

/** Updates the first-day-of-week preference only — never touches display_name, working_days, or any other field. */
export async function updateFirstDayOfWeek(userId: string, value: number): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ first_day_of_week: value })
    .eq('id', userId)
    .select('first_day_of_week, working_days')
    .single();

  if (error) throw toSupabaseError('Could not save this preference', error);
  const row = data as ProfileRow;
  return { firstDayOfWeek: row.first_day_of_week, workingDays: row.working_days };
}

/** Updates the working-days preference only — never touches display_name, first_day_of_week, or any other field. */
export async function updateWorkingDays(userId: string, workingDays: number[]): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ working_days: workingDays })
    .eq('id', userId)
    .select('first_day_of_week, working_days')
    .single();

  if (error) throw toSupabaseError('Could not save this preference', error);
  const row = data as ProfileRow;
  return { firstDayOfWeek: row.first_day_of_week, workingDays: row.working_days };
}
