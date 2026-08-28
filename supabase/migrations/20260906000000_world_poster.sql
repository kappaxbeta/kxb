-- ============================================================================
-- A picture of the world
-- ----------------------------------------------------------------------------
-- The catalogue was a list of names, which is the wrong shape for a page whose
-- whole job is "would you like to stand in this". A world is a place; the only
-- honest summary of one is a picture of it.
--
-- In the row rather than in Storage, and the argument is the one
-- 20260904000000_published_scenes.sql already makes for its poster - the two
-- are now the same decision, deliberately:
--
--   1. The upload route is tenant-scoped, and a world published from
--      /ovaloffice has no tenant. A platform thumbnail would need a second
--      upload path with its own authority, for a picture.
--   2. It is small. A 480px JPEG of flat-shaded blocks is 10-20KB - smaller
--      than the document sitting beside it in the same row.
--   3. It is always wanted with the row and never without it, so an object
--      would be a second round trip per card to save a column the listing
--      query reads anyway.
--
-- Capped so a hand-rolled POST cannot put a megabyte of base64 into a list
-- query. Null is legal and draws as a placeholder: a world published from a
-- context with no canvas - the seed script before it learned to render, a
-- future API - is still a world.
-- ============================================================================

alter table public.published_worlds
  add column if not exists poster text
    check (poster is null or length(poster) <= 400000);

comment on column public.published_worlds.poster is
  'A still of the world as a data URL, 480px JPEG. Shot from the builder''s own '
  'canvas at publish time, or offline by scripts/seed-worlds.ts. Null draws as a '
  'placeholder rather than a broken image.';
