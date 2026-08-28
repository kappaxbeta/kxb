-- ============================================================================
-- A notice can carry a scene
-- ----------------------------------------------------------------------------
-- The pinboard's whole content used to be words. A scene pinned to it is the
-- first thing on the board that is not text, and it arrives as a *reference*
-- rather than as a copy: the column holds an id into public.published_scenes,
-- and the document, the poster and the name all stay over there.
--
-- ---------------------------------------------------------------------------
-- Why a reference and not the document
-- ---------------------------------------------------------------------------
-- The alternative - copying the shot into the post, the way domain/lounge/copy
-- copies blocks into a space - is right when the two things must be able to
-- diverge, and wrong here. A pinned scene is somebody showing the room a thing
-- they made; if they fix the timing and re-save, the notice should show the fix
-- rather than a snapshot of the mistake. Nobody expects to have to re-pin.
--
-- The cost is honest and is the reason `on delete set null` is what it is: a
-- scene can be deleted out from under a notice. The card then renders as the
-- words alone, which is exactly what the notice was before anybody attached
-- anything, rather than as a broken frame.
--
-- ---------------------------------------------------------------------------
-- No foreign key
-- ---------------------------------------------------------------------------
-- Deliberately just a uuid. This is a *read model* - a projection rebuilt by
-- replaying events - and a constraint here would make a replay fail the moment
-- it reached a post whose scene had since been deleted. The projector must be
-- able to land on the same answer from zero at any time; a row pointing at a
-- scene that is gone is a join that returns nothing, which the query already
-- handles because a post never had to have a scene in the first place.
-- ============================================================================

alter table public.board_posts_read_model
  add column if not exists scene_id uuid;

-- Only the posts that have one, which on a normal board is a handful. The
-- partial index is what keeps "which scenes does this board need" from being a
-- scan of every notice ever written.
create index if not exists board_posts_read_model_scene_idx
  on public.board_posts_read_model (scene_id)
  where scene_id is not null;
