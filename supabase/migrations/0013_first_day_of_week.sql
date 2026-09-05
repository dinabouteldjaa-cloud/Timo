-- ============================================================================
-- Timo — First day of week preference
-- ============================================================================
-- Adds a purely DISPLAY-ORDER preference to profiles. This does NOT change
-- the internal weekday numbering used everywhere else in the app
-- (0=Sunday .. 6=Saturday, per src/types/task.ts's recurrenceDaysOfWeek and
-- the recurrence engine) — it only controls which day a user sees listed
-- first in Calendar/RecurrencePicker. Recurrence semantics, stored
-- daysOfWeek values, and "every weekday" (still [1,2,3,4,5]) are entirely
-- unaffected.
--
-- Default is 1 (Monday) for both new and existing rows — this matches
-- Calendar's own current hardcoded Monday-first behavior exactly (see
-- CalendarPage.tsx's buildMonthGrid/getWeekDates, both currently
-- `(x.getDay() + 6) % 7`), so existing users see no unexpected change to
-- Calendar on first load after this ships. RecurrencePicker's own
-- previously-hardcoded Sunday-first order will visibly change to
-- Monday-first as a result — an approved, deliberate product decision to
-- make the two surfaces consistent, not an oversight.
--
-- No separate backfill is needed: `not null default 1` applies to every
-- existing row automatically as part of this single ALTER TABLE.
-- ============================================================================

alter table public.profiles
  add column if not exists first_day_of_week smallint not null default 1;

do $$
begin
  alter table public.profiles
    add constraint profiles_first_day_of_week_range
    check (first_day_of_week between 0 and 6);
exception
  when duplicate_object then null;
end $$;

-- Existing grants/RLS (0001_init.sql / 0003_grants_corrective.sql) already
-- cover `select, update` on profiles for the owning user via
-- `auth.uid() = id` — a plain column addition needs no changes there.

-- ============================================================================
-- End of migration.
-- ============================================================================
