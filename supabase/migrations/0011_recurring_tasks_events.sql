-- ============================================================================
-- Timo — Recurring tasks & events
-- ============================================================================
-- DO NOT RUN THIS YET. This migration is provided for review first, per
-- explicit instruction. Once reviewed, run it once in the Supabase SQL
-- Editor, AFTER 0010_task_scheduling.sql.
--
-- ARCHITECTURE (see chat report for full reasoning):
--
-- Recurrence is stored as a RULE on the parent tasks/calendar_events row
-- — no future rows are pre-generated. A recurring task/event is just a
-- normal row with recurrence_type != 'none'; the actual dates it appears
-- on ("occurrences") are computed on the fly by the frontend
-- (src/lib/recurrence.ts) from that rule, for whatever date range is
-- currently being displayed (Today / a Calendar month / etc).
--
-- Three small additions make per-occurrence behavior possible without a
-- second task/event system:
--
--   1. Two new nullable columns on tasks/calendar_events themselves:
--      recurrence_parent_id + recurrence_occurrence_date. When a user
--      edits or reschedules just "This occurrence" of a series, that
--      creates an ordinary, real, non-recurring task/event row (using
--      100% the same existing create/update code path as any other
--      task/event) that happens to point back at the series it
--      overrides and which date it stands in for. The frontend simply
--      prefers this override row over the computed occurrence for that
--      date wherever it appears.
--
--   2. occurrence_skips — records "This occurrence" deletes. A tiny
--      table, one row per skipped date, so the series itself is never
--      touched by deleting a single occurrence. Mirrors the existing
--      reminders table's "exactly one of task_id/event_id" pattern.
--
--   3. task_occurrence_completions — records which specific dates of a
--      recurring TASK have been completed. Completing "today's" instance
--      of a daily task inserts one row for today; it never touches the
--      task row itself, so tomorrow's occurrence is unaffected.
--      (Events have no "completed" concept, so this is tasks-only,
--      matching the existing tasks.status column's tasks-only scope.)
--
-- reminders is also touched, minimally: reminder_deliveries gets an
-- occurrence_date column so a recurring item's reminder can be marked
-- delivered PER DATE instead of only once ever — see the report for how
-- the push-reminders Edge Function uses this.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. RECURRENCE RULE COLUMNS on tasks and calendar_events
-- ----------------------------------------------------------------------------

alter table public.tasks add column if not exists recurrence_type text not null default 'none';
do $$
begin
  alter table public.tasks
    add constraint tasks_recurrence_type_check
    check (recurrence_type in ('none', 'daily', 'weekly', 'monthly', 'custom'));
exception
  when duplicate_object then null;
end $$;

-- 0 = Sunday .. 6 = Saturday, used only when recurrence_type = 'custom'.
alter table public.tasks add column if not exists recurrence_days_of_week smallint[];
-- Inclusive last date the series applies to. NULL = never ends.
alter table public.tasks add column if not exists recurrence_end_date date;

-- Set only on a real task row that overrides ONE occurrence of a series
-- (see architecture note above). NULL on both an ordinary task and on a
-- recurring series' own parent row.
alter table public.tasks add column if not exists recurrence_parent_id uuid
  references public.tasks (id) on delete cascade;
alter table public.tasks add column if not exists recurrence_occurrence_date date;

create index if not exists tasks_recurrence_parent_id_idx
  on public.tasks (recurrence_parent_id) where recurrence_parent_id is not null;

-- Same three columns, same meaning, on calendar_events.
alter table public.calendar_events add column if not exists recurrence_type text not null default 'none';
do $$
begin
  alter table public.calendar_events
    add constraint calendar_events_recurrence_type_check
    check (recurrence_type in ('none', 'daily', 'weekly', 'monthly', 'custom'));
exception
  when duplicate_object then null;
end $$;

alter table public.calendar_events add column if not exists recurrence_days_of_week smallint[];
alter table public.calendar_events add column if not exists recurrence_end_date date;
alter table public.calendar_events add column if not exists recurrence_parent_id uuid
  references public.calendar_events (id) on delete cascade;
alter table public.calendar_events add column if not exists recurrence_occurrence_date date;

create index if not exists calendar_events_recurrence_parent_id_idx
  on public.calendar_events (recurrence_parent_id) where recurrence_parent_id is not null;

-- Existing rows are entirely unaffected: recurrence_type defaults to
-- 'none' and every other new column defaults to NULL, so every
-- already-existing task/event continues to behave exactly as a
-- non-recurring item today, with zero behavior change.


-- ----------------------------------------------------------------------------
-- 2. OCCURRENCE SKIPS ("This occurrence" delete, for both tasks and events)
-- ----------------------------------------------------------------------------

create table if not exists public.occurrence_skips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  task_id uuid references public.tasks (id) on delete cascade,
  event_id uuid references public.calendar_events (id) on delete cascade,
  occurrence_date date not null,

  created_at timestamptz not null default now(),

  constraint occurrence_skips_exactly_one_parent check (
    (task_id is not null and event_id is null) or
    (task_id is null and event_id is not null)
  )
);

