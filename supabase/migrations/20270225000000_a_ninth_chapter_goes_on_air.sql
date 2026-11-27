-- ============================================================================
-- A ninth chapter goes on air
-- ----------------------------------------------------------------------------
-- `20270222000000` put every written chapter of all four books on air in one
-- go. Book four has since gained a ninth, `era-c`, and a chapter that exists
-- and is written but has no row here is invisible on the channel - the season
-- is half up, which is the exact thing that migration was written to prevent.
--
-- ----------------------------------------------------------------------------
-- Why this is a new file and not a line added to that one
-- ----------------------------------------------------------------------------
-- Because that migration has run. Adding `('book-four', 'era-c')` to it is the
-- obvious edit and it publishes nothing: applied migrations are recorded by
-- version in `supabase_migrations.schema_migrations` and are never re-executed,
-- so the row would appear in the repository, the test that reads that file
-- would go green, and `era-c` would stay dark in production with nothing
-- anywhere disagreeing. Verified rather than assumed before writing this -
-- 20270222000000 is in the applied list on the production database.
--
-- That is the general rule and it has bitten this repository before: an
-- applied migration is history, and history is appended to.
--
-- ----------------------------------------------------------------------------
-- What it does not touch
-- ----------------------------------------------------------------------------
-- Everything `20270222000000` already published. This names one pair, so a
-- chapter an editor has since taken down stays down; re-publishing the other
-- thirty-seven as a side effect of adding a ninth chapter would be a decision
-- nobody made.
--
-- `published_at` where it is already set, for the same reason as before: it
-- means "when this first went up" and has to survive a takedown. `era-c` has
-- never been up, so in practice the coalesce below fills it - but the shape is
-- kept so that re-running this against a database where it *has* been up does
-- not restamp it as new.
--
-- Chapter 0 of book four. The intro is exempt in `schedule.ts` and
-- `setChapterPublished` refuses a row for it, so writing one would be a
-- control that appears to do something and does not.
-- ============================================================================

insert into public.oasis_chapters (work, slug, published, published_at, updated_at)
values ('book-four', 'era-c', true, now(), now())
on conflict (work, slug) do update
  set published    = true,
      -- Kept, not overwritten: see the note above on what "first went up"
      -- has to survive.
      published_at = coalesce(public.oasis_chapters.published_at, excluded.published_at),
      updated_at   = excluded.updated_at;
