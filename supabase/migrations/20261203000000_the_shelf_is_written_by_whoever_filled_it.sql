-- ============================================================================
-- The shelf is written by whoever filled it
-- ----------------------------------------------------------------------------
-- `20261129000000_a_shelf_that_belongs_to_the_space.sql` gave
-- `magazine_read_model` a select policy and deliberately no others, arguing:
--
--   "Nobody writes it directly. The rows are projected, and the projection runs
--    as the service role, so there is no insert or update policy at all rather
--    than a narrow one."
--
-- The argument is sound and the premise is false. Projections in this codebase
-- run **inline in the request, on the caller's own client** - see
-- `runProjection`, called at the end of every action with the same `supabase`
-- that executed the command. There is no service role anywhere on that path.
--
-- So the first person to press "take in" got:
--
--   magazine projection failed: new row violates row-level security policy
--   for table "magazine_read_model"
--
-- after the event had already been appended. The log was right and the read
-- model was empty, which is the failure mode a projection that cannot write
-- always has: the space had taken the XP in, and nothing could see it.
--
-- ----------------------------------------------------------------------------
-- Member-scoped, which is what every other read model here says
-- ----------------------------------------------------------------------------
-- `battles_read_model` puts it in one line - "the projection runs as the
-- signed-in member, so writing is scoped to the hosting space" - and tasks,
-- pages, agents, the board and both lounge tables all say the same. The
-- magazine was the one table that tried to be stricter, and stricter than the
-- mechanism allows is not stricter, it is broken.
--
-- What the original comment was protecting against is still worth naming: a
-- member who writes here directly puts an XP on the shelf with no event behind
-- it, and the log stops being the story of the space. That is true of every
-- read model in this system and the answer is the same for all of them - the
-- surfaces write events, and a row without one is a row that the next replay
-- removes.
--
-- Delete as well as insert, unlike battles. `XpPutBack` genuinely removes the
-- row - a shelf is a collection, and taking something off it is not a state
-- change on an entry that stays.
-- ============================================================================

drop policy if exists "magazine_insert" on public.magazine_read_model;
drop policy if exists "magazine_update" on public.magazine_read_model;
drop policy if exists "magazine_delete" on public.magazine_read_model;

create policy "magazine_insert"
  on public.magazine_read_model for insert
  to authenticated
  with check (public.tenant_role(tenant_id) is not null);

-- The upsert `XpTakenIn` makes lands on update when the row is already there,
-- which the decider allows as a no-op - so without this, taking in something
-- already on the shelf would fail where taking in something new succeeded.
create policy "magazine_update"
  on public.magazine_read_model for update
  to authenticated
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

create policy "magazine_delete"
  on public.magazine_read_model for delete
  to authenticated
  using (public.tenant_role(tenant_id) is not null);
