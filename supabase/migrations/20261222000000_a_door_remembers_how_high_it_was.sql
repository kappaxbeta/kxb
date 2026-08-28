-- A door remembers how high it was.
--
-- `world_spawns` held x and z and nothing else, so a spawn was a floor tile
-- rather than a place. Standing on a floating island and pressing "set the
-- arrival here" stored the column and threw the height away - and `standingSurface`
-- then picked the *lowest* clear surface in that column, which under an island is
-- the world floor twenty blocks below it. Reported as "if you on the floating
-- island try to set it somewhere on the island its go to the floor".
--
-- Nullable, and null keeps the old behaviour exactly: every spawn written before
-- this migration has no opinion about height, and the arrival goes on choosing
-- the lowest surface with headroom for those. Only a door set from now on carries
-- one, which means nothing has to be backfilled and no existing world moves.
--
-- No default either. A zero would be an opinion - "arrive at the floor" - and a
-- door that has never expressed one is a different thing from a door pinned to
-- the ground floor of a world whose island is the only place anybody stands.
alter table public.world_spawns
  add column if not exists y integer;

comment on column public.world_spawns.y is
  'The surface the door was set on, in cells. Null means no preference: the arrival picks the lowest surface with headroom, which is what every spawn did before this column existed.';
