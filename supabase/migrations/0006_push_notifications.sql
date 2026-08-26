-- ============================================================================
-- Timo — Push notification infrastructure migration
-- ============================================================================
-- Run this once, in the Supabase SQL Editor, AFTER 0005_reminders_refactor.sql.
-- Safe to run once on a fresh project; guarded with IF NOT EXISTS /
-- DROP POLICY IF EXISTS / DROP TRIGGER IF EXISTS where practical.
--
-- Adds two tables:
--
--   push_subscriptions — one row per browser/device a user has enabled
--   notifications on (a user may have several: phone, laptop, etc). Holds
--   the standard Web Push subscription fields (endpoint, p256dh, auth).
--   Readable/writable by the owning user directly from the client (RLS
--   scoped to auth.uid()), the same pattern as tasks/events/reminders.
--
--   reminder_deliveries — one row per reminder that has actually been
--   sent. This is the deduplication ledger: the push-sending Edge
--   Function INSERTs a row here (on a UNIQUE reminder_id) before sending,
--   and only proceeds if that insert succeeded. If two overlapping cron
--   runs race for the same reminder, only one can win the insert, so the
--   reminder is delivered exactly once. This table is NOT exposed to
--   the client at all — no RLS policies are granted to anon/authenticated,
--   so only the service-role key (used solely inside the Edge Function)
--   can read or write it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PUSH SUBSCRIPTIONS
-- ----------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  endpoint text not null unique,
  p256dh text not null,
  auth text not null,

  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Push subscriptions are viewable by owner" on public.push_subscriptions;
create policy "Push subscriptions are viewable by owner"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

drop policy if exists "Push subscriptions are insertable by owner" on public.push_subscriptions;
create policy "Push subscriptions are insertable by owner"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

drop policy if exists "Push subscriptions are updatable by owner" on public.push_subscriptions;
create policy "Push subscriptions are updatable by owner"
  on public.push_subscriptions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Push subscriptions are deletable by owner" on public.push_subscriptions;
create policy "Push subscriptions are deletable by owner"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- Explicit table privileges for the authenticated role (RLS narrows rows,
-- but the base SQL privilege must also be granted — see prior migrations'
-- notes on the earlier "permission denied for table tasks" issue).
grant select, insert, update, delete on public.push_subscriptions to authenticated;


-- ----------------------------------------------------------------------------
-- 2. REMINDER DELIVERIES (dedup ledger — service-role only, no client access)
-- ----------------------------------------------------------------------------

create table if not exists public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  reminder_id uuid not null unique references public.reminders (id) on delete cascade,
  delivered_at timestamptz not null default now(),
  -- How many of the user's devices actually received it, for observability.
  subscriptions_notified integer not null default 0
);

alter table public.reminder_deliveries enable row level security;
-- Intentionally NO policies are granted to anon/authenticated here. With
-- RLS enabled and zero policies, the client (anon/authenticated roles)
-- cannot read or write this table under any circumstances — only the
-- service-role key, which always bypasses RLS and is used exclusively
-- inside the push-reminders Edge Function, can touch it.


-- ----------------------------------------------------------------------------
-- 3. DUE / UNSENT REMINDERS VIEW (service-role only)
-- ----------------------------------------------------------------------------
-- A single, efficient query the Edge Function reads from: reminders whose
-- remind_at has arrived and that have no matching reminder_deliveries row
-- yet. This is what lets one recurring cron check (see
-- 0007_push_cron_schedule.sql) replace scheduling a job per reminder.

create or replace view public.due_unsent_reminders as
select
  r.id as reminder_id,
  r.user_id,
  r.remind_at,
  r.offset_minutes,
  r.task_id,
  r.event_id
from public.reminders r
left join public.reminder_deliveries d on d.reminder_id = r.id
where r.remind_at <= now()
  and d.id is null;

-- Views can inherit a project's default privileges just like tables, so
-- this is explicit rather than assumed: never selectable by the client,
-- only by the service-role key used inside the Edge Function.
revoke all on public.due_unsent_reminders from anon, authenticated;
grant select on public.due_unsent_reminders to service_role;

-- ============================================================================
-- End of migration.
-- ============================================================================
