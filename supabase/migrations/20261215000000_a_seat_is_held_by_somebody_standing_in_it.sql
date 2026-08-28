-- A guest seat should be held by somebody who is here, not by somebody who was.
--
-- ---------------------------------------------------------------------------
-- The bug
-- ---------------------------------------------------------------------------
-- `tenant_guest_count` counted every admitted guest whose admission had not
-- expired, and an admission lasts `ADMISSION_TTL_HOURS` - twelve hours. So the
-- cap was never counting who was in the space. It counted everybody who had
-- walked in since breakfast.
--
-- On a space with the default cap of eight, that is a door which shuts for the
-- rest of the day once eight people have looked in, however briefly and however
-- long ago they left. It was found the way these things usually are: six test
-- visitors could not get into a room that was standing empty.
--
-- ---------------------------------------------------------------------------
-- Why not simply shorten the admission
-- ---------------------------------------------------------------------------
-- Because those twelve hours do a second, useful job: they are what lets a
-- guest close the tab, come back after lunch, and still be the same person with
-- the same name rather than a stranger at the door again. Shortening it to fix
-- capacity would trade one real feature for another.
--
-- The two questions are simply different. *May this person come in* is about
-- admission and belongs to `expires_at`. *Is there room* is in the present
-- tense, and until now nothing answered it.
--
-- ---------------------------------------------------------------------------
-- Presence already exists, and this asks it rather than inventing a second one
-- ---------------------------------------------------------------------------
-- The first attempt at this added a `last_seen_at` column, an RPC to stamp it
-- and a heartbeat component to call the RPC - all of which `world_occupancy`
-- has done since the event-spaces migration, for exactly this reason: room caps
-- are enforced on the server, and Realtime presence is not readable from there.
-- `<OccupancyBeacon>` already beats every ten seconds from inside every world
-- and deletes the row on the way out.
--
-- A second presence mechanism would have been a second thing to keep true, and
-- the two would have disagreed on some afternoon nobody was watching.

/**
 * How much slack a seat gets beyond the room's own occupancy TTL.
 *
 * `occupancy_ttl()` is twenty seconds, which is the right answer for "is this
 * room full" - it is asked at a door somebody is standing at, and it should
 * recover fast. It is the wrong answer for a *seat*, because a guest is still
 * using the space while reading the magazine, changing their avatar, or walking
 * between two rooms - none of which is standing in a world.
 *
 * Two minutes, and deliberately generous rather than tight: being slow to free
 * a seat costs the next visitor a short wait, while being quick to free one
 * hands somebody's place to a stranger while they are still looking at it.
 */
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
     and g.admitted_at is not null
     and (
       /*
        * Admitted a moment ago and not in a world yet.
        *
        * Without this the count has a hole exactly where it matters most: a
        * visitor who has just come through the door holds a row but has not
        * loaded a world, so a crowd arriving together would every one of them
        * be counted as absent and every one of them let in. Two minutes is
        * comfortably longer than a world takes to load on a bad connection.
        */
       g.admitted_at > now() - interval '2 minutes'
       or exists (
         select 1
           from public.world_occupancy o
          where o.tenant_id = g.tenant_id
            and o.user_id = g.guest_id
            and o.seen_at > now() - interval '2 minutes'
       )
     );
$$;

comment on function public.tenant_guest_count(uuid) is
  'How many guests are in this space right now. Counts presence via '
  'world_occupancy, not admission: somebody who left an hour ago still holds a '
  'valid admission and no longer holds a seat.';
