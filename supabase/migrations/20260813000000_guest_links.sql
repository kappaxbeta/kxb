-- ============================================================================
-- Guest links: being in a space without ever having an account
-- ----------------------------------------------------------------------------
-- Two words that sound alike and mean opposite things, so they are worth
-- separating before anything below makes sense:
--
--   *viewing*  is what anybody with the URL can do, with no token and no
--              session. That is `/v/[slug]`, it already exists, and this
--              migration does not touch it.
--   *joining*  is walking in as a body other people can see - moving, emoting,
--              and taking part in a match. That needs a token, and it is what
--              everything here is for.
--
-- The distinction is the whole security model in one line: a token is not what
-- lets you *see* a space, it is what lets you *be* in one.
--
-- ----------------------------------------------------------------------------
-- Why guests are not members
-- ----------------------------------------------------------------------------
-- The obvious implementation is a fourth role in `tenant_members`, and it is
-- wrong. That table is written only by the SECURITY DEFINER trigger in
-- 20260725130000, from events on the tenant stream, and it is read by the
-- members list, the seat limit and the billing entitlement. A guest is none of
-- those things: they are not a fact about the workspace worth keeping, they do
-- not consume a seat somebody is paying for, and they must not appear in a list
-- headed "who is in this space". Putting them in that table would mean
-- teaching four unrelated features to filter them back out, and each one that
-- forgot would be a bug shaped like a stranger in your billing page.
--
-- So guests get their own table, and `tenant_role()` learns to fall back to it.
-- That single function is what every policy in this codebase is written in
-- terms of - the lounge's realtime topics in 20260727010000, the room topics in
-- 20260731000000, the event log itself - so teaching it one new answer is what
-- makes a guest work everywhere at once, instead of thirty policies being
-- edited and twenty-eight of them being right.
--
-- ----------------------------------------------------------------------------
-- Why the guest id has no foreign key
-- ----------------------------------------------------------------------------
-- `tenant_guests.guest_id` deliberately does *not* reference auth.users, and
-- that is the load-bearing decision in this file rather than an omission.
--
-- Anything that writes an event needs a real auth.users row, because
-- `events.actor_id` references it and the insert policy demands
-- `actor_id = auth.uid()`. So a guest who joins a match has to be a real
-- (anonymous) user. A guest who is only standing around emoting writes nothing
-- - presence is realtime, and realtime writes no rows - so requiring an
-- account for them would be creating a permanent identity to hold three
-- seconds of "somebody is near the sofa".
--
-- Leaving the column unconstrained lets one table serve both: the id is
-- whatever `auth.uid()` returns for that visitor, and this table takes no view
-- on where it came from. The cost is that a deleted auth user leaves a row
-- behind, which is what `reap_expired_guests()` at the bottom is for.
-- ============================================================================

-- ============================================================================
-- 1. The link
-- ----------------------------------------------------------------------------
-- Deliberately the same shape as `account_invites` in 20260805000000, including
-- storing the token in the clear, and the argument there applies unchanged: the
-- table is unreadable to anybody but an admin under RLS, redemption runs
-- through the service role, and the token can be revoked and expired.
--
-- What is different is what the token buys, and it is worth being exact.
-- An `account_invites` token creates an *account* and enters no space. A
-- `guest_links` token enters exactly *one* space and creates no account. They
-- are near-inverses, which is why they are two tables rather than one with a
-- mode column - a bug that let one behave like the other would be the worst
-- possible bug in either.
--
-- `max_uses` NULL is the open link, and NULL rather than 0 or -1 on purpose:
-- "no limit" is the absence of a limit, and a sentinel number would sooner or
-- later be compared with `<` by somebody who had not read this comment.
-- ============================================================================

