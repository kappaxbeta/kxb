-- A topic may name which room of a level you are standing in.
--
-- `xp:<room>` becomes `xp:<room>/<scene>` - docs/xp/scenes.md §1.6. Two people
-- in different scenes are in different topics, so they do not see each other
-- because nothing is sent, rather than because something was filtered. Presence
-- is a topic; not being on one is free, and filtering one everybody is on is
-- work that grows with the room.
--
-- ---------------------------------------------------------------------------
-- The room is still the room, and that is what this function is for
-- ---------------------------------------------------------------------------
-- `roomId` stays the unit of a session: one instance, one set of players, one
-- arbiter. `abc/lobby` and `abc/cellar` are one game, so this splits the scene
-- back off and returns the part before the slash - which is the value the check
-- this file is waiting for will need. The original said so in as many words:
-- the topic parser is a separate function "because it is the part that stays",
-- and the moment an XP room belongs to a match, `is_battle_participant` goes
-- here. That check has to be given a room id, not a room id with a room of a
-- level glued to it.
--
-- ---------------------------------------------------------------------------
-- Both halves are validated, and the length is now per half
-- ---------------------------------------------------------------------------
-- The old rule was 64 characters for everything after `xp:`. Appending a scene
-- to a room id that was already near the limit would have pushed the topic past
-- it, and the failure is the worst shape there is: the policy denies, the join
-- fails, and the room is silently empty for everybody in it. So each half
-- carries its own 64 and the topic carries at most one slash.
--
-- Replayable, as every migration here has to be: `create or replace` and the
-- policies dropped before they are made.

create or replace function public.xp_room_topic(p_topic text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_tail text;
  v_room text;
  v_scene text;
begin
  if p_topic is null or left(p_topic, 3) <> 'xp:' then
    return null;
  end if;
  v_tail := substring(p_topic from 4);
  -- A colon still ends it: a topic that parses loosely is one somebody can
  -- widen into meaning something else.
  if v_tail = '' or v_tail like '%:%' then
    return null;
  end if;

  v_room := split_part(v_tail, '/', 1);
  v_scene := split_part(v_tail, '/', 2);

  -- At most one slash. `a/b/c` is not a room with a scene in it, it is a shape
  -- nothing writes, and accepting it would leave `split_part` quietly deciding
  -- what it meant.
  if strpos(v_tail, '/') > 0 and v_tail <> v_room || '/' || v_scene then
    return null;
  end if;

  if v_room = '' or length(v_room) > 64 then
    return null;
  end if;
  -- An empty tail after a slash is `abc/`, which is not the room `abc` and is
  -- not a scene either.
  if strpos(v_tail, '/') > 0 and (v_scene = '' or length(v_scene) > 64) then
    return null;
  end if;

  return v_room;
exception
  when others then
    return null;
end;
$$;

comment on function public.xp_room_topic(text) is
  'Room id embedded in an xp:<room> or xp:<room>/<scene> Realtime topic, or NULL.';

drop policy if exists "xp_room_read" on realtime.messages;
create policy "xp_room_read"
  on realtime.messages for select
  to authenticated
  using (public.xp_room_topic(realtime.topic()) is not null);

drop policy if exists "xp_room_write" on realtime.messages;
create policy "xp_room_write"
  on realtime.messages for insert
  to authenticated
  with check (public.xp_room_topic(realtime.topic()) is not null);
