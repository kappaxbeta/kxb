-- ============================================================================
-- Dropping `xps_read_model.plays`
-- ----------------------------------------------------------------------------
-- docs/xp/backlog.md §7a. The column has been `bigint not null default 0` since
-- 20261001000000 and nothing has ever written to it - 20261028000000 built the
-- real reader (`xp_play_totals`, off `xp_sessions`) precisely because this one
-- was permanently zero. What made this a queued cleanup rather than the same
-- commit is order, not risk: migrations reach production through
-- `db-push-prod.sh`, a separate hand from the deploy, so a schema that had
-- already lost the column while an image still `select`ing it was running would
-- have been a five-hundred on the space library.
--
-- That reader shipped and its deploy is the commit this migration waits on -
-- 8d9c0ea4 and 9b99e16d are both on `main` now, so every caller left reads the
-- real figure out of the session log and none of them names this column.
-- `if exists` because a column already gone is not a failure here, only a
-- migration that ran on a database that got here a different way.
-- ============================================================================

alter table public.xps_read_model drop column if exists plays;