create table if not exists public.guest_links (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null,
  /** The secret in the URL. Unique, so a collision is a failed insert rather
   *  than two links quietly sharing a token. */
  token      text        not null unique,
  /** What this link is for, in the owner's words. Shown in the admin lists so
   *  a row of tokens is something a human can tell apart. */
  label      text,
  /**
   * How many guests this link may admit in total.
   *
   * NULL is the open link - share it once, anybody who has it can come in.
   * 1 is the single-use link. This counts *admissions over the life of the
   * link*, which is not the same question as the concurrent cap in section 4:
   * a single-use link is spent even after its one guest goes home, while the
   * cap is about how many are standing in the room right now.
   */
  max_uses   integer     check (max_uses is null or max_uses > 0),
  uses       integer     not null default 0 check (uses >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Redemption looks a token up by its exact value; the unique constraint above
-- already serves that. These two are for the admin lists, which read one
-- tenant's links newest-first, and for the backoffice, which reads all of them.
create index if not exists guest_links_tenant_idx
  on public.guest_links (tenant_id, created_at desc);

create index if not exists guest_links_created_idx
  on public.guest_links (created_at desc);

comment on table public.guest_links is
  'A capability to enter one space as a guest. Not an invitation, and not an account.';

comment on column public.guest_links.max_uses is
  'Total admissions this link may ever grant. NULL means an open link. Distinct from the concurrent guest cap.';

-- ============================================================================
-- 2. The guest
-- ----------------------------------------------------------------------------
-- One row per guest currently admitted to one space.
--
-- This is the row that makes a kick instant. Admission could have been carried
-- in the JWT instead, which would have cost no table at all - but a JWT cannot
-- be un-issued, so "remove this person" would have meant "this person leaves in
-- up to an hour", and a moderation control that takes an hour is not one. The
-- row is the price of the kick being a delete.
--
-- It is also what the concurrent cap counts. Both features want the same state,
-- which is the argument for storing it once rather than approximating it twice.
-- ============================================================================

create table if not exists public.tenant_guests (
  tenant_id  uuid        not null,
  /**
   * Whatever auth.uid() is for this visitor.
   *
   * No foreign key, on purpose - see the header. It may be an anonymous
   * auth.users id, and it may be an identity that has no row there at all.
   * This table's job is to say "this id may be in this space", not to know
   * what kind of id it is.
   */
  guest_id   uuid        not null,
  /** Which link let them in. Kept so revoking a link can find its guests, and
   *  so an admin can see how somebody got in. */
  link_id    uuid        references public.guest_links (id) on delete set null,
  /** What to call them on their nameplate. Chosen at the door, not verified. */
  display_name text      not null,
  joined_at  timestamptz not null default now(),
  /**
   * When this admission lapses on its own.
   *
   * Every guest has one - there is no such thing as a guest who is admitted
   * forever, because the failure mode of forgetting to revoke is somebody
   * still being able to walk into a space months later. A link with an expiry
   * hands its own down; a link without one gets the default in the redemption
   * path rather than here, so the number lives in one place in TypeScript.
   */
  expires_at timestamptz not null,

  primary key (tenant_id, guest_id)
);

-- The cap counts live guests per tenant, and the reaper sweeps by expiry.
create index if not exists tenant_guests_tenant_idx
  on public.tenant_guests (tenant_id, expires_at);

create index if not exists tenant_guests_expiry_idx
  on public.tenant_guests (expires_at);

-- Revoking a link ejects everybody it let in, so that lookup needs to be cheap.
create index if not exists tenant_guests_link_idx
  on public.tenant_guests (link_id);

comment on table public.tenant_guests is
  'Somebody currently admitted to a space as a guest. Deleting the row removes them on their next query.';

-- ============================================================================
-- 3. tenant_role() learns about guests
-- ----------------------------------------------------------------------------
-- The one change that makes guests work at all, and the one to be most careful
-- about, because every policy in the schema is downstream of it.
--
-- Shape matters here. The member lookup runs first and unchanged, so nothing
-- about an existing member's path is altered - same index, same plan, and a
-- member never touches `tenant_guests` at all. The guest lookup is a coalesce
-- behind it, paid for only by callers who are not members, which for the
-- overwhelming majority of requests is nobody.
--
-- The expiry check lives *here* rather than in the callers. That is what makes
-- a lapsed guest lapse everywhere simultaneously - the event log, the realtime
-- topics, the read models - instead of in whichever surfaces remembered to ask.
-- ============================================================================

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
    )
  );
$$;

