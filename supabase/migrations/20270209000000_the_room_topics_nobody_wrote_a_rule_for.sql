-- ============================================================================
-- The topics a room opens, and the rules nobody wrote for them
-- ----------------------------------------------------------------------------
-- Two channels are refused by Realtime on every join, and have been since the
-- day each was scoped to a world:
--
--   things:<tenant>            -- use-things.ts, the live half of the thingiverse
--   things:<tenant>:<world>
--   chat:<tenant>:<world>      -- chat-dock.tsx, a conversation per room
--
-- `things:` has never had a policy at all - not even for the bare form - so
-- every crate somebody moved moved for nobody. `chat:` has one, but
-- `chat_topic_tenant` casts *everything* after the prefix to a uuid, so it
-- reads the three-segment form as malformed and returns NULL. Both failures
-- have the shape the rooms migration warned about: "the policy denies, the join
-- fails, and the room is silently empty for everybody in it". Prod had 2290 of
-- the first and 94 of the second in one log window.
--
-- Added beside the existing policies rather than replacing them, for the reason
-- the battles migration gives: policies for one command are OR-ed, so `chat:`
-- keeps its bare form exactly as it was and gains the scoped one.
--
-- ---------------------------------------------------------------------------
-- Why not `can_enter_room`, which is right there
-- ---------------------------------------------------------------------------
-- Because the second segment is not always a room. `worldId` in the scene is
-- whatever world is being drawn that is not the lounge, and that is three
-- different things: a room id from `rooms_read_model`, a homestead stream id -
-- `uuidv5(tenant:user)`, which has no row anywhere - and an arena. Gating on
-- `can_enter_room` would authorize the first and silently keep refusing the
-- other two, which is the bug again with a smaller blast radius.
--
-- So the rule is the one the homestead's own presence topic already uses -
-- membership of the tenant named in the topic - narrowed by the one extra fact
-- `can_enter_room` knows and it does not: a room that has been closed is not a
-- room you may talk in. For anything that is not a room, there is nothing to
-- check and the membership rule stands alone. That makes this exactly as strong
-- as `can_enter_room` everywhere `can_enter_room` applies, and no weaker than
-- `room_presence_read` everywhere it does not.
-- ============================================================================

/**
 * Is this world open to talk in?
 *
 * NULL-safe on purpose: a world id that names no room is not a closed room, it
 * is a homestead or an arena, and those carry no door of their own. The only
 * thing this refuses is a world that *is* a room and is either shut or in
 * somebody else's workspace - the latter being the reason the tenant is passed
 * in rather than read back out of the row.
 *
 * `security definer` because `rooms_read_model` is not readable by the caller,
 * the same reason `can_enter_room` is one. It answers a boolean about a row the
 * caller named, and returns no part of it.
 */
create or replace function public.world_topic_open(p_tenant uuid, p_world uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.rooms_read_model r
    where r.room_id = p_world
      and (r.closed or r.tenant_id is distinct from p_tenant)
  );
$$;

grant execute on function public.world_topic_open(uuid, uuid) to authenticated;

comment on function public.world_topic_open(uuid, uuid) is
  'False only when the world names a room that is closed or belongs elsewhere.';

/**
 * The tenant a bare things topic refers to, or NULL.
 *
 * A near-copy of `chat_topic_tenant`, and deliberately not a generalisation of
 * it - see the note in 20260818010000 for why a parameterised prefix helper is
 * refused here. Strict about the bare form: the scoped one is a different
 * question with a different answer, and the two parsers below own it.
 */
