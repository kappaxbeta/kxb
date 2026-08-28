-- ============================================================================
-- Worlds
-- ----------------------------------------------------------------------------
-- The lounge's block table was keyed by tenant, because a workspace had exactly
-- one world and so "which tenant" and "which world" were the same question.
-- Battlefields make them different questions: a space can save several arenas
-- and still have its lounge, and all of them are voxel worlds built with the
-- same tools, stored in the same chunk streams, projected into this same table.
--
-- So the tenant column stays - it is what every RLS policy consults, and a
-- battlefield still belongs to the space that made it - and `world_id` is added
-- beside it to say *which* of that space's worlds a block is in.
--
-- Existing rows are the tenant's lounge, so they backfill to `world_id =
-- tenant_id`. That is the same default `worldOf()` applies in TypeScript when
-- it reads an event written before this column existed, and the two have to
-- agree: a projection replaying old history must land on the rows the backfill
-- produced, or the world doubles.
-- ============================================================================

alter table public.lounge_blocks_read_model
  add column if not exists world_id uuid;

update public.lounge_blocks_read_model
  set world_id = tenant_id
  where world_id is null;

alter table public.lounge_blocks_read_model
  alter column world_id set not null;

-- The primary key widens rather than moves. Dropping and recreating is the only
-- way to change a PK's columns, and it is safe here because the new key is a
-- superset of the old one - no two rows that were distinct before can collide
-- now.
alter table public.lounge_blocks_read_model
  drop constraint if exists lounge_blocks_read_model_pkey;

alter table public.lounge_blocks_read_model
  add constraint lounge_blocks_read_model_pkey
  primary key (tenant_id, world_id, x, y, z);

-- The chunk index is what "load this world" reads through, so it gains the
-- world too. Without it, loading one battlefield scans every block the space
-- has ever placed in any of them.
drop index if exists public.lounge_blocks_read_model_chunk_idx;

create index if not exists lounge_blocks_read_model_chunk_idx
  on public.lounge_blocks_read_model (tenant_id, world_id, cx, cz);

create index if not exists lounge_blocks_read_model_world_idx
  on public.lounge_blocks_read_model (tenant_id, world_id);
