-- ============================================================================
-- The limits a page can see
-- ============================================================================
-- The Realtime ceilings live in one row of `_realtime.tenants`, and until now
-- the only way to know what they said was to ssh to the box. That is fine for
-- setting them - `scripts/realtime-limits.sh` does exactly that - and useless
-- for noticing they changed.
--
-- Which is the failure that actually happens. Realtime's `seeds.exs` does
-- `Repo.delete!(tenant)` then `Repo.insert!` on every boot, so a stack that
-- comes up with SEED_SELF_HOST true silently replaces 25 000 events/s with the
-- schema default of 100. `SEED_SELF_HOST: "false"` and the re-assert in
-- `supabase-restart.sh` are what stop that, and both are one line on one box
-- that an upstream merge or a restored backup can quietly undo.
--
-- **What a lost limit looks like is not an outage.** Measured at the stock 100:
-- three players in a room got 50.7% of movement frames, ten players got 8.6%.
-- Nine frames in ten gone. To everybody involved that reads as "the netcode got
-- worse", which is not a thing anybody greps for. See
-- docs/operations/realtime-limits.md.
--
-- So the numbers get a reader, the health page gets a section, and the drift
-- announces itself on a page somebody already looks at.
--
-- ----------------------------------------------------------------------------
-- Why an RPC and not a view
-- ----------------------------------------------------------------------------
-- `_realtime` is not in PostgREST's exposed schemas and should not be - it is
-- Realtime's private bookkeeping, and exposing the schema to reach one row
-- would hand out the rest of it too. A definer function in `public` returns the
-- six values the page needs and nothing else.
--
-- SECURITY DEFINER for the same reason `health_db_stats` is: `service_role` has
-- no grant on `_realtime.tenants` at all, so a non-definer read returns
-- "permission denied" rather than a number. Note this asymmetry is real and was
-- found the hard way - `postgres` can SELECT that table but its UPDATE fails,
-- which is why the shell script connects as `supabase_admin`.
--
-- Being definer, it checks its own caller rather than trusting the grant, on
-- exactly the terms health_db_stats set: a backoffice admin, or the service
-- role the sampler runs as. `auth.role()` reads the verified JWT.
--
-- ----------------------------------------------------------------------------
-- Why the body is dynamic SQL
-- ----------------------------------------------------------------------------
-- `_realtime.tenants` is created by Realtime's own migrations, not ours, so
-- there is no ordering guarantee that it exists when this runs - and with
-- `check_function_bodies` on, a plain reference to a missing table makes the
-- CREATE FUNCTION fail and takes the whole migration with it. A `to_regclass`
-- guard plus EXECUTE means a stack without Realtime gets a function that
-- returns no rows, which is the honest answer, instead of a migration that
-- cannot be applied.
--
-- No rows is also what a *missing tenant row* returns - the `TenantNotFound`
-- state described in docs/product/event-spaces.md. The page renders both as
-- "cannot read", because from a monitoring standpoint they are the same
-- sentence: nobody knows what the limits are.
-- ============================================================================

create or replace function public.health_realtime_limits()
returns table (
  external_id             text,
  max_events_per_second   int,
  max_concurrent_users    int,
  max_bytes_per_second    int,
  max_joins_per_second    int,
  max_channels_per_client int,
  updated_at              timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_backoffice_admin() or (select auth.role()) = 'service_role') then
    raise exception 'health_realtime_limits: not permitted';
  end if;

  if to_regclass('_realtime.tenants') is null then
    return;
  end if;

  return query execute $q$
    select
      t.external_id::text,
      t.max_events_per_second::int,
      t.max_concurrent_users::int,
      t.max_bytes_per_second::int,
      t.max_joins_per_second::int,
      t.max_channels_per_client::int,
      t.updated_at::timestamptz
    from _realtime.tenants t
    order by t.external_id
  $q$;
end;
$$;

comment on function public.health_realtime_limits() is
  'The Realtime per-tenant ceilings, for the backoffice health page. Returns no rows when the tenant row or the _realtime schema is absent - both mean "nobody knows what the limits are". Set them with scripts/realtime-limits.sh.';

-- `authenticated` rather than `anon`: the function checks its own caller, but a
-- grant to anon would mean an unauthenticated request reaching the definer body
-- to be told no, and there is no reason to offer that.
grant execute on function public.health_realtime_limits() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- A note on what this does NOT do
-- ----------------------------------------------------------------------------
-- It reads. It does not set, and it must not: an UPDATE reachable through
-- PostgREST would be a way to raise the ceilings from a session, and the
-- ceilings are what stand between one busy tenant and every other service on
-- that box. Setting stays in a script that needs ssh and supabase_admin.
--
-- `updated_at` is returned but is weaker evidence than it looks. There is no
-- trigger on that column, so an UPDATE leaves it reading whatever it read
-- before - the shell script applying new values does not move it. It is still
-- worth having, because the seed revert this whole thing exists to catch is a
-- delete+insert, which *does* stamp a fresh one. A timestamp that suddenly
-- matches a restart is the signature. A stale one proves nothing either way.
