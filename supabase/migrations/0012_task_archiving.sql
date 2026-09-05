-- ============================================================================
-- Timo — Task archiving
-- ============================================================================
-- Adds a real Archive concept, separate from Delete and separate from
-- `status`. See chat report ("Implement a scalable Completed-task history"
-- follow-up investigation) for the reasoning: `tasks.status` has a DB-level
-- CHECK constraint ('todo' | 'in_progress' | 'completed') and is also the
-- field used to track completion — adding a fourth 'archived' value would
-- conflate archival with completion state and lose information (was an
-- archived task done or not before archiving?).
--
-- Instead this mirrors the exact same pattern already used for
-- `completed_at` (0001_init.sql): a single additive, nullable timestamp,
-- orthogonal to status. NULL = active. Non-null = archived (and
-- restorable, by setting it back to NULL — nothing is ever deleted by
-- archiving).
--
-- This does NOT touch calendar_events at all, per the explicit
-- instruction to leave that schema alone.
-- ============================================================================

alter table public.tasks add column if not exists archived_at timestamptz;

-- Every existing active-view query filters on `archived_at is null` (or
-- implicitly benefits from it once the frontend adds that filter) — this
-- partial index keeps that filter fast as archived history grows, without
-- indexing rows that are already archived and therefore excluded from
-- those queries anyway.
create index if not exists tasks_active_idx
  on public.tasks (user_id)
  where archived_at is null;

-- ----------------------------------------------------------------------------
-- Reminders must respect archived_at (inspection: see chat report before
-- this migration was written).
-- ----------------------------------------------------------------------------
-- due_unsent_reminders (PASS 1 in push-reminders — see
-- 0011_recurring_tasks_events.sql for its full history) already LEFT
-- JOINs `tasks` as `t` to check recurrence_type. This adds ONE condition
-- to that same, already-present join: `t.archived_at is null`. This
-- covers BOTH an archived ordinary task's own reminder AND an
-- individually archived recurring occurrence's override reminder (an
-- override is itself just a `tasks` row with recurrence_type = 'none',
-- so its reminder flows through this exact same view). For an
-- event-linked reminder, `t` is entirely NULL from the LEFT JOIN (no
-- task side at all), and `NULL.archived_at IS NULL` is true in SQL, so
-- this condition is automatically a no-op for event reminders — no
-- separate coalesce/event-specific branch is needed. Archiving never
-- deletes a reminder row, so restoring (clearing archived_at) makes the
-- reminder eligible again immediately, with no further action needed.
create or replace view public.due_unsent_reminders as
select
  r.id as reminder_id,
  r.user_id,
  r.remind_at,
  r.offset_minutes,
  r.task_id,
  r.event_id
from public.reminders r
left join public.reminder_deliveries d
  on d.reminder_id = r.id and d.occurrence_date = r.remind_at::date
left join public.tasks t on t.id = r.task_id
left join public.calendar_events e on e.id = r.event_id
where r.remind_at <= now()
  and d.id is null
  and coalesce(t.recurrence_type, 'none') = 'none'
  and coalesce(e.recurrence_type, 'none') = 'none'
  and t.archived_at is null;

revoke all on public.due_unsent_reminders from anon, authenticated;
grant select on public.due_unsent_reminders to service_role;

-- ============================================================================
-- End of migration.
-- ============================================================================
