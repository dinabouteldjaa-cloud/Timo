import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';
import type { Task, TaskCategory, TaskPriority, TaskStatus } from '../types/task';

// ---------------------------------------------------------------------------
// Supabase `tasks` row shape (snake_case, matches supabase/migrations/0001_init.sql)
// and mapping to/from the app's `Task` type so the rest of the app never has
// to deal with the DB's column naming.
// ---------------------------------------------------------------------------

interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  category: TaskCategory;
  due_date: string | null;
  due_time: string | null;
  estimated_duration_minutes: number | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Supabase/PostgREST errors are plain objects ({ message, details, hint, code }),
 * NOT instances of the built-in `Error` — so `err instanceof Error` checks
 * upstream would silently swallow them and fall back to a generic message.
 * This wraps them in a real `Error` (with the original info attached) so the
 * actual cause is preserved and can be surfaced/logged.
 */
function toError(context: string, error: PostgrestError): Error {
  const parts = [error.message];
  if (error.code) parts.push(`code: ${error.code}`);
  if (error.hint) parts.push(`hint: ${error.hint}`);
  const err = new Error(`${context}: ${parts.join(' — ')}`);
  // Non-secret diagnostic fields only — never includes credentials/tokens.
  Object.assign(err, {
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
  // eslint-disable-next-line no-console
  console.error(`[tasksApi] ${context}`, error);
  return err;
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    priority: row.priority,
    category: row.category,
    dueDate: row.due_date ?? undefined,
    // Postgres `time` comes back as "HH:MM:SS" — trim to "HH:MM" for <input type="time">.
    dueTime: row.due_time ? row.due_time.slice(0, 5) : undefined,
    estimatedMinutes: row.estimated_duration_minutes ?? undefined,
  };
}

export interface TaskInput {
  title: string;
  description?: string;
  dueDate?: string;
  dueTime?: string;
  priority: TaskPriority;
  category: TaskCategory;
  estimatedMinutes?: number;
}

export async function fetchTasks(userId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw toError('Could not load tasks', error);
  return (data as TaskRow[]).map(rowToTask);
}

export async function createTask(userId: string, input: TaskInput): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priority: input.priority,
      category: input.category,
      due_date: input.dueDate || null,
      due_time: input.dueTime || null,
      estimated_duration_minutes: input.estimatedMinutes ?? null,
    })
    .select('*')
    .single();

  if (error) throw toError('Could not create task', error);
  return rowToTask(data as TaskRow);
}

export async function updateTask(
  taskId: string,
  input: TaskInput,
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priority: input.priority,
      category: input.category,
      due_date: input.dueDate || null,
      due_time: input.dueTime || null,
      estimated_duration_minutes: input.estimatedMinutes ?? null,
    })
    .eq('id', taskId)
    .select('*')
    .single();

  if (error) throw toError('Could not update task', error);
  return rowToTask(data as TaskRow);
}

export async function setTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    })
    .eq('id', taskId)
    .select('*')
    .single();

  if (error) throw toError('Could not update task status', error);
  return rowToTask(data as TaskRow);
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) throw toError('Could not delete task', error);
}
