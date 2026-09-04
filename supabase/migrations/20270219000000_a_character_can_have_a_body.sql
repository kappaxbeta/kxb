-- ============================================================================
-- Which body a character wears
-- ----------------------------------------------------------------------------
-- A bible entry has a name, a portrait and a description, all of which are for
-- a person reading. This is the first thing on it that the *runtime* can use:
-- the model a character is played by, so a scene can be staged with the actual
-- bodies rather than with name tags.
--
-- ---------------------------------------------------------------------------
-- An avatar id, not a path
-- ---------------------------------------------------------------------------
-- `beaver`, not `/xo/peeps/animal-beaver.glb`. The path is built by
-- `avatarModel()` in `src/domain/lounge/avatars.ts` and it is built there for
-- a reason this codebase has already been bitten by: a raw id handed to a
-- loader that wanted a path takes the canvas down, and a stored path is a
-- string that goes stale the day the assets move.
--
-- Storing the id means the day `/xo/peeps/` becomes `/xo/bodies/`, one
-- function changes and every character in every show follows. Nothing here is
-- validated against `AVATARS` - a check constraint listing them would be a
-- migration every time a body is added - so an unknown id resolves to nothing
-- and the scene draws a name tag, which is what it did before this column.
--
-- Null is the ordinary case and always will be: a place, a prop and a faction
-- have no body, and plenty of characters never get one.
-- ============================================================================

alter table public.channel_bible_read_model
  add column if not exists model text;

comment on column public.channel_bible_read_model.model is
  'The avatar id this character is played by - see AVATARS in src/domain/lounge/avatars.ts. Null for anything without a body. An id, never a path: avatarModel() builds the path.';
