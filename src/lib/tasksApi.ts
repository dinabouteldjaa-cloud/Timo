import { supabase } from './supabaseClient';
import { toSupabaseError } from './supabaseErrors';
import type { RecurrenceType, Task, TaskCategory, TaskPriority, TaskStatus } from '../types/task';

// ---------------------------------------------------------------------------
// Supabase `tasks` row shape (snake_case, matches supabase/migrations/0001_init.sql
// plus recurrence columns from 0011_recurring_tasks_events.sql) and mapping
// to/from the app's `Task` type so the rest of the app never has to deal
// with the DB's column naming.
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
  recurrence_type: RecurrenceType;
  recurrence_days_of_week: number[] | null;
  recurrence_end_date: string | null;
  recurrence_parent_id: string | null;
  recurrence_occurrence_date: string | null;
  completed_at: string | null;
  archived_at: string | null;
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
    recurrenceType: row.recurrence_type ?? 'none',
    recurrenceDaysOfWeek: row.recurrence_days_of_week ?? undefined,
    recurrenceEndDate: row.recurrence_end_date ?? undefined,
    recurrenceParentId: row.recurrence_parent_id ?? undefined,
    recurrenceOccurrenceDate: row.recurrence_occurrence_date ?? undefined,
    completedAt: row.completed_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
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
  // Recurrence — all optional; omitted/undefined means 'none' (an
  // ordinary, non-recurring task), matching the DB column's own default.
  recurrenceType?: RecurrenceType;
  recurrenceDaysOfWeek?: number[];
  recurrenceEndDate?: string;
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
      recurrence_type: input.recurrenceType ?? 'none',
      recurrence_days_of_week: input.recurrenceDaysOfWeek ?? null,
      recurrence_end_date: input.recurrenceEndDate || null,
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
      recurrence_type: input.recurrenceType ?? 'none',
      recurrence_days_of_week: input.recurrenceDaysOfWeek ?? null,
      recurrence_end_date: input.recurrenceEndDate || null,
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

// ---------------------------------------------------------------------------
// Archiving (see supabase/migrations/0012_task_archiving.sql)
// ---------------------------------------------------------------------------

/** Archives a normal task OR an existing occurrence override row — both are ordinary rows in `tasks`. */
export async function archiveTask(taskId: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', taskId)
    .select('*')
    .single();

  if (error) throw toSupabaseError('Could not archive this task', error);
  return rowToTask(data as TaskRow);
}

/** Restores an archived task or override — clearing archived_at never creates a new row, so this can never produce a duplicate. */
export async function unarchiveTask(taskId: string): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({ archived_at: null })
    .eq('id', taskId)
    .select('*')
    .single();

  if (error) throw toSupabaseError('Could not restore this task', error);
  return rowToTask(data as TaskRow);
}

/**
 * Archives ONE occurrence of a recurring series, never the series itself.
 * If the occurrence is still virtual (no override yet), this materializes
 * one — copying the given effective fields — WITH archived_at already set
 * in the SAME insert, rather than creating the override and archiving it
 * as two separate calls. That matters: a two-step create-then-archive
 * would leave a brief window where a real, unarchived, visible override
 * exists if the second step failed, meaning the user could end up with
 * the occurrence still showing (now via the override) even though the
 * archive action reported success. A single write has no such window.
 * If an override already exists for this date, it's archived in place —
 * never creating a second row.
 */
export async function archiveTaskOccurrenceOverride(
  userId: string,
  seriesId: string,
  occurrenceDate: string,
  effectiveFields: TaskInput,
): Promise<Task> {
  const { data: existing, error: findError } = await supabase
    .from('tasks')
    .select('id')
    .eq('recurrence_parent_id', seriesId)
    .eq('recurrence_occurrence_date', occurrenceDate)
    .maybeSingle();

  if (findError) throw toSupabaseError('Could not archive this occurrence', findError);

  const archivedAt = new Date().toISOString();

  if (existing) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ archived_at: archivedAt })
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) throw toSupabaseError('Could not archive this occurrence', error);
    return rowToTask(data as TaskRow);
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title: effectiveFields.title.trim(),
      description: effectiveFields.description?.trim() || null,
      priority: effectiveFields.priority,
      category: effectiveFields.category,
      due_date: effectiveFields.dueDate || null,
      due_time: effectiveFields.dueTime || null,
      estimated_duration_minutes: effectiveFields.estimatedMinutes ?? null,
      recurrence_type: 'none',
      recurrence_parent_id: seriesId,
      recurrence_occurrence_date: occurrenceDate,
      archived_at: archivedAt,
    })
    .select('*')
    .single();

  if (error) throw toSupabaseError('Could not archive this occurrence', error);
  return rowToTask(data as TaskRow);
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

