-- An XP you can be in together.
--
-- One Realtime topic per room, `xp:<room>`, carrying presence and position
-- broadcasts. Nothing durable goes over it: a position at 8 Hz written to a log
-- is a log that grows by a million rows an hour, and what has to survive a
-- refresh goes through the document and the battle stream instead.
--
-- ---------------------------------------------------------------------------
-- What this grants, and what it deliberately does not
-- ---------------------------------------------------------------------------
-- Any signed-in person may join any `xp:` topic. The room id is the secret, and
-- that is a smaller claim than the lounge's or a battle's - both of those check
-- membership of something, because both are attached to a private space with a
-- roster to check against.
--
-- An XP room has no roster yet. It is created by whoever opens the link, joined
-- by whoever is sent it, and holds nothing but where people are standing for as
-- long as they are standing there. The honest reading is that a room id is a
-- capability: hold it and you are in, which is what "send this link to a friend
-- and test it" means and is the whole point of the feature.
--
-- The moment an XP room belongs to a *match* - a battle with a roster - the
-- check that belongs here is `is_battle_participant`, exactly as the battle
-- topics already do. That is the next migration, not this one, and it is why the
-- topic parser below is a separate function rather than inlined: it is the part
-- that stays.
--
-- Added alongside the existing policies rather than replacing them. Policies for
-- one command are OR-ed, so `lounge:`, `battle:` and `chat:` topics keep working
-- exactly as they did and `xp:` topics become reachable.

/**
 * The room a topic refers to, or NULL if the topic is not one.
 *
 * Returns text rather than uuid: an XP room is not always a battle, so a room
 * id may be any short opaque string somebody was sent. It is still validated -
 * an empty tail, or anything with a colon in it, is not a room, because a topic
 * that parses loosely is one somebody can widen.
 */
create or replace function public.xp_room_topic(p_topic text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_room text;
begin
  if p_topic is null or left(p_topic, 3) <> 'xp:' then
    return null;
  end if;
  v_room := substring(p_topic from 4);
  if v_room = '' or v_room like '%:%' or length(v_room) > 64 then
    return null;
  end if;
  return v_room;
exception
  when others then
    return null;
end;
$$;

comment on function public.xp_room_topic(text) is
  'Room id embedded in an xp:<room> Realtime topic, or NULL.';

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