comment on function public.tenant_role(uuid) is
  'The caller''s role in a tenant: owner | admin | member | guest, or NULL if they are neither a member nor a live guest.';

-- True when the caller is in this tenant on a guest pass rather than a
-- membership. Its own function because policies below need to say "everyone
-- except a guest", and spelling that as `tenant_role(x) <> 'guest'` would be
-- silently false for a non-member - NULL <> 'guest' is NULL, not true, and a
-- policy that evaluates to NULL denies. Every one of those would have been a
-- correct-looking policy that locked out the people it was meant to admit.
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
  );
$$;

-- True for a member of any standing, and false for a guest and for a stranger
-- alike. This is the predicate most existing policies actually meant when they
-- wrote `tenant_role(x) is not null`, back when a guest could not exist.
create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.tenant_members m
     where m.tenant_id = p_tenant_id
       and m.user_id = (select auth.uid())
  );
$$;

grant execute on function public.is_tenant_guest(uuid)  to authenticated;
grant execute on function public.is_tenant_member(uuid) to authenticated;

-- ============================================================================
-- 4. The concurrent cap
-- ----------------------------------------------------------------------------
-- How many guests may be in one space at the same time.
--
-- Modelled exactly on `seat_limit` from 20260805000000 - a valued feature flag,
-- with a global default an admin sets once and a per-space override for the
-- exceptions. That is not imitation for its own sake: it means the cap inherits
-- the whole override story, the backoffice UI that already renders valued
-- flags, and the "off means unlimited" convention, without any of it being
-- built twice.
--
-- Note what it counts, because the two limits in this file are easy to confuse.
-- `guest_links.max_uses` is a budget spent over the life of a link. This is a
-- ceiling on how many are inside right now, and a guest leaving frees a place
-- under it. A space can therefore have an open link and still be full.
-- ============================================================================

insert into public.feature_flags (key, enabled, value_int, label, description) values
  ('guest_limit', false, 8, 'Guests in a space at once',
   'Off means any number of guests may be in a space at the same time. On caps how many are inside simultaneously, for every space at once. Override it for one space to give that space a different cap. This is separate from a link''s own use limit.')
on conflict (key) do nothing;

-- The cap for one space, or NULL for "no cap". A near-copy of
-- `tenant_seat_limit()`, and its comments apply here too: user-scope overrides
-- are ignored because a capacity is a property of the room rather than of the
-- person walking into it, and the `enabled` switch is checked before the number
-- so that "unlimited" needs no sentinel.
create or replace function public.tenant_guest_limit(p_tenant_id uuid default null)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case
           when coalesce(o.enabled, f.enabled)
            and coalesce(o.value_int, f.value_int) > 0
           then coalesce(o.value_int, f.value_int)
         end
    from public.feature_flags f
    left join public.feature_flag_overrides o
      on  o.flag_key = f.key
      and o.scope    = 'tenant'
      and o.scope_id = p_tenant_id
   where f.key = 'guest_limit';
$$;

-- How many guests are inside right now. Expired rows do not count, whether or
-- not the reaper has got to them yet - the cap has to agree with
-- `tenant_role()` about who is actually in the room, and that function reads
-- the clock rather than the reaper's schedule.
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
     and g.expires_at > now();
$$;

grant execute on function public.tenant_guest_limit(uuid) to authenticated, anon;
grant execute on function public.tenant_guest_count(uuid) to authenticated;

-- ============================================================================
-- 5. What a guest may write
-- ----------------------------------------------------------------------------
-- Everything so far grants a guest the same reach as a member, because every
-- policy asks `tenant_role(...) is not null` and a guest now answers it. For
-- reading and for realtime that is exactly right and is the point. For the
-- event log it is far too much: as written, a guest could rewrite the lounge,
-- edit pages, move furniture and rename the space.
--
-- So the insert policy is narrowed here. A guest may append to the battle
-- stream and to nothing else, which is precisely the "they can take part in a
-- match, they cannot build" line - enforced in the database rather than in the
-- UI, so it holds for a guest driving the API by hand as well as one clicking
-- buttons.
--
-- The member half of the check is untouched and still first, so this changes
-- nothing for anybody who is not a guest.
-- ============================================================================

