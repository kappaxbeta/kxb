-- ============================================================================
-- Where people come in
-- ----------------------------------------------------------------------------
-- A published world can say where its door is (see `BuilderWorld.spawn`), and
-- the point of saying so is that a space which pulls that world in gets people
-- arriving at the door rather than at the origin - which, in an arena laid out
-- around a corner of the map, is outside it.
--
-- ---------------------------------------------------------------------------
-- Why a table and not an event
-- ---------------------------------------------------------------------------
-- The obvious home is the battlefield aggregate: it is the thing that owns a
-- world's identity. Adding it there means a new event type, a new command, a
-- projection change and a column - four moving parts for two integers that are
-- *not* a fact about the world's history. Nobody will ever ask when the spawn
-- moved, and no decision anywhere replays it.
--
-- What it actually is: a hint the client reads on join. So it is a row keyed by
-- world id, written when a world is copied in and overwritten if it is copied
-- again - the same shape `world_occupancy` has, and for the same reason.
--
-- The height is deliberately not here. Where the ground is at that column is
-- something the world knows better than whoever marked the door, and it changes
-- every time somebody builds there - so the client resolves it with `surfaceAt`
-- on arrival. Storing a y would mean a spawn that floats a metre up the day
-- somebody digs under it.
-- ============================================================================

create table if not exists public.world_spawns (
  /** The world this door belongs to: a battlefield id, a room id, or a tenant's lounge. */
  world_id   uuid        primary key,
  /** Whose space it is in. The whole access story - see the policies below. */
  tenant_id  uuid        not null references public.tenants_read_model (id) on delete cascade,
  x          integer     not null,
  z          integer     not null,
  updated_at timestamptz not null default now()
);

create index if not exists world_spawns_tenant_idx on public.world_spawns (tenant_id);

alter table public.world_spawns enable row level security;

-- Read: anybody who is in the space. A guest at an event is in the space and
-- has to spawn somewhere too, so this is `tenant_role is not null` rather than
-- the owner/admin pair - the same reach the block table's select policy has.
create policy "world_spawns_select"
  on public.world_spawns for select
  to authenticated
  using (public.tenant_role(tenant_id) is not null);

-- Write: the pair that may shape a world at all. Moving where everybody arrives
-- is a layout decision, not a visit.
create policy "world_spawns_write"
  on public.world_spawns for insert
  to authenticated
  with check (public.tenant_role(tenant_id) in ('owner', 'admin'));

create policy "world_spawns_update"
  on public.world_spawns for update
  to authenticated
  using (public.tenant_role(tenant_id) in ('owner', 'admin'))
  with check (public.tenant_role(tenant_id) in ('owner', 'admin'));

create policy "world_spawns_delete"
  on public.world_spawns for delete
  to authenticated
  using (public.tenant_role(tenant_id) in ('owner', 'admin'));
