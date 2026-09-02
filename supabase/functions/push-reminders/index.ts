// ============================================================================
// Timo — push-reminders Edge Function
// ============================================================================
// ┌──────────────────────────────────────────────────────────────────────┐
// │ CRITICAL — DEPLOY WITH --no-verify-jwt                                │
// │                                                                        │
// │ This function is called by pg_cron (see 0007_push_cron_schedule.sql), │
// │ not by a logged-in user, so requests carry no Supabase Authorization  │
// │ JWT — only the custom `x-cron-secret` header checked below. Supabase  │
// │ verifies a JWT at the platform gateway by default and will reject     │
// │ every cron call with 401 before this code ever runs unless deployed   │
// │ with JWT verification explicitly disabled for this function only:     │
// │                                                                        │
// │     supabase functions deploy push-reminders --no-verify-jwt          │
// │                                                                        │
// │ This does not weaken security — the CRON_SECRET check below still     │
// │ runs on every request and rejects anything that doesn't match. It     │
// │ only removes a gateway check this endpoint could never pass anyway.   │
// │ The service-role key stays server-side regardless, in either case.    │
// └──────────────────────────────────────────────────────────────────────┘
//
// Triggered on a schedule (see supabase/migrations/0007_push_cron_schedule.sql
// — one recurring pg_cron job calling this endpoint every minute; NOT one
// job per reminder). On each invocation it does TWO passes:
//
// PASS 1 — ordinary (non-recurring) reminders, unchanged since this
// function was first built:
//   1. Reads `public.due_unsent_reminders` (a view joining reminders whose
//      remind_at has passed against the reminder_deliveries dedup ledger —
//      see 0006_push_notifications.sql and 0011_recurring_tasks_events.sql
//      for how that view's dedup join was updated to stay correct once
//      reminder_deliveries became keyed on (reminder_id, occurrence_date)
//      instead of reminder_id alone).
//   2. For each due reminder, ATOMICALLY claims it by inserting into
//      reminder_deliveries first (a UNIQUE constraint on
//      (reminder_id, occurrence_date) makes this a compare-and-swap: if
//      two overlapping runs race for the same reminder, only one insert
//      can succeed). Only the run that wins the claim proceeds to send —
//      this is what guarantees "send only once" even under retries/overlaps.
//
// PASS 2 — recurring tasks'/events' reminders (see
// 0011_recurring_tasks_events.sql): a recurring item's reminder is still
// just ONE row in `reminders` (one per task/event, exactly as before —
// no new reminder system). Its remind_at only ever reflects the FIRST
// occurrence's absolute timestamp; PASS 1 naturally delivers that first
// occurrence once and then stays silent forever after (its
// occurrence_date never changes). PASS 2 separately finds reminders whose
// parent task/event is still recurring, checks whether TODAY is a valid
// occurrence of that series (isOccurrenceUTC, a small self-contained
// port of the same matching rules used in src/lib/recurrence.ts — Edge
// Functions run in a separate Deno runtime with no shared package
// between frontend and functions in this project, so this is duplicated
// rather than imported, matching this function's existing style), and if
// so, claims/sends it keyed to TODAY's date specifically.
//
// KNOWN LIMITATION (disclosed, not silently assumed away): a recurring
// reminder's time-of-day is derived from the UTC clock time of its
// original remind_at, reapplied to each new occurrence date. This is
// correct as long as the user's UTC offset doesn't change between
// occurrences (e.g. no DST transition, no travel across timezones) —
// exactly the same class of assumption the rest of this reminder system
// already makes by storing only a UTC instant with no separate timezone
// field. Fixing this fully would require storing the user's timezone
// somewhere, which does not exist yet anywhere in this schema.
//
// For BOTH passes: sends a Web Push message to every device
// (push_subscriptions row) the reminder's owner has registered, and if
// the push provider reports a subscription is gone (404/410), deletes
// that subscription so it's never retried.
//
// Deliberate design choice: the claim happens BEFORE sending. This means
// delivery is "at most once", not "at least once" — if sending fails
// after the claim succeeds, that reminder will not be retried. This was
// chosen because the requirement that a reminder must never be sent
// twice is mandatory, while occasionally missing a send on a transient
// provider error is an acceptable trade-off for this phase.
//
// Required secrets (set with `supabase secrets set NAME=value`):
//   CRON_SECRET           — a long, random shared secret (treat it as a
//                          real credential, not a short password) checked
//                          against the `x-cron-secret` request header, so
//                          only your own pg_cron job (or you, manually)
//                          can trigger this function.
//   VAPID_PUBLIC_KEY      — public VAPID key (also used by the frontend).
//   VAPID_PRIVATE_KEY     — private VAPID key. NEVER put this in frontend
//                          code or commit it anywhere.
//   VAPID_SUBJECT         — a "mailto:you@example.com" or site URL, as
//                          required by the Web Push protocol.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically by
// the Supabase Edge Functions runtime — you do not set these yourself, and
// this key never leaves this server-side function.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

interface DueReminder {
  reminder_id: string;
  user_id: string;
  remind_at: string;
  offset_minutes: number | null;
  task_id: string | null;
  event_id: string | null;
}

