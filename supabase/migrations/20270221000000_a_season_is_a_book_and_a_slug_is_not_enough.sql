-- ============================================================================
-- A chapter belongs to a book, and the schedule has to say which
-- ============================================================================
-- `oasis_chapters` was keyed on the slug alone, and that was right for exactly
-- as long as there was one book. There are two. `no-biggi` closes both of
-- them, and `the-sapphire` is a chapter of book two that was once a chapter of
-- book one - the package already says so, in `work.ts`, and this table is the
-- last place that still disagrees.
--
-- What that disagreement would have done, left alone, is not a schema
-- complaint: an editor putting book one's `No biggi` on air would have put
-- book two's on air at the same time, through the same row, and nothing
-- anywhere would have said so. The read path filters by work, so the wrong
-- chapter would simply have appeared in the other season's list.
--
-- So the key becomes the pair the package already uses to address a chapter.
-- Every existing row is book one's, because book one is the only thing that
-- has ever been on air, which is why the default backfills rather than the
-- migration having to guess.
alter table public.oasis_chapters
  add column if not exists work text not null default 'book-one'
    check (work ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

comment on column public.oasis_chapters.work is
  'The work this chapter belongs to - book-one, book-two. Half of a chapter''s identity; see packages/xo-universe/src/work.ts.';

-- The pair, not the slug. Named rather than left to the default so a later
-- migration can find it, and dropped first because a primary key cannot be
-- widened in place.
alter table public.oasis_chapters drop constraint if exists oasis_chapters_pkey;
alter table public.oasis_chapters add primary key (work, slug);

-- The default stays. A row written without a work is a row from a caller that
-- has not learnt about seasons yet, and book one is the honest guess for it -
-- the same reason the backfill above is safe. The application always sends it.

-- Nothing changes about the policies. They turn on `published` and on
-- `is_backoffice_admin()`, neither of which ever looked at the slug, so the
-- rule "a stranger sees the published rows and nothing else" holds per work
-- without being restated.