create unique index if not exists occurrence_skips_task_date_idx
  on public.occurrence_skips (task_id, occurrence_date) where task_id is not null;
create unique index if not exists occurrence_skips_event_date_idx
  on public.occurrence_skips (event_id, occurrence_date) where event_id is not null;

alter table public.occurrence_skips enable row level security;

drop policy if exists "Occurrence skips are viewable by owner" on public.occurrence_skips;
create policy "Occurrence skips are viewable by owner"
  on public.occurrence_skips for select
  using (auth.uid() = user_id);

drop policy if exists "Occurrence skips are insertable by owner" on public.occurrence_skips;
create policy "Occurrence skips are insertable by owner"
  on public.occurrence_skips for insert
  with check (auth.uid() = user_id);

drop policy if exists "Occurrence skips are deletable by owner" on public.occurrence_skips;
create policy "Occurrence skips are deletable by owner"
  on public.occurrence_skips for delete
  using (auth.uid() = user_id);

-- Explicit GRANT — this project's default privileges do not automatically
-- expose newly created tables to the authenticated role (see earlier
-- "permission denied for table tasks" issue this app already hit once).
grant select, insert, delete on public.occurrence_skips to authenticated;


-- ----------------------------------------------------------------------------
-- 3. PER-OCCURRENCE TASK COMPLETION (tasks only — events have no "done" state)
-- ----------------------------------------------------------------------------

create table if not exists public.task_occurrence_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  occurrence_date date not null,
  completed_at timestamptz not null default now()
);

create unique index if not exists task_occurrence_completions_task_date_idx
  on public.task_occurrence_completions (task_id, occurrence_date);

alter table public.task_occurrence_completions enable row level security;

drop policy if exists "Occurrence completions are viewable by owner" on public.task_occurrence_completions;
create policy "Occurrence completions are viewable by owner"
  on public.task_occurrence_completions for select
  using (auth.uid() = user_id);

drop policy if exists "Occurrence completions are insertable by owner" on public.task_occurrence_completions;
create policy "Occurrence completions are insertable by owner"
  on public.task_occurrence_completions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Occurrence completions are deletable by owner" on public.task_occurrence_completions;
create policy "Occurrence completions are deletable by owner"
  on public.task_occurrence_completions for delete
  using (auth.uid() = user_id);

grant select, insert, delete on public.task_occurrence_completions to authenticated;


-- ----------------------------------------------------------------------------
-- 4. REMINDER DELIVERY DEDUP — per occurrence date, not just once ever
-- ----------------------------------------------------------------------------
-- reminder_deliveries (0006_push_notifications.sql) currently has a plain
-- UNIQUE(reminder_id) — correct for a one-off reminder, but it would
-- permanently block every future occurrence of a recurring item's
-- reminder after the very first one fired. Adding occurrence_date (never
-- NULL, so the unique constraint stays fully enforceable) and keying
-- uniqueness on the (reminder_id, occurrence_date) PAIR preserves the
-- exact same "send exactly once" guarantee for ordinary reminders
-- (they only ever produce one occurrence_date — the date of their own
-- remind_at) while allowing a recurring reminder to be delivered once
-- PER valid occurrence date going forward.

alter table public.reminder_deliveries add column if not exists occurrence_date date;

-- Backfill existing rows with the date portion of when they were
-- actually delivered, so the column can safely become NOT NULL — this
-- doesn't change what already happened, it just gives already-delivered
-- rows a real, non-null occurrence_date consistent with the new column's
-- meaning.
update public.reminder_deliveries set occurrence_date = delivered_at::date
  where occurrence_date is null;

alter table public.reminder_deliveries alter column occurrence_date set not null;
alter table public.reminder_deliveries alter column occurrence_date set default current_date;

alter table public.reminder_deliveries drop constraint if exists reminder_deliveries_reminder_id_key;
create unique index if not exists reminder_deliveries_reminder_occurrence_idx
  on public.reminder_deliveries (reminder_id, occurrence_date);

-- The view's old join only checked "does ANY delivery exist for this
-- reminder_id" — correct back when a reminder could only ever be
-- delivered once, period. Now that reminder_deliveries is keyed on
-- (reminder_id, occurrence_date), that old join would permanently
-- exclude a recurring reminder from this view after its very first
-- delivery, since it never re-checks per date. This replaces it with a
-- join on BOTH reminder_id and that reminder's own remind_at date,
-- which is exactly equivalent to the original behavior for an ordinary,
-- non-recurring reminder (its remind_at date never changes, so this is
-- the same "sent once, ever" check as before) while remaining correct
-- once the push-reminders function separately re-checks recurring
-- reminders against each new occurrence date (see that function's own
-- comments for how it queries recurring reminders itself, outside this
-- view, since matching a recurrence rule isn't expressed here in SQL).
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
where r.remind_at <= now()
  and d.id is null;

revoke all on public.due_unsent_reminders from anon, authenticated;
grant select on public.due_unsent_reminders to service_role;

-- No grant changes here: reminder_deliveries remains service-role-only,
-- exactly as before (see 0006_push_notifications.sql) — still zero
-- policies granted to anon/authenticated.

-- ============================================================================
-- End of migration.
-- ============================================================================
