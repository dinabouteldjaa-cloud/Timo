-- ============================================================================
-- Timo — Initial backend migration
-- ============================================================================
-- Run this once in the Supabase SQL Editor for your Timo project.
--
-- What this does:
--   1. Creates a `profiles` table (1:1 with auth.users).
--   2. Automatically creates a profile row whenever a new user signs up.
--   3. Creates a `tasks` table for the current Timo task model.
--   4. Enables Row Level Security on both tables and adds policies so a
--      user can only ever read/write their own rows.
--
-- Safe to run once on a fresh project. Re-running is guarded with
-- IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS where practical, but
-- review before re-running against a project with existing data.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. PROFILES
-- ----------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Profiles are updatable by owner" on public.profiles;
create policy "Profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Profiles are created by the trigger below, not directly by users, so no
-- insert policy is granted to the client. The trigger runs as the table
-- owner (security definer) and bypasses RLS for that one insert.

-- Auto-create a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Keep updated_at current on profile edits.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();


-- ----------------------------------------------------------------------------
-- 2. TASKS
-- ----------------------------------------------------------------------------

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  title text not null check (char_length(trim(title)) > 0),
  description text,

  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'completed')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  category text not null default 'other'
    check (category in ('work', 'personal', 'health', 'errands', 'learning', 'other')),

  due_date date,
  due_time time,
  estimated_duration_minutes integer check (estimated_duration_minutes is null or estimated_duration_minutes >= 0),

  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_id_idx on public.tasks (user_id);
create index if not exists tasks_user_id_status_idx on public.tasks (user_id, status);
create index if not exists tasks_user_id_due_date_idx on public.tasks (user_id, due_date);

alter table public.tasks enable row level security;

drop policy if exists "Tasks are viewable by owner" on public.tasks;
create policy "Tasks are viewable by owner"
  on public.tasks for select
  using (auth.uid() = user_id);

drop policy if exists "Tasks are insertable by owner" on public.tasks;
create policy "Tasks are insertable by owner"
  on public.tasks for insert
  with check (auth.uid() = user_id);

drop policy if exists "Tasks are updatable by owner" on public.tasks;
create policy "Tasks are updatable by owner"
  on public.tasks for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Tasks are deletable by owner" on public.tasks;
create policy "Tasks are deletable by owner"
  on public.tasks for delete
  using (auth.uid() = user_id);

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
  before update on public.tasks
  for each row execute procedure public.set_updated_at();

-- ============================================================================
-- End of migration.
-- ============================================================================
