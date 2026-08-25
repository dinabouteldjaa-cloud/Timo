-- ============================================================================
-- Timo — Reminders migration
-- ============================================================================
-- Run this once, after 0001_init.sql (and the calendar_events migration you
-- already applied), in the Supabase SQL Editor.
--
-- Creates `reminders`, enables RLS with owner-only policies, and explicitly
-- GRANTs table privileges to the `authenticated` role.
--
-- IMPORTANT: RLS policies restrict which *rows* a role can see/modify, but
-- do not by themselves grant permission to attempt the operation at all —
-- that base SELECT/INSERT/UPDATE/DELETE privilege is a separate GRANT. This
-- is what caused the earlier "permission denied for table tasks" issue, so
-- the GRANT below is explicit rather than assumed.
--
-- A reminder may be standalone, linked to a task, or linked to a calendar
-- event — task_id/event_id are both nullable and mutually optional.
--
-- Foreign-key behavior: if the linked task or event is deleted, the
-- reminder itself is NOT deleted — only the link is cleared (ON DELETE SET
-- NULL). This preserves reminder history instead of silently destroying
-- user data as a side effect of an unrelated delete.
--
-- Safe to run once on a fresh project. Re-running is guarded with
-- IF NOT EXISTS / DROP POLICY IF EXISTS / DROP TRIGGER IF EXISTS. GRANT
-- statements are always safe to re-run.
-- ============================================================================

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  title text not null check (char_length(trim(title)) > 0),
  notes text,

  remind_at timestamptz not null,

  completed boolean not null default false,
  completed_at timestamptz,

  task_id uuid references public.tasks (id) on delete set null,
  event_id uuid references public.calendar_events (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reminders_user_id_idx on public.reminders (user_id);
create index if not exists reminders_user_id_remind_at_idx on public.reminders (user_id, remind_at);
create index if not exists reminders_task_id_idx on public.reminders (task_id);
create index if not exists reminders_event_id_idx on public.reminders (event_id);

alter table public.reminders enable row level security;

drop policy if exists "Reminders are viewable by owner" on public.reminders;
create policy "Reminders are viewable by owner"
  on public.reminders for select
  using (auth.uid() = user_id);

drop policy if exists "Reminders are insertable by owner" on public.reminders;
create policy "Reminders are insertable by owner"
  on public.reminders for insert
  with check (auth.uid() = user_id);

drop policy if exists "Reminders are updatable by owner" on public.reminders;
create policy "Reminders are updatable by owner"
  on public.reminders for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Reminders are deletable by owner" on public.reminders;
create policy "Reminders are deletable by owner"
  on public.reminders for delete
  using (auth.uid() = user_id);

-- Reuses the set_updated_at() function created in 0001_init.sql.
drop trigger if exists set_reminders_updated_at on public.reminders;
create trigger set_reminders_updated_at
  before update on public.reminders
  for each row execute procedure public.set_updated_at();

-- Explicit table privileges for the authenticated role (see note above).
grant select, insert, update, delete on public.reminders to authenticated;

-- ============================================================================
-- End of migration.
-- ============================================================================
