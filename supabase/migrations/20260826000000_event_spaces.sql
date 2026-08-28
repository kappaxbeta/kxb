-- ============================================================================
-- Event spaces: a space that runs for a weekend
-- ----------------------------------------------------------------------------
-- /events sells "a room built for your jam, hackathon, conference or class,
-- and one link that puts everyone in it". Everything in that sentence except
-- the room already exists; what is missing is the *period* and the *matrix*.
--
-- A period, because a booked event runs Friday to Sunday and the doors should
-- shut afterwards. Archiving is the wrong tool - it retires a space, and a
-- customer who paid for a hackathon expects to still walk through the room
-- with their logo on the wall in November.
--
-- A matrix, because "everyone is a guest" is only sane if you can say what a
-- guest may do. A hackathon wants strangers building, posting and writing
-- tasks; a conference wants them watching and chatting and nothing else.
--
-- ----------------------------------------------------------------------------
-- Why this is a table and not an aggregate
-- ----------------------------------------------------------------------------
-- The obvious modelling is `EventScheduled` on the tenant stream beside
-- `ChatEnabledSet`, and it is wrong for one hard reason: a backoffice admin
-- cannot append to a tenant's stream at all. `append_events()` is security
-- invoker, and `events_insert_tenant` demands `actor_id = auth.uid()` plus
-- membership. A platform operator configuring somebody's event is not a member
-- of it. This is the same wall chat moderation hit in 20260803080000, and it
-- takes the same answer: an admin-owned side table, enforced in policies.
--
-- ----------------------------------------------------------------------------
-- Two levels, and why both
-- ----------------------------------------------------------------------------
-- What a guest may actually do is the AND of three things:
--
--   the backoffice allows it here   (event_spaces.guest_writes - this file)
--   AND the staff have it switched on (tenants_read_model.capabilities)
--   AND the window is open            (event_spaces.opens_at/closes_at)
--
-- The first is ours and the second is theirs, and collapsing them into one
-- switch would destroy the distinction the host most needs at 09:00 on the
-- day: "this event never had tasks" reads differently from "somebody turned
-- tasks off ten minutes ago". It is the same split as the `chat` feature flag
-- versus `chat_enabled`, argued at length in src/domain/tenants/events.ts, and
-- it is reused here rather than reinvented.
--
-- The staff half lives on the tenant stream, because the staff *are* members
-- and may write there - which is also why the backoffice makes whoever creates
-- an event its owner. That one decision is what keeps every later operator
-- action (inviting staff, flipping a switch, setting a room's mode) an
-- ordinary member action instead of a service-role hole into the event log.
-- ============================================================================

-- ============================================================================
-- 1. The event record
-- ============================================================================

create table if not exists public.event_spaces (
  /** The space this is an event for. One event per space, by construction. */
  tenant_id     uuid        primary key
                            references public.tenants_read_model (id) on delete cascade,
  opens_at      timestamptz not null,
  closes_at     timestamptz not null,
  /**
   * Which preset this was built from. Kept for the console's benefit only -
   * nothing branches on it, because a preset is a starting point and every
   * value it set is editable afterwards. Recording it is what lets the console
   * say "hackathon, with three things changed" instead of showing twelve
   * checkboxes with no story.
   */
  preset        text        not null,
  /**
   * The ceiling on what a guest may write, as capability names rather than
   * stream types.
   *
   * Capability names, because this array is rendered as checkboxes to somebody
   * pricing an event, and `lounge_chunk` is not a word they should have to
   * learn. `stream_capability()` below does the translation, in one place, so
   * that adding a stream type later is one line here rather than a migration
   * against every stored array.
   */
  guest_writes  text[]      not null default '{}',
  /**
   * The ceiling on which surfaces a guest may reach. Read by requireTenant's
   * 'event' mode and by the sidebar.
   *
   * Defaulting to the lounge and the rooms rather than to everything: an event
   * created with no thought about surfaces should behave like today's guest
   * link, not like a workspace with the doors taken off.
   */
  surfaces      text[]      not null default '{lounge,rooms}',
  /** Default heads per room. Overridden per room by rooms_read_model.cap. */
  room_cap      integer     not null default 10 check (room_cap between 2 and 40),
  /** How many rooms overflow may mint before it gives up and shows a queue. */
  room_max      integer     not null default 12 check (room_max between 1 and 64),
  /** May a full venue mint the next room, or does it queue? */
  room_overflow boolean     not null default true,
  created_by    uuid        references auth.users (id) on delete set null,
  /** Why this event exists, for whoever reads the console in six months. */
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Not a column check, because a closed event is a normal state and an
  -- operator shortening the window to "now" is the Close button. What is
  -- refused is a window that never opens.
  constraint event_spaces_window check (closes_at > opens_at)
);

comment on table public.event_spaces is
  'A space that runs for a period, with a ceiling on what its guests may do. Written only by the backoffice; the staff half of the answer is tenants_read_model.capabilities.';

create index if not exists event_spaces_window_idx
  on public.event_spaces (closes_at desc);

alter table public.event_spaces enable row level security;

-- Written by the backoffice, read by anybody standing in the space.
--
-- The read is wider than the write on purpose and is not a leak: the banner,
-- the sidebar and the room picker all have to know when the event ends and
-- what a guest may do, and every one of those renders for a guest. Nothing in
-- the row is a secret - it is the terms of the event, and the people inside it
-- are exactly who those terms are for.
drop policy if exists "event_spaces_admin_all"  on public.event_spaces;
drop policy if exists "event_spaces_select_any" on public.event_spaces;

create policy "event_spaces_admin_all"
  on public.event_spaces for all
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

create policy "event_spaces_select_any"
  on public.event_spaces for select
  using (public.tenant_role(tenant_id) is not null);

-- ============================================================================
-- 2. The staff switches
-- ----------------------------------------------------------------------------
-- Projected from `SpaceCapabilitySet` on the tenant stream. One JSONB column
-- rather than a column per capability, because the set of capabilities is
-- expected to grow with the surfaces and a migration per checkbox is not a
-- trade worth making for a value nothing joins or filters on.
--
-- An absent key means "the staff have not touched this", and it resolves to
-- *on*. The ceiling has already decided whether the capability exists here at
-- all; this column only records a host switching something off during the day.
-- The opposite default would mean every event arrives with everything the
-- operator just enabled switched off again.
-- ============================================================================

alter table public.tenants_read_model
  add column if not exists capabilities jsonb not null default '{}'::jsonb;

comment on column public.tenants_read_model.capabilities is
  'Staff switches, from SpaceCapabilitySet. Absent key = on. The other half of the answer is event_spaces.guest_writes.';

-- ============================================================================
-- 3. Is this an event, and is it open
-- ============================================================================

create or replace function public.tenant_is_event(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.event_spaces e where e.tenant_id = p_tenant_id);
$$;

-- True for an ordinary space, and for an event inside its window.
--
-- The "no row" case answering *true* is what keeps this function safe to call
-- from anywhere, including paths that know nothing about events: a space with
-- no event record is not a closed event, it is a workspace, and it is open in
-- the only sense this function means.
create or replace function public.event_open(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select now() >= e.opens_at and now() < e.closes_at
       from public.event_spaces e
      where e.tenant_id = p_tenant_id),
    true
  );
