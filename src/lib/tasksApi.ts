import { supabase } from './supabaseClient';
import { toSupabaseError } from './supabaseErrors';
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
  scheduled_date: string | null;
  scheduled_start_time: string | null;
  scheduled_end_time: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
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
    scheduledDate: row.scheduled_date ?? undefined,
    scheduledStartTime: row.scheduled_start_time ? row.scheduled_start_time.slice(0, 5) : undefined,
    scheduledEndTime: row.scheduled_end_time ? row.scheduled_end_time.slice(0, 5) : undefined,
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

  if (error) throw toSupabaseError('Could not load tasks', error);
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

  if (error) throw toSupabaseError('Could not create task', error);
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

  if (error) throw toSupabaseError('Could not update task', error);
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

  if (error) throw toSupabaseError('Could not update task status', error);
  return rowToTask(data as TaskRow);
}

export async function deleteTask(taskId: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) throw toSupabaseError('Could not delete task', error);
}

/**
 * Sets or clears a task's planned execution block (see
 * supabase/migrations/0010_task_scheduling.sql). Deliberately a narrow,
 * targeted update — separate from the full updateTask() above — so
 * accepting a Plan My Day proposal never touches title/priority/category/
 * reminder or any other field on the task. Passing null clears all three
 * fields together — the DB constraint requires them to be all-or-nothing.
 */
export async function updateTaskSchedule(
  taskId: string,
  schedule: { date: string; startTime: string; endTime: string } | null,
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      scheduled_date: schedule?.date ?? null,
      scheduled_start_time: schedule?.startTime ?? null,
      scheduled_end_time: schedule?.endTime ?? null,
    })
    .eq('id', taskId)
    .select('*')
    .single();

  if (error) throw toSupabaseError('Could not schedule task', error);
  return rowToTask(data as TaskRow);
}
