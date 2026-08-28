-- A bracket can be fought inside a level, not only on an arena.
--
-- One nullable column, and the case for it is the case `battles_read_model.xp_id`
-- already made a tier earlier: a tournament is a run of matches, a match can be
-- fought inside an XP, and the only thing stopping a *bracket* being was that
-- `createTournament` had nowhere to write down which level - so every round it
-- staged fell back to the arena in `world_id`.
--
-- ============================================================================
-- Nullable, and `world_id` stays not null beside it
-- ============================================================================
-- A tournament in a level still has a world: `createBattle` stores the host's
-- own tenant id when no arena is named, and the bracket does the same, so the
-- column keeps its meaning ("where, when it is not a level") without a second
-- nullable field to reason about. NULL here is the ordinary case and means what
-- it has always meant - fought on the ground in `world_id`.
--
-- The event payload is the shape of record, as always: `TournamentCreated.xpId`
-- is what a replay reads, and this column is a cache of it for the list page.
--
-- ============================================================================
-- No foreign key, deliberately
-- ============================================================================
-- The same argument `battles_read_model.xp_id` makes. A reference is a string
-- that can name a document we ship (`builtin:corridor`) as well as a version of
-- a project row, so there is no single table to point at - and a bracket that
-- outlives the project it was fought in is a *record*, which is exactly what a
-- cascade would delete.

alter table public.tournaments_read_model
  add column if not exists xp_id text;

comment on column public.tournaments_read_model.xp_id is
  'The XP every round of this bracket is fought inside, or NULL for an arena. See TournamentCreated.xpId.';
