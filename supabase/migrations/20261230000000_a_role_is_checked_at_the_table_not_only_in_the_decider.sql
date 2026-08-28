-- ============================================================================
-- A role is checked at the table, not only in the decider
-- ----------------------------------------------------------------------------
-- The space security review of 2026-08-28. Every finding below was reproduced
-- against a running database as the `authenticated` role with an ordinary
-- member's JWT claims, in a transaction that was rolled back, before it was
-- written down.
--
-- ---------------------------------------------------------------------------
-- 1. The tenant stream authorized by space, not by role - CRITICAL
-- ---------------------------------------------------------------------------
-- `events_insert_tenant` asks whether the caller belongs to the space. Every
-- rule about *which* member may write *which* event lives in
-- `domain/tenants/aggregate.ts` - `requireRole(state, command, ['owner'])` and
-- its neighbours - and the decider is reachable only through a Server Action.
--
-- PostgREST is the other door, and it takes the anon key and a session cookie
-- that every member already holds. One row:
--
--   insert into events (stream_id, stream_type, version, type, data,
--                       actor_id, tenant_id)
--   values (:space, 'tenant', :next, 'MemberRoleChanged',
--           '{"userId":"<me>","role":"owner"}', :me, :space);
--
-- `events_sync_tenant_authorization` fires on the row, applies it to
-- `tenant_members`, and the caller is an owner of the space. Measured: role
-- before `member`, role after `owner`. A second row of `MemberRemoved` deleted
-- the space's admin. `TenantArchived` shuts the space; `SpaceCapabilitySet`
-- opens what the host closed; `MemberJoined` seats people past the tier's seat
-- limit.
--
-- It is not only members. `has_tenant_invitation()` lets somebody who has been
-- invited and has *not* accepted write to the tenant stream - that is how
-- accepting is recorded. An invitation is issuable at `admin` or `member`
-- only, and an invitee posting `InvitationAccepted` with `"role":"owner"`
-- became an owner of a space they had never entered. Also measured.
--
-- The existing `events_radio_admin_only` policy is the shape of the fix and the
-- proof the shape works - it is a RESTRICTIVE policy that reads `tenant_role()`
-- for one stream type. This generalises it to the stream where the roles are
-- decided, rather than to one where they are used.
--
-- What this is NOT: a second decider. It answers one question per event type -
-- "may somebody standing here at this role have caused this at all" - and
-- leaves every other rule where it is. The last-owner rule, the seat limit, the
-- "an admin may not remove an admin" rule and the invitation-key check stay in
-- the aggregate, because they are facts about the *stream's state* and this
-- policy sees one row. The property being bought is narrower and is the one
-- that was missing: no role-gated event enters the log from a caller who does
-- not hold the role.
--
-- ---------------------------------------------------------------------------
-- 2. Definer functions that take a user id and never look at the session
-- ---------------------------------------------------------------------------
-- `redeem_promo_code(code, p_user_id, …)` and `claim_free_month(p_user_id, …)`
-- are SECURITY DEFINER, are granted to `anon` and `authenticated`, and grant
-- the tier named by the code to whichever account id they are handed.
-- `redeem_promo_code` additionally takes `p_ignore_history`, the flag that
-- exists so an operator can re-grant, which turns off the "you have had this
-- tier before" refusal.
--
-- A tier is what `tenant_tier()` reads out of `promo_redemptions`, so this is
-- the paid product, granted from a browser console. Measured, twice: an
-- ordinary session granted `xo` to a *different* account, and granted itself a
-- code it had already used by passing the flag.
--
-- Both are called from the server only - `redeemPromoCode()` through the
-- service role, `claimFreeMonth()` with the caller's own id off a verified
-- session - so the fix costs nothing at the call sites. `redeem_promo_code`
-- loses its grant; `claim_free_month` keeps one and gains the check its
-- callers were already making, because it is the path a signed-in person takes
-- and the id it is handed must be theirs.
--
-- Three more definers in the same shape lose their grants. Each is called only
-- by a trigger or by another definer, where the grant is irrelevant:
--
--   claim_username(p_user_id, p_seed)  a handle claimed on somebody else's
--                                      account - permanent, and there is no
--                                      path to change it after the fact.
--   forget_invitation(tenant, key)     deletes any invitation of any space.
--   account_has_had_tier(user, tier)   reads another account's billing history.
--
-- ---------------------------------------------------------------------------
-- 3. Two tables readable by every signed-in person - LOW
-- ---------------------------------------------------------------------------
-- `tenant_slugs` is `using (true)`, and it has to stay readable: resolving a
-- slug at the door happens before anybody's membership is known, and the
-- sign-up form asks whether a slug is free. What does not have to be readable
-- is `claimed_by` - the account that made the space - which turns the table
-- into a directory of every space in the deployment and who created it. Column
-- grants, not a policy: the two columns the app selects stay, the two it never
-- selects go.
--
-- `hidden_chat_messages` is `using (true)` and carries `reason` and
-- `hidden_by`, so every moderation takedown in the product, and the operator
-- who made it, was readable by any account. It was written that way for a real
-- reason: `chat_messages_read_model`'s SELECT policy has a `not exists`
-- against it, sub-selects inside a policy run as the calling user, and a table
-- the caller cannot read hides nothing. So the predicate moves into a definer
-- function - which is the only way to keep the takedown working while closing
-- the table.
--
-- ---------------------------------------------------------------------------
-- 4. A checkpoint may not walk backwards - LOW
-- ---------------------------------------------------------------------------
-- Projections run in the caller's session, so `projection_checkpoints` is
-- writable by anybody with a role in the space, guests included. 20261025000000
-- already stops a cursor being pushed past the head of the log. Nothing stopped
-- it being pulled *back*, which replays a space's whole history through every
-- projection on the next sweep.
--
-- Backwards is a repair, and a repair is an operator's to make: the service
-- role and the backoffice keep it, a member loses it.
--
-- ---------------------------------------------------------------------------
-- 5. Local drift, handled defensively
-- ---------------------------------------------------------------------------
-- `xp_arbiter_sweep(interval)` and `tenant_log_extent()` exist in the local
-- database and in no migration - somebody made them by hand. The sweep deletes
-- up to 200 rows of live arbiter state older than an interval *it is handed*,
-- and is granted to `authenticated`: `xp_arbiter_sweep('0 seconds')` in a loop
-- clears the scores, hands and seats out of every match in progress.
--
-- They are not in this repository's schema, so they are almost certainly not in
-- production. The block below therefore only fires if the function is there,
-- and takes the grant off rather than dropping something an operator may be
-- relying on.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The tenant stream
-- ---------------------------------------------------------------------------

