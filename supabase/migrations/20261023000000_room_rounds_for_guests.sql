-- ============================================================================
-- A guest may deal
-- ----------------------------------------------------------------------------
-- From a report of one sentence, seen by the person and not by the guest:
--
--   Failed to append to stream af466886-…: new row violates row-level security
--   policy for table "events"
--
-- A visitor walked in on a link, stood in a room that is a level, and pressed
-- the one button that room has. `atTable` (src/domain/rooms/actions.ts) admits
-- guests on purpose and says why - a round is a table saying "we are playing
-- now", and the people at the table are the people who came - and `XpRoom`
-- offers the button to everybody standing there. The database was never told,
-- so the click died at the boundary with a sentence about a stream id.
--
-- 20261018000000 is where the two parted: "any member, exactly as any member
-- may start one" was written when a room event could only ever come from an
-- admin, and the guest at the table arrived afterwards.
--
-- ----------------------------------------------------------------------------
-- Two event types, not a stream type
-- ----------------------------------------------------------------------------
-- The obvious repair - hand guests the `room` stream through
-- `event_guest_may_write` - is the wrong size. That path exists and stays as it
-- is: an event's staff tick "rooms" to let attendees *open* one, and it grants
-- the whole aggregate, closing and renaming included, because that is what
-- overflow needs.
--
-- Dealing is not that. It is the only thing on this stream a person with no
-- standing in the space should be able to say, so the branch names the two
-- events rather than the stream they live on. Reading `type` here is the same
-- move the `lounge_chunk` branch already makes on `data ->> 'worldId'`: the
-- policy is allowed to know what is being written, and a rule stated as "these
-- two facts" cannot be widened by a later event type nobody has thought about.
--
-- What a guest can therefore do that they could not this morning: shut the door
-- of a room they are standing in, and open it again. Both are recorded with
-- their id, both are undone by any member pressing the same button, and neither
-- outlives the round. That is the whole hole, and it is the one the button was
-- already promising.
--
-- Rebased from 20260903000000 clause for clause. Rewriting this policy from an
-- older copy has silently dropped a branch before - see the note there - so the
-- text below is that file's, plus the last `or`.
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
      -- The platform, operating a space it does not belong to.
      or public.is_backoffice_admin()
      -- Somebody at the table, dealing. See the header.
      or (
        stream_type = 'room'
        and type in ('RoundStarted', 'RoundReopened')
        and public.is_tenant_guest(tenant_id)
      )
    )
  );

-- ============================================================================
-- And the listing has to be able to hear it
-- ----------------------------------------------------------------------------
-- Letting the event through is half of it. `run()` appends and then projects,
-- in the caller's own session, so a guest whose event lands and whose UPDATE is
-- refused gets the worst possible outcome: no error - an UPDATE that matches no
-- row under RLS is zero rows, not a failure - a checkpoint that moves past the
-- event anyway, and a door that never shuts. Silence, and then the fact is
-- gone.
--
-- That is not hypothetical and it is not only about rounds. An event's guest
-- with the "rooms" capability can already open an overflow room today: the
-- append succeeds, `rooms_insert` refuses the row, the checkpoint advances, and
-- the room exists in the log and in no list. Both are the same bug, which is
-- why both policies move together here.
--
-- The shape is `tenant_role() is not null` - anybody the space has admitted -
-- which is what 20260820000000 said this table was doing all along ("the same
-- shape the battlefields table uses"). Battlefields, battles, battle scores and
-- homesteads all read that way; rooms alone said `is_tenant_member`, and the
-- day a guest could cause a room event was the day that drifted into a bug.
--
-- It is not the authorization boundary and it was never claiming to be: what a
-- guest may *cause* is decided one policy up, on the log, where the events
-- policy above names two types and refuses the rest. This table is derived, so
-- the cost of widening it is that a guest could PATCH a listing directly and
-- have it stand until the next event for that room rewrites the row - exactly
-- the exposure `battles_read_model` has carried since guests could join a
-- match, taken knowingly and for the same reason.
-- ============================================================================

drop policy if exists "rooms_insert" on public.rooms_read_model;

create policy "rooms_insert"
  on public.rooms_read_model for insert
  to authenticated
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "rooms_update" on public.rooms_read_model;

create policy "rooms_update"
  on public.rooms_read_model for update
  to authenticated
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);