create or replace function public.things_topic_tenant(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_topic is null or left(p_topic, 7) <> 'things:' then
    return null;
  end if;
  return substring(p_topic from 8)::uuid;
exception
  when others then
    return null;
end;
$$;

comment on function public.things_topic_tenant(text) is
  'Tenant id embedded in a things:<uuid> Realtime topic, or NULL.';

/**
 * The tenant half of a world-scoped things topic, or NULL.
 *
 * Both halves are cast, and the tail is rebuilt from the two of them and
 * compared: `a:b:c` splits into a first and second part perfectly happily, and
 * accepting it would leave `split_part` quietly deciding what a third segment
 * meant. Same reasoning as `xp_room_topic`, which validates each half for the
 * same reason.
 */
create or replace function public.things_room_topic_tenant(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  v_tail text;
  v_tenant uuid;
  v_world uuid;
begin
  if p_topic is null or left(p_topic, 7) <> 'things:' then
    return null;
  end if;
  v_tail := substring(p_topic from 8);
  v_tenant := split_part(v_tail, ':', 1)::uuid;
  v_world := split_part(v_tail, ':', 2)::uuid;
  if v_tail <> v_tenant::text || ':' || v_world::text then
    return null;
  end if;
  return v_tenant;
exception
  when others then
    return null;
end;
$$;

comment on function public.things_room_topic_tenant(text) is
  'Tenant id in a things:<tenant>:<world> Realtime topic, or NULL.';

/** The world half of the same topic. See `things_room_topic_tenant`. */
create or replace function public.things_room_topic_world(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  v_tail text;
  v_tenant uuid;
  v_world uuid;
begin
  if p_topic is null or left(p_topic, 7) <> 'things:' then
    return null;
  end if;
  v_tail := substring(p_topic from 8);
  v_tenant := split_part(v_tail, ':', 1)::uuid;
  v_world := split_part(v_tail, ':', 2)::uuid;
  if v_tail <> v_tenant::text || ':' || v_world::text then
    return null;
  end if;
  return v_world;
exception
  when others then
    return null;
end;
$$;

comment on function public.things_room_topic_world(text) is
  'World id in a things:<tenant>:<world> Realtime topic, or NULL.';

/** The tenant half of a world-scoped chat topic. See `things_room_topic_tenant`. */
create or replace function public.chat_room_topic_tenant(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  v_tail text;
  v_tenant uuid;
  v_world uuid;
begin
  if p_topic is null or left(p_topic, 5) <> 'chat:' then
    return null;
  end if;
  v_tail := substring(p_topic from 6);
  v_tenant := split_part(v_tail, ':', 1)::uuid;
  v_world := split_part(v_tail, ':', 2)::uuid;
  if v_tail <> v_tenant::text || ':' || v_world::text then
    return null;
  end if;
  return v_tenant;
exception
  when others then
    return null;
end;
$$;

comment on function public.chat_room_topic_tenant(text) is
  'Tenant id in a chat:<tenant>:<world> Realtime topic, or NULL.';

/** The world half of the same topic. See `chat_room_topic_tenant`. */
create or replace function public.chat_room_topic_world(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
declare
  v_tail text;
  v_tenant uuid;
  v_world uuid;
begin
  if p_topic is null or left(p_topic, 5) <> 'chat:' then
    return null;
  end if;
  v_tail := substring(p_topic from 6);
  v_tenant := split_part(v_tail, ':', 1)::uuid;
  v_world := split_part(v_tail, ':', 2)::uuid;
  if v_tail <> v_tenant::text || ':' || v_world::text then
    return null;
  end if;
  return v_world;
exception
  when others then
    return null;
end;
$$;

comment on function public.chat_room_topic_world(text) is
  'World id in a chat:<tenant>:<world> Realtime topic, or NULL.';

-- ---------------------------------------------------------------------------
-- The lounge's own things, which never had a rule
-- ---------------------------------------------------------------------------
-- Membership of the workspace, the same rule the lounge's blocks and its
-- presence already use. A thing in the lounge is as public as the lounge is.
drop policy if exists "things_read" on realtime.messages;
create policy "things_read"
  on realtime.messages for select
  to authenticated
  using (
    public.tenant_role(public.things_topic_tenant(realtime.topic())) is not null
  );

-- Sending. Guests included, exactly as the chat and lounge policies admit them:
-- what a guest may actually *do* to a thing is decided by the actions in
-- `domain/thingiverse`, which re-check at the boundary. A forged broadcast puts
-- a crate on other people's screens that no row backs, and so nothing that
-- survives a refresh.
drop policy if exists "things_write" on realtime.messages;
create policy "things_write"
  on realtime.messages for insert
  to authenticated
  with check (
    public.tenant_role(public.things_topic_tenant(realtime.topic())) is not null
  );

-- ---------------------------------------------------------------------------
-- The same, for a world inside the workspace
-- ---------------------------------------------------------------------------
drop policy if exists "things_room_read" on realtime.messages;
create policy "things_room_read"
  on realtime.messages for select
  to authenticated
  using (
    public.tenant_role(public.things_room_topic_tenant(realtime.topic())) is not null
    and public.world_topic_open(
      public.things_room_topic_tenant(realtime.topic()),
      public.things_room_topic_world(realtime.topic())
    )
  );

drop policy if exists "things_room_write" on realtime.messages;
create policy "things_room_write"
  on realtime.messages for insert
  to authenticated
  with check (
    public.tenant_role(public.things_room_topic_tenant(realtime.topic())) is not null
    and public.world_topic_open(
      public.things_room_topic_tenant(realtime.topic()),
      public.things_room_topic_world(realtime.topic())
    )
  );

-- ---------------------------------------------------------------------------
-- And the conversation held in that world
-- ---------------------------------------------------------------------------
drop policy if exists "chat_room_read" on realtime.messages;
create policy "chat_room_read"
  on realtime.messages for select
  to authenticated
  using (
    public.tenant_role(public.chat_room_topic_tenant(realtime.topic())) is not null
    and public.world_topic_open(
      public.chat_room_topic_tenant(realtime.topic()),
      public.chat_room_topic_world(realtime.topic())
    )
  );

drop policy if exists "chat_room_write" on realtime.messages;
create policy "chat_room_write"
  on realtime.messages for insert
  to authenticated
  with check (
    public.tenant_role(public.chat_room_topic_tenant(realtime.topic())) is not null
    and public.world_topic_open(
      public.chat_room_topic_tenant(realtime.topic()),
      public.chat_room_topic_world(realtime.topic())
    )
  );
