-- ============================================================================
-- The guests at the far end of the list
-- ============================================================================
-- `/api/cron/reap-guests` finds abandoned anonymous accounts by paging
-- `auth.admin.listUsers`, bounded at ten pages of two hundred. The bound is
-- right - a sweep that walks the whole user table forever is a sweep that
-- starts timing out on the day the product works - but the comment beside it
-- says "what it does not collect this hour it collects next hour, because the
-- condition it looks for does not go away", and that is only true if the pages
-- it walks eventually reach the stragglers.
--
-- They do not. `listUsers` returns a stable order, so pages 1..10 are the same
-- two thousand accounts every hour. Past two thousand users, everything behind
-- that boundary is never looked at again - and the accounts that fall behind it
-- are the *oldest*, which is precisely the set this job exists to delete.
--
-- The failure is silent and it compounds: the litter that accumulates fastest
-- is anonymous accounts from guest links, one per visitor, and none of them are
-- ever reachable again once the table passes the bound.
--
-- ----------------------------------------------------------------------------
-- Why a function rather than a bigger bound
-- ----------------------------------------------------------------------------
-- Raising MAX_PAGES moves the boundary; it does not remove it, and it makes
-- every run more expensive to buy that. The actual problem is that the filter
-- is being applied in TypeScript to pages chosen by somebody else's ordering,
-- when it is a WHERE clause: anonymous, and older than the cutoff, oldest
-- first. Postgres can answer that with an index and a LIMIT, and the answer is
-- the right rows rather than whichever rows arrived first.
--
-- So the bound stays - it is still a batch, and still finishes - but it now
-- bounds *the work*, not *the window the work is visible through*.
--
-- SECURITY DEFINER because `auth.users` is not reachable from PostgREST at all,
-- by design. The function returns nothing but ids of accounts that are already
-- provably anonymous and expired, and checks its caller is the service role -
-- there is no user in a cron run, and no session should ever reach this.
-- ============================================================================

create or replace function public.stray_guest_ids(
  p_older_than timestamptz,
  p_limit      int default 2000
)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Not `is_backoffice_admin() or service_role`, unlike the health functions.
  -- This one is a sweeper's input and nothing else - an admin has no reason to
  -- enumerate abandoned accounts through an RPC, and the narrower check is free.
  if (select auth.role()) <> 'service_role' then
    raise exception 'stray_guest_ids: not permitted';
  end if;

  return query
  select u.id
    from auth.users u
   where u.is_anonymous
     and u.created_at < p_older_than
   -- Oldest first, which is the whole point: a capped run must take the
   -- accounts that have been waiting longest, so a backlog drains instead of
   -- the same slice being re-examined every hour.
   order by u.created_at
   limit greatest(1, least(p_limit, 10000));
end;
$$;

comment on function public.stray_guest_ids(timestamptz, int) is
  'Anonymous auth.users older than the cutoff, oldest first. Input to /api/cron/reap-guests. Service role only - auth.users is not otherwise reachable through PostgREST.';

grant execute on function public.stray_guest_ids(timestamptz, int) to service_role;

-- ----------------------------------------------------------------------------
-- The index this wants, and why it is not created here
-- ----------------------------------------------------------------------------
-- The query is a sequential scan of `auth.users` once an hour. That is nothing
-- at four figures and is worth an index somewhere in the high five, at which
-- point the right one is partial - the only rows it ever wants are anonymous,
-- and on a healthy table those are a minority being deleted continuously:
--
--   create index users_anonymous_created_at_idx
--     on auth.users (created_at) where is_anonymous;
--
-- It is not in this migration because migrations run as `postgres` and
-- `auth.users` belongs to `supabase_auth_admin`, so the CREATE INDEX fails and
-- takes the whole file with it - which is how this comment came to exist.
--
-- Creating it by hand as the owner works, and is a deliberate decision rather
-- than an oversight: `auth` is GoTrue's schema, its contents are managed by
-- GoTrue's own migrations, and an object we add there is an object a Supabase
-- upgrade has never heard of. Worth doing when the scan actually costs
-- something; not worth doing speculatively, and not worth doing silently.
