-- ============================================================================
-- Timo — Focus sessions migration
-- ============================================================================
-- Run this once, in the Supabase SQL Editor, AFTER
-- 0008_reminder_reschedule_reset.sql. Safe to run once on a fresh project;
-- guarded with IF NOT EXISTS / DROP POLICY IF EXISTS where practical.
--
-- Stores completed/ended Focus sessions for history and simple stats
-- ("focused today", "sessions today", a compact recent-sessions list).
-- The live countdown itself stays in React state and is NOT written here
-- every second — only a single row is inserted once a session finishes
-- (naturally or via "End session"). See src/lib/focusSessionsApi.ts.
--
-- DURATION REPRESENTATION — actual_seconds, not actual_minutes:
-- The brief allowed proposing actual_seconds instead of actual_minutes if
-- it would be meaningfully more accurate, while keeping the user-facing
-- UI in minutes. That's what this does: a session ended after only a few
-- seconds should record those few seconds, not get rounded up into a
-- misleadingly "full" minute (or down to a misleading zero). The app
-- computes minutes for display by rounding actual_seconds only at the
-- moment of display (e.g. `Math.round(actualSeconds / 60)`), and sums
-- raw seconds across sessions before rounding once for a "today" total —
-- so rounding error never compounds across multiple sessions.
--
-- A focus session may exist without a Task (task_id nullable). If the
-- linked Task is later deleted, the session record is preserved with
-- task_id set to NULL (ON DELETE SET NULL) rather than being deleted —
-- focus history is independent of whether the task still exists.
-- ============================================================================

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,

  started_at timestamptz not null,
  ended_at timestamptz not null check (ended_at >= started_at),

  planned_minutes integer not null check (planned_minutes > 0),
  -- See note above: seconds, not minutes, for accuracy on short/early-ended sessions.
  actual_seconds integer not null check (actual_seconds >= 0),

  status text not null check (status in ('completed', 'ended_early')),

  created_at timestamptz not null default now()
);

create index if not exists focus_sessions_user_id_idx on public.focus_sessions (user_id);
create index if not exists focus_sessions_user_id_started_at_idx
  on public.focus_sessions (user_id, started_at desc);
create index if not exists focus_sessions_task_id_idx on public.focus_sessions (task_id);

alter table public.focus_sessions enable row level security;

drop policy if exists "Focus sessions are viewable by owner" on public.focus_sessions;
create policy "Focus sessions are viewable by owner"
  on public.focus_sessions for select
  using (auth.uid() = user_id);

drop policy if exists "Focus sessions are insertable by owner" on public.focus_sessions;
create policy "Focus sessions are insertable by owner"
  on public.focus_sessions for insert
  with check (auth.uid() = user_id);

-- No update/delete policies: a saved focus session is a write-once history
-- record in this phase — nothing in the app edits or removes one after
-- the fact, so no update/delete access is granted, intentionally
-- minimizing what the client can do to this table.

-- Explicit table privileges for the authenticated role (RLS narrows rows,
-- but the base SQL privilege must also be granted — see prior migrations'
-- notes on the earlier "permission denied for table tasks" issue). Only
-- SELECT and INSERT are granted, matching the policies above.
grant select, insert on public.focus_sessions to authenticated;

-- ============================================================================
-- End of migration.
-- ============================================================================
