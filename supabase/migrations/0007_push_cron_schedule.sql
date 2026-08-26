-- ============================================================================
-- Timo — Push reminder scheduling (pg_cron + pg_net)
-- ============================================================================
-- Run this SEPARATELY, after:
--   1. 0006_push_notifications.sql has been applied, AND
--   2. the `push-reminders` Edge Function has been deployed WITH
--      `--no-verify-jwt` (see below — this is not optional), AND
--   3. you have chosen a CRON_SECRET and set it as an Edge Function secret
--      (see the Edge Function's own comments for the exact command).
--
-- ┌──────────────────────────────────────────────────────────────────────┐
-- │ CRITICAL — DEPLOYMENT COMMAND                                        │
-- │                                                                      │
-- │ Supabase Edge Functions verify a Supabase Authorization JWT at the   │
-- │ platform gateway BY DEFAULT, before your function code ever runs.    │
-- │ pg_cron's net.http_post call below sends only the custom             │
-- │ `x-cron-secret` header — no Supabase JWT — so if this function is    │
-- │ deployed normally, every cron invocation will be rejected with 401   │
-- │ at the gateway and push-reminders will silently never run.           │
-- │                                                                      │
-- │ You MUST deploy this specific function with JWT verification         │
-- │ disabled:                                                            │
-- │                                                                      │
-- │     supabase functions deploy push-reminders --no-verify-jwt         │
-- │                                                                      │
-- │ This does not weaken security: the function still independently      │
-- │ checks the `x-cron-secret` header against your CRON_SECRET at the    │
-- │ top of its own code (see push-reminders/index.ts) and returns 401    │
-- │ if it's missing or wrong. Disabling gateway JWT verification only    │
-- │ removes a check this endpoint was never going to satisfy anyway      │
-- │ (it isn't called by a logged-in user) — it does NOT expose the       │
-- │ service-role key, which never leaves the function's own environment. │
-- │ CRON_SECRET should be a long, random value (e.g. 32+ random bytes,   │
-- │ not a short password) — treat it as a real credential.               │
-- └──────────────────────────────────────────────────────────────────────┘
--
-- This does NOT create a cron job per reminder — it creates exactly ONE
-- recurring job that calls the Edge Function every minute. The Edge
-- Function itself does the efficient "find all due, unsent reminders in
-- one query" work; Postgres/pg_cron's only job is to ping it on a timer.
--
-- Nothing privileged is placed in this SQL: no service-role key, no
-- Supabase JWT of any kind — only the shared x-cron-secret value, which
-- by itself grants no database access (the function is what enforces it).
--
-- Safe to re-run: cron.schedule() with the same job name replaces the
-- existing schedule rather than creating a duplicate.
-- ============================================================================

-- Enable the two extensions this requires (safe to run even if already enabled).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Replace the two placeholders below before running:
--   <YOUR_PROJECT_REF>   e.g. abcdefghijklmnop  (from your Supabase project URL)
--   <YOUR_CRON_SECRET>   the exact same value you set as the CRON_SECRET
--                        Edge Function secret (see push-reminders/index.ts)
select cron.schedule(
  'timo-push-reminders',        -- job name — re-running this replaces the existing job
  '* * * * *',                  -- every minute; the finest interval pg_cron supports
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/push-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<YOUR_CRON_SECRET>'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- To check the job is registered:
--   select * from cron.job where jobname = 'timo-push-reminders';
--
-- To see recent run results/errors:
--   select * from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'timo-push-reminders')
--   order by start_time desc limit 20;
--
-- To remove the job entirely:
--   select cron.unschedule('timo-push-reminders');

-- ============================================================================
-- End of scheduling setup.
-- ============================================================================
