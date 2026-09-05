import { supabase } from './supabaseClient';
import { toSupabaseError } from './supabaseErrors';

// ---------------------------------------------------------------------------
// Supabase `profiles` row (see supabase/migrations/0001_init.sql plus
// first_day_of_week from 0013_first_day_of_week.sql). Deliberately narrow:
// this file only ever reads/writes the preference fields Timo actually
// uses today. `display_name` stays sourced from Supabase Auth's
// user_metadata (see AuthContext/ProfilePage) — not moved here.
// ---------------------------------------------------------------------------

export interface Profile {
  firstDayOfWeek: number; // 0=Sun..6=Sat — DISPLAY ORDER ONLY, see RecurrencePicker/weekUtils
}

interface ProfileRow {
  first_day_of_week: number;
}

/**
 * Loads the signed-in user's preference row. Callers should fall back to
 * Monday (1) if this throws or the value is somehow missing/out of range —
 * that fallback lives in AppStateContext, not here, since this function's
 * only job is to report what's actually in the database.
 */
export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('first_day_of_week')
    .eq('id', userId)
    .single();

  if (error) throw toSupabaseError('Could not load profile', error);
  const row = data as ProfileRow;
  return { firstDayOfWeek: row.first_day_of_week };
}

/** Updates the first-day-of-week preference only — never touches display_name or any other field. */
export async function updateFirstDayOfWeek(userId: string, value: number): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ first_day_of_week: value })
    .eq('id', userId)
    .select('first_day_of_week')
    .single();

  if (error) throw toSupabaseError('Could not save this preference', error);
  const row = data as ProfileRow;
  return { firstDayOfWeek: row.first_day_of_week };
}