$$;

grant execute on function public.tenant_is_event(uuid) to authenticated, anon;
grant execute on function public.event_open(uuid)      to authenticated, anon;

-- ============================================================================
-- 4. Stream types, in the words the console uses
-- ----------------------------------------------------------------------------
-- The console shows "may guests build", not "may guests append to
-- lounge_chunk". This is the single place the two vocabularies meet.
--
-- A stream type with no capability returns NULL, and every caller below treats
-- NULL as "no". That is the safe direction and it is what makes adding a new
-- aggregate safe by default: a stream type nobody has thought about yet is one
-- a guest may not write, without anybody having remembered to say so.
-- ============================================================================

create or replace function public.stream_capability(p_stream_type text)
returns text
language sql
immutable
as $$
  select case p_stream_type
    when 'lounge_chunk' then 'build'
    when 'lounge_image' then 'build'
    when 'lounge_goal'  then 'build'
    when 'room'         then 'rooms'
    when 'board_post'   then 'board'
    when 'task'         then 'tasks'
    when 'page'         then 'pages'
    when 'battle'       then 'battle'
    when 'chat_message' then 'chat'
    when 'agents'       then 'agents'
  end;
$$;

comment on function public.stream_capability(text) is
  'Stream type -> the capability name the event console shows. NULL means no capability covers it, which every caller reads as no.';

