-- ============================================================================
-- Read model: lounge blocks (Minecraft Creative Mode)
-- ----------------------------------------------------------------------------
-- This table is derived data. It is written *only* by the TypeScript projector
-- in src/domain/lounge/projection.ts, never by application code directly.
--
-- The primary key is (tenant_id, x, y, z), meaning each workspace has its own
-- unique spatial grid coordinates.
-- ============================================================================

create table if not exists public.lounge_blocks_read_model (
  tenant_id  uuid        not null,
  x          integer     not null,
  y          integer     not null,
  z          integer     not null,
  type       text        not null,
  color      text,
  placed_by  uuid        references auth.users (id) on delete set null,
  placed_at  timestamptz not null default now(),

  primary key (tenant_id, x, y, z)
);

create index if not exists lounge_blocks_read_model_tenant_idx
  on public.lounge_blocks_read_model (tenant_id);

-- ----------------------------------------------------------------------------
-- Row level security
-- ----------------------------------------------------------------------------
-- Reads and writes are scoped to members of the workspace.
-- ----------------------------------------------------------------------------

alter table public.lounge_blocks_read_model enable row level security;

create policy "lounge_blocks_read_model_select_tenant"
  on public.lounge_blocks_read_model for select
  using (public.tenant_role(tenant_id) is not null);

create policy "lounge_blocks_read_model_insert_tenant"
  on public.lounge_blocks_read_model for insert
  with check (public.tenant_role(tenant_id) is not null);

create policy "lounge_blocks_read_model_update_tenant"
  on public.lounge_blocks_read_model for update
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

create policy "lounge_blocks_read_model_delete_tenant"
  on public.lounge_blocks_read_model for delete
  using (public.tenant_role(tenant_id) is not null);
