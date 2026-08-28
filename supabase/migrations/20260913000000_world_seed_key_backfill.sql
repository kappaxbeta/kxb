-- ============================================================================
-- Giving the worlds that are already there their seed keys
-- ----------------------------------------------------------------------------
-- 20260912000000 added `seed_key` and switched the seed script to match on it.
-- What it did not do is *fill it in* - so the next seed run looked for a row
-- with `seed_key = 'yard'`, found none, and inserted a second Flat yard beside
-- the one that was already there. Fourteen worlds became twenty-eight.
--
-- A forward fix rather than an edit to that migration, because the first one
-- has already run: a migration that has been applied somewhere is history, and
-- rewriting history is how two databases that ran "the same" migration end up
-- different.
--
-- The order matters and is the whole of the repair:
--
--   1. Drop the duplicates the seed inserted. They are identifiable without
--      guessing - they carry a key, they share a name with an older row that
--      does not, and they are minutes old, so nothing references them.
--   2. Key the originals by name. This is the one moment a name is a safe
--      handle, because it is also the last: after this the key is the handle
--      and renaming a world is free.
--
-- The names below are a snapshot of `STARTERS` at the time of writing, and they
-- are allowed to go stale: a backfill runs once per database, so a world
-- renamed next month simply is not in this list and does not need to be.
-- ============================================================================

create temporary table seeded_worlds (key text primary key, name text not null) on commit drop;

insert into seeded_worlds (key, name) values
  ('yard', 'Flat yard'),
  ('arena', 'Walled arena'),
  ('pitch', 'Football pitch'),
  ('square', 'Town square'),
  ('keep', 'Stone keep'),
  ('maze', 'Maze race'),
  ('island', 'Floating island'),
  ('parkour', 'Parkour tower'),
  ('race', 'Parkour race'),
  ('village', 'Village green'),
  ('bank', 'The money house'),
  ('restaurant', 'The corner restaurant'),
  ('school', 'The little school'),
  ('office', 'The office floor');

-- 1. The duplicates. Keyed, platform, and shadowing an older unkeyed row of the
--    same name - which is precisely the shape the missing backfill produced and
--    nothing else has. Guarded on `world_copies` anyway: a row some space has
--    already taken a copy from is one whose id is worth keeping, whichever of
--    the pair it turned out to be.
delete from public.published_worlds dup
 where dup.origin = 'platform'
   and dup.seed_key is not null
   and exists (
     select 1
       from public.published_worlds original
      where original.origin = 'platform'
        and original.seed_key is null
        and original.name = dup.name
        and original.created_at < dup.created_at
   )
   and not exists (
     select 1 from public.world_copies c where c.source_world_id = dup.id
   );

-- 2. The originals, keyed by name. Only where the key is still free, so a
--    database where the duplicate survived step 1 (because somebody had copied
--    it) does not fail the unique index here.
update public.published_worlds p
   set seed_key = s.key
  from seeded_worlds s
 where p.origin = 'platform'
   and p.seed_key is null
   and p.name = s.name
   and not exists (
     select 1 from public.published_worlds other where other.seed_key = s.key
   );
