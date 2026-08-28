-- ============================================================================
-- The XP policies stop referring to each other's tables directly
-- ----------------------------------------------------------------------------
-- 20261001000000 and 20261002000000 shipped a set of policies that recurse:
--
--   ERROR:  infinite recursion detected in policy for relation "xps_read_model"
--
-- and every read of a project or a grant failed with it. This is the fix and
-- the reasoning, because the shape of the mistake is easy to make again.
--
-- ---------------------------------------------------------------------------
-- What actually recursed, which was not the obvious candidate
-- ---------------------------------------------------------------------------
-- The suspicious-looking pair was `xps_select` (which consults `xp_grants`) and
-- `xp_grants_select` (which consults `may_read_xp`, which reads
-- `xps_read_model`). That pair is fine: `may_read_xp` is SECURITY DEFINER and
-- owned by the tables' owner, so RLS does not re-enter inside it. Calling it
-- directly as `authenticated` returns a row rather than an error, which is how
-- it was ruled out.
--
-- The culprit was `xp_grants_write`, declared `for all`. **`for all` includes
-- SELECT**, and policies for one command are OR-ed - so that policy's `using`
-- clause ran on every read of `xp_grants`, and its clause reads
-- `xps_read_model` *raw*. That completes the loop:
--
--   read xps_read_model
--     -> xps_select consults xp_grants
--       -> xp_grants_write (for all) consults xps_read_model
--         -> xps_select consults xp_grants ...
--
-- `xp_releases_write` had the identical shape and would have failed the same
-- way the moment anything read a release.
--
-- ---------------------------------------------------------------------------
-- The rule this establishes
-- ---------------------------------------------------------------------------
-- **No policy on any of these tables references another of them directly.**
-- Every cross-table question goes through a SECURITY DEFINER function that
-- touches exactly one table, so there is never a path from a policy back to
-- the relation it is a policy for.
--
-- That is a stronger rule than "do not write a cycle", and deliberately: a
-- cycle here is not visible in any one policy. It took reading three of them
-- together, and the next person adding a fourth table should not have to.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The two one-table questions
-- ----------------------------------------------------------------------------

/**
 * Does the caller hold a grant on this project? Reads `xp_grants` and nothing
 * else, so it is safe to call from a policy on `xps_read_model`.
 */
create or replace function public.has_xp_grant(p_xp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.xp_grants g
    where g.xp_id = p_xp_id and g.account_id = (select auth.uid())
  );
$$;

comment on function public.has_xp_grant(uuid) is
  'Reads xp_grants only. Exists so a policy on xps_read_model can ask about '
  'grants without the grants table asking back - see 20261003000000.';

/**
 * Is this project in a space the caller belongs to? Reads `xps_read_model` and
 * nothing else, so it is safe to call from a policy on `xp_grants`,
 * `xp_versions` or `xp_releases`.
 *
 * This is the *write* question for all three child tables: the projection runs
 * as the signed-in member, so a member of the space the project lives in is who
 * needs to write. The narrower rules - only the owner may share, only the
 * backoffice may publish - are the decider's, because a policy cannot ask who
 * owns a project without reading the row it is guarding.
 */
create or replace function public.xp_in_my_space(p_xp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.xps_read_model x
    where x.id = p_xp_id and public.tenant_role(x.tenant_id) is not null
  );
$$;

/**
 * Does the caller own this project? Reads `xps_read_model` only.
 *
 * Separate from `xp_in_my_space` because ownership and residence are different
 * facts - the whole of docs/xp/backend.md §7.0 - and a release list should be
 * visible to an owner who has left the space it lives in.
 */
create or replace function public.xp_is_mine(p_xp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.xps_read_model x
    where x.id = p_xp_id and x.owner_id = (select auth.uid())
  );
$$;

comment on function public.xp_in_my_space(uuid) is
  'Reads xps_read_model only. The write guard for xp_grants, xp_versions and '
  'xp_releases, so none of them reference the projects table directly.';

-- ----------------------------------------------------------------------------
-- xps_read_model
-- ----------------------------------------------------------------------------
drop policy if exists "xps_select" on public.xps_read_model;

create policy "xps_select"
  on public.xps_read_model for select
  using (
    state = 'published'
    or owner_id = (select auth.uid())
    or public.tenant_role(tenant_id) is not null
    -- Through the function now. The inline `exists (select 1 from xp_grants…)`
    -- this replaces is the near half of the cycle described above.
    or public.has_xp_grant(id)
  );

-- ----------------------------------------------------------------------------
-- xp_grants
-- ----------------------------------------------------------------------------
drop policy if exists "xp_grants_select" on public.xp_grants;
drop policy if exists "xp_grants_write" on public.xp_grants;

create policy "xp_grants_select"
  on public.xp_grants for select
  to authenticated
  using (account_id = (select auth.uid()) or public.may_read_xp(xp_id));

/**
 * Split out of the `for all` that caused this.
 *
 * Three separate policies rather than one `for all`, because `for all` silently
 * put a write rule on the read path - which is both the bug above and a
 * confusing thing to read. Naming the commands means the SELECT policy is the
 * only thing that governs reads, which is what anybody would assume.
 */
create policy "xp_grants_insert"
  on public.xp_grants for insert
  to authenticated
  with check (public.xp_in_my_space(xp_id));

create policy "xp_grants_update"
  on public.xp_grants for update
  to authenticated
  using (public.xp_in_my_space(xp_id))
  with check (public.xp_in_my_space(xp_id));

create policy "xp_grants_delete"
  on public.xp_grants for delete
  to authenticated
  using (public.xp_in_my_space(xp_id));

-- ----------------------------------------------------------------------------
-- xp_versions
-- ----------------------------------------------------------------------------
-- The select policy already went through a definer function and is untouched.
-- The insert one read `xps_read_model` raw; it never closed a loop, because
-- nothing reads `xp_versions` from another policy - but it is the same shape as
-- the bug and the rule above says no.
drop policy if exists "xp_versions_insert" on public.xp_versions;

create policy "xp_versions_insert"
  on public.xp_versions for insert
  to authenticated
  with check (public.xp_in_my_space(xp_id));

-- ----------------------------------------------------------------------------
-- xp_releases
-- ----------------------------------------------------------------------------
drop policy if exists "xp_releases_select" on public.xp_releases;
drop policy if exists "xp_releases_write" on public.xp_releases;

/**
 * Narrower than `may_read_xp` and wider than `may_read_xp_version`: a stranger
 * playing a published project has no business knowing it shipped four times and
 * pulled one of them, and everybody who could open the drafts already knows
 * more than that.
 *
 * Expressed with the two one-table functions rather than one inline subquery,
 * so this table also holds to the rule.
 */
create policy "xp_releases_select"
  on public.xp_releases for select
  to authenticated
  using (public.xp_in_my_space(xp_id) or public.xp_is_mine(xp_id) or public.has_xp_grant(xp_id));

create policy "xp_releases_insert"
  on public.xp_releases for insert
  to authenticated
  with check (public.xp_in_my_space(xp_id));

create policy "xp_releases_update"
  on public.xp_releases for update
  to authenticated
  using (public.xp_in_my_space(xp_id))
  with check (public.xp_in_my_space(xp_id));
