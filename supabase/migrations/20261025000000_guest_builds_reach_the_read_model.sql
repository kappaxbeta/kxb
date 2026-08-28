-- ============================================================================
-- A guest's blocks, as far as the lounge
-- ----------------------------------------------------------------------------
-- The sibling of 20261023000000, found while writing it. An event's attendee
-- may build - 20260826000000 gave them `lounge_chunk` on the log, gated by the
-- event's "build" capability - and their blocks reach the log and stop there.
-- Three read models refuse them, and refuse them in two different ways:
--
--   * placing a *new* block is an INSERT, which RLS refuses out loud. The
--     projection throws, `placeBlocks` returns an error, and the checkpoint is
--     not written - so the event survives and the guest is told something
--     broke.
--   * painting over a block, moving an image, removing a block or clearing a
--     chunk are an UPDATE and a DELETE, and an UPDATE that matches no row under
--     RLS is zero rows and *not* an error. The projection sees success, the
--     batch ends, the checkpoint moves past the event, and the fact is gone.
--
-- Measured against the local database with a simulated guest at an open event,
-- all in one rolled-back transaction: `append_events` accepted `BlocksPlaced`
-- at version 1; the INSERT raised "new row violates row-level security policy";
-- the UPDATE reported 0 rows changed and the DELETE 0 rows removed, neither
-- raising; and the guest wrote a projection checkpoint without complaint.
--
-- ----------------------------------------------------------------------------
-- Why this is not the same shape as 20261023000000
-- ----------------------------------------------------------------------------
-- Rooms got `tenant_role(tenant_id) is not null` - anybody the space admitted -
-- because that is what its own file said it was doing and what battles,
-- battlefields and homesteads do. These three tables are different, and the
-- difference is a decision somebody already made: 20260813000000 names them in
-- a list headed *"everything a guest must not write"*, rewrites their write
-- policies from exactly that expression to `is_tenant_member`, and ends with an
-- assertion that fails the migration if any of them ever gets it back. Rooms is
-- not on that list; these three are the list.
--
-- That decision was right and stays. What changed underneath it is that
-- 20260826000000 - thirteen days later - gave a guest at an event a way to
-- *cause* one of these rows, and nobody widened the far end. So the repair is
-- not "let guests write the lounge"; it is "let the read model hear exactly
-- what the log already accepts", which is a strictly smaller statement:
--
--   is_tenant_member(tenant_id)
--   or (is_tenant_guest(tenant_id) and event_guest_may_write(tenant_id, <type>))
--
-- The second half is the same call the `events` insert policy makes, on the
-- same capability. A guest in an ordinary space - the case 20260813000000 was
-- written about - is refused by it, because `event_guest_may_write` answers
-- false for a space that is not an event. A guest at an event that did not tick
-- "build" is refused by it. It opens when the event opens and shuts when the
-- event shuts.
--
-- ----------------------------------------------------------------------------
-- The one place it is deliberately looser than the log
-- ----------------------------------------------------------------------------
-- Blocks are keyed by world, and the log's rule is per world:
-- `event_guest_may_build(tenant_id, worldId)` also reads the *room's*
-- `guest_build` flag, so a guest may build in the hall and not in the sponsor's
-- room. The policy below asks the event-level question instead and does not
-- look at `world_id`.
--
-- That is not laziness, it is the projection. A projector applies every event
-- in the tenant's log, not only the ones the person running it caused - so a
-- policy that refused a guest the rooms they may not build in would silently
-- drop a *member's* blocks in those rooms, which is the bug at the top of this
-- file wearing a smaller hat. The read model's write policy has to cover
-- everything the projector might apply, and the question "may this person build
-- here" belongs on the log, where it already is and where it is enforced.
--
-- What that costs, stated plainly: a guest at an open event with "build" on can
-- PATCH one of these tables directly, including rows for a room whose
-- `guest_build` is off, and it will stand until the next event for that chunk
-- rewrites it. They cannot append the event that would make it true, so the
-- forgery is visible to a replay and dies at the next `reset`. It is the same
-- exposure every read model in this repo carries in exchange for being written
-- by the session that caused it.
--
-- Two edges are left, and neither is new - both are today's behaviour, made
-- rarer rather than introduced. A guest still admitted after the event's window
-- closes, or after an admin turns "build" off mid-event, is once again a
-- session that can advance a checkpoint past an event it cannot apply. The real
-- fix for that is a projector that refuses to move its checkpoint over a write
-- it could not make, which is a change to `runProjection` and not to a policy.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Blocks. `public` rather than `authenticated` on the role, preserving what
-- 20260813000000's rewrite left - the anon key reaches these tables through the
-- select policies and has never had a write path.
-- ----------------------------------------------------------------------------

