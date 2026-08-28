-- ============================================================================
-- Lounge: chunk coordinates
-- ----------------------------------------------------------------------------
-- Extends the lounge_blocks_read_model from the previous migration. Kept as a
-- separate file rather than an edit to that one, because migrations are history
-- - amending an applied migration means two databases can disagree about what
-- "20260725160000" was.
--
-- Why the world needs chunks at all is a *write*-side concern, explained in
-- src/domain/lounge/events.ts: a voxel world cannot live in one event stream,
-- because replaying every block ever placed on every placement is quadratic.
-- The world is therefore cut into 16x16 columns, each with its own stream.
--
-- These two columns are what let the read side speak the same language:
--
--   * Loading a region is "give me chunks near the player", an index range scan
--     rather than a scan of every block a workspace owns.
--   * ChunkCleared deletes a whole column in one statement.
--
-- They are derived from x/z (floor division by 16) and so are strictly
-- redundant. Denormalising is deliberate: computing floor(x / 16.0) inside a
-- WHERE clause makes the expression unindexable, which defeats the point.
-- ============================================================================

alter table public.lounge_blocks_read_model
  add column if not exists cx integer not null default 0,
  add column if not exists cz integer not null default 0;

-- The defaults exist only so this is safe to run against a table that already
-- has rows. New rows always carry real values, written by the projector, so the
-- default should never be relied on again.
alter table public.lounge_blocks_read_model alter column cx drop default;
alter table public.lounge_blocks_read_model alter column cz drop default;

create index if not exists lounge_blocks_read_model_chunk_idx
  on public.lounge_blocks_read_model (tenant_id, cx, cz);

comment on column public.lounge_blocks_read_model.cx is
  'floor(x / 16). Denormalised from x so region queries can use an index.';
comment on column public.lounge_blocks_read_model.cz is
  'floor(z / 16). Denormalised from z so region queries can use an index.';
