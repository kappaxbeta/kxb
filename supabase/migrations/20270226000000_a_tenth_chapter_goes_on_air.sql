-- ============================================================================
-- A tenth chapter goes on air
-- ----------------------------------------------------------------------------
-- The same job as `20270225000000`, one chapter later. Book four has gained
-- `the-testament-of-a-fin`, and a chapter that exists and is written but has
-- no row here is invisible on the channel - the season reads as nine of ten,
-- with nothing anywhere saying so.
--
-- Two files in two days is the shape this is supposed to have. An applied
-- migration is history: `20270225000000` has run, and adding a second pair to
-- it would publish nothing while making the repository and the test that reads
-- it both agree that it had. So a chapter is a file, and the file names one
-- pair.
--
-- ----------------------------------------------------------------------------
-- The pair, spelled out
-- ----------------------------------------------------------------------------
-- Written as a `values` list of `(work, slug)` rather than inline in the
-- insert, which is the shape `20270222000000` uses and the shape the coverage
-- test in `channel.test.ts` looks for: it asserts that some migration contains
-- `('book-four', 'the-testament-of-a-fin')`, the pair with its closing paren.
-- An insert that ran the columns together - `values ('book-four', 'slug',
-- true, now(), now())` - publishes the chapter perfectly well and satisfies
-- that test only by accident, through a mention in a comment.
--
-- ----------------------------------------------------------------------------
-- What it does not touch
-- ----------------------------------------------------------------------------
-- Every chapter already published, so one an editor has since taken down stays
-- down. And `published_at` where it is already set: it means "when this first
-- went up" and has to survive a takedown, which is what the coalesce is for.
-- This chapter has never been up, so in practice the coalesce fills it.
-- ============================================================================

insert into public.oasis_chapters (work, slug, published, published_at, updated_at)
select work, slug, true, now(), now()
from (values
  ('book-four', 'the-testament-of-a-fin')
) as v(work, slug)
on conflict (work, slug) do update
  set published    = true,
      -- Kept, not overwritten: see the note above on what "first went up"
      -- has to survive.
      published_at = coalesce(public.oasis_chapters.published_at, excluded.published_at),
      updated_at   = excluded.updated_at;
