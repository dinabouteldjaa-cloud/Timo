-- ============================================================================
-- Timo — Reset delivery ledger when a reminder is rescheduled
-- ============================================================================
-- Run this once, in the Supabase SQL Editor, AFTER 0007_push_cron_schedule.sql
-- has been applied. Safe to re-run (guarded with DROP TRIGGER/FUNCTION IF
-- EXISTS). No already-applied migration is modified.
--
-- BUG THIS FIXES:
-- A reminder row keeps the same id for its whole life — editing a Task or
-- Event's reminder time updates the existing row's remind_at rather than
-- creating a new one (see src/lib/remindersApi.ts). But
-- reminder_deliveries.reminder_id is keyed on that same, unchanging id, so
-- once a reminder had been delivered once, its reminder_deliveries row
-- stayed forever — permanently excluding it from
-- public.due_unsent_reminders (see 0006_push_notifications.sql) even after
-- being rescheduled to a brand-new remind_at. Net effect: reschedule a
-- reminder that already fired once, and it can never fire again.
--
-- FIX:
-- A trigger on public.reminders, firing only on UPDATE, checks whether
-- remind_at or offset_minutes actually changed. If so, it deletes any
-- existing reminder_deliveries row for that reminder_id — clearing it to
-- send again at the new time. Updates that don't touch the schedule (there
-- currently are none from the app, but this is intentionally narrow rather
-- than firing on every UPDATE) leave the delivery ledger untouched.
--
-- WHY A TRIGGER, AND WHY SECURITY DEFINER:
-- The frontend must never be given direct access to reminder_deliveries —
-- it has zero grants to anon/authenticated (see 0006_push_notifications.sql)
-- and that is unchanged here. A plain trigger function executes with the
-- privileges of whichever role performed the UPDATE (i.e. `authenticated`,
-- via RLS), which has no grant on reminder_deliveries and would fail with
-- a permission error. Declaring the function SECURITY DEFINER — the same
-- pattern already used by public.handle_new_user() in 0001_init.sql for
-- an equivalent cross-table, privileged-on-behalf-of-the-user operation —
-- lets it perform the DELETE regardless, without granting the client any
-- new privileges at all. This keeps the "server-only" boundary intact
-- while still running automatically and identically for Tasks and Events,
-- since both use the same reminders table and the same update path.
--
-- Reminder -> None is unaffected by this migration: it already deletes
-- the reminders row outright, and reminder_deliveries.reminder_id already
-- has ON DELETE CASCADE (see 0006_push_notifications.sql), so its ledger
-- row is removed automatically. No cleanup was needed there.
-- ============================================================================

create or replace function public.reset_reminder_delivery_on_reschedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.remind_at is distinct from old.remind_at)
     or (new.offset_minutes is distinct from old.offset_minutes) then
    delete from public.reminder_deliveries where reminder_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists reset_reminder_delivery_on_reschedule on public.reminders;
create trigger reset_reminder_delivery_on_reschedule
  after update on public.reminders
  for each row execute procedure public.reset_reminder_delivery_on_reschedule();

-- No grants change: authenticated/anon still have zero access to
-- reminder_deliveries. Only this SECURITY DEFINER function may touch it
-- on their behalf, and only to delete the one row matching the reminder
-- that was just genuinely rescheduled.

-- ============================================================================
-- End of migration.
-- ============================================================================
