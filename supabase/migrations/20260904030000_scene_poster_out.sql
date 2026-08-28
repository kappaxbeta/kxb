-- ============================================================================
-- A scene is its document and its id
-- ----------------------------------------------------------------------------
-- `poster` held a JPEG of the first frame as a base64 data URL, so a card could
-- show a picture without mounting a renderer. It is being taken back out, and
-- the reasoning it was added under is worth keeping next to the reversal.
--
-- What it bought: a board of twenty scenes cost twenty <img> tags instead of
-- twenty WebGL contexts.
--
-- What it cost, and why that wins:
--
--   * A row was two things - a document and a picture of the document - which
--     could disagree. Re-saving a scene without a canvas in front of it (a
--     fork, an edit through an action, anything not driven by the editor) left
--     a poster of the old arrangement attached to the new one, and nothing in
--     the row said so.
--   * The picture was derived data in a table of source data. The document
--     already says what the first frame looks like; storing a rendering of it
--     is a cache with no invalidation.
--   * Every listing query carried twenty kilobytes of base64 per row whether or
--     not anything drew it.
--
-- A scene is now exactly what it is: a uuid and a shot document. A card names
-- the scene and mounts the player when somebody asks for it - which was always
-- the rule for the *expensive* part, and is now the rule for all of it.
-- ============================================================================

alter table public.published_scenes
  drop column if exists poster;
