-- ============================================================================
-- Timo — Task scheduling columns (for Plan My Day)
-- ============================================================================
-- Run this once, in the Supabase SQL Editor, AFTER 0009_focus_sessions.sql.
-- Safe to run once on a fresh project; guarded with IF NOT EXISTS /
-- exception-guarded constraint add.
--
-- WHY THIS IS NEEDED:
-- Timo's `tasks` table (0001_init.sql) has `due_date` + `due_time` — a
-- single deadline point — but no field for a planned start/end TIME BLOCK
-- on a specific day. Plan My Day proposes exactly that (e.g.
-- "14:00–15:00 Finish presentation"), so there's no existing column to
-- persist an accepted plan into. This adds the minimal columns needed,
-- rather than inventing a parallel scheduling table/system.
--
-- These three columns together represent ONE optional planned execution
-- block and are intentionally simple for this first version:
--   - scheduled_date is REQUIRED alongside the two times specifically so
--     a schedule from a previous day can never be silently mistaken for
--     today's — without a date, "14:00-15:00" has no way to expire or be
--     distinguished from yesterday's identical-looking block.
--   - They are fully independent of due_date/due_time, which remain the
--     task's actual deadline semantics and are unaffected by this
--     migration. due_date is never reused for this — a task's deadline
--     and its planned execution window are different concepts and can
--     disagree (e.g. due tomorrow, but the user planned to start it today).
--   - No RLS/grant changes are needed — the existing owner-scoped RLS
--     policies and GRANTs on public.tasks (0001_init.sql) already cover
--     every column on the row, including these new ones.
-- ============================================================================

alter table public.tasks add column if not exists scheduled_date date;
alter table public.tasks add column if not exists scheduled_start_time time;
alter table public.tasks add column if not exists scheduled_end_time time;

-- Enforce "all three or none" plus end > start, so a task can never end up
-- in a half-scheduled state (e.g. times set but no date, or vice versa).
do $$
begin
  alter table public.tasks
    add constraint tasks_scheduled_block_check
    check (
      (
        scheduled_date is null
        and scheduled_start_time is null
        and scheduled_end_time is null
      )
      or (
        scheduled_date is not null
        and scheduled_start_time is not null
        and scheduled_end_time is not null
        and scheduled_end_time > scheduled_start_time
      )
    );
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- End of migration.
-- ============================================================================
