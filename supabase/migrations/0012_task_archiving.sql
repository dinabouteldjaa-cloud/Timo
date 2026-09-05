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

-- ----------------------------------------------------------------------------
-- Reminders must respect archived_at (inspection: see chat report before
-- this migration was written).
-- ----------------------------------------------------------------------------
-- due_unsent_reminders (PASS 1 in push-reminders — see
-- 0011_recurring_tasks_events.sql for its full history) already LEFT
-- JOINs `tasks` as `t` to check recurrence_type. This adds ONE condition
-- to that same, already-present join: `t.archived_at is null`. This
-- covers BOTH an archived ordinary task's own reminder AND an
-- individually archived recurring occurrence's override reminder (an
-- override is itself just a `tasks` row with recurrence_type = 'none',
-- so its reminder flows through this exact same view). For an
-- event-linked reminder, `t` is entirely NULL from the LEFT JOIN (no
-- task side at all), and `NULL.archived_at IS NULL` is true in SQL, so
-- this condition is automatically a no-op for event reminders — no
-- separate coalesce/event-specific branch is needed. Archiving never
-- deletes a reminder row, so restoring (clearing archived_at) makes the
-- reminder eligible again immediately, with no further action needed.
create or replace view public.due_unsent_reminders as
select
  r.id as reminder_id,
  r.user_id,
  r.remind_at,
  r.offset_minutes,
  r.task_id,
  r.event_id
from public.reminders r
left join public.reminder_deliveries d
  on d.reminder_id = r.id and d.occurrence_date = r.remind_at::date
left join public.tasks t on t.id = r.task_id
left join public.calendar_events e on e.id = r.event_id
where r.remind_at <= now()
  and d.id is null
  and coalesce(t.recurrence_type, 'none') = 'none'
  and coalesce(e.recurrence_type, 'none') = 'none'
  and t.archived_at is null;

revoke all on public.due_unsent_reminders from anon, authenticated;
grant select on public.due_unsent_reminders to service_role;

-- ----------------------------------------------------------------------------
-- Move-To idempotency for recurring occurrences (correction — see chat
-- report: the first version of this used the TRANSIENT
-- (recurrence_parent_id, recurrence_occurrence_date) pair as its
-- idempotency key, but the detach operation's own final step clears
-- exactly those two fields — so after a successful detach, a retry
-- (e.g. triggered by a later, unrelated reminder-application failure, or
-- a lost network response) could no longer find the row it had already
-- created, and would insert a second standalone task).
--
-- These are PERMANENT provenance fields, never cleared once set — a
-- record of "this standalone task originated from detaching this
-- specific occurrence", independent of the transient recurrence_* pair
-- that only reflects an occurrence's CURRENT slot while it's still
-- attached. They are NOT recurrence fields and do not participate in
-- expandTaskOccurrences/occurrence resolution at all — only
-- detachTaskOccurrenceToDate reads or writes them.
-- ----------------------------------------------------------------------------

-- detached_from_parent_id is DELIBERATELY a plain uuid with NO foreign
-- key to tasks(id) — this is historical/idempotency metadata, not an
-- active relationship. An earlier version added `references
-- public.tasks (id) on delete set null`, but that conflicts with the
-- paired-nullability CHECK below: deleting the original recurring
-- series would have cleared ONLY detached_from_parent_id (via the FK's
-- own ON DELETE action) while leaving detached_from_occurrence_date
-- populated, violating the CHECK and potentially making the series
-- delete itself fail. A plain, unconstrained column has no such action
-- to fire, so deleting the original series never touches this pair at
-- all — it stays fully populated, which is exactly what's needed: the
-- provenance identity must survive the original series being deleted,
-- both to remain historically accurate and to keep working as the
-- permanent idempotency key detachTaskOccurrenceToDate relies on.
alter table public.tasks add column if not exists detached_from_parent_id uuid;
alter table public.tasks add column if not exists detached_from_occurrence_date date;

-- detached_from_parent_id and detached_from_occurrence_date form ONE
-- logical identity — a row is either not-detached-from-anything (both
-- NULL) or it records exactly which occurrence it came from (both set);
-- one populated without the other is meaningless and would break the
-- provenance lookup detachTaskOccurrenceToDate relies on. Same
-- defensive style already used for recurrence_parent_id /
-- recurrence_occurrence_date above.
do $$
begin
  alter table public.tasks
    add constraint tasks_detached_from_fields_paired
    check ((detached_from_parent_id is null) = (detached_from_occurrence_date is null));
exception
  when duplicate_object then null;
end $$;

-- One original recurring occurrence can map to at most one detached
-- task. This is what the fixed detachTaskOccurrenceToDate checks FIRST,
-- before ever considering an insert — and what a concurrent/retried
-- attempt's insert collides against (23505) if another attempt already
-- won the race, so it can re-fetch and continue instead of duplicating.
-- The predicate requires BOTH fields non-null (not just the parent id)
-- so it precisely matches the complete provenance identity the paired
-- CHECK constraint above guarantees — with that constraint in place the
-- two predicates are equivalent, but this reads correctly as "a complete
-- provenance record" on its own rather than relying on the reader to
-- know the CHECK constraint exists elsewhere.
create unique index if not exists tasks_detached_from_unique
  on public.tasks (detached_from_parent_id, detached_from_occurrence_date)
  where detached_from_parent_id is not null and detached_from_occurrence_date is not null;

-- ============================================================================
-- End of migration.
-- ============================================================================