/**
 * The role an invitation of mine was issued at, or NULL.
 *
 * A companion to `invitation_is_mine()`, and separate from it because
 * accepting has two questions in it: whether the invitation is addressed to me
 * and what it offered. Conflating them is exactly the hole - an invitee who
 * could answer only the first one wrote their own role.
 */
create or replace function public.invitation_role(p_tenant_id uuid, p_invitee_key text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select i.role
    from public.tenant_invitations i
    left join public.tenant_invitation_emails e
      on e.tenant_id = i.tenant_id
     and e.invitee_key = i.invitee_key
   where i.tenant_id = p_tenant_id
     and i.invitee_key = p_invitee_key
     and (
       i.invited_user_id = (select auth.uid())
       or lower(e.email) = lower((select auth.jwt() ->> 'email'))
     );
$$;

comment on function public.invitation_role(uuid, text) is
  'The role my own invitation to this space was issued at, or NULL.';

-- A definer that returns a value about the caller, so the grant is the point.
-- See 20261218000000 for the rule about definers that return rows.
grant execute on function public.invitation_role(uuid, text) to authenticated;

/**
 * May the caller have caused this tenant event?
 *
 * One question per event type, mirroring `decide()` in
 * `domain/tenants/aggregate.ts`. Where the two could drift, this one is the
 * looser of the pair on purpose: it is a door, not a rulebook.
 *
 * The `else false` at the end is deliberate and is the property worth having.
 * A tenant event type added next year is refused by this policy until somebody
 * writes its rule down, which is a failing test rather than a silent hole -
 * the opposite default is how the tenant stream came to be authorized by
 * space rather than by role in the first place.
 */
create or replace function public.tenant_event_permitted(
  p_tenant_id uuid,
  p_type      text,
  p_data      jsonb
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    -- The platform administers every space, and its writes are audited in
    -- `backoffice_audit` rather than here. Same test the permissive policy
    -- already makes, restated so this one cannot refuse what that one allows.
    when public.is_backoffice_admin() then true

    /**
     * Creation, where nobody is a member yet.
     *
     * `CreateTenant` emits two events, and the second seats the creator as
     * owner. There is no role to check because the roster does not exist, so
     * the test is the one the permissive policy already uses for this moment -
     * a space nobody else has written to - plus the requirement that the
     * person being seated is the person writing.
     *
     * `tenant_is_unclaimed()` stays true across the batch: it asks for an
     * event by somebody *else*, and both of these are mine.
     */
    when p_type = 'TenantCreated' then
      public.tenant_is_unclaimed(p_tenant_id)

    when p_type = 'MemberJoined' then
      public.tenant_is_unclaimed(p_tenant_id)
      and (p_data ->> 'userId')::uuid = (select auth.uid())

    /**
     * Answering an invitation, at the role it was actually offered at.
     *
     * The role comparison is the half that was missing. `invitation_is_mine()`
     * proves the envelope has my name on it; without `invitation_role()` the
     * contents were mine to write.
     */
    when p_type = 'InvitationAccepted' then
      (p_data ->> 'invitee') is not null
      and public.invitation_is_mine(p_tenant_id, p_data ->> 'invitee')
      and (p_data ->> 'userId')::uuid = (select auth.uid())
      and (p_data ->> 'role') is not distinct from
          public.invitation_role(p_tenant_id, p_data ->> 'invitee')

    when p_type = 'InvitationDeclined' then
      (p_data ->> 'invitee') is not null
      and public.invitation_is_mine(p_tenant_id, p_data ->> 'invitee')

    -- Leaving is the one membership change a person makes about themselves.
    -- Whether they may - the last owner may not - is the aggregate's.
    when p_type = 'MemberLeft' then
      (p_data ->> 'userId')::uuid = (select auth.uid())

    -- Ownership and the shutter: owners only, as `ChangeMemberRole` and
    -- `ArchiveTenant` already say.
    when p_type in ('MemberRoleChanged', 'TenantArchived') then
      public.tenant_role(p_tenant_id) = 'owner'

    -- Everything an admin may do. `MemberRemoved` is here rather than above
    -- because an admin may clear out members; that they may not remove an
    -- admin is a fact about the target's role and stays in the decider.
    when p_type in (
      'TenantRenamed',
      'MemberInvited',
      'InvitationRevoked',
      'MemberRemoved',
      'LoungePublicitySet',
      'LoungeModeSet',
      'ChatEnabledSet',
      'SpaceCapabilitySet'
    ) then
      public.tenant_role(p_tenant_id) = any (array['owner', 'admin'])

    else false
  end;
$$;

comment on function public.tenant_event_permitted(uuid, text, jsonb) is
  'May the caller have caused this tenant-stream event, at the role they hold?';

grant execute on function public.tenant_event_permitted(uuid, text, jsonb) to authenticated, anon;

drop policy if exists "events_tenant_role_required" on public.events;
create policy "events_tenant_role_required"
  on public.events
  as restrictive
  for insert
  with check (
    stream_type <> 'tenant'
    or public.tenant_event_permitted(tenant_id, type, data)
  );

-- ---------------------------------------------------------------------------
-- 2. Definers that take an account id
-- ---------------------------------------------------------------------------

/**
 * A month, for the account asking for it.
 *
 * Unchanged except for the first block. The id stays a parameter rather than
 * becoming `auth.uid()` because the service role calls this on the sign-up
 * path, where there is no session to read one from - so the check is "if there
 * is a session, the id must be its own", which is precisely the invariant
 * every caller in the app already maintained by hand.
 */
create or replace function public.claim_free_month(
  p_user_id   uuid,
  p_source    text default 'picker',
  p_tenant_id uuid default null
)
returns table(outcome text, granted_until timestamptz, granted_tier text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  public.promo_codes%rowtype;
  v_until timestamptz;
begin
  -- A month is granted to the account that asks for it. The service role has no
  -- `auth.uid()` and is trusted with the id it was given; an operator granting
  -- one deliberately goes through /ovaloffice/promos, which is the backoffice.
  if (select auth.uid()) is not null
     and (select auth.uid()) <> p_user_id
     and not public.is_backoffice_admin()
  then
    return query select 'refused'::text, null::timestamptz, null::text;
    return;
  end if;

  if p_tenant_id is not null and not exists (
    select 1
      from public.tenant_members m
     where m.tenant_id = p_tenant_id
       and m.user_id   = p_user_id
       and m.role      = 'owner'
  ) then
    return query select 'refused'::text, null::timestamptz, null::text;
    return;
  end if;

  select * into v_code
    from public.promo_codes
   where code = 'FIRST-MONTH'
   for update;

  if not found
     or v_code.revoked_at is not null
     or (v_code.starts_at  is not null and v_code.starts_at  > now())
     or (v_code.expires_at is not null and v_code.expires_at <= now())
     or (v_code.max_uses   is not null and v_code.uses >= v_code.max_uses)
  then
    return query select 'inactive'::text, null::timestamptz, null::text;
    return;
  end if;

  if exists (
    select 1
      from public.promo_redemptions r
     where r.user_id      = p_user_id
       and r.granted_tier = v_code.tier
  ) then
    return query select 'already'::text, null::timestamptz, null::text;
    return;
  end if;

  v_until := case
               when v_code.free_days is null then null
               else now() + make_interval(days => v_code.free_days)
             end;

  insert into public.promo_redemptions
    (code_id, user_id, tenant_id, granted_days, granted_until, granted_tier,
     granted_spaces, source, campaign)
  values
    (v_code.id, p_user_id, p_tenant_id, v_code.free_days, v_until, v_code.tier,
     v_code.spaces,
     case when p_source in ('signup', 'link', 'picker', 'space', 'grant')
          then p_source else 'picker' end,
     v_code.campaign);

  update public.promo_codes
     set uses = uses + 1
   where id = v_code.id;

  return query select 'ok'::text, v_until, v_code.tier;
end;
$$;

-- Server-side callers only. Every one of these runs through the service role
-- or a trigger, so the revoke is invisible to the application and removes the
-- PostgREST endpoint.
revoke execute on function public.redeem_promo_code(text, uuid, text, uuid, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.account_has_had_tier(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.claim_username(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.forget_invitation(uuid, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Two tables readable by everybody
-- ---------------------------------------------------------------------------

-- Column privileges, because a table-level grant covers every column and
-- revoking one column back out of it does nothing. The grant is replaced.
revoke select on public.tenant_slugs from anon, authenticated;
grant select (slug, tenant_id) on public.tenant_slugs to anon, authenticated;

/**
 * Has this message been taken down?
 *
 * A definer so that the chat policy can ask without the caller being able to
 * read the takedown - the reason, and which operator made it, are the
 * platform's. See the header.
 */
create or replace function public.chat_message_hidden(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.hidden_chat_messages h where h.message_id = p_message_id
  );
$$;

comment on function public.chat_message_hidden(uuid) is
  'Has this chat message been taken down? Asked by the chat read policy.';

grant execute on function public.chat_message_hidden(uuid) to authenticated;

drop policy if exists "chat_messages_select_tenant" on public.chat_messages_read_model;
create policy "chat_messages_select_tenant"
  on public.chat_messages_read_model
  for select
  to authenticated
  using (
    tenant_role(tenant_id) is not null
    and not public.chat_message_hidden(id)
  );

drop policy if exists "hidden_chat_messages_select" on public.hidden_chat_messages;
create policy "hidden_chat_messages_select"
  on public.hidden_chat_messages
  for select
  to authenticated
  using (public.is_backoffice_admin());

-- ---------------------------------------------------------------------------
-- 4. A checkpoint may not walk backwards
-- ---------------------------------------------------------------------------

create or replace function public.projection_checkpoint_forward_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_seq >= old.last_seq then
    return new;
  end if;

  -- Replaying a space deliberately is a repair. It stays possible, for the
  -- people who repair things.
  --
  -- `auth.uid() is null` is the first test and carries the case the other two
  -- miss: a migration or a psql session has no JWT at all, so `auth.role()` is
  -- null rather than `service_role`, and a guard that only knew the two named
  -- roles would refuse the very people it is written for. A caller with no uid
  -- and no privilege is `anon`, whom the UPDATE policy has already refused -
  -- `tenant_role()` is null for them.
  if (select auth.uid()) is null
     or (select auth.role()) = 'service_role'
     or public.is_backoffice_admin()
  then
    return new;
  end if;

  raise exception
    'projection_checkpoints: % for tenant % would move back from % to % - a rewind is a repair, not a sweep',
    new.projection, new.tenant_id, old.last_seq, new.last_seq
    using errcode = '22003';
end;
$$;

comment on function public.projection_checkpoint_forward_only() is
  'A sweep advances a cursor. Only an operator may pull one back.';

drop trigger if exists projection_checkpoint_forward_only on public.projection_checkpoints;
create trigger projection_checkpoint_forward_only
  before update on public.projection_checkpoints
  for each row execute function public.projection_checkpoint_forward_only();

-- ---------------------------------------------------------------------------
-- 5. Local drift
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'xp_arbiter_sweep'
  ) then
    execute 'revoke execute on function public.xp_arbiter_sweep(interval) from public, anon, authenticated';
    raise notice 'xp_arbiter_sweep existed and is now service-role only - it is in no migration, so check where it came from';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------
-- The same shape as 20260813000000's and 20261219000000's: this migration is
-- worthless if a later one drops the restrictive policy while adding an
-- ordinary one, which is the easiest possible mistake to make on this table.
do $$
begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename  = 'events'
       and policyname = 'events_tenant_role_required'
       and permissive = 'RESTRICTIVE'
  ) then
    raise exception 'events_tenant_role_required must exist and must be RESTRICTIVE - a permissive copy grants what it means to refuse';
  end if;
end;
$$;
