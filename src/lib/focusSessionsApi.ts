import { supabase } from './supabaseClient';
import { toSupabaseError } from './supabaseErrors';
import type { FocusSessionRecord, FocusSessionStatus } from '../types/task';

// ---------------------------------------------------------------------------
// Supabase `focus_sessions` row shape (snake_case, matches
// supabase/migrations/0009_focus_sessions.sql) and mapping to/from the
// app's `FocusSessionRecord` type.
//
// The live countdown is never written here every second — only a single
// row is inserted once a session actually finishes (naturally or via
// "End session"). See AppStateContext's persistFocusSession.
// ---------------------------------------------------------------------------

interface FocusSessionRow {
  id: string;
  user_id: string;
  task_id: string | null;
  started_at: string;
  ended_at: string;
  planned_minutes: number;
  actual_seconds: number;
  status: FocusSessionStatus;
  created_at: string;
}

function rowToFocusSession(row: FocusSessionRow): FocusSessionRecord {
  return {
    id: row.id,
    taskId: row.task_id ?? undefined,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    plannedMinutes: row.planned_minutes,
    actualSeconds: row.actual_seconds,
    status: row.status,
  };
}

export interface FocusSessionInput {
  taskId: string | null;
  startedAt: string;
  endedAt: string;
  plannedMinutes: number;
  actualSeconds: number;
  status: FocusSessionStatus;
}

// Enough for a "today" summary plus a compact recent-sessions list —
// this is intentionally not meant to become an unbounded analytics store.
const HISTORY_LIMIT = 50;

export async function fetchFocusSessions(userId: string): Promise<FocusSessionRecord[]> {
  const { data, error } = await supabase
    .from('focus_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .limit(HISTORY_LIMIT);

  if (error) throw toSupabaseError('Could not load focus history', error);
  return (data as FocusSessionRow[]).map(rowToFocusSession);
}

export async function saveFocusSession(
  userId: string,
  input: FocusSessionInput,
): Promise<FocusSessionRecord> {
  const { data, error } = await supabase
    .from('focus_sessions')
    .insert({
      user_id: userId,
      task_id: input.taskId,
      started_at: input.startedAt,
      ended_at: input.endedAt,
      planned_minutes: input.plannedMinutes,
      actual_seconds: input.actualSeconds,
      status: input.status,
    })
    .select('*')
    .single();

  if (error) throw toSupabaseError('Could not save focus session', error);
  return rowToFocusSession(data as FocusSessionRow);
}
