-- ============================================================================
-- A contest the backoffice runs
-- ----------------------------------------------------------------------------
-- The prize draw at `/gewinnspiel` had every fact about it written into
-- `src/app/gewinnspiel/contest.ts` - the dates, the prizes, the hashtag, the
-- code that makes entering free - and three things about that were right and
-- one was wrong.
--
-- Right: the facts must be identical in six languages, they must be
-- proof-readable, and a date rendered by `toLocaleDateString` is a legal
-- deadline that depends on whichever ICU the runtime shipped. All three
-- arguments are in that file at length and none of them has stopped being
-- true.
--
-- Wrong: it also meant *running* the contest was a deploy. Turning it off after
-- the draw, correcting the handle, moving the closing date when a launch slips
-- - each of those is a commit, a review and a release, done by whoever is
-- around, for a campaign whose whole shape is decided by the person who is not
-- a developer.
--
-- So the facts move here and the *rendering* of them stays in the repo:
-- `dates.ts` turns a date into "30. September 2026" out of a written-out month
-- table, per language, with no ICU anywhere near it. An operator sets the day;
-- the six languages still cannot disagree about what day it is, because they
-- are all reading this one row.
--
-- ----------------------------------------------------------------------------
-- One row, and it says so in the primary key
-- ----------------------------------------------------------------------------
-- `id boolean primary key check (id)` is the trick that makes "there is exactly
-- one of these" a thing the database knows: only `true` passes the check, and a
-- primary key permits it once. A second contest would need a second table or a
-- real key, and the day that happens is the day this constraint tells whoever
-- is writing it that the assumption was load-bearing.
--
-- ----------------------------------------------------------------------------
-- Off, and it is not a feature flag
-- ----------------------------------------------------------------------------
-- `live` decides whether the site *points* at the contest - the footer link,
-- and anything else that wants to advertise it. It sits here rather than in
-- `feature_flags` because it belongs with the dates: switching a contest on
-- while its closing date is in the past is a mistake, and it should be possible
-- to see both numbers at once on the screen where either is changed.
--
-- The conditions themselves stay reachable whatever this says. A document
-- somebody was shown, and may have entered on the strength of, does not get to
-- 404 because a campaign ended - that is what § 12's "we will announce it on
-- this page" is a promise about.
-- ============================================================================

create table if not exists public.contest_settings (
  id         boolean     primary key default true check (id),

  -- Whether the site points at the contest. See above: not a 404 switch.
  live       boolean     not null default false,

  /**
   * The promo code that makes entering free.
   *
   * Stored uppercase like every other code in this system, and checked here so
   * a lowercase twin cannot be typed into the form and then fail to match a
   * `promo_codes` row it looks identical to.
   *
   * This does *not* create the code. § 5 of the conditions rests on the code
   * being live and outliving the draw, which is a fact about `promo_codes`, and
   * the backoffice page checks it rather than assuming it - see
   * `readContestHealth`.
   */
  code       text        not null default 'KXB50'
               check (code = upper(code) and length(code) between 3 and 40),

  -- The window and the draw. Dates rather than timestamps: the deadline's hour
  -- and zone are part of the *prose* (23:59, Berlin), written once per language
  -- in `contest.ts`, because "23:59 MESZ" is a sentence rather than a value.
  starts_on  date        not null default date '2026-09-01',
  ends_on    date        not null default date '2026-09-30',
  draws_on   date        not null default date '2026-10-02',

  -- The draw cannot be before entries close, and entries cannot close before
  -- they open. Cheap here, and the alternative is a conditions page that
  -- promises a draw in the past.
  constraint contest_settings_order
    check (starts_on <= ends_on and ends_on <= draws_on),

  /**
   * What is handed out, in euro, best first.
   *
   * An array rather than three columns, because the number of prizes is a
   * decision about a campaign and not about a schema - two prizes next time is
   * an edit, not a migration. Deliberately not "Amazon vouchers" anywhere: the
   * document promises a voucher of a stated value and lets the winner pick the
   * shop, for the reason `contest.ts` gives.
   */
  prizes     integer[]   not null default '{50,25,25}'
               -- `ALL (array)` rather than a subquery, which a CHECK may not
               -- contain: every amount is a real number of euro, and there are
               -- between one and ten of them.
               check (
                 array_length(prizes, 1) between 1 and 10
                 and 0 < all (prizes)
                 and 100000 >= all (prizes)
               ),

  -- The tag an entry carries and the account it is addressed to, both without
  -- their punctuation - the `#` and the `@` are drawn by the page, so an
  -- operator pasting "@kxbteam" does not produce "@@kxbteam".
  hashtag    text        not null default 'kxbteam'
               check (hashtag ~ '^[A-Za-z0-9_]{2,40}$'),
  handle     text        not null default 'kxbteam'
               check (handle ~ '^[A-Za-z0-9_]{2,40}$'),

  /**
   * The floor, where the service itself asks for 16.
   *
   * Not a stricter reading of Art. 8 DSGVO - that question is settled in the
   * terms. It is about the prize: a voucher handed to a minor is a
   * Willenserklärung needing a guardian's agreement under §§ 107 ff. BGB, and
   * there is no way to collect that through a direct message. Settable because
   * a different prize might not need it; floored at 16 because below that the
   * service's own terms refuse anyway.
   */
  min_age    integer     not null default 18 check (min_age between 16 and 99),

  updated_at timestamptz not null default now(),
  updated_by uuid        references auth.users (id) on delete set null
);

