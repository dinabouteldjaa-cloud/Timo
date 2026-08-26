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
// job per reminder). On each invocation it:
//
//   1. Reads `public.due_unsent_reminders` (a view joining reminders whose
//      remind_at has passed against the reminder_deliveries dedup ledger —
//      see 0006_push_notifications.sql).
//   2. For each due reminder, ATOMICALLY claims it by inserting into
//      reminder_deliveries first (a UNIQUE constraint on reminder_id makes
//      this a compare-and-swap: if two overlapping runs race for the same
//      reminder, only one insert can succeed). Only the run that wins the
//      claim proceeds to send — this is what guarantees "send only once"
//      even under retries/overlaps.
//   3. Resolves the reminder's parent Task or Event to build the
//      notification title/body.
//   4. Sends a Web Push message to every device (push_subscriptions row)
//      the reminder's owner has registered.
//   5. If the push provider reports a subscription is gone (404/410), that
//      subscription row is deleted so it's never retried.
//
// Deliberate design choice: the claim (step 2) happens BEFORE sending
// (step 4). This means delivery is "at most once", not "at least once" —
// if sending fails after the claim succeeds, that reminder will not be
// retried. This was chosen because the requirement that a reminder must
// never be sent twice is mandatory, while occasionally missing a send on
// a transient provider error is an acceptable trade-off for this phase.
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

  const { data: due, error: dueError } = await supabase
    .from('due_unsent_reminders')
    .select('*');

  if (dueError) {
    return new Response(JSON.stringify({ error: dueError.message }), { status: 500 });
  }

  const dueReminders = (due ?? []) as DueReminder[];
  let sent = 0;
  let skippedAlreadyClaimed = 0;
  let failed = 0;

  for (const reminder of dueReminders) {
    // Atomic claim: only the run that successfully inserts here proceeds.
    const { error: claimError } = await supabase
      .from('reminder_deliveries')
      .insert({ reminder_id: reminder.reminder_id });

    if (claimError) {
      // 23505 = unique_violation — another invocation already claimed this
      // reminder. This is the expected, safe outcome of a race, not a bug.
      if (claimError.code === '23505') {
        skippedAlreadyClaimed++;
        continue;
      }
      failed++;
      continue;
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
        // Parent was deleted between the view read and now — nothing to send.
        continue;
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
        .eq('reminder_id', reminder.reminder_id);

      sent++;
    } catch {
      failed++;
    }
  }

  return new Response(
    JSON.stringify({
      checked: dueReminders.length,
      sent,
      skippedAlreadyClaimed,
      failed,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
