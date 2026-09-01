-- ============================================================================
-- The thingiverse: a shelf of blueprints, and the things summoned from them
-- ----------------------------------------------------------------------------
-- A space could already put two kinds of object in a world and neither of them
-- is this one. Blocks (`lounge_blocks_read_model`) are values at coordinates,
-- 58 of them, batched into chunk streams because a creative session places
-- several a second and none of them has an identity. The builder reaches the
-- whole 1,300-model catalogue and is an admin's offline tool - a JSON file on
-- somebody's machine, published as a whole world.
--
-- What was missing is the middle: *this* thing, here, now, with properties. A
-- ball that falls, a crate that blocks a doorway, a fountain that does not.
--
-- Two tables, because there are two nouns and the split is the one
-- `@kxb/xp/blueprints` already argues at length:
--
--   * a **blueprint** is the kind of thing. A model, how big, does it block,
--     does it fall, what it does when touched. Every ball falls the same way,
--     so how it falls is a fact about balls.
--   * a **thing** is one of them, standing somewhere. Where it is, which way it
--     faces, how big *this* one is.
--
-- Both are read models over their own event streams (`thingiverse_blueprint`,
-- `thingiverse_thing`), and both are kept by one projection with one checkpoint
-- - see src/domain/thingiverse/projection.ts for why these two share a cursor
-- when the lounge's three do not.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The shelf
-- ----------------------------------------------------------------------------
-- `spec` is jsonb rather than a row of columns, which is the one place this
-- differs from the goals and images beside it. The reason is what gets asked of
-- it: a query filters blueprints by who owns them and whether they are public,
-- and never by how bouncy they are. Nothing indexes a property, nothing joins
-- on one, and the whole value arrives and leaves together. Ten columns would
-- buy a migration per idea and no query.
--
-- Postgres therefore does not check it. `specSchema` and the decider's own
-- `assertSpec` are the check, which is where a guard on a *command* belongs
-- anyway - a column constraint would only catch the writes that got past the
-- aggregate, and nothing is meant to.
create table if not exists public.thingiverse_blueprints_read_model (
  -- Same id as the aggregate's stream_id.
  id          uuid        primary key,
  tenant_id   uuid        not null,
  /** What the shelf calls it. Not unique: two people may each have a "lamp". */
  name        text        not null,
  /** The whole `BlueprintSpec`. See the note above about why it is one value. */
  spec        jsonb       not null,
  /**
   * Whose it is.
   *
   * Not `placed_by`-style provenance - this is a permission. The owner and the
   * space's admins are the only people who may reshape, publish, hand over or
   * retire it, and the check lives in the decider because ownership is state
   * only the aggregate holds.
   */
  owner_id    uuid        not null,
  /**
   * 'private' or 'public'. Deliberately two words and not three: there is no
   * platform-wide value here even though "public" invites one, because every
   * row in this product is somebody's tenant's. A starter set for every space
   * is an operator-owned overlay (the `builtin_xps` shape), not a third value
   * on this column.
   *
   * No check constraint, matching `rooms_read_model.room_icon`: the reader
   * falls back to 'private' - the value that shares least - so a row from a
   * build newer than the reader is invisible rather than exposed.
   */
  visibility  text        not null default 'private',
  /**
   * Taken off the shelf. Soft, like every removal here.
   *
   * Things already standing in rooms are deliberately not swept away with it:
   * the room's read path resolves a thing's blueprint whether or not it is
   * retired, so retiring shortens the shelf and empties nobody's room.
   */
  retired     boolean     not null default false,
  created_at  timestamptz not null,
  updated_at  timestamptz not null,
  version     integer     not null
);

-- The shelf query: this space's, not retired, mine or public. Ordered by
-- creation, which is the order the rail draws.
create index if not exists thingiverse_blueprints_shelf_idx
  on public.thingiverse_blueprints_read_model (tenant_id, retired, created_at);

-- "What have I made", for the profile's own shelf.
create index if not exists thingiverse_blueprints_owner_idx
  on public.thingiverse_blueprints_read_model (tenant_id, owner_id);