// ---------------------------------------------------------------------------
// Recurrence support (see supabase/migrations/0011_recurring_tasks_events.sql)
// ---------------------------------------------------------------------------

/**
 * Creates a real, ordinary task row that overrides ONE occurrence of a
 * recurring series ("Edit this occurrence"). This is not a second task
 * system — it's a completely normal task, just tagged with which series
 * and which date it stands in for, so the UI can prefer it over the
 * computed occurrence for that date.
 *
 * If an override already exists for this exact (series, date) pair — the
 * user editing "this occurrence" a second time — that existing row is
 * UPDATED in place rather than inserting a second one. A unique index on
 * (recurrence_parent_id, recurrence_occurrence_date) also enforces this
 * at the database level as a backstop.
 */
export async function createTaskOccurrenceOverride(
  userId: string,
  seriesId: string,
  occurrenceDate: string,
  input: TaskInput,
): Promise<Task> {
  const { data: existing, error: findError } = await supabase
    .from('tasks')
    .select('id')
    .eq('recurrence_parent_id', seriesId)
    .eq('recurrence_occurrence_date', occurrenceDate)
    .maybeSingle();

  if (findError) throw toSupabaseError('Could not update this occurrence', findError);

  const fields = {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    priority: input.priority,
    category: input.category,
    due_date: input.dueDate || null,
    due_time: input.dueTime || null,
    estimated_duration_minutes: input.estimatedMinutes ?? null,
  };

  if (existing) {
    const { data, error } = await supabase
      .from('tasks')
      .update(fields)
      .eq('id', existing.id)
      .select('*')
      .single();

    if (error) throw toSupabaseError('Could not update this occurrence', error);
    return rowToTask(data as TaskRow);
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      ...fields,
      recurrence_type: 'none',
      recurrence_parent_id: seriesId,
      recurrence_occurrence_date: occurrenceDate,
    })
    .select('*')
    .single();

  if (error) throw toSupabaseError('Could not update this occurrence', error);
  return rowToTask(data as TaskRow);
}

/**
 * Moves ONE occurrence of a recurring series to `newDate` by detaching it
 * into a fully standalone, non-recurring task — never by changing an
 * override's due_date in place (confirmed during inspection that an
 * occurrence's displayed position always comes from its
 * recurrence_occurrence_date SLOT, not its own due_date field, so that
 * alone would not actually reposition it).
 *
 * RETRY-SAFETY (see chat report): the naive "create a new standalone
 * task, then remove the original occurrence" sequence has a failure
 * window — if creation succeeds but removal fails, a retry would create
 * a SECOND standalone task. This avoids that without any new schema or
 * a transaction system, by reusing the EXISTING unique index on
 * (recurrence_parent_id, recurrence_occurrence_date) as a natural
 * idempotency key:
 *
 *   1. Find-or-create a row for this exact (seriesId, occurrenceDate)
 *      slot — i.e. the SAME select-then-update-or-insert pattern already
 *      used by createTaskOccurrenceOverride — but with its due_date
 *      already set to the NEW date. A retry that reaches this step again
 *      finds the row IT already created (or an existing override) via
 *      that same unique pair, and reuses it instead of inserting a
 *      second one — this is what actually prevents the duplicate.
 *   2. Remove the original occurrence from the series (already
 *      idempotent — see skipTaskOccurrence's own comment).
 *   3. Clear recurrence_parent_id/recurrence_occurrence_date on that same
 *      row, completing the detach. A retry that only reaches this step
 *      (because step 2 or 3 itself failed previously) finds the exact
 *      same row again via step 1's lookup and simply clears the same
 *      already-correct fields — harmless either way.
 *
 * The row's id never changes across this process, so anything already
 * tied to it (a reminder, for instance) stays correctly attached
 * throughout.
 */
