-- ============================================================================
-- Timo — Corrective migration: explicit table grants for existing tables
-- ============================================================================
-- Run this once, in the Supabase SQL Editor. Safe to run any number of
-- times, and contains no destructive statements — GRANT only.
--
-- Why this is needed:
-- RLS policies restrict which *rows* a role can see or modify, but they do
-- not by themselves grant the role permission to attempt the operation at
-- all — that base SELECT/INSERT/UPDATE/DELETE privilege is a separate,
-- ordinary PostgreSQL GRANT. The original 0001_init.sql migration created
-- `profiles` and `tasks` with RLS policies but never explicitly GRANTed
-- these privileges to the `authenticated` role, which is what caused the
-- "permission denied for table tasks" error on some deployments (fixed
-- manually in the Supabase dashboard at the time). This migration makes
-- those grants explicit in the repo so a fresh deployment of this schema
-- works correctly without a manual dashboard step.
-- ============================================================================

-- Profiles: read/update only. Rows are created exclusively by the
-- on_auth_user_created trigger (security definer), so INSERT is
-- intentionally not granted to the authenticated role directly.
grant select, update on public.profiles to authenticated;

-- Tasks: full CRUD, scoped by RLS to the owning user.
grant select, insert, update, delete on public.tasks to authenticated;

-- ============================================================================
-- End of migration.
-- ============================================================================