type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';

interface RecurringReminderRow {
  id: string;
  user_id: string;
  remind_at: string;
  offset_minutes: number | null;
  task_id: string | null;
  event_id: string | null;
  base_date: string; // the parent task's due_date or event's event_date
  recurrence_type: RecurrenceType;
  recurrence_days_of_week: number[] | null;
  recurrence_end_date: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  due_date: string | null;
  due_time: string | null;
}

interface EventRow {
  id: string;
  title: string;
  event_date: string;
  start_time: string | null;
  all_day: boolean;
  event_type: 'event' | 'meeting';
}

interface PushSubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * A minimal, self-contained port of src/lib/recurrence.ts's isOccurrence,
 * operating on UTC date components throughout (consistent with remind_at
 * itself being stored as a UTC instant) — see the KNOWN LIMITATION note
 * above the module doc for what this does and doesn't guarantee.
 */
function isOccurrenceUTC(baseDateISO: string, rule: RecurringReminderRow, dateISO: string): boolean {
  if (dateISO < baseDateISO) return false;
  if (rule.recurrence_end_date && dateISO > rule.recurrence_end_date) return false;
  if (rule.recurrence_type === 'none') return dateISO === baseDateISO;

  const base = new Date(`${baseDateISO}T00:00:00Z`);
  const date = new Date(`${dateISO}T00:00:00Z`);

  switch (rule.recurrence_type) {
    case 'daily':
      return true;
    case 'weekly':
      return date.getUTCDay() === base.getUTCDay();
    case 'monthly': {
      const targetDay = base.getUTCDate();
      const lastDayOfTargetMonth = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate();
      return date.getUTCDate() === Math.min(targetDay, lastDayOfTargetMonth);
    }
    case 'custom':
      return (rule.recurrence_days_of_week ?? []).includes(date.getUTCDay());
    default:
      return false;
  }
}

function offsetPhrase(minutes: number): string {
  if (minutes === 0) return 'now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  if (minutes < 1440) {
    const hours = Math.round(minutes / 60);
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.round(minutes / 1440);
  return `${days} day${days === 1 ? '' : 's'}`;
}

function formatFriendlyWhen(date: string, time: string | null): string {
  const d = time ? new Date(`${date}T${time}`) : new Date(`${date}T00:00:00`);
  const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
  if (!time) return dateLabel;
  const timeLabel = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
  return `${dateLabel} at ${timeLabel}`;
}

/** Builds the notification title/body/url for a task-linked reminder. */
function buildTaskNotification(task: TaskRow, offsetMinutes: number | null) {
  const statusLine =
    offsetMinutes !== null
      ? offsetMinutes === 0
        ? 'Due now.'
        : `Due in ${offsetPhrase(offsetMinutes)}.`
      : task.due_date
        ? `Due ${formatFriendlyWhen(task.due_date, task.due_time)}.`
        : 'Reminder for this task.';

  return {
    title: 'Timo',
    body: `${task.title}\n${statusLine}`,
    url: '/#/tasks',
  };
}

/** Builds the notification title/body/url for an event-linked reminder. */
function buildEventNotification(event: EventRow, offsetMinutes: number | null) {
  const statusLine =
    offsetMinutes !== null
      ? offsetMinutes === 0
        ? 'Starting now.'
        : `Starts in ${offsetPhrase(offsetMinutes)}.`
      : event.all_day
        ? 'Today.'
        : `Starts ${formatFriendlyWhen(event.event_date, event.start_time)}.`;

  return {
    title: 'Timo',
    body: `${event.title}\n${statusLine}`,
    url: '/#/calendar',
  };
}

interface ClaimAndSendCounts {
  sent: number;
  skippedAlreadyClaimed: number;
  failed: number;
}

/**
 * Atomically claims one reminder for one specific occurrence date, then
 * resolves its parent Task/Event and sends to every registered device.
 * Used by both passes — the only difference between an ordinary reminder
 * and a recurring one, from this function's point of view, is which
 * occurrence_date is being claimed.
 */