/**
 * Moves ONE occurrence of a recurring series to `newDate` by detaching it
 * into a fully standalone, non-recurring task.
 *
 * IDEMPOTENCY (corrected — see chat report): the identity used to detect
 * "has this already been done" must be something that survives the
 * operation's OWN final step. An earlier version used the transient
 * (recurrence_parent_id, recurrence_occurrence_date) pair — but step 5
 * below clears exactly those two fields on success, so a retry after a
 * successful detach (triggered by, say, a later reminder-application
 * failure, or a lost network response) could no longer find the row it
 * had already created, and would insert a second standalone task.
 *
 * This uses PERMANENT provenance columns instead — detached_from_parent_id
 * / detached_from_occurrence_date (see 0012_task_archiving.sql) — which
 * are set once and never cleared, independent of the transient
 * recurrence_* pair that only reflects an occurrence's CURRENT slot.
 *
 * Sequence:
 *   1. Look up an existing task by the PERMANENT provenance pair — this
 *      is the authoritative "already detached (fully or partially)"
 *      check, and is what makes a retry after ANY point of failure land
 *      on the same row.
 *   2. If none, look up an existing task by the TRANSIENT
 *      recurrence_parent_id/occurrence_date pair instead — this is a
 *      pre-existing "This occurrence" override that predates any move
 *      attempt; it gets reused (tagged with the provenance pair) rather
 *      than creating a second row for the same slot.
 *   3. If neither exists, insert exactly one row carrying BOTH pairs at
 *      once. A unique index on the provenance pair means a
 *      concurrent/retried insert can only ever collide (23505), never
 *      silently duplicate — on collision, re-fetch by the provenance
 *      pair and continue with that row instead of failing or inserting
 *      again.
 *   4. Remove the original occurrence from the series (skipTaskOccurrence
 *      — already idempotent).
 *   5. Clear ONLY recurrence_parent_id/recurrence_occurrence_date — never
 *      detached_from_*, which stays set permanently. Clearing
 *      recurrence_parent_id is required for this to actually become
 *      standalone: expandTaskOccurrences treats ANY row with that field
 *      set as an override still positioned in its original series slot.
 *
 * The row's id never changes across this process (steps 1-3 always
 * resolve to, create, or reuse exactly one row before any mutation that
 * matters), so anything already tied to it (a reminder, for instance)
 * stays correctly attached throughout, and every step past the first
 * successful resolution of that id is naturally idempotent to repeat.
 */
export async function detachTaskOccurrenceToDate(
  userId: string,
  seriesId: string,
  occurrenceDate: string,
  newDate: string,
  effectiveFields: TaskInput,
): Promise<Task> {
  const fields = {
    title: effectiveFields.title.trim(),
    description: effectiveFields.description?.trim() || null,
    priority: effectiveFields.priority,
    category: effectiveFields.category,
    due_date: newDate,
    due_time: effectiveFields.dueTime || null,
    estimated_duration_minutes: effectiveFields.estimatedMinutes ?? null,
  };

  async function findByProvenance(): Promise<string | null> {
    const { data, error } = await supabase
      .from('tasks')
      .select('id')
      .eq('detached_from_parent_id', seriesId)
      .eq('detached_from_occurrence_date', occurrenceDate)
      .maybeSingle();
    if (error) throw toSupabaseError('Could not move this occurrence', error);
    return data?.id ?? null;
  }

  let taskId = await findByProvenance();

  if (taskId) {
    // Already detached (fully or partially) by a previous attempt —
    // just make sure its fields reflect the latest requested move, then
    // continue to the remaining (idempotent) steps.
    const { error } = await supabase.from('tasks').update(fields).eq('id', taskId);
    if (error) throw toSupabaseError('Could not move this occurrence', error);
  } else {
    const { data: existingOverride, error: overrideFindError } = await supabase
      .from('tasks')
      .select('id')
      .eq('recurrence_parent_id', seriesId)
      .eq('recurrence_occurrence_date', occurrenceDate)
      .maybeSingle();
    if (overrideFindError) throw toSupabaseError('Could not move this occurrence', overrideFindError);

    if (existingOverride) {
      const { error } = await supabase
        .from('tasks')
        .update({ ...fields, detached_from_parent_id: seriesId, detached_from_occurrence_date: occurrenceDate })
        .eq('id', existingOverride.id);
      if (error) throw toSupabaseError('Could not move this occurrence', error);
      taskId = existingOverride.id;
    } else {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          ...fields,
          recurrence_type: 'none',
          recurrence_parent_id: seriesId,
          recurrence_occurrence_date: occurrenceDate,
          detached_from_parent_id: seriesId,
          detached_from_occurrence_date: occurrenceDate,
        })
        .select('id')
        .single();

      if (error) {
        // 23505 = unique_violation on tasks_detached_from_unique — a
        // concurrent or retried attempt already won this exact detach
        // between our check above and this insert. Re-fetch by the same
        // provenance pair and continue with THAT row rather than
        // failing or inserting a duplicate.
        if (error.code === '23505') {
          const raceWinnerId = await findByProvenance();
          if (!raceWinnerId) throw toSupabaseError('Could not move this occurrence', error);
          taskId = raceWinnerId;
        } else {
          throw toSupabaseError('Could not move this occurrence', error);
        }
      } else {
        taskId = (data as { id: string }).id;
      }
    }
  }

  if (!taskId) throw new Error('Could not resolve the detached task for this occurrence.');

  await skipTaskOccurrence(userId, seriesId, occurrenceDate);

  const { data: detached, error: detachError } = await supabase
    .from('tasks')
    .update({ recurrence_parent_id: null, recurrence_occurrence_date: null })
    .eq('id', taskId)
    .select('*')
    .single();

  if (detachError) throw toSupabaseError('Could not finish moving this occurrence', detachError);
  return rowToTask(detached as TaskRow);
}