-- Has a capability been left on by the staff? Absent means yes - see the note
-- on the column.
create or replace function public.space_capability_on(p_tenant_id uuid, p_capability text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (t.capabilities ->> p_capability)::boolean
       from public.tenants_read_model t
      where t.id = p_tenant_id),
    true
  );
$$;

grant execute on function public.space_capability_on(uuid, text) to authenticated, anon;

-- ============================================================================
-- 5. May this guest write this?
-- ----------------------------------------------------------------------------
-- All three levels in one function, so that the policy below is one call and
-- cannot be half-applied by a future edit that remembers the array and forgets
-- the clock.
--
-- Note it answers *false* for a space that is not an event. Guests in ordinary
-- spaces keep exactly the reach 20260813000000 gave them - matches and nothing
-- else - and this whole file is additive to that.
-- ============================================================================

create or replace function public.event_guest_may_write(p_tenant_id uuid, p_stream_type text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.event_spaces e
     where e.tenant_id = p_tenant_id
       and now() >= e.opens_at
       and now() <  e.closes_at
       and public.stream_capability(p_stream_type) is not null
       and public.stream_capability(p_stream_type) = any (e.guest_writes)
       and public.space_capability_on(p_tenant_id, public.stream_capability(p_stream_type))
  );
$$;

grant execute on function public.event_guest_may_write(uuid, text) to authenticated, anon;

-- ============================================================================
-- 6. Rooms carry their own cap and their own build rule
-- ----------------------------------------------------------------------------
-- Ahead of the function below rather than after it, because that function
-- reads `guest_build` and a migration cannot compile a reference to a column
-- it has not added yet.
-- ============================================================================

alter table public.rooms_read_model
  add column if not exists guest_build boolean not null default true;

-- NULL = "whatever the event says", which is the common case and the reason
-- this is nullable rather than defaulted to a number. A room created before
-- caps existed has no opinion, and should not acquire one that disagrees with
-- the event it is standing in.
alter table public.rooms_read_model
  add column if not exists cap integer check (cap is null or cap between 2 and 40);

comment on column public.rooms_read_model.guest_build is
  'May a guest place blocks in this room? Set by the space''s own admins, under the event ceiling.';
comment on column public.rooms_read_model.cap is
  'Heads allowed in this room at once. NULL falls back to event_spaces.room_cap, and then to no cap at all.';

-- ----------------------------------------------------------------------------
-- Building is per world, not per space
-- ----------------------------------------------------------------------------
-- A room's blocks are not stored under the room. They live in `lounge_chunk`
-- streams keyed by world id, and the room's stream id *is* its world id - see
-- the header of src/domain/rooms/events.ts. So "guests may build in the lobby
-- but not in the sponsor's room" cannot be answered from the stream type
-- alone: both are `lounge_chunk`.
--
-- It can be answered from the payload. Every block event carries `worldId`,
-- deliberately and for a related reason - a projection holding an opaque
-- stream id has no way to invert the hash that produced it. An absent one
-- means the space's own lounge, exactly as `worldOf()` resolves it.
--
-- Reading the payload rather than the stream id is also the honest choice for
-- enforcement, because the payload is what the projection files the blocks by.
-- A guest who names a world they may not build in is refused here; a guest who
-- names one they may is allowed, and their blocks land where they said. The
-- stream id never gets a vote in either direction, in the policy or in the
-- read model, so the two cannot disagree.
-- ----------------------------------------------------------------------------

