-- ============================================================================
-- Timo — Reminders refactor: from standalone items to notification schedules
-- ============================================================================
-- Run this once, in the Supabase SQL Editor, AFTER 0004_reminders.sql has
-- already been applied to your project (it has — do not re-run 0004).
--
-- Architectural change:
--   Reminders are no longer a standalone productivity item a user creates
--   directly. A reminder now exists purely as "when Timo should notify the
--   user about a Task or Event" — i.e. notification-scheduling metadata
--   owned by exactly one parent row.
--
-- This migration:
--   1. Deletes reminder rows that can no longer be represented under the
--      new model (standalone reminders with no parent, or the rare row
--      with both a task_id and event_id set). These were UI-only content
--      with no meaning once the standalone Reminders screen is removed.
--   2. Deletes duplicate reminders per parent, keeping only the most
--      recent, so a UNIQUE index enforcing "max one reminder per parent"
--      can be added safely.
--   3. Drops now-unused columns (title, notes, completed, completed_at) —
--      a reminder no longer has its own identity/content or its own
--      completion state; it inherits everything from its parent.
--   4. Adds `offset_minutes` (nullable) so a relative reminder ("15
--      minutes before") can be re-displayed accurately later even if the
--      parent's scheduled time changes, without re-deriving it. NULL
--      means an absolute/custom `remind_at` with no relative meaning.
--   5. Changes task_id/event_id foreign keys from ON DELETE SET NULL to
--      ON DELETE CASCADE — a reminder with no parent has no meaning, so
--      deleting the task/event should delete its reminder automatically.
--   6. Adds a CHECK constraint requiring exactly one of task_id/event_id
--      (never both, never neither).
--   7. Adds partial UNIQUE indexes enforcing at most one reminder per
--      task and at most one reminder per event.
--
-- RLS and the table-level GRANTs from 0004_reminders.sql are unaffected
-- and remain in force — no data becomes visible across users as a result
-- of this migration.
-- ============================================================================

-- 1. Remove reminders that can't be represented under the new model:
--    no parent at all, or (defensively) both parents set.
delete from public.reminders
where not (
  (task_id is not null and event_id is null) or
  (task_id is null and event_id is not null)
);

-- 2. Keep only the most recent reminder per task/event, so the upcoming
--    unique indexes can be created without conflict.
delete from public.reminders a
using public.reminders b
where a.task_id is not null
  and a.task_id = b.task_id
  and a.created_at < b.created_at;

delete from public.reminders a
using public.reminders b
where a.event_id is not null
  and a.event_id = b.event_id
  and a.created_at < b.created_at;

-- 3. Drop columns that no longer apply now that a reminder has no
--    standalone identity or completion state of its own.
alter table public.reminders drop column if exists title;
alter table public.reminders drop column if exists notes;
alter table public.reminders drop column if exists completed;
alter table public.reminders drop column if exists completed_at;

-- 4. Record which relative preset (if any) the user picked, so it can be
--    displayed/edited accurately later without re-deriving it from the
--    parent's current time. NULL = absolute/custom remind_at.
alter table public.reminders add column if not exists offset_minutes integer;

do $$
begin
  alter table public.reminders
    add constraint reminders_offset_minutes_check
    check (offset_minutes is null or offset_minutes >= 0);
exception
  when duplicate_object then null;
end $$;

-- 5. A reminder with no parent is meaningless — cascade the delete.
alter table public.reminders drop constraint if exists reminders_task_id_fkey;
alter table public.reminders
  add constraint reminders_task_id_fkey
  foreign key (task_id) references public.tasks (id) on delete cascade;

alter table public.reminders drop constraint if exists reminders_event_id_fkey;
alter table public.reminders
  add constraint reminders_event_id_fkey
  foreign key (event_id) references public.calendar_events (id) on delete cascade;

-- 6. Exactly one parent — never both, never neither.
alter table public.reminders drop constraint if exists reminders_exactly_one_parent_check;
alter table public.reminders
  add constraint reminders_exactly_one_parent_check
  check (
    (task_id is not null and event_id is null) or
    (task_id is null and event_id is not null)
  );

-- 7. At most one reminder per task, and at most one per event.
create unique index if not exists reminders_one_per_task_idx
  on public.reminders (task_id) where task_id is not null;

create unique index if not exists reminders_one_per_event_idx
  on public.reminders (event_id) where event_id is not null;

-- ============================================================================
-- End of migration. RLS policies and GRANTs from 0004_reminders.sql are
-- unchanged and still apply — no action needed for those.
-- ============================================================================
