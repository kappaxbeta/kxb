-- ============================================================================
-- Read model: images placed in the lounge
-- ----------------------------------------------------------------------------
-- Blocks and images are both "things in the world", and the difference between
-- them is what decides the aggregate boundary.
--
-- A block has no identity. It is a value at a coordinate: placing one records
-- "cell (3,0,7) is now dirt". Two dirt blocks in the same cell are not two
-- things, which is why blocks batch into chunk streams and why placing the same
-- one twice is a no-op.
--
-- An image *is* an entity. It gets moved, resized and removed, and every one of
-- those refers to the same object across time. That is a lifecycle, and a
-- lifecycle gets its own stream - one per image, exactly like a task.
--
-- Note it stores an upload slug rather than a URL. The serving route resolves
-- the slug through RLS, so an image dropped into a private workspace stays as
-- private as the workspace is.
-- ============================================================================

create table if not exists public.lounge_images_read_model (
  -- Same id as the aggregate's stream_id.
  id          uuid        primary key,
  tenant_id   uuid        not null,
  /** The `uploads.slug` this renders. Not a URL - see the uploads migration. */
  upload_slug text        not null,
  -- Grid position: integers, on the same 1-unit lattice as the blocks.
  x           integer     not null,
  y           integer     not null,
  z           integer     not null,
  /** Size in cells, so an image spans whole grid squares like everything else. */
  width       integer     not null default 4,
  height      integer     not null default 3,
  /** Quarter turns about Y: 0=north, 1=east, 2=south, 3=west. */
  facing      integer     not null default 0,
  deleted     boolean     not null default false,
  placed_by   uuid,
  created_at  timestamptz not null,
  updated_at  timestamptz not null,
  version     integer     not null
);

create index if not exists lounge_images_tenant_idx
  on public.lounge_images_read_model (tenant_id, deleted);

alter table public.lounge_images_read_model enable row level security;

drop policy if exists "lounge_images_select_tenant" on public.lounge_images_read_model;
create policy "lounge_images_select_tenant"
  on public.lounge_images_read_model for select
  using (public.tenant_role(tenant_id) is not null);

drop policy if exists "lounge_images_insert_tenant" on public.lounge_images_read_model;
create policy "lounge_images_insert_tenant"
  on public.lounge_images_read_model for insert
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "lounge_images_update_tenant" on public.lounge_images_read_model;
create policy "lounge_images_update_tenant"
  on public.lounge_images_read_model for update
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "lounge_images_delete_tenant" on public.lounge_images_read_model;
create policy "lounge_images_delete_tenant"
  on public.lounge_images_read_model for delete
  using (public.tenant_role(tenant_id) is not null);
