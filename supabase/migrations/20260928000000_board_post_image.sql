-- ============================================================================
-- A notice can carry a picture
-- ----------------------------------------------------------------------------
-- The second thing on the board that is not text, and it arrives the same way
-- the first one did - see 20260904020000_board_post_scene.sql, which argued
-- every point below and is the file to read first.
--
-- What differs is what is being referenced. A scene is a row in
-- public.published_scenes and stays a live document, so a re-save shows through
-- on the notice. A picture is a *frame*: the picture studio composes an
-- arrangement and exports one PNG of it, and that PNG is the thing being shown.
-- Re-arranging the animals afterwards makes a different picture, not a
-- correction to this one, so what is stored is the upload rather than the
-- document that produced it.
--
-- ---------------------------------------------------------------------------
-- A slug, not an id
-- ---------------------------------------------------------------------------
-- public.uploads is addressed by its opaque slug everywhere else in the product
-- - the page editor stores `/api/uploads/<slug>` as an image `src`, and the
-- route of that name is what asks whether the caller may see it. Storing the
-- slug here means the board asks the same question through the same door, and
-- a notice cannot become a way to read a file the reader would otherwise be
-- refused.
--
-- No foreign key, for the reason the scene column has none: this is a read
-- model rebuilt by replay, and a constraint would make a replay fail the moment
-- it reached a notice whose picture had since been deleted. A slug that no
-- longer resolves renders as the words alone.
-- ============================================================================

alter table public.board_posts_read_model
  add column if not exists image_slug text;

-- No index, unlike the scene column. That one exists because listing the board
-- is followed by a second query asking "which of these scenes may I read", and
-- the index is what keeps it off a scan. A picture needs no such round trip -
-- the slug goes straight into an `src` and /api/uploads/<slug> answers the
-- permission question when the browser asks for the bytes.

