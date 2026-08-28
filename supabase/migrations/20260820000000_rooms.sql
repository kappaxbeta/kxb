-- ============================================================================
-- Rooms: more than one lounge
-- ----------------------------------------------------------------------------
-- A space has had exactly one room since the beginning, and that is its whole
-- limitation. Twelve people who want to do two things have to agree; somebody
-- laying out a build gets a football match through their wall; and the only way
-- to have a conversation nobody else is in is to not have it.
--
-- A room is another lounge. Same scene, same palette, same tools, same block
-- table - the only things it does not share with the space's lounge are its
-- *world* and its *channel*, which is precisely what makes it a different place
-- to stand rather than a different view of the same one.
--
-- Why this is not a battlefield, which it otherwise resembles closely enough to
-- be worth writing down:
--
--   * A battlefield is a world you *fight on*. People only meet in one through
--     a match, which brings its own roster and its own `battle:` topic, and it
--     can be published for other spaces to borrow.
--   * A room is a place you *stand*. It has presence of its own, so the people
--     in it are separated from the people in the lounge, and it never leaves
--     the space that opened it.
--
-- The room's id is its world id, exactly as a battlefield's is: the blocks go
-- in the lounge's chunk streams keyed by `world_id`, so nothing here has to
-- know what a voxel is.
-- ============================================================================

create table if not exists public.rooms_read_model (
  /** The room id. Also its world id, and the room aggregate's stream id. */
  room_id    uuid        primary key,
  /** The space that opened it, and the only one that can see or change it. */
  tenant_id  uuid        not null references public.tenants_read_model (id) on delete cascade,
  name       text        not null,
  /** Closed, not deleted - the blocks stay, only the listing goes. */
  closed     boolean     not null default false,
  created_by uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer     not null default 0
);

-- Partial, because the only question anybody asks of this table is "which rooms
-- can I walk into", and a closed one is not one of them.
create index if not exists rooms_tenant_idx
  on public.rooms_read_model (tenant_id)
  where closed = false;

alter table public.rooms_read_model enable row level security;

-- ----------------------------------------------------------------------------
-- Who may see and write the listing
-- ----------------------------------------------------------------------------
-- Read is `tenant_role()`, which includes guests: a visitor admitted to a space
-- should be able to see the rooms in it, or a guest link pointing at one would
-- lead somewhere they cannot find their way back to.
--
-- Write is the same shape the battlefields table uses and for the same reason -
-- the projection runs as whichever signed-in member's action triggered it, so
-- the owning space's people are the ones who need insert and update. It is not
-- the authorization boundary: `createRoom` checks the role, because *this*
-- table cannot tell an admin from a member. No delete policy at all; closing
-- sets a flag, and the read model is rebuilt from the log rather than edited.
-- ----------------------------------------------------------------------------
create policy "rooms_select"
  on public.rooms_read_model for select
  to authenticated
  using (public.tenant_role(tenant_id) is not null);

create policy "rooms_insert"
  on public.rooms_read_model for insert
  to authenticated
  with check (public.is_tenant_member(tenant_id));

create policy "rooms_update"
  on public.rooms_read_model for update
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- ============================================================================
-- The channel
-- ----------------------------------------------------------------------------
-- A room's whole point is that the people in it are not the people in the
-- lounge, and that separation is a Realtime topic or it is nothing.
--
-- The topic is `hall:<room uuid>`, and the prefix is `hall:` rather than the
-- obvious `room:` for a boring but load-bearing reason: `room:` is already
-- taken. Homesteads use `room:<tenant>:<place>:<owner>` (see
-- 20260731000000_homestead_doors_and_presence.sql), a four-segment shape whose
-- policy would sit alongside this one - policies for a command are OR-ed - and
-- two parsers disagreeing about what a `room:` topic means is exactly the kind
-- of overlap that grants access nobody intended. A distinct prefix cannot be
-- misread by either.
--
-- The cast is allowed to fail, for the reason `lounge_topic_tenant` explains at
-- length: Postgres does not guarantee AND short-circuits, so a malformed topic
-- has to be *denied* rather than raise.
-- ============================================================================

create or replace function public.hall_topic_room(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_topic is null or left(p_topic, 5) <> 'hall:' then
    return null;
  end if;
  return substring(p_topic from 6)::uuid;
exception
  when others then
    return null;
end;
$$;

comment on function public.hall_topic_room(text) is
  'Room id embedded in a hall:<uuid> Realtime topic, or NULL. See 20260820000000_rooms.sql for why not room:.';

/**
 * Who is allowed in a room.
 *
 * Standing in the space, and the room still being open. The second half is what
 * makes closing a room mean something at the wire level rather than only in the
 * listing: a client holding a link to a closed room is refused the topic, so it
 * cannot broadcast a body into a place the space has shut.
 *
 * SECURITY DEFINER because it is consulted from a policy on `realtime.messages`,
 * where the caller has no reason to hold read on this table directly - and
 * because making the answer depend on the reader's own RLS would be a policy
 * that quietly means something different per person.
 */
create or replace function public.can_enter_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rooms_read_model r
    where r.room_id = p_room_id
      and r.closed = false
      and public.tenant_role(r.tenant_id) is not null
  );
$$;

grant execute on function public.can_enter_room(uuid) to authenticated;

-- Added alongside the lounge's and the battle's policies rather than replacing
-- them: policies for one command are OR-ed, so `lounge:` and `battle:` topics
-- keep working exactly as they did and `hall:` topics become reachable.
drop policy if exists "hall_presence_read" on realtime.messages;
create policy "hall_presence_read"
  on realtime.messages for select
  to authenticated
  using (
    public.hall_topic_room(realtime.topic()) is not null
    and public.can_enter_room(public.hall_topic_room(realtime.topic()))
  );

drop policy if exists "hall_presence_write" on realtime.messages;
create policy "hall_presence_write"
  on realtime.messages for insert
  to authenticated
  with check (
    public.hall_topic_room(realtime.topic()) is not null
    and public.can_enter_room(public.hall_topic_room(realtime.topic()))
  );