drop policy if exists "lounge_blocks_read_model_insert_tenant" on public.lounge_blocks_read_model;

create policy "lounge_blocks_read_model_insert_tenant"
  on public.lounge_blocks_read_model for insert
  with check (
    public.is_tenant_member(tenant_id)
    or (
      public.is_tenant_guest(tenant_id)
      and public.event_guest_may_write(tenant_id, 'lounge_chunk')
    )
  );

drop policy if exists "lounge_blocks_read_model_update_tenant" on public.lounge_blocks_read_model;

create policy "lounge_blocks_read_model_update_tenant"
  on public.lounge_blocks_read_model for update
  using (
    public.is_tenant_member(tenant_id)
    or (
      public.is_tenant_guest(tenant_id)
      and public.event_guest_may_write(tenant_id, 'lounge_chunk')
    )
  )
  with check (
    public.is_tenant_member(tenant_id)
    or (
      public.is_tenant_guest(tenant_id)
      and public.event_guest_may_write(tenant_id, 'lounge_chunk')
    )
  );

-- `BlocksRemoved` and `ChunkCleared` are the only deletes in this projection,
-- and a guest who may place may also take back - the aggregate says so, and a
-- build session where the rubber cannot reach what the pencil drew is not one.
drop policy if exists "lounge_blocks_read_model_delete_tenant" on public.lounge_blocks_read_model;

create policy "lounge_blocks_read_model_delete_tenant"
  on public.lounge_blocks_read_model for delete
  using (
    public.is_tenant_member(tenant_id)
    or (
      public.is_tenant_guest(tenant_id)
      and public.event_guest_may_write(tenant_id, 'lounge_chunk')
    )
  );

-- ----------------------------------------------------------------------------
-- Images and goals, which are the same capability under a different stream
-- type - `stream_capability()` maps all three to "build". Named separately
-- rather than passed 'lounge_chunk' three times, so that the day one of them
-- gets its own capability this file is already asking the right question.
-- ----------------------------------------------------------------------------

drop policy if exists "lounge_images_insert_tenant" on public.lounge_images_read_model;

create policy "lounge_images_insert_tenant"
  on public.lounge_images_read_model for insert
  with check (
    public.is_tenant_member(tenant_id)
    or (
      public.is_tenant_guest(tenant_id)
      and public.event_guest_may_write(tenant_id, 'lounge_image')
    )
  );

drop policy if exists "lounge_images_update_tenant" on public.lounge_images_read_model;

create policy "lounge_images_update_tenant"
  on public.lounge_images_read_model for update
  using (
    public.is_tenant_member(tenant_id)
    or (
      public.is_tenant_guest(tenant_id)
      and public.event_guest_may_write(tenant_id, 'lounge_image')
    )
  )
  with check (
    public.is_tenant_member(tenant_id)
    or (
      public.is_tenant_guest(tenant_id)
      and public.event_guest_may_write(tenant_id, 'lounge_image')
    )
  );

drop policy if exists "lounge_images_delete_tenant" on public.lounge_images_read_model;

create policy "lounge_images_delete_tenant"
  on public.lounge_images_read_model for delete
  using (
    public.is_tenant_member(tenant_id)
    or (
      public.is_tenant_guest(tenant_id)
      and public.event_guest_may_write(tenant_id, 'lounge_image')
    )
  );

-- Goals keep `to authenticated` from 20260804000000, and keep having no delete
-- policy: `GoalRemoved` is a flag on the row, not a missing row.
drop policy if exists "lounge_goals_insert_tenant" on public.lounge_goals_read_model;

create policy "lounge_goals_insert_tenant"
  on public.lounge_goals_read_model for insert
  to authenticated
  with check (
    public.is_tenant_member(tenant_id)
    or (
      public.is_tenant_guest(tenant_id)
      and public.event_guest_may_write(tenant_id, 'lounge_goal')
    )
  );

drop policy if exists "lounge_goals_update_tenant" on public.lounge_goals_read_model;

create policy "lounge_goals_update_tenant"
  on public.lounge_goals_read_model for update
  to authenticated
  using (
    public.is_tenant_member(tenant_id)
    or (
      public.is_tenant_guest(tenant_id)
      and public.event_guest_may_write(tenant_id, 'lounge_goal')
    )
  )
  with check (
    public.is_tenant_member(tenant_id)
    or (
      public.is_tenant_guest(tenant_id)
      and public.event_guest_may_write(tenant_id, 'lounge_goal')
    )
  );
