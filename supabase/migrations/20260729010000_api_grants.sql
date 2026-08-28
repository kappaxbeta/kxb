-- ============================================================================
-- API role grants
-- ----------------------------------------------------------------------------
-- Every table here was written assuming `anon` and `authenticated` already hold
-- table privileges and that RLS is the thing actually deciding who sees what.
-- On the self-hosted database that assumption held, because the install had
-- `alter default privileges in schema public grant all on tables to anon,
-- authenticated, service_role` in place before the first migration ran, so
-- every `create table` picked the grants up for free.
--
-- The local Docker stack does not carry those default privileges, so the same
-- migrations produced tables that `authenticated` may reference and truncate
-- but not select. Nothing failed at migration time - the break only surfaced at
-- runtime, as `permission denied for table tenant_invitations` from a query
-- whose RLS policy would have admitted the caller.
--
-- Depending on an install-time setting that is not in this repo is the actual
-- defect; a database rebuilt from `supabase/migrations` should not need one.
-- So the grants are stated here. On the self-hosted database this is a no-op -
-- it already grants exactly this - which is what makes it safe to push.
--
-- RLS is unaffected and remains the real access control. A grant only says the
-- role may attempt the statement; every table in this schema still has row
-- level security enabled, and a role with `select` on a table whose policies
-- admit nothing reads zero rows.
-- ============================================================================

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;

-- The statements above only reach objects that exist right now, which would
-- leave the next migration to create a table reintroducing the same bug. These
-- close that: they apply to objects created later by this role.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines to anon, authenticated, service_role;
