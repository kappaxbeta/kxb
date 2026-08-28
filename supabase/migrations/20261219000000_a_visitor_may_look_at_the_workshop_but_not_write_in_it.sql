-- ============================================================================
-- A visitor may look at the workshop, but not write in it
-- ----------------------------------------------------------------------------
-- 20260813000000 drew the line: `tenant_role(x) is not null` is true for a
-- guest, so a write policy written that way lets a link-holder write. It
-- rewrote fourteen read models to `is_tenant_member()` and left a block that
-- fails the migration if any of *those* tables slips back.
--
-- It could not guard tables that did not exist yet. Every read model below was
-- created afterwards and came back in the permissive shape - each one saying
-- "member-scoped, like every other read model here", which had stopped being
-- true the week before. The security review of 2026-08-23 found them with a
-- guest's anonymous JWT against PostgREST:
--
--   xps_read_model / xp_versions / xp_releases / xp_grants / xp_files
--     a guest could push a version into any project of the space, grant their
--     own real account a permanent `edit` right (grants survive leaving the
--     space by design), flip `state` to published, and register file rows
--     whose `scan_status` defaults to clean. `xp` is not in
--     `stream_capability()`, so no guest can append an xp *event* - the read
--     model was the only door, and it was open.
--   xp_claims
--     advisory, but a guest could hold the editor lock on somebody's project.
--   magazine_read_model
--     put any XP on the shelf, take any off. No event path exists for a guest.
--   login_streaks_read_model
--     forge the space's leaderboard for any user id.
--   published_worlds / published_scenes
--     publish into the public gallery attributed to the space.
--   render_jobs
--     enqueue Chromium work against the space's quota.
--
-- ---------------------------------------------------------------------------
-- Why none of these are "a projection a guest's session has to be able to run"
-- ---------------------------------------------------------------------------
-- The reason some read models are *deliberately* `tenant_role(...) is not null`
-- is that projections run in the caller's session, and a session that cannot
-- write a read model advances the checkpoint past the event anyway - the
-- failure 20261025000000 exists to describe. That argument needs a guest who
-- can cause the event or who renders the page that projects it. None of the
-- tables here qualify: a guest cannot append `xp`, `magazine` or streak events;
-- `recordLogin` returns early for guests; the xps, magazine and streaks
-- projections run only inside the command that issued the event (a member's
-- session) and in the worker (service role); publishing and rendering are
-- server actions behind `requireTenant` + `hasRole`, which a guest never
-- reaches. So a member-only policy here loses nothing.
--
-- ---------------------------------------------------------------------------
-- What is left alone, and why
-- ---------------------------------------------------------------------------
-- `xp_store` - a guest playing an XP in a room is a player; `space` scope is
--   the game's shared state, and refusing it would break play rather than
--   protect a project. `rooms_read_model`, `battlefields`, `battles` and
--   `projection_checkpoints` - named as guest-writable on purpose in
--   20260813000000 and 20261023000000, because guests cause the events that
--   write them. They carry their own caveats (the rooms row holds policy inputs)
--   and deserve their own migration, not a line in this one.
--
-- The reads are unchanged. A guest can still *see* the space's projects,
-- shelf and leaderboard, which is what being invited in means.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The member-only sibling of `xp_in_my_space`
-- ---------------------------------------------------------------------------
-- `xp_in_my_space` is the read test for the whole XP family and has to keep
-- answering true for a guest - they play the space's projects. The write
-- policies get this one instead. Same one-table shape, same reason: no policy
-- below reads another of these tables directly, so there is no path from a
-- policy back to the relation it governs (20261003000000).
create or replace function public.xp_in_my_space_as_member(p_xp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.xps_read_model x
    where x.id = p_xp_id and public.is_tenant_member(x.tenant_id)
  );
$$;

comment on function public.xp_in_my_space_as_member(uuid) is
  'Does this project live in a space the caller is a member of - not a guest of. The write-side twin of xp_in_my_space, which answers true for visitors and must, because they play.';

revoke execute on function public.xp_in_my_space_as_member(uuid) from public, anon;
grant execute on function public.xp_in_my_space_as_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The XP family
-- ---------------------------------------------------------------------------
drop policy if exists "xps_insert" on public.xps_read_model;
create policy "xps_insert"
  on public.xps_read_model for insert
  to authenticated
  with check (public.is_tenant_member(tenant_id));

drop policy if exists "xps_update" on public.xps_read_model;
create policy "xps_update"
  on public.xps_read_model for update
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

drop policy if exists "xp_files_insert" on public.xp_files;
create policy "xp_files_insert"
  on public.xp_files for insert
  to authenticated
  with check (public.is_tenant_member(tenant_id));

drop policy if exists "xp_grants_insert" on public.xp_grants;
create policy "xp_grants_insert"
  on public.xp_grants for insert
  to authenticated
  with check (public.xp_in_my_space_as_member(xp_id));

drop policy if exists "xp_grants_update" on public.xp_grants;
create policy "xp_grants_update"
  on public.xp_grants for update
  to authenticated
  using (public.xp_in_my_space_as_member(xp_id))
  with check (public.xp_in_my_space_as_member(xp_id));

drop policy if exists "xp_grants_delete" on public.xp_grants;
create policy "xp_grants_delete"
  on public.xp_grants for delete
  to authenticated
  using (public.xp_in_my_space_as_member(xp_id));

drop policy if exists "xp_versions_insert" on public.xp_versions;
create policy "xp_versions_insert"
  on public.xp_versions for insert
  to authenticated
  with check (public.xp_in_my_space_as_member(xp_id));