create or replace function public.event_guest_may_build(p_tenant_id uuid, p_world_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.event_guest_may_write(p_tenant_id, 'lounge_chunk')
     and coalesce(
           -- A room of this space: it carries its own answer.
           (select r.guest_build
              from public.rooms_read_model r
             where r.room_id = p_world_id
               and r.tenant_id = p_tenant_id),
           -- Not a room, so the lounge (or a battlefield being played on).
           -- The space-level capability has already been checked above.
           true
         );
$$;

grant execute on function public.event_guest_may_build(uuid, uuid) to authenticated, anon;

-- ============================================================================
-- 7. Who is in a room right now
-- ----------------------------------------------------------------------------
-- Occupancy exists only in Realtime presence today, which means there is no
-- row to count and no way for the server to ask. That is fine for drawing
-- nameplates and useless for a cap - and the cap is not cosmetic: movement
-- costs SEND_HZ x M x (N-1) events per second, so a room's cost is quadratic
-- in its population and one crowded room is what takes the whole tenant's
-- Realtime budget down. See performancestudy/.
--
-- So: a table, shaped after `tenant_guests` on purpose. Same clock-decides
-- rule, same reaper-is-housekeeping-not-enforcement posture, same "a row that
-- lapsed a second ago frees its place whether or not anybody swept".
--
-- Keyed by world rather than by room, because the lounge is a world too and a
-- picker that could not show how busy the lobby is would be telling half the
-- story. `world_id` is the room id for a room and the tenant id for the lounge,
-- which is exactly what `worldOf()` already resolves to.
--
-- Cost: one upsert per person per heartbeat. At 80 people on a 10-second tick
-- that is 8 writes a second, against a room that is already broadcasting
-- thousands. It is not the expensive part of anybody's event.
-- ============================================================================

create table if not exists public.world_occupancy (
  tenant_id uuid        not null references public.tenants_read_model (id) on delete cascade,
  /** Room id, or the tenant id for the space's own lounge. No foreign key,
   *  for the same reason: it points at either, depending. */
  world_id  uuid        not null,
  /** Whatever auth.uid() is - a member, or an anonymous guest. */
  user_id   uuid        not null,
  seen_at   timestamptz not null default now(),

  primary key (tenant_id, world_id, user_id)
);

-- The count is the only read, and it is per world.
create index if not exists world_occupancy_world_idx
  on public.world_occupancy (tenant_id, world_id, seen_at);

-- The reaper sweeps by staleness across every space at once.
create index if not exists world_occupancy_seen_idx
  on public.world_occupancy (seen_at);

comment on table public.world_occupancy is
  'Who is standing in a world right now, within OCCUPANCY_TTL. Heartbeat rows, not history - deleting one is how somebody leaves.';

alter table public.world_occupancy enable row level security;

-- No insert or update policy, and that is deliberate: the only way to write
-- here is `touch_occupancy()` below, which stamps auth.uid() itself. A policy
-- of the shape `user_id = auth.uid()` would have been equivalent right up
-- until somebody upserted a row for a world they were not in, to make a room
-- look full.
drop policy if exists "world_occupancy_select_same_tenant" on public.world_occupancy;
drop policy if exists "world_occupancy_delete_own"         on public.world_occupancy;

create policy "world_occupancy_select_same_tenant"
  on public.world_occupancy for select
  using (public.tenant_role(tenant_id) is not null);

-- Leaving is a delete, and only of yourself. An admin removing somebody uses
-- the guest controls, which delete the admission rather than the presence.
create policy "world_occupancy_delete_own"
  on public.world_occupancy for delete
  using (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- How long a heartbeat counts for.
--
-- Twice the client's tick, so one dropped beat on a bad connection does not
-- evict somebody from a room they are standing in. Written as a function
-- rather than a literal because both the count and the reaper need the same
-- number and the two disagreeing is a room that is permanently one head short.
-- ----------------------------------------------------------------------------
create or replace function public.occupancy_ttl()
returns interval
language sql
immutable
as $$ select interval '20 seconds' $$;

create or replace function public.touch_occupancy(p_tenant_id uuid, p_world_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Membership is checked rather than assumed. This is a SECURITY DEFINER
  -- function writing a row that a capacity decision is made from, so a caller
  -- with no standing in the space must not be able to add weight to it.
  if public.tenant_role(p_tenant_id) is null then
    return;
  end if;

  insert into public.world_occupancy (tenant_id, world_id, user_id, seen_at)
  values (p_tenant_id, p_world_id, (select auth.uid()), now())
  on conflict (tenant_id, world_id, user_id)
  do update set seen_at = now();

  -- Standing in one world means not standing in the others. Without this a
  -- walk through four rooms leaves four live rows, and every one of those
  -- rooms looks fuller than it is for the next twenty seconds.
  delete from public.world_occupancy
   where tenant_id = p_tenant_id
     and user_id   = (select auth.uid())
     and world_id <> p_world_id;
end;
$$;

grant execute on function public.touch_occupancy(uuid, uuid) to authenticated;

create or replace function public.world_occupancy_count(p_tenant_id uuid, p_world_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from public.world_occupancy o
   where o.tenant_id = p_tenant_id
     and o.world_id  = p_world_id
     and o.seen_at > now() - public.occupancy_ttl();
$$;

-- The cap in force for one room: its own, else the event's, else none.
--
-- NULL means no cap, and it is the answer for every room in every space that
-- is not an event - which is every room that exists today.
create or replace function public.room_cap(p_tenant_id uuid, p_room_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select r.cap from public.rooms_read_model r
      where r.room_id = p_room_id and r.tenant_id = p_tenant_id),
    (select e.room_cap from public.event_spaces e where e.tenant_id = p_tenant_id)
  );
$$;

create or replace function public.room_has_space(p_tenant_id uuid, p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
           when public.room_cap(p_tenant_id, p_room_id) is null then true
           else public.world_occupancy_count(p_tenant_id, p_room_id)
                  < public.room_cap(p_tenant_id, p_room_id)
         end;
$$;

grant execute on function public.world_occupancy_count(uuid, uuid) to authenticated, anon;
grant execute on function public.room_cap(uuid, uuid)              to authenticated, anon;
grant execute on function public.room_has_space(uuid, uuid)        to authenticated, anon;

-- Housekeeping, exactly as `reap_expired_guests` is: the count already ignores
-- stale rows, so a deployment that never runs this is untidy rather than
-- wrong. Service role only, for the cron route.
create or replace function public.reap_stale_occupancy(p_grace interval default '5 minutes')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.world_occupancy
   where seen_at < now() - public.occupancy_ttl() - p_grace;

  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke execute on function public.reap_stale_occupancy(interval) from public, authenticated, anon;

-- ============================================================================
-- 8. What an event's guests may append
-- ----------------------------------------------------------------------------
-- Rebased on the version in 20260813000000, which was itself rebased on
-- 20260803060000. Every existing clause is preserved verbatim - the header of
-- that migration explains what silently breaks when one is dropped, and the
-- `can_act_in_battle` clause has already been lost once that way.
--
-- Two clauses are added, and they are deliberately not one:
--
--   `lounge_chunk` is checked per world, because a room may refuse building
--   while its lobby allows it.
--   Everything else is checked per stream type.
--
-- `stream_type <> 'tenant'` is not stated, and does not need to be: no
-- capability maps to `tenant` in `stream_capability()`, so renaming the space,
-- inviting members, changing publicity and flipping the staff switches are
-- outside a guest's reach by construction rather than by a clause somebody
-- could delete. That is the safer place for that rule to live.
-- ============================================================================

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
      -- ...unless this is an event, and the event says otherwise.
      or (
        stream_type = 'lounge_chunk'
        and public.is_tenant_guest(tenant_id)
        and public.event_guest_may_build(
              tenant_id,
              coalesce((data ->> 'worldId')::uuid, tenant_id)
            )
      )
      or (
        stream_type <> 'lounge_chunk'
        and public.is_tenant_guest(tenant_id)
        and public.event_guest_may_write(tenant_id, stream_type)
      )
    )
  );

-- ----------------------------------------------------------------------------
-- Chat is not event-sourced, so it needs the same rule written again
-- ----------------------------------------------------------------------------
-- `chat_messages_read_model` is written directly rather than projected, so the
-- policy above does not cover it. Rebased from 20260816000000 with the guest
-- clause added and the member clause untouched.
-- ----------------------------------------------------------------------------

drop policy if exists "chat_messages_insert_member" on public.chat_messages_read_model;

create policy "chat_messages_insert_member"
  on public.chat_messages_read_model for insert
  to authenticated
  with check (
    public.is_tenant_member(tenant_id)
    or (
      public.is_tenant_guest(tenant_id)
      and public.event_guest_may_write(tenant_id, 'chat_message')
    )
  );
