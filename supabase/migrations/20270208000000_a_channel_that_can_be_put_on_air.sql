-- ============================================================================
-- Project Oasis: which chapters are on air
-- ----------------------------------------------------------------------------
-- The story itself is not in here, and that is the design rather than an
-- omission. Chapters are files in `@kxb/xo-universe` - prose in the
-- repository, reviewed like prose, versioned like prose. What a database is
-- genuinely better at is the one fact that changes without a deploy: whether
-- a written chapter is showing.
--
-- So this table is a decision log, not a content store. One row per chapter an
-- editor has ever made a decision about, keyed by the slug the file declares.
-- No body, no title, no ordering column - all three live in the file, and a
-- second copy of a title here is a second title to keep in step.
--
-- An absent row means "not published". That is deliberate and it is what makes
-- the seed idempotent: a chapter that lands in a later release needs no
-- backfill to be correctly invisible, because invisible is what no row means.
--
-- Chapter 0 is XO's introduction and is exempt in the application, not here.
-- A row for it is harmless and simply never consulted; see `schedule.ts` for
-- why the thing that explains the channel cannot be switchable.
-- ============================================================================

create table if not exists public.oasis_chapters (
  /**
   * The chapter's slug, as declared by its file in `@kxb/xo-universe`.
   *
   * The primary key, so a chapter cannot be turned on twice and an upsert is
   * the natural write. Text rather than a foreign key because the thing it
   * refers to is a file, not a row - which is also why nothing cascades here:
   * a slug for a chapter that has been renamed or withdrawn simply stops
   * matching, and the roster is what decides what exists.
   */
  slug          text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  /**
   * On air, or not.
   *
   * A column rather than "a row means published", so that taking a chapter
   * down is an update an editor can see and reverse, rather than a delete that
   * loses when it went up. `published_at` below is the reason that matters.
   */
  published     boolean not null default false,

  /**
   * When it first went up, kept across a takedown.
   *
   * Set on the way to true and never cleared, so a chapter pulled for an
   * afternoon and put back does not claim to be new. Null until it has been
   * published once.
   */
  published_at  timestamptz,

  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null
);

-- The channel's read is "every published slug", on a table with ten rows in
-- it. An index would be ceremony; the primary key is already more than this
-- needs. Left unindexed on purpose so nobody wonders what it was for.

alter table public.oasis_chapters enable row level security;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
-- Anybody, signed in or not, may read which chapters are published. The
-- channel is a public marketing page - that is the whole point of it - so
-- `anon` is granted here explicitly rather than left to a signed-in-only
-- policy that would make the story invisible to every reader who arrived from
-- a link.
--
-- Only the published rows, though, and this is the load-bearing half. A row
-- saying "chapter 3 is written but off" is a fact about unreleased work, and
-- an anonymous reader who can list the table can tell how much is sitting
-- ready. The application never sends a draft's text, and the policy makes sure
-- it cannot leak the schedule either.
create policy "oasis_chapters_select_published"
  on public.oasis_chapters for select
  to anon, authenticated
  using (published);

-- The backoffice sees everything, published or not - it is the surface where
-- the decision is made, and a list that hides what is off would be a list you
-- cannot turn anything on from.
create policy "oasis_chapters_select_admin"
  on public.oasis_chapters for select
  to authenticated
  using (public.is_backoffice_admin());

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------
-- The backoffice alone, in all three directions. There is no membership of any
-- space that should put a platform story on air, which is the same argument
-- `platform_news` makes about announcements.
create policy "oasis_chapters_insert"
  on public.oasis_chapters for insert
  to authenticated
  with check (public.is_backoffice_admin());

create policy "oasis_chapters_update"
  on public.oasis_chapters for update
  to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

create policy "oasis_chapters_delete"
  on public.oasis_chapters for delete
  to authenticated
  using (public.is_backoffice_admin());

-- ============================================================================
-- The flag
-- ----------------------------------------------------------------------------
-- On, unlike the seeds for `agents`, `battle` and `thingiverse`. Those guard
-- machinery that would otherwise appear inside somebody's workspace; this
-- guards a page of prose on the public site, where the failure of falling back
-- to off is a published chapter 404ing for a reader who followed a link to it.
-- The argument is set out at `xo_universe` in `src/domain/flags/keys.ts`.
-- ============================================================================

insert into public.feature_flags (key, enabled, label, description) values
  ('xo_universe', true, 'XO Universe',
   'The Project Oasis channel and its nav tab. Off takes the tab away and 404s the routes; the chapters and their published rows are untouched, so turning it back on restores the channel exactly as the editors left it.')
on conflict (key) do nothing;