/** Marks one occurrence of a recurring task complete without touching the series. */
export async function completeTaskOccurrence(
  userId: string,
  taskId: string,
  occurrenceDate: string,
): Promise<void> {
  const { error } = await supabase
    .from('task_occurrence_completions')
    .upsert(
      { user_id: userId, task_id: taskId, occurrence_date: occurrenceDate },
      { onConflict: 'task_id,occurrence_date' },
    );
  if (error) throw toSupabaseError('Could not complete this occurrence', error);
}

/** Reverses completeTaskOccurrence for one date. */
export async function uncompleteTaskOccurrence(taskId: string, occurrenceDate: string): Promise<void> {
  const { error } = await supabase
    .from('task_occurrence_completions')
    .delete()
    .eq('task_id', taskId)
    .eq('occurrence_date', occurrenceDate);
  if (error) throw toSupabaseError('Could not undo this completion', error);
}

/** All (taskId, occurrenceDate) pairs the user has completed, as `${taskId}::${date}` keys. */
export async function fetchTaskOccurrenceCompletions(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('task_occurrence_completions')
    .select('task_id, occurrence_date')
    .eq('user_id', userId);

  if (error) throw toSupabaseError('Could not load task completions', error);
  return new Set((data as { task_id: string; occurrence_date: string }[]).map((r) => `${r.task_id}::${r.occurrence_date}`));
}

/**
 * The same completion records as fetchTaskOccurrenceCompletions above,
 * but carrying each one's completed_at timestamp — needed to sort the
 * Completed history by actual completion time. Deliberately a SEPARATE
 * function/return shape rather than changing fetchTaskOccurrenceCompletions
 * itself: that function's plain `Set<string>` is used in
 * expandTaskOccurrences's hot path (re-run on every Today/Upcoming/
 * Overdue/All recompute) purely for fast `.has(key)` membership checks,
 * and widening its return type would touch that already-correct,
 * frequently-exercised code for no benefit there. Returns a Map keyed by
 * the identical `${taskId}::${occurrenceDate}` shape for consistency.
 */
export async function fetchTaskOccurrenceCompletionRecords(userId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('task_occurrence_completions')
    .select('task_id, occurrence_date, completed_at')
    .eq('user_id', userId);

  if (error) throw toSupabaseError('Could not load completion history', error);
  const map = new Map<string, string>();
  for (const row of data as { task_id: string; occurrence_date: string; completed_at: string }[]) {
    map.set(`${row.task_id}::${row.occurrence_date}`, row.completed_at);
  }
  return map;
}

/**
 * Records "This occurrence" deleted, without touching the series or
 * other occurrences.
 *
 * NOTE: deliberately does NOT use `.upsert(..., { onConflict })`. The
 * "one skip per (task, date)" guarantee is enforced by a PARTIAL unique
 * index (`... where task_id is not null` — see
 * 0011_recurring_tasks_events.sql), and PostgREST's `onConflict` option
 * can only generate a plain `ON CONFLICT (task_id, occurrence_date)`
 * with no way to repeat that partial predicate, so Postgres can't match
 * it to any constraint and rejects the request with 42P10 — exactly the
 * same class of bug already found and fixed once before in
 * remindersApi.ts. Select-then-update-or-insert works correctly with a
 * partial unique index because it never asks Postgres to infer one.
 */
export async function skipTaskOccurrence(
  userId: string,
  taskId: string,
  occurrenceDate: string,
): Promise<void> {
  const { data: existing, error: findError } = await supabase
    .from('occurrence_skips')
    .select('id')
    .eq('task_id', taskId)
    .eq('occurrence_date', occurrenceDate)
    .maybeSingle();

  if (findError) throw toSupabaseError('Could not remove this occurrence', findError);
  if (existing) return; // already skipped — idempotent, nothing further to do

  const { error: insertError } = await supabase
    .from('occurrence_skips')
    .insert({ user_id: userId, task_id: taskId, occurrence_date: occurrenceDate });

  if (insertError) {
    // 23505 = unique_violation — a concurrent call already inserted the
    // same skip between our check and this insert; the partial unique
    // index did its job, so this is a safe, expected no-op, not a failure.
    if (insertError.code === '23505') return;
    throw toSupabaseError('Could not remove this occurrence', insertError);
  }
}

/** All skipped task occurrences, as `${taskId}::${date}` keys. */
export async function fetchTaskOccurrenceSkips(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('occurrence_skips')
    .select('task_id, occurrence_date')
    .eq('user_id', userId)
    .not('task_id', 'is', null);

  if (error) throw toSupabaseError('Could not load skipped occurrences', error);
  return new Set((data as { task_id: string; occurrence_date: string }[]).map((r) => `${r.task_id}::${r.occurrence_date}`));
}
