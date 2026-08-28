-- ============================================================================
-- Guest links that make you knock
-- ----------------------------------------------------------------------------
-- A guest link is a door propped open for a week: whoever holds it picks a
-- name, picks an animal, and is standing in the lounge. That is the right shape
-- for "come and see the place", and the wrong one for a link that has been
-- forwarded twice - by the time a stranger walks in, nobody in the room decided
-- to let them.
--
-- So a link can be marked as requiring a knock. The visitor still does
-- everything they did before at the door, and then waits: somebody already in
-- the space has to say yes before they are anywhere.
--
-- ----------------------------------------------------------------------------
-- Why the waiting is durable, when the homestead's is not
-- ----------------------------------------------------------------------------
-- The house, the café and the garden already have a knock, and it is
-- deliberately ephemeral - it lives on a Realtime channel and dies with the tab
-- (see 20260731000000). That works there because the person knocking is already
-- a member: they can reach the channel, and being refused costs them nothing
-- but a click.
--
-- Neither is true here. A guest who is not admitted is not *anything* -
-- `tenant_role()` returns null for them, so they cannot read the space and
-- cannot join its Realtime topics, which is precisely the enforcement a knock
-- on a public link has to have. And they arrived through a form: making them
-- fill it in again because a broadcast was dropped, or because they reloaded
-- while waiting, would be the feature's most common moment and its worst one.
--
-- So the waiting is a row. `admitted_at is null` means "at the door", and every
-- function that decides whether somebody is in this space learns to say no to
-- it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The link's setting
-- ----------------------------------------------------------------------------
-- Defaults false, so every link that exists today keeps letting people straight
-- in. The stricter behaviour being the deliberate tick is the same way round as
-- the single-use checkbox beside it, and for the reason the rail gives there:
-- choosing to be more careful is a decision, while being more careful by
-- accident produces a link that mysteriously does nothing.
-- ----------------------------------------------------------------------------
alter table public.guest_links
  add column if not exists requires_knock boolean not null default false;

-- ----------------------------------------------------------------------------
-- The admission
-- ----------------------------------------------------------------------------
-- Nullable, and null is the interesting state. A row with no `admitted_at` is
-- somebody standing at the door: they have an anonymous account, a name and an
-- animal, and no access to anything.
--
-- Existing rows are backfilled to `joined_at` rather than left null, which is
-- the load-bearing line in this migration. Without it, deploying this would
-- silently put every guest currently walking around a lounge back outside -
-- `tenant_role()` would stop recognising them mid-session, and from inside the
-- app that is indistinguishable from the space having been deleted.
-- ----------------------------------------------------------------------------
alter table public.tenant_guests
  add column if not exists admitted_at timestamptz;

update public.tenant_guests
   set admitted_at = joined_at
 where admitted_at is null;

-- The rail's query: who is waiting at this space's door, oldest first. Partial,
-- because everybody already inside is the overwhelming majority of the table
-- and never appears in this list.
create index if not exists tenant_guests_knocking_idx
  on public.tenant_guests (tenant_id, joined_at)
  where admitted_at is null;

-- ----------------------------------------------------------------------------
-- Waiting is not being here
-- ----------------------------------------------------------------------------
-- Three functions decide what a guest row means, and all three have to agree.
-- `tenant_role()` is the one that matters - every policy in this codebase is
-- written in terms of it, which is what makes teaching it one new answer enough
-- to make a knock work everywhere at once instead of thirty policies being
-- edited and twenty-eight of them being right. The other two are narrowed to
-- match so that nothing can disagree with it.
--
-- Each is a copy of its current body with one clause added. Rewritten in full
-- rather than patched, because these are `create or replace` and there is no
-- half-applied version of that to worry about.
-- ----------------------------------------------------------------------------

create or replace function public.tenant_role(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select m.role
        from public.tenant_members m
       where m.tenant_id = p_tenant_id
         and m.user_id = (select auth.uid())
    ),
    (
      select 'guest'
        from public.tenant_guests g
       where g.tenant_id = p_tenant_id
         and g.guest_id = (select auth.uid())
         and g.expires_at > now()
         -- Still at the door. See the header.
         and g.admitted_at is not null
    )
  );
$$;

comment on function public.tenant_role(uuid) is
  'The caller''s role in a tenant: owner | admin | member | guest, or NULL if they are neither a member nor a live, admitted guest.';

create or replace function public.is_tenant_guest(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.tenant_guests g
     where g.tenant_id = p_tenant_id
       and g.guest_id = (select auth.uid())
       and g.expires_at > now()
       and g.admitted_at is not null
  );
$$;

-- The concurrent-guest cap counts bodies in the room, not people on the
-- doormat. Counting knockers would let a link that was forwarded around a
-- group lock the space's own guests out of it without anybody ever being let
-- in - and the door is where the count is checked.
create or replace function public.tenant_guest_count(p_tenant_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.tenant_guests g
   where g.tenant_id = p_tenant_id
     and g.expires_at > now()
     and g.admitted_at is not null;
$$;

-- ----------------------------------------------------------------------------
-- Nothing new is needed for reading or reaping
-- ----------------------------------------------------------------------------
-- Named here so the next reader can see it was checked rather than missed.
--
-- `tenant_guests_select_visible` already reads
-- `is_tenant_member(tenant_id) or guest_id = auth.uid() or is_backoffice_admin()`,
-- which is exactly the two audiences a knock has: the members who decide, and
-- the visitor refreshing a waiting page to find out. Note that it keys on
-- `is_tenant_member`, not on `tenant_role()`, so a knocker can see their own row
-- while being nothing at all to this space - which is the one read they need.
--
-- Admitting is deliberately *not* given a policy. There is no update policy on
-- this table and there should not be: letting somebody in runs through the
-- service role behind a role check in TypeScript, the same as minting and
-- revoking links, so the set of people who can grant access stays something one
-- file decides.
--
-- `reap_expired_guests()` needs no change either. A knock gets a short
-- `expires_at` of its own - see KNOCK_TTL_MINUTES - so an unanswered one is
-- swept by the same clock that sweeps a finished visit, with no second notion
-- of staleness to keep in step.
-- ----------------------------------------------------------------------------
