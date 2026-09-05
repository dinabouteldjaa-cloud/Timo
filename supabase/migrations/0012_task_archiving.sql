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

-- ============================================================================
-- End of migration.
-- ============================================================================