-- Rebased on the version in 20260803060000, not the original in 20260725130000
-- - that migration replaced this policy to let challenged fighters append, and
-- rewriting from the older text would silently delete the `can_act_in_battle`
-- clause and break cross-space matches. Every clause it had is preserved
-- verbatim; `tenant_role(...) is not null` becomes `is_tenant_member(...)`,
-- which is what it meant before a guest could answer it, and the guest clause
-- is the only addition.
drop policy if exists "events_insert_tenant" on public.events;

create policy "events_insert_tenant"
  on public.events for insert
  with check (
    actor_id = (select auth.uid())
    and (
      public.is_tenant_member(tenant_id)
      or public.tenant_is_unclaimed(tenant_id)
      or (stream_type = 'tenant' and public.has_tenant_invitation(tenant_id))
      or (stream_type = 'battle' and public.can_act_in_battle(stream_id, (select auth.uid())))
      -- A guest takes part in matches and does nothing else durable.
      or (stream_type = 'battle' and public.is_tenant_guest(tenant_id))
    )
  );

-- ----------------------------------------------------------------------------
-- And what a guest may not read
-- ----------------------------------------------------------------------------
-- The member list is the one read that `tenant_role()` widened and should not
-- have. It no longer carries emails - 20260801000000 dropped that column - so
-- what leaks is the roster itself: every member's user id and their role,
-- which is an org chart, and the standing invitation list beside it. Neither is
-- something "come and look at my lounge" should hand over.
--
-- A guest still sees whoever is actually present, because bodies and nameplates
-- arrive over the realtime channel. That is the right shape for a visitor: they
-- see who is in the room, not who is on the books.
drop policy if exists "tenant_members_select_same_tenant" on public.tenant_members;

create policy "tenant_members_select_same_tenant"
  on public.tenant_members for select
  using (public.is_tenant_member(tenant_id));

-- ============================================================================
-- 6. Policies on the two new tables
-- ----------------------------------------------------------------------------
-- `guest_links` is admin-only for the same reason `account_invites` is: a
-- member who could read it could read every unrevoked token for their space,
-- and a guest who could read it could mint themselves a permanent way back in.
-- Minting, listing and revoking all run through the service role behind
-- requireTenant()/requireBackofficeAdmin() in TypeScript.
--
-- Redemption also runs as the service role, necessarily: the caller is by
-- definition holding no session for this space yet, so there is no policy that
-- could admit them without being open to the world.
-- ============================================================================

alter table public.guest_links   enable row level security;
alter table public.tenant_guests enable row level security;

-- Owners and admins of the space, plus backoffice admins. Members cannot see
-- the tokens for their own space - handing out a way in is an administrative
-- act, and the list is the tokens themselves in the clear.
drop policy if exists "guest_links_admin_read" on public.guest_links;

create policy "guest_links_admin_read"
  on public.guest_links for select
  to authenticated
  using (
    public.tenant_role(tenant_id) in ('owner', 'admin')
    or public.is_backoffice_admin()
  );

-- Deliberately no insert/update/delete policy. Every write is a service-role
-- write from a server action that has already proved who is asking, which
-- keeps "who may mint a link" a decision in one readable place rather than a
-- predicate duplicated across three policies.

-- Who is in the room. Visible to members - it is the guest list for a space
-- they belong to, and it is what the kick UI renders - and to the guests'
-- own row, so a guest's client can tell when it has been removed.
drop policy if exists "tenant_guests_select_visible" on public.tenant_guests;

create policy "tenant_guests_select_visible"
  on public.tenant_guests for select
  to authenticated
  using (
    public.is_tenant_member(tenant_id)
    or guest_id = (select auth.uid())
    or public.is_backoffice_admin()
  );

