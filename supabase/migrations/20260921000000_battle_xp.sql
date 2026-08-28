-- A match fought inside an XP.
--
-- One nullable column, and null is the answer for every match that has ever been
-- played: `world_id` still says which space the battle belongs to, and this says
-- where the players are *sent* when it starts. Both, not either - the roster, the
-- RLS, the sides and the scoring all reach for the world, and a match with no
-- world would be a second shape for every one of them to handle.
--
-- Text rather than uuid, because an XP is a file for all of v1
-- (docs/xp/creator.md §3.1): there is no row to point at, and the document's name
-- is its identity. The check is the same alphabet the route accepts - an id ends
-- up in a path on a server, and a column that would hold `../../etc` is one that
-- only fails to matter until somebody forgets a validator upstream.

alter table public.battles_read_model
  add column if not exists xp_id text;

alter table public.battles_read_model
  drop constraint if exists battles_read_model_xp_id_shape;

alter table public.battles_read_model
  add constraint battles_read_model_xp_id_shape
  check (xp_id is null or xp_id ~ '^[a-z0-9][a-z0-9-]{0,63}$');

comment on column public.battles_read_model.xp_id is
  'XP document id this match is fought inside, or NULL for a world.';
