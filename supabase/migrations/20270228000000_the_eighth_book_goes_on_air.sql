-- ============================================================================
-- Fall Eins goes on air, all twenty chapters at once
-- ----------------------------------------------------------------------------
-- Book eight is the first book since book four to arrive whole rather than a
-- chapter at a time, so it is published the way `20270222000000` published the
-- first four rather than the way the two single-chapter migrations after it
-- added one row each. Same insert, same conflict rule, same reasoning; only
-- the list is new.
--
-- ----------------------------------------------------------------------------
-- Why every chapter and not chapter 0
-- ----------------------------------------------------------------------------
-- Because it has no chapter 0. The other books open on an intro that
-- `schedule.ts` exempts from this table outright - it is the thing that
-- explains the channel, so it cannot be switchable - and this one opens on
-- chapter 1, a chapter like any other. Which means that without this migration
-- the book is in the repository, in the season strip, and completely
-- unreadable to the public: `schedule` finds no intro to show and no rows to
-- go with the twenty chapters, and draws a season that promises twenty and
-- opens none.
--
-- A signed-in reader sees it either way - `visibleSlugs` gives them every
-- written chapter - which is exactly why this is easy to miss in review.
--
-- ----------------------------------------------------------------------------
-- The list
-- ----------------------------------------------------------------------------
-- Generated from `works/book-eight/roster.ts`, so it cannot name a chapter
-- that does not exist. `night-shift-in-the-mausewerk` has its umlaut folded
-- rather than dropped - see `slugify` in `scripts/oasis-import.ts` for why
-- that mattered enough to fix before anything was published against it.
-- ============================================================================

insert into public.oasis_chapters (work, slug, published, published_at, updated_at)
select work, slug, true, now(), now()
from (values
  ('book-eight', 'the-mouse-with-the-wrong-feet'),
  ('book-eight', 'night-shift-in-the-mausewerk'),
  ('book-eight', 'dobbel-has-a-theory-all-of-them-wrong'),
  ('book-eight', 'the-negotiator'),
  ('book-eight', 'nobody-signed-it'),
  ('book-eight', 'queen-perrin-of-the-lower-vents'),
  ('book-eight', 'what-the-krallen-were-for'),
  ('book-eight', 'the-dates-don-t-line-up'),
  ('book-eight', 'brummel-smells-the-gate'),
  ('book-eight', 'the-gate-is-not-a-door'),
  ('book-eight', 'the-ghost-mice'),
  ('book-eight', 'the-copied-world'),
  ('book-eight', 'the-office-with-no-windows'),
  ('book-eight', 'kappa-gets-a-kralle'),
  ('book-eight', 'mirell-negotiates-with-a-machine'),
  ('book-eight', 'the-shoes-come-off'),
  ('book-eight', 'the-inner-voice'),
  ('book-eight', 'what-the-mice-decide'),
  ('book-eight', 'fall-eins-closed'),
  ('book-eight', 'epilogue-the-second-file')

) as v(work, slug)
on conflict (work, slug) do update
  set published    = true,
      -- Kept, not overwritten: "first went up" has to survive a takedown.
      published_at = coalesce(public.oasis_chapters.published_at, excluded.published_at),
      updated_at   = excluded.updated_at;