-- ============================================================================
-- 7. Closing the read-model hole
-- ----------------------------------------------------------------------------
-- Narrowing the event log is not enough on its own, and this is the subtle
-- part of the whole change.
--
-- Around forty policies across a dozen migrations authorize writes to *read
-- model* tables with `tenant_role(tenant_id) is not null`. Those tables are
-- written by projections running under the caller's own client, which is why
-- they are writable by members at all. Widening `tenant_role()` to answer
-- 'guest' therefore hands a guest direct write access to the projected state of
-- the lounge, pages, tasks, the board and the café - bypassing the event log
-- entirely, which is exactly what section 5 just spent a policy preventing.
--
-- Every one of those policies *meant* "a member", written at a time when a
-- guest could not exist. So they are rewritten to say it.
--
-- Mechanically rather than by hand, and that is a deliberate choice. Forty
-- policies transcribed by hand is forty chances to drop a clause - which is a
-- mistake this very migration already made once, on `events_insert_tenant`,
-- and caught only by reading the later migration that had redefined it. So
-- this rewrites only policies whose expression is *exactly* the canonical
-- form, leaves anything else untouched, and then refuses to finish if a policy
-- it expected to handle is still standing. A migration that half-applied this
-- would leave a hole that looked closed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- First, the four that the generic pass cannot reach
-- ----------------------------------------------------------------------------
-- These key on a differently-named column - `id` on the tenant read model,
-- and a pair of them on a cross-space challenge - so the block below leaves
-- them alone by design. Rewritten by hand, preserving every other clause.
--
-- Note the two policies *not* here: `tenant_invitation_emails_insert_admin` and
-- `tenants_read_model_delete_member` both spell the test as
-- `tenant_role(...) = any (owner, admin)`, which a guest can never satisfy.
-- They are already correct and are deliberately untouched.
-- ----------------------------------------------------------------------------

drop policy if exists "tenants_read_model_insert_member" on public.tenants_read_model;
create policy "tenants_read_model_insert_member"
  on public.tenants_read_model for insert
  with check (public.is_tenant_member(id) or public.tenant_is_unclaimed(id));

drop policy if exists "tenants_read_model_update_member" on public.tenants_read_model;
create policy "tenants_read_model_update_member"
  on public.tenants_read_model for update
  using (public.is_tenant_member(id))
  with check (public.is_tenant_member(id));

drop policy if exists "space_challenges_insert" on public.space_challenges;
create policy "space_challenges_insert"
  on public.space_challenges for insert
  to authenticated
  with check (public.is_tenant_member(challenger_tenant_id));

-- A challenge is writable from either side of it, which is why this one names
-- two columns. Issuing and answering a challenge on a space's behalf is a
-- member's act; a guest may fight in the match it produces, not arrange it.
drop policy if exists "space_challenges_update" on public.space_challenges;
create policy "space_challenges_update"
  on public.space_challenges for update
  to authenticated
  using (
    public.is_tenant_member(challenger_tenant_id)
    or public.is_tenant_member(challenged_tenant_id)
  )
  with check (
    public.is_tenant_member(challenger_tenant_id)
    or public.is_tenant_member(challenged_tenant_id)
  );

do $$
declare
  -- Everything a guest must not write. Battle tables are deliberately absent -
  -- see the next block, which is the other half of this decision.
  targets text[] := array[
    'agents_read_model',
    'board_posts_read_model',
    'lounge_avatars_read_model',
    'lounge_blocks_read_model',
    'lounge_goals_read_model',
    'lounge_images_read_model',
    'pages_read_model',
    'space_challenges',
    'subscriptions_read_model',
    'tasks_read_model',
    'tenant_invitation_emails',
    'tenants_read_model',
    'tournaments_read_model',
    'uploads'
  ];
  -- How Postgres renders the expression we are looking for, once parsed and
  -- deparsed. Matching the rendered form rather than the source text is what
  -- makes this reliable across the several migrations that wrote it with
  -- different whitespace.
  canonical constant text := '(tenant_role(tenant_id) IS NOT NULL)';
  policy   record;
  rewrote  integer := 0;
  skipped  text[] := '{}';
