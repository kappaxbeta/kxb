-- ============================================================================
-- Which seeded world is which
-- ----------------------------------------------------------------------------
-- `scripts/seed-worlds.ts` matched its rows by *name*, which worked until the
-- first rename: "Maze" became "Maze race", the next run found no row called
-- "Maze race", inserted one, and left the old world sitting in the catalogue
-- forever. A seed that accumulates its own history is not idempotent, it is
-- just slow to notice.
--
-- So the seed gets a key of its own - the starter's id from
-- src/domain/builder/starters.ts, which is stable across renames because it is
-- what the *code* calls the world rather than what the card does.
--
-- Null for everything else, and that is the important half: a world published
-- by hand from /ovaloffice has no seed key, so the seed can safely delete
-- anything whose key it no longer recognises without ever touching somebody's
-- own work.
-- ============================================================================

alter table public.published_worlds
  add column if not exists seed_key text;

-- One row per starter. Partial, because every hand-published world has a null
-- here and nulls do not collide in a unique index anyway - the `where` makes
-- that explicit rather than incidental.
create unique index if not exists published_worlds_seed_key_idx
  on public.published_worlds (seed_key)
  where seed_key is not null;

comment on column public.published_worlds.seed_key is
  'The starter id this row was seeded from (src/domain/builder/starters.ts). '
  'Null for worlds published by a person. Only scripts/seed-worlds.ts writes it, '
  'and it is what makes re-seeding after a rename update the row instead of '
  'leaving the old one behind.';

-- The one row that flaw already produced. Named exactly, and only if it is
-- still the orphan: a `Maze` that somebody has since republished by hand would
-- have a null key like every other hand-made world, and deleting on the name
-- alone would take it with them.
delete from public.published_worlds
 where origin = 'platform'
   and name = 'Maze'
   and seed_key is null
   and not exists (
     select 1 from public.world_copies c where c.source_world_id = published_worlds.id
   );
