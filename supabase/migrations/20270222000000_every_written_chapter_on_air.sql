-- ============================================================================
-- Every written chapter, on air
-- ----------------------------------------------------------------------------
-- The channel has four seasons now and they were all sitting behind the same
-- switch: written, merged, invisible. This puts every written chapter of every
-- book on air in one go, because that is the decision that was actually made -
-- "make all books public" - and making it thirty-seven times by hand in the
-- backoffice is the same decision with thirty-seven chances to miss one.
--
-- ----------------------------------------------------------------------------
-- This is a migration doing an editor's job, and that is worth flagging
-- ----------------------------------------------------------------------------
-- `20270208000000` is explicit that this table is a decision log an editor
-- writes, and every seeding migration beside it registers a *control* switched
-- off rather than flipping one on. This one flips thirty-seven, so it breaks
-- that pattern knowingly and leaves two marks the backoffice would have left:
-- there is no `updated_by`, because no person did it, and there is no row in
-- the backoffice audit log, because `recordBackofficeAction` runs in the
-- action and not in Postgres. An editor taking a chapter back down afterwards
-- is a normal switch and will be audited normally.
--
-- The alternative was a script run once against production with a service key,
-- which leaves no trace in the repository at all. A migration is at least
-- reviewable, and says in writing what was published and when.
--
-- ----------------------------------------------------------------------------
-- What it does not touch
-- ----------------------------------------------------------------------------
-- Chapter 0 of each book. The intro is exempt in `schedule.ts` - it is the
-- thing that explains the channel, so it cannot be switchable - and
-- `setChapterPublished` refuses a row for it outright. Writing one here would
-- be a control that appears to do something and does not.
--
-- `published_at` on a chapter that has been up before. It means "when this
-- first went up" and has to survive a takedown, so the update below only fills
-- it where it is still null. A chapter published, pulled and now republished
-- keeps its original date rather than claiming to be new.
--
-- The list is generated from the rosters in `@kxb/xo-universe`, non-intro and
-- written only, so it cannot name a chapter that does not exist. A slug that
-- is later renamed simply stops matching, which is what the original migration
-- says about every row in this table.
-- ============================================================================

insert into public.oasis_chapters (work, slug, published, published_at, updated_at)
select work, slug, true, now(), now()
from (values
  ('book-one', 'night-shift'),
  ('book-one', 'the-casting'),
  ('book-one', 'wishingwell'),
  ('book-one', 'stronger'),
  ('book-one', 'daughters-of-delphi'),
  ('book-one', 'first-world-tour'),
  ('book-one', 'kappa'),
  ('book-one', 'berlin'),
  ('book-one', 'born'),
  ('book-one', 'the-zoo'),
  ('book-one', 'no-biggi'),
  ('book-two', 'the-thread'),
  ('book-two', 'the-kanzlei'),
  ('book-two', 'the-lid'),
  ('book-two', 'the-zentrale'),
  ('book-two', 'the-tribe'),
  ('book-two', 'the-good-coats'),
  ('book-two', 'the-sapphire'),
  ('book-two', 'the-door'),
  ('book-two', 'the-prince'),
  ('book-two', 'the-chair'),
  ('book-two', 'no-biggi'),
  ('book-three', 'the-city-outside'),
  ('book-three', 'the-nymphen'),
  ('book-three', 'the-head'),
  ('book-three', 'heidelberg'),
  ('book-three', 'do-you-hear-the-trumpets'),
  ('book-three', 'my-apology-to-all-allegations'),
  ('book-three', 'the-channel'),
  ('book-three', 'the-godly-dilemma'),
  ('book-four', 'the-academy'),
  ('book-four', 'the-girl-and-the-wall'),
  ('book-four', 'the-million-trials'),
  ('book-four', 'the-redheads'),
  ('book-four', 'sakura-and-the-warm-world'),
  ('book-four', 'the-dome'),
  ('book-four', 'olympus-or-what-s-left-of-it')
) as v(work, slug)
on conflict (work, slug) do update
  set published    = true,
      -- Kept, not overwritten: see the note above on what "first went up"
      -- has to survive.
      published_at = coalesce(public.oasis_chapters.published_at, excluded.published_at),
      updated_at   = excluded.updated_at;