begin
  for policy in
    select p.policyname, p.tablename, p.cmd, p.qual, p.with_check,
           array_to_string(p.roles, ', ') as role_list
      from pg_policies p
     where p.schemaname = 'public'
       and p.tablename = any (targets)
       and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    -- Only the unambiguous ones. A policy with any extra condition is somebody
    -- having thought about something this block has not, and is left alone and
    -- reported rather than flattened.
    if coalesce(policy.qual, canonical) is distinct from canonical
       or coalesce(policy.with_check, canonical) is distinct from canonical then
      skipped := skipped || format('%s.%s', policy.tablename, policy.policyname);
      continue;
    end if;

    execute format('drop policy %I on public.%I', policy.policyname, policy.tablename);

    execute format(
      'create policy %I on public.%I for %s to %s %s %s',
      policy.policyname,
      policy.tablename,
      policy.cmd,
      policy.role_list,
      case when policy.qual is not null
           then 'using (public.is_tenant_member(tenant_id))' else '' end,
      case when policy.with_check is not null
           then 'with check (public.is_tenant_member(tenant_id))' else '' end
    );

    rewrote := rewrote + 1;
  end loop;

  raise notice 'guest hardening: rewrote % write policies', rewrote;

  if array_length(skipped, 1) is not null then
    raise notice 'guest hardening: left alone (non-canonical): %',
      array_to_string(skipped, ', ');
  end if;

  -- The assertion. If any policy on a guarded table still authorizes writes
  -- through tenant_role(), a guest can write to it, and shipping in that state
  -- is worse than not shipping - so this fails the migration instead.
  --
  -- `IS NOT NULL` is what makes a tenant_role() test guest-permissive. A policy
  -- comparing the role against specific names - `= any (owner, admin)` - is
  -- already safe, because 'guest' is not among them, and flagging those would
  -- train the next reader to ignore this error.
  if exists (
    select 1
      from pg_policies p
     where p.schemaname = 'public'
       and p.tablename = any (targets)
       and p.cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
       and coalesce(p.qual, '') || coalesce(p.with_check, '') like '%tenant_role(%'
       and coalesce(p.qual, '') || coalesce(p.with_check, '') like '%IS NOT NULL%'
  ) then
    raise exception
      'guest hardening incomplete: a write policy on a guarded table still keys on tenant_role(), which now answers ''guest''. Narrow it to is_tenant_member() before applying.';
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- What a guest *does* still need to write
-- ----------------------------------------------------------------------------
-- Joining a match appends an event, and `executeCommand` then runs the battle
-- projection under the same client. So a guest who could append but not
-- project would write an event and immediately fail, leaving a match whose
-- roster disagrees with its log until a member happened to open the page.
--
-- The battle read models are therefore left keyed on `tenant_role()`, which now
-- includes guests, and that is correct rather than an oversight: they are
-- derived from a stream the guest is already authorized to append to, so the
-- write grants nothing the event did not. The same argument covers
-- `projection_checkpoints`, which every projection advances.
--
-- Named here explicitly - `battles_read_model`, `battle_participants`,
-- `battle_goals`, `battle_scores`, `battlefields_read_model` and
-- `projection_checkpoints` - so that the next person reading the block above
-- can see the exclusions were chosen rather than missed.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- 8. The reaper
-- ----------------------------------------------------------------------------
-- Guests expire by the clock, which `tenant_role()` already honours - an
-- expired row grants nothing the moment it lapses, with or without this
-- function. So this is housekeeping rather than enforcement, and it is worth
-- being clear about that: nothing here is load-bearing for security, and a
-- deployment that never runs it is not less safe, only untidier.
--
-- It returns the count so the route that calls it can log something useful,
-- and it takes a grace period so that "expired ten seconds ago" is not deleted
-- out from under a client that is mid-reconnect and about to be told to leave.
-- ============================================================================

create or replace function public.reap_expired_guests(p_grace interval default '1 hour')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.tenant_guests
   where expires_at < now() - p_grace;

  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.reap_expired_guests(interval) is
  'Housekeeping only. Expiry is enforced by tenant_role(); this just clears the rows out afterwards.';

-- Service role only - there is no grant to authenticated here, so the only
-- caller is the cron route, which authenticates with CRON_SECRET exactly as
-- the entitlement sync does.
revoke execute on function public.reap_expired_guests(interval) from public, authenticated, anon;