-- ----------------------------------------------------------------------------
-- The row itself, so every reader has something to read.
--
-- The defaults above are the values that were in `contest.ts` on the day this
-- was written, which is what makes this migration a move rather than a change:
-- the page says exactly what it said before until somebody edits it.
-- ----------------------------------------------------------------------------

-- `live` is true here where the column defaults to false, and the two are not
-- in disagreement. The column's default is what a *fresh installation* gets,
-- and it must be off: an operator standing up their own copy should not find it
-- advertising somebody else's prize draw. This row is not fresh - the draw it
-- describes opened on the 1st of September 2026 and is running as this ships,
-- and the page it points at went out in a post before that. Off here would be a
-- migration that quietly took down a live campaign.
insert into public.contest_settings (id, live) values (true, true)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Readable by everybody, writable by the backoffice
-- ----------------------------------------------------------------------------
-- Public read, and that is not a compromise: every field here is printed on a
-- page with no login in front of it, in six languages, on purpose. Hiding the
-- row while publishing its contents would be a lock on a door with no wall.
--
-- Writing is the backoffice's alone, through the service role, behind the
-- `gewinnspiel` section grant. There is no user-facing write path at all.
-- ----------------------------------------------------------------------------

alter table public.contest_settings enable row level security;

drop policy if exists "contest_settings_read" on public.contest_settings;

create policy "contest_settings_read"
  on public.contest_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "contest_settings_admin_all" on public.contest_settings;

create policy "contest_settings_admin_all"
  on public.contest_settings for all
  to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

-- ============================================================================
-- The code the conditions name
-- ----------------------------------------------------------------------------
-- § 5 of the contest conditions says entering is free, and that sentence is
-- true only while this code works. It has been named in a scheduled post since
-- August and lived nowhere but a comment telling somebody to go and create it
-- by hand - which is a promise in a legal document depending on an errand.
--
-- So it is created here, with what it was always meant to hand over plus the
-- part that is new: five bucks, straight into the pocket, which is the half of
-- the offer somebody can spend the minute they arrive. The migration that added
-- `bucks` makes that argument.
--
-- `on conflict do nothing`, because on any installation where somebody already
-- made it this must not quietly rewrite what a live campaign is handing out.
-- The Gewinnspiel page in the backoffice is where an existing code is brought
-- into line, deliberately, with a button that says so.
--
-- The expiry outlives the draw by a fortnight rather than by a day: a winner
-- told on the 2nd of October to go and use a code should not find it dead
-- because they read the message on the 3rd.
-- ============================================================================

insert into public.promo_codes
  (code, label, campaign, tier, free_days, bucks, vouchers, coins, max_uses, expires_at)
values
  ('KXB50',
   'Gewinnspiel - entries are free while this works',
   'gewinnspiel',
   'xo',
   30,
   5,
   0,
   0,
   -- Uncapped. A headcount on the code is a headcount on the contest, and the
   -- conditions promise anybody may enter for nothing.
   null,
   timestamptz '2026-10-16 23:59:59+02')
on conflict (code) do nothing;