drop policy if exists "xp_releases_insert" on public.xp_releases;
create policy "xp_releases_insert"
  on public.xp_releases for insert
  to authenticated
  with check (public.xp_in_my_space_as_member(xp_id));

drop policy if exists "xp_releases_update" on public.xp_releases;
create policy "xp_releases_update"
  on public.xp_releases for update
  to authenticated
  using (public.xp_in_my_space_as_member(xp_id))
  with check (public.xp_in_my_space_as_member(xp_id));

-- The claim is taken by somebody who can already edit; `xp_is_mine` stays so
-- the owner of a project that has moved out of their space keeps the editor.
drop policy if exists "xp_claims_insert" on public.xp_claims;
create policy "xp_claims_insert"
  on public.xp_claims for insert
  to authenticated
  with check (public.xp_in_my_space_as_member(xp_id) or public.xp_is_mine(xp_id));

drop policy if exists "xp_claims_update" on public.xp_claims;
create policy "xp_claims_update"
  on public.xp_claims for update
  to authenticated
  using (public.xp_in_my_space_as_member(xp_id) or public.xp_is_mine(xp_id))
  with check (public.xp_in_my_space_as_member(xp_id) or public.xp_is_mine(xp_id));

drop policy if exists "xp_claims_delete" on public.xp_claims;
create policy "xp_claims_delete"
  on public.xp_claims for delete
  to authenticated
  using (public.xp_in_my_space_as_member(xp_id) or public.xp_is_mine(xp_id));

-- ---------------------------------------------------------------------------
-- 3. The shelf
-- ---------------------------------------------------------------------------
drop policy if exists "magazine_insert" on public.magazine_read_model;
create policy "magazine_insert"
  on public.magazine_read_model for insert
  to authenticated
  with check (public.is_tenant_member(tenant_id));

drop policy if exists "magazine_update" on public.magazine_read_model;
create policy "magazine_update"
  on public.magazine_read_model for update
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

drop policy if exists "magazine_delete" on public.magazine_read_model;
create policy "magazine_delete"
  on public.magazine_read_model for delete
  to authenticated
  using (public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- 4. The leaderboard
-- ---------------------------------------------------------------------------
drop policy if exists "login_streaks_insert" on public.login_streaks_read_model;
create policy "login_streaks_insert"
  on public.login_streaks_read_model for insert
  to authenticated
  with check (public.is_tenant_member(tenant_id));

drop policy if exists "login_streaks_update" on public.login_streaks_read_model;
create policy "login_streaks_update"
  on public.login_streaks_read_model for update
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------------
-- 5. The gallery
-- ---------------------------------------------------------------------------
-- Everything else in these two is kept word for word - `author_id` pinned to
-- the caller, the platform origin behind the backoffice. Only the space branch
-- changes, and it changes to what its own comment always said: "a space world
-- needs membership of that space".
drop policy if exists "published_worlds_insert" on public.published_worlds;
create policy "published_worlds_insert"
  on public.published_worlds for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (origin = 'space' and public.is_tenant_member(tenant_id))
      or (origin = 'platform' and public.is_backoffice_admin())
    )
  );

drop policy if exists "published_scenes_insert" on public.published_scenes;
create policy "published_scenes_insert"
  on public.published_scenes for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (origin = 'space' and public.is_tenant_member(tenant_id))
      or (origin = 'platform' and public.is_backoffice_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- 6. The render queue
-- ---------------------------------------------------------------------------
-- The lifecycle pins stay exactly as 20260929010000 wrote them.
drop policy if exists "render_jobs_insert" on public.render_jobs;
create policy "render_jobs_insert"
  on public.render_jobs for insert
  to authenticated
  with check (
    requested_by = (select auth.uid())
    and status = 'pending'
    and attempts = 0
    and claimed_at is null
    and finished_at is null
    and storage_path is null
    and error is null
    and (
      (tenant_id is not null and public.is_tenant_member(tenant_id))
      or (tenant_id is null and public.is_backoffice_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- 7. The assertion
-- ---------------------------------------------------------------------------
-- The same check 20260813000000 runs over its fourteen tables, over these. If
-- a write policy on any of them still keys on `tenant_role(...) is not null`
-- - or on `xp_in_my_space`, which is the same test one table removed - the
-- migration fails rather than ships. A later migration that recreates one of
-- these policies in the permissive shape should add its table here or say why
-- not.
do $$
declare
  targets text[] := array[
    'xps_read_model',
    'xp_files',
    'xp_grants',
    'xp_versions',
    'xp_releases',
    'xp_claims',
    'magazine_read_model',
    'login_streaks_read_model',
    'published_worlds',
    'published_scenes',
    'render_jobs'
  ];
  offender text;
begin
  select format('%s.%s', p.tablename, p.policyname)
    into offender
    from pg_policies p
   where p.schemaname = 'public'
     and p.tablename = any (targets)
     and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     -- The deparsed form, exactly, for the same reason 20260813000000 matched
     -- it that way: `published_worlds_update` says `tenant_id IS NOT NULL` a
     -- few words away from a perfectly safe `tenant_role(...) = ANY (owner,
     -- admin)`, and a looser test flags it.
     and (
       coalesce(p.qual, '') || coalesce(p.with_check, '')
         like '%tenant_role(tenant_id) IS NOT NULL%'
       or coalesce(p.qual, '') || coalesce(p.with_check, '') like '%xp_in_my_space(%'
     )
   limit 1;

  if offender is not null then
    raise exception
      'guest hardening incomplete: % still authorizes writes for a guest. Narrow it to is_tenant_member() / xp_in_my_space_as_member() before applying.',
      offender;
  end if;

  raise notice 'guest hardening: % tables now refuse writes from visitors', array_length(targets, 1);
end
$$;
