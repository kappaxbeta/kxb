-- A thing stands between the cells.
--
-- `1856345b thingiverse: tenths of a cell` widened the *command* - `cell` and
-- `level` in thing-commands.ts now accept any multiple of `STEP`, so a thing can
-- be nudged a tenth of a cell and the log happily records `x: 1.5`. The read
-- model was not widened with it, so the very next projection run hits
--
--   invalid input syntax for type integer: "1.5"
--
-- and throws. That is worse than it sounds, and worse than a failed write would
-- have been: the log is append-only, so the bad row is replayed on *every*
-- subsequent run, and `runProjection` is awaited at the top of every surface
-- that reads things. One nudge takes out the rail, the browse page and the
-- composer for that space, permanently, and no amount of retrying clears it.
--
-- `real` rather than `numeric`, matching `scale` in the same table, which has
-- been fractional since the day it was added. These are positions in a world
-- drawn by a float32 renderer - a tenth of a cell is 10cm and single precision
-- carries about seven digits, so there is nothing here that `numeric` would
-- keep and `real` would lose, and `real` is what every other coordinate in this
-- schema is.
--
-- Widening is not a rewrite: every existing integer is representable exactly, so
-- this is a metadata-only change on the values and the rows are read back
-- identically. Nothing here is reversible in the useful sense - narrowing back
-- would round somebody's furniture into the wall - so there is deliberately no
-- down migration for it.

alter table public.thingiverse_things_read_model
  alter column x type real,
  alter column y type real,
  alter column z type real;