async function claimAndSend(
  supabase: ReturnType<typeof createClient>,
  reminder: { reminder_id: string; user_id: string; offset_minutes: number | null; task_id: string | null; event_id: string | null },
  occurrenceDate: string,
  counts: ClaimAndSendCounts,
): Promise<void> {
  // Atomic claim: only the run that successfully inserts here proceeds.
  const { error: claimError } = await supabase
    .from('reminder_deliveries')
    .insert({ reminder_id: reminder.reminder_id, occurrence_date: occurrenceDate });

  if (claimError) {
    // 23505 = unique_violation — another invocation (or, for a recurring
    // reminder, the other pass) already claimed this exact reminder +
    // date. This is the expected, safe outcome of a race, not a bug.
    if (claimError.code === '23505') {
      counts.skippedAlreadyClaimed++;
    } else {
      counts.failed++;
    }
    return;
  }

  try {
    let notification: { title: string; body: string; url: string } | null = null;

    if (reminder.task_id) {
      const { data: task } = await supabase
        .from('tasks')
        .select('id, title, due_date, due_time')
        .eq('id', reminder.task_id)
        .maybeSingle();
      if (task) notification = buildTaskNotification(task as TaskRow, reminder.offset_minutes);
    } else if (reminder.event_id) {
      const { data: event } = await supabase
        .from('calendar_events')
        .select('id, title, event_date, start_time, all_day, event_type')
        .eq('id', reminder.event_id)
        .maybeSingle();
      if (event) notification = buildEventNotification(event as EventRow, reminder.offset_minutes);
    }

    if (!notification) {
      // Parent was deleted between the read and now — nothing to send.
      return;
    }

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', reminder.user_id);

    const subscriptions = (subs ?? []) as PushSubscriptionRow[];
    let notified = 0;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(notification),
        );
        notified++;
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is no longer valid on the push provider's side —
          // remove it so it's never retried.
          await supabase.from('push_subscriptions').delete().eq('id', sub.id);
        }
      }
    }

    await supabase
      .from('reminder_deliveries')
      .update({ subscriptions_notified: notified })
      .eq('reminder_id', reminder.reminder_id)
      .eq('occurrence_date', occurrenceDate);

    counts.sent++;
  } catch {
    counts.failed++;
  }
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  if (!cronSecret || providedSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return new Response(JSON.stringify({ error: 'VAPID secrets are not configured' }), {
      status: 500,
    });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const counts: ClaimAndSendCounts = { sent: 0, skippedAlreadyClaimed: 0, failed: 0 };

  // --- PASS 1: ordinary (non-recurring) reminders --------------------------
  const { data: due, error: dueError } = await supabase.from('due_unsent_reminders').select('*');

  if (dueError) {
    return new Response(JSON.stringify({ error: dueError.message }), { status: 500 });
  }

  const dueReminders = (due ?? []) as DueReminder[];
  for (const reminder of dueReminders) {
    const occurrenceDate = reminder.remind_at.slice(0, 10);
    await claimAndSend(supabase, reminder, occurrenceDate, counts);
  }

  // --- PASS 2: recurring tasks'/events' reminders ---------------------------
  // See the module header comment for the full explanation. Two separate
  // queries (task-linked, event-linked) since a reminder has exactly one
  // parent type — same pattern already used throughout this schema.
  const nowUTC = new Date();
  const todayISO = nowUTC.toISOString().slice(0, 10);

  const { data: recurringTaskReminders } = await supabase
    .from('reminders')
    .select(
      'id, user_id, remind_at, offset_minutes, task_id, event_id, tasks!inner(due_date, recurrence_type, recurrence_days_of_week, recurrence_end_date)',
    )
    .not('task_id', 'is', null)
    .neq('tasks.recurrence_type', 'none');

  const { data: recurringEventReminders } = await supabase
    .from('reminders')
    .select(
      'id, user_id, remind_at, offset_minutes, task_id, event_id, calendar_events!inner(event_date, recurrence_type, recurrence_days_of_week, recurrence_end_date)',
    )
    .not('event_id', 'is', null)
    .neq('calendar_events.recurrence_type', 'none');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function toRecurringRow(raw: any, parentKey: 'tasks' | 'calendar_events', dateField: string): RecurringReminderRow {
    const parent = raw[parentKey];
    return {
      id: raw.id,
      user_id: raw.user_id,
      remind_at: raw.remind_at,
      offset_minutes: raw.offset_minutes,
      task_id: raw.task_id,
      event_id: raw.event_id,
      base_date: parent[dateField],
      recurrence_type: parent.recurrence_type,
      recurrence_days_of_week: parent.recurrence_days_of_week,
      recurrence_end_date: parent.recurrence_end_date,
    };
  }

  const recurringRows: RecurringReminderRow[] = [
    ...((recurringTaskReminders ?? []) as unknown[]).map((r) => toRecurringRow(r, 'tasks', 'due_date')),
    ...((recurringEventReminders ?? []) as unknown[]).map((r) =>
      toRecurringRow(r, 'calendar_events', 'event_date'),
    ),
  ].filter((r) => r.base_date); // a series needs a base date to recur from

  let recurringChecked = 0;
  for (const row of recurringRows) {
    if (!isOccurrenceUTC(row.base_date, row, todayISO)) continue;
    recurringChecked++;

    // Reapply the reminder's original UTC time-of-day to TODAY's date —
    // see the KNOWN LIMITATION note in the module header for what this
    // does and doesn't guarantee across DST/timezone changes.
    const timeOfDayUTC = row.remind_at.slice(11, 19);
    const candidateRemindAt = new Date(`${todayISO}T${timeOfDayUTC}Z`);
    if (candidateRemindAt > nowUTC) continue; // not due yet today

    await claimAndSend(
      supabase,
      { reminder_id: row.id, user_id: row.user_id, offset_minutes: row.offset_minutes, task_id: row.task_id, event_id: row.event_id },
      todayISO,
      counts,
    );
  }

  return new Response(
    JSON.stringify({
      checked: dueReminders.length,
      recurringChecked,
      sent: counts.sent,
      skippedAlreadyClaimed: counts.skippedAlreadyClaimed,
      failed: counts.failed,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
