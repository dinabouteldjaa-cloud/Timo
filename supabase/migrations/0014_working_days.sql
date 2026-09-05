-- ============================================================================
-- Timo — Working days ("weekday") preference
-- ============================================================================
-- Adds a SECOND, INDEPENDENT profiles preference, separate from
-- first_day_of_week (0013_first_day_of_week.sql). first_day_of_week is
-- DISPLAY ORDER ONLY; working_days defines what "weekday" actually MEANS
-- for this user (e.g. Sunday-Thursday in Qatar vs Monday-Friday
-- internationally) — used by Brain Dump when interpreting phrases like
-- "every weekday", and by the recurrence label ("Every weekday" vs an
-- explicit day list). working_days is NEVER derived from
-- first_day_of_week — a user can freely have, say, Saturday as their
-- first displayed day while still working Sunday-Thursday.
--
-- Internal weekday numbering is unchanged everywhere: 0=Sunday..6=Saturday,
-- the same numbers already used by recurrenceDaysOfWeek and the
-- recurrence engine. This column stores the actual selected day numbers
-- directly — never a derived/locale-inferred value.
--
-- Default '{1,2,3,4,5}' (Monday-Friday) matches the previously hardcoded
-- Brain Dump behavior exactly, so existing users see no unexpected change.
-- ============================================================================

alter table public.profiles
  add column if not exists working_days smallint[] not null default '{1,2,3,4,5}';

-- PostgreSQL CHECK constraints cannot contain a raw subquery — not even
-- one built on unnest() — so the "every value 0-6, no duplicates" logic
-- lives in a small IMMUTABLE SQL function instead, which a CHECK
-- constraint CAN call directly.
create or replace function public.is_valid_working_days(days smallint[])
returns boolean
language sql
immutable
as $$
  select
    array_length(days, 1) > 0
    and not exists (select 1 from unnest(days) as d where d < 0 or d > 6)
    and array_length(days, 1) = (select count(distinct d) from unnest(days) as d);
$$;

-- Guarded (safe to re-run): non-empty, every element 0-6, no duplicates.
do $$
begin
  alter table public.profiles
    add constraint profiles_working_days_valid
    check (public.is_valid_working_days(working_days));
exception
  when duplicate_object then null;
end $$;

-- No separate "preset type" column, per the approved design — the
-- Sunday-Thursday / Monday-Friday / Custom choice shown in the UI is
-- always derived by comparing the stored array against the two preset
-- arrays, never persisted as its own field.

-- Existing grants/RLS (0001_init.sql / 0003_grants_corrective.sql) already
-- cover `select, update` on profiles for the owning user; a plain column
-- addition needs no changes there.

-- ============================================================================
-- End of migration.
-- ============================================================================
