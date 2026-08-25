-- ============================================================================
-- Timo — Calendar events migration
-- ============================================================================
-- Run this once, after 0001_init.sql, in the Supabase SQL Editor.
--
-- Creates `calendar_events`, enables RLS with owner-only policies, and
-- explicitly GRANTs table privileges to the `authenticated` role.
--
-- IMPORTANT: RLS policies alone are not enough. PostgreSQL requires the
-- role to hold the base SELECT/INSERT/UPDATE/DELETE privilege on a table
-- before RLS is even evaluated — RLS only narrows which *rows* a role can
-- see/touch once it already has the privilege to attempt the operation.
-- This is exactly what caused the earlier "permission denied for table
-- tasks" issue, so the GRANTs below are explicit rather than assumed.
--
-- Safe to run once on a fresh project. Re-running is guarded with
-- IF NOT EXISTS / DROP POLICY IF EXISTS / DROP TRIGGER IF EXISTS. GRANT
-- statements are always safe to re-run.
-- ============================================================================

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  title text not null check (char_length(trim(title)) > 0),
  description text,

  event_date date not null,
  start_time time,
  end_time time,
  all_day boolean not null default false,

  location text,
  event_type text not null default 'event'
    check (event_type in ('event', 'meeting')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_events_user_id_idx on public.calendar_events (user_id);
create index if not exists calendar_events_user_id_date_idx on public.calendar_events (user_id, event_date);

alter table public.calendar_events enable row level security;

drop policy if exists "Calendar events are viewable by owner" on public.calendar_events;
create policy "Calendar events are viewable by owner"
  on public.calendar_events for select
  using (auth.uid() = user_id);

drop policy if exists "Calendar events are insertable by owner" on public.calendar_events;
create policy "Calendar events are insertable by owner"
  on public.calendar_events for insert
  with check (auth.uid() = user_id);

drop policy if exists "Calendar events are updatable by owner" on public.calendar_events;
create policy "Calendar events are updatable by owner"
  on public.calendar_events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Calendar events are deletable by owner" on public.calendar_events;
create policy "Calendar events are deletable by owner"
  on public.calendar_events for delete
  using (auth.uid() = user_id);

-- Reuses the set_updated_at() function created in 0001_init.sql.
drop trigger if exists set_calendar_events_updated_at on public.calendar_events;
create trigger set_calendar_events_updated_at
  before update on public.calendar_events
  for each row execute procedure public.set_updated_at();

-- Explicit table privileges for the authenticated role (see note above).
grant select, insert, update, delete on public.calendar_events to authenticated;

-- ============================================================================
-- End of migration.
-- ============================================================================
