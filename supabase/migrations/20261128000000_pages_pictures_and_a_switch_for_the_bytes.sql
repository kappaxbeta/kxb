-- ============================================================================
-- Pages, pictures, and a switch for the bytes
-- ----------------------------------------------------------------------------
-- docs/product/pricing.md §1 and §10.
--
-- Two more capped quantities, and one plain switch that is not a cap at all.
--
-- `page_limit` and `picture_limit` are ordinary members of the family the
-- previous migration built: a ceiling with a per-space override, resolved
-- against the tier by `resolveLimit()`. Nothing new to argue.
--
-- `pictures` is the interesting one. It is a *kill switch*, not a number, and
-- it exists because uploaded images are the only surface in this product that
-- accepts bytes from the internet and serves them back from our own origin.
-- `uploads.ts` caps one file at 10 MB and nothing caps how many, so before
-- `picture_limit` a space paying EUR 5 could hold a hundred gigabytes.
--
-- ----------------------------------------------------------------------------
-- Why `pictures` seeds off when every other surface seeds on
-- ----------------------------------------------------------------------------
-- Every flag in the previous migration seeds off because switching a cap on
-- during a migration would break a customer doing nothing wrong. This one seeds
-- off for the opposite reason: the feature is being *withheld* rather than
-- uncapped, and an operator turns it on when they want it.
--
-- Note the deliberate asymmetry with `open_registration`, which seeds true even
-- though its code-side fallback is false. That flag's seed answers "what should
-- a deployment that has never thought about this do", and the answer there was
-- "keep working exactly as it did yesterday". Here the answer is the opposite,
-- because the thing being switched has a cost that accrues silently: a surface
-- that quietly keeps accepting uploads is not "working as it did yesterday", it
-- is a bill and a moderation queue nobody chose.
--
-- The code-side fallback matches the seed for once - see the note on `pictures`
-- in flags/keys.ts. A kill switch that turns the thing back on when the
-- resolver hiccups is not a kill switch.
--
-- Turning it off stops new uploads and removes the surface offering them. It
-- does not unpublish anything already stored. Nothing in this codebase deletes
-- on a flag, and an operator who needs images *gone* rather than *off* is
-- asking for moderation, which keeps its own trail.
-- ============================================================================

insert into public.feature_flags (key, enabled, value_int, label, description) values
  ('page_limit', false, 100, 'Pages per space',
   'Off means a space may hold any number of pages. On caps them for every space at once. The tier already sets this per space; this is the ceiling above it.'),
  ('pictures', false, null, 'Image uploads',
   'Off means nobody may upload an image, and the surface offering it is gone. Images already stored keep being served - this switch withholds the feature, it does not unpublish anything. On restores uploading, still subject to the per-space image limit.'),
  ('picture_limit', false, 100, 'Uploaded images per space',
   'Off means no cap on how many images a space may hold. On caps them for every space at once. Uploaded images only - the pictures that ship with the product are a platform catalogue and cost a space nothing.')
on conflict (key) do nothing;