-- ----------------------------------------------------------------------------
-- What is standing in a world
-- ----------------------------------------------------------------------------
-- Keyed by world rather than by tenant, exactly as the goals are and unlike the
-- images: a room's furniture appearing in the lounge would be a bug nobody can
-- explain. The lounge is the world whose id is the tenant's, which is the
-- convention every world-keyed table here already follows.
--
-- No foreign key to the blueprint, and that is deliberate rather than lazy: a
-- projection applies events in whatever order the log hands them over, so a key
-- would turn "this thing's blueprint has not projected yet" from a row that
-- resolves a moment later into a write that fails forever.
create table if not exists public.thingiverse_things_read_model (
  id           uuid        primary key,
  tenant_id    uuid        not null,
  /** The world it stands in. The tenant's own id means the lounge. */
  world_id     uuid        not null,
  /** Which blueprint it is one of. Not a foreign key - see above. */
  blueprint_id uuid        not null,
  -- Whole cells, on the same lattice the blocks, images and goals sit on. `y`
  -- is the cell its feet are in, not its middle.
  x            integer     not null,
  y            integer     not null,
  z            integer     not null,
  /** Quarter turns about Y: 0=north, 1=east, 2=south, 3=west. */
  facing       integer     not null default 0,
  /** Multiplier on top of the blueprint's own scale. */
  scale        real        not null default 1,
  /**
   * The two properties this one may disagree with its blueprint about: does it
   * block, and does it fall. Empty when it simply agrees, which is nearly
   * always - the release valve exists so the same crate can be a wall in the
   * corridor and a barrel on the ramp without being two blueprints.
   */
  tuning       jsonb       not null default '{}'::jsonb,
  deleted      boolean     not null default false,
  /** Who summoned it. A question people ask; not a permission. */
  placed_by    uuid,
  created_at   timestamptz not null,
  updated_at   timestamptz not null,
  version      integer     not null
);

create index if not exists thingiverse_things_world_idx
  on public.thingiverse_things_read_model (tenant_id, world_id, deleted);

-- ----------------------------------------------------------------------------
-- Policies
-- ----------------------------------------------------------------------------
-- Membership, and nothing finer, matching every other read model in the lounge.
-- The narrower rules - it is yours or you are an admin - are the decider's, and
-- they guard the *log*; these guard the table a projection writes with the
-- signed-in user's own session, so anything stricter here would refuse the
-- projection its own write.
alter table public.thingiverse_blueprints_read_model enable row level security;

drop policy if exists "thingiverse_blueprints_select_tenant" on public.thingiverse_blueprints_read_model;
create policy "thingiverse_blueprints_select_tenant"
  on public.thingiverse_blueprints_read_model for select
  using (public.tenant_role(tenant_id) is not null);

drop policy if exists "thingiverse_blueprints_insert_tenant" on public.thingiverse_blueprints_read_model;
create policy "thingiverse_blueprints_insert_tenant"
  on public.thingiverse_blueprints_read_model for insert
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "thingiverse_blueprints_update_tenant" on public.thingiverse_blueprints_read_model;
create policy "thingiverse_blueprints_update_tenant"
  on public.thingiverse_blueprints_read_model for update
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "thingiverse_blueprints_delete_tenant" on public.thingiverse_blueprints_read_model;
create policy "thingiverse_blueprints_delete_tenant"
  on public.thingiverse_blueprints_read_model for delete
  using (public.tenant_role(tenant_id) is not null);

alter table public.thingiverse_things_read_model enable row level security;

drop policy if exists "thingiverse_things_select_tenant" on public.thingiverse_things_read_model;
create policy "thingiverse_things_select_tenant"
  on public.thingiverse_things_read_model for select
  using (public.tenant_role(tenant_id) is not null);

drop policy if exists "thingiverse_things_insert_tenant" on public.thingiverse_things_read_model;
create policy "thingiverse_things_insert_tenant"
  on public.thingiverse_things_read_model for insert
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "thingiverse_things_update_tenant" on public.thingiverse_things_read_model;
create policy "thingiverse_things_update_tenant"
  on public.thingiverse_things_read_model for update
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "thingiverse_things_delete_tenant" on public.thingiverse_things_read_model;
create policy "thingiverse_things_delete_tenant"
  on public.thingiverse_things_read_model for delete
  using (public.tenant_role(tenant_id) is not null);

-- ----------------------------------------------------------------------------
-- The switch
-- ----------------------------------------------------------------------------
-- Off, like every flag guarding surface that has not shipped. What it gates is
-- the whole feature: the rail tab, the /thingiverse command, the shelf and what
-- the scene draws from it. Things already summoned stay in the log and come
-- back when it goes on again - this withholds the feature, it unplaces nothing.
insert into public.feature_flags (key, enabled, label, description) values
  ('thingiverse', false, 'Thingiverse',
   'A shelf of object blueprints a space can summon into its rooms: a model out of the packs, with its own size, whether it blocks the way and whether it falls. Off, the rail tab and the /thingiverse command are gone and nothing is drawn from the shelf. Things already summoned are kept and reappear when this goes back on.')
on conflict (key) do nothing;
