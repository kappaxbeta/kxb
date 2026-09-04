-- ============================================================================
-- Channels: shows, seasons, episodes, and the two copies of a document
-- ----------------------------------------------------------------------------
-- Project Oasis is files. This is not, and the difference is the reason every
-- table below exists: a story the platform writes belongs in the repository
-- where it can be reviewed as a diff, and a story a *member* writes cannot be,
-- because there is no deploy between them finishing a sentence and wanting it
-- read. See `docs/product/channels.md` for the argument in full.
--
-- These are read models. The events are in `events`, the aggregates are in
-- `src/domain/xo-universe/`, and every table here is rebuilt by a projection -
-- so nothing in this file is a source of truth, and anything that looks like a
-- decision was made in the aggregate before it arrived.
--
-- ---------------------------------------------------------------------------
-- The one structural decision: a draft and a release are different tables
-- ---------------------------------------------------------------------------
-- Not two columns on one row, which is what it wants to be. The public channel
-- is read by anonymous strangers and the author's draft must never be in a row
-- a stranger may select - and RLS is row level, so a policy that lets `anon`
-- read a published episode would hand them every column on it, draft included.
--
-- `queries.ts` already makes this argument for the file-based channel: there
-- must be nothing in the rendered document, no props and no flight payload,
-- for a reader with devtools to find. Splitting the tables is what makes that
-- true here rather than aspirational, and it is the same split §4.1 of the
-- product doc arrived at from the other direction - the last approved version
-- stays up while the author edits, so the two copies have to exist anyway.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Shows
-- ---------------------------------------------------------------------------
create table if not exists public.channel_shows_read_model (
  /** The show's stream id. */
  id             uuid primary key,

  /**
   * The channel. A space, not a new kind of account.
   *
   * Which is what gives an author a purse to be charged 500 coins from, a bank
   * for their readers' coins to land in, and an owner already accountable for
   * what is published under it. A channel that was its own object would need
   * all three inventing.
   */
  tenant_id      uuid not null references public.tenants_read_model (id) on delete cascade,

  /**
   * The show's address inside its channel: `/t/kxb/c/the-long-wait`.
   *
   * Unique per channel rather than globally, so two spaces may both have a
   * show called `pilot` - the public route carries the channel slug and
   * disambiguates them, the same way a season and episode number disambiguate
   * two chapters that share a slug across books.
   */
  slug           text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  title          text not null,
  logline        text not null default '',
  cover_url      text,

  /**
   * Whether this show has ever put an episode on air.
   *
   * Denormalised from the releases table on purpose. `/xo-universe/channels`
   * lists channels that have published something and nothing else, and that
   * page must not be a join across every release in the installation to find
   * out - it is the directory, it is public, and it is the first page anybody
   * sees.
   */
  first_aired_at timestamptz,

  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (tenant_id, slug)
);

-- ---------------------------------------------------------------------------
-- Seasons
-- ---------------------------------------------------------------------------
create table if not exists public.channel_seasons_read_model (
  id         uuid primary key,
  tenant_id  uuid not null references public.tenants_read_model (id) on delete cascade,
  show_id    uuid not null references public.channel_shows_read_model (id) on delete cascade,

  /**
   * `s1`, `s2`. The number is the identity and the title is courtesy - the
   * same rule `episodePath` states for chapters, applied one level up, so a
   * season can be retitled without breaking a link somebody sent.
   */
  number     integer not null check (number >= 1),
  title      text not null default '',

  created_at timestamptz not null default now(),

  unique (show_id, number)
);

-- ---------------------------------------------------------------------------
-- Episodes: the author's copy
-- ---------------------------------------------------------------------------
-- Never readable by a stranger. Everything a reader sees is in `releases`
-- below; this table is the workbench.
create table if not exists public.channel_episodes_read_model (
  id          uuid primary key,
  tenant_id   uuid not null references public.tenants_read_model (id) on delete cascade,
  show_id     uuid not null references public.channel_shows_read_model (id) on delete cascade,
  season_id   uuid not null references public.channel_seasons_read_model (id) on delete cascade,

  number      integer not null check (number >= 0),
  title       text not null default '',

  /** BlockNote's document JSON. Opaque here; the editor owns its shape. */
  doc         jsonb not null default '[]'::jsonb,

  /**
   * Where this episode is in the pipeline.
   *
   *   draft     - never submitted
   *   in_review - submitted, an admin has not decided yet
   *   published - the current draft is what is on air
   *   changed   - published once, and edited since; the release is still up
   *   rejected  - sent back with a note, the release (if any) is still up
   *
   * `changed` is the state the whole design is for. An episode that has been
   * out and touched is not a draft - there is something live with its name on
   * it - and it is not published either, because what the author is looking at
   * is not what a reader is. Collapsing the two is how somebody edits a
   * published episode and believes their change is out.
   */
  status      text not null default 'draft'
                check (status in ('draft', 'in_review', 'published', 'changed', 'rejected')),

  /**
   * The version the author is holding: `1.4.2`.
   *
   * Stored as its three parts rather than a string, so "the next patch" is
   * arithmetic and not parsing, and so the review queue can be ordered by it.
   * `major` is here for completeness and is never moved by the application -
   * see the domain, where the minor is a decision and the patch is a count.
   */
  major       integer not null default 1 check (major >= 0),
  minor       integer not null default 0 check (minor >= 0),
  patch       integer not null default 0 check (patch >= 0),

  /**
   * What it costs a reader to open this, in coins. 0 is free and is the
   * default; 200 is the ceiling and is enforced here as well as in the domain,
   * because a price is money and a check constraint is the last thing standing
   * if a command is ever called from somewhere new.
   */
  price       integer not null default 0 check (price between 0 and 200),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (season_id, number)
);

create index if not exists channel_episodes_by_show
  on public.channel_episodes_read_model (show_id, season_id, number);

-- The review queue's own read: everything waiting, oldest first, across every
-- channel. Partial, because the queue is the small tail of this table and an
-- admin opening it should not be paying for every draft in the installation.
create index if not exists channel_episodes_in_review
  on public.channel_episodes_read_model (created_at)
  where status = 'in_review';

-- ---------------------------------------------------------------------------
-- Releases: the copy a reader gets
-- ---------------------------------------------------------------------------
-- One row per episode that has ever been approved, replaced in place on
-- re-release. Not a history - the events are the history, and a table that
-- kept every approved version would be a second one that drifts.
--
-- Everything a public page needs is denormalised onto the row: the channel
-- slug, the show slug, the season and episode numbers, the title. A public
-- reader's query is then one indexed lookup with no joins into tables they
-- have no business selecting from, which is both faster and the only way the
-- policies below stay simple enough to be obviously correct.
create table if not exists public.channel_releases_read_model (
  episode_id     uuid primary key references public.channel_episodes_read_model (id) on delete cascade,
  tenant_id      uuid not null references public.tenants_read_model (id) on delete cascade,
  show_id        uuid not null references public.channel_shows_read_model (id) on delete cascade,

  channel_slug   text not null,
  show_slug      text not null,
  show_title     text not null,
  season         integer not null,
  number         integer not null,
  title          text not null,
  doc            jsonb not null,

  /** The released version, as a string, because nothing sorts by it. */
  version        text not null,

  price          integer not null default 0 check (price between 0 and 200),

  /**
   * Hidden by a moderator, without being deleted.
   *
   * `content.ts` argues the case: upholding a report hides and never deletes,
   * because the report is the record and the evidence is the thing reported.
   * A hidden release stays here, drops out of every public read, and can be
   * put back.
   */
  hidden         boolean not null default false,

  first_aired_at timestamptz not null default now(),
  aired_at       timestamptz not null default now()
);

create index if not exists channel_releases_public
  on public.channel_releases_read_model (channel_slug, show_slug, season, number)
  where not hidden;

create index if not exists channel_releases_recent
  on public.channel_releases_read_model (aired_at desc)
  where not hidden;

-- ---------------------------------------------------------------------------
-- The bible
-- ---------------------------------------------------------------------------
-- A show's cast and world. Never published, never reviewed - see §2 of the
-- product doc: the moment a bible needs sign-off, nobody writes one.
create table if not exists public.channel_bible_read_model (
  id         uuid primary key,
  tenant_id  uuid not null references public.tenants_read_model (id) on delete cascade,
  show_id    uuid not null references public.channel_shows_read_model (id) on delete cascade,

  /**
   * Character, place, faction, object - and `note` for the thing that is none
   * of them. Text with a check rather than an enum, because a show will want a
   * kind we have not thought of and an enum makes that a migration.
   */
  kind       text not null default 'character'
               check (kind in ('character', 'place', 'faction', 'object', 'note')),

  name       text not null,
  summary    text not null default '',

  /** A document, like an episode is - a character sheet wants a table too. */
  doc        jsonb not null default '[]'::jsonb,

  image_url  text,
  position   integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists channel_bible_by_show
  on public.channel_bible_read_model (show_id, kind, position);

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
create table if not exists public.channel_comments_read_model (
  id          uuid primary key,
  tenant_id   uuid not null references public.tenants_read_model (id) on delete cascade,
  episode_id  uuid not null references public.channel_episodes_read_model (id) on delete cascade,

  author_id   uuid references auth.users (id) on delete set null,

  /**
   * The name as it was when they wrote it.
   *
   * Captured rather than joined, for the reason `content_reports` captures a
   * title: a thread read six months later must still say who said what, and an
   * author who has since left, been renamed or deleted their account would
   * otherwise turn a conversation into rows of nulls.
   */
  author_name text not null,

  body        text not null check (length(body) between 1 and 4000),

  /**
   * Dealt with, and therefore hidden - not deleted.
   *
   * The same shape as a report, and for the same reason: the interesting
   * comments are the ones somebody acted on. A resolved comment leaves the
   * thread a reader sees and stays visible to the show's own people.
   */
  resolved    boolean not null default false,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,

  created_at  timestamptz not null default now()
);

create index if not exists channel_comments_open
  on public.channel_comments_read_model (episode_id, created_at)
  where not resolved;

-- ---------------------------------------------------------------------------
-- Who has paid for what
-- ---------------------------------------------------------------------------
-- An episode with a price is bought once and then owned, which is the rule
-- `economy.md` §9.1 already set for a level with a `once` price. A reader who
-- paid for episode 3 and comes back next week must not pay again.
create table if not exists public.channel_episode_access (
  episode_id uuid not null references public.channel_episodes_read_model (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  paid       integer not null check (paid >= 0),
  paid_at    timestamptz not null default now(),
  primary key (episode_id, user_id)
);

-- ============================================================================
-- Policies
-- ============================================================================
alter table public.channel_shows_read_model     enable row level security;
alter table public.channel_seasons_read_model   enable row level security;
alter table public.channel_episodes_read_model  enable row level security;
alter table public.channel_releases_read_model  enable row level security;
alter table public.channel_bible_read_model     enable row level security;
alter table public.channel_comments_read_model  enable row level security;
alter table public.channel_episode_access       enable row level security;

-- ---------------------------------------------------------------------------
-- Reading: the workbench is the channel's, the release is everybody's
-- ---------------------------------------------------------------------------
-- Members of the space see their own drafts, seasons, bible and episodes.
-- Backoffice admins see everything, because they are the ones who have to read
-- a submission before it goes out. Nobody else sees any of it.
create policy "channel_shows_select"
  on public.channel_shows_read_model for select to authenticated
  using (public.tenant_role(tenant_id) is not null or public.is_backoffice_admin());

create policy "channel_seasons_select"
  on public.channel_seasons_read_model for select to authenticated
  using (public.tenant_role(tenant_id) is not null or public.is_backoffice_admin());

create policy "channel_episodes_select"
  on public.channel_episodes_read_model for select to authenticated
  using (public.tenant_role(tenant_id) is not null or public.is_backoffice_admin());

create policy "channel_bible_select"
  on public.channel_bible_read_model for select to authenticated
  using (public.tenant_role(tenant_id) is not null or public.is_backoffice_admin());

-- A show that has aired is public, so the directory and a show's page can be
-- read by a stranger. Only the four marketing columns matter to them, and the
-- row carries nothing else worth hiding - `first_aired_at is not null` is
-- exactly the "listed once it has published something" rule from §1.1.
create policy "channel_shows_select_aired"
  on public.channel_shows_read_model for select to anon, authenticated
  using (first_aired_at is not null);

-- The release table is the public one. Hidden rows drop out for everybody
-- except the channel and the backoffice, so a takedown is invisible rather
-- than an error page that says something was here.
create policy "channel_releases_select_public"
  on public.channel_releases_read_model for select to anon, authenticated
  using (not hidden);

create policy "channel_releases_select_own"
  on public.channel_releases_read_model for select to authenticated
  using (public.tenant_role(tenant_id) is not null or public.is_backoffice_admin());

-- Comments are read by anyone who can read the episode they are on. Resolved
-- ones are hidden from the public and stay visible to the channel, which is
-- what "hidden, not deleted" has to mean to be worth anything.
create policy "channel_comments_select_open"
  on public.channel_comments_read_model for select to anon, authenticated
  using (not resolved);

create policy "channel_comments_select_own"
  on public.channel_comments_read_model for select to authenticated
  using (public.tenant_role(tenant_id) is not null or public.is_backoffice_admin());

-- What you have bought is yours to know about and nobody else's.
create policy "channel_access_select_own"
  on public.channel_episode_access for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Writing: the projection, and nobody else
-- ---------------------------------------------------------------------------
-- Every table here is derived. A member does not write to them - they append
-- an event, and the projection catches up. So the write policies are the
-- narrow ones the other read models use: the space's own members, because the
-- projection runs under the caller's session, and the aggregate has already
-- decided whether the command was allowed.
--
-- The releases table is deliberately *not* writable by a member. A release is
-- the output of a review, and review is the backoffice's; a member who could
-- insert here would be publishing without being read.
create policy "channel_shows_write"
  on public.channel_shows_read_model for all to authenticated
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

create policy "channel_seasons_write"
  on public.channel_seasons_read_model for all to authenticated
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

create policy "channel_episodes_write"
  on public.channel_episodes_read_model for all to authenticated
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

create policy "channel_bible_write"
  on public.channel_bible_read_model for all to authenticated
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

create policy "channel_comments_write"
  on public.channel_comments_read_model for all to authenticated
  using (public.tenant_role(tenant_id) is not null or author_id = auth.uid())
  with check (public.tenant_role(tenant_id) is not null or author_id = auth.uid());

create policy "channel_releases_write_admin"
  on public.channel_releases_read_model for all to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

create policy "channel_access_write_own"
  on public.channel_episode_access for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- The flag
-- ----------------------------------------------------------------------------
-- Off, unlike `xo_universe` beside it. That flag guards a page of prose the
-- platform wrote and whose failure mode is a 404 on a link somebody followed;
-- this one guards a surface where members publish to a public directory and
-- charge each other coins for it. The safe failure there is not to be open -
-- the same argument `economy` makes for defaulting off, and for the same
-- reason: the cost of it being briefly unavailable is nothing, and the cost of
-- it being accidentally open is a moderation queue nobody is watching.
-- ============================================================================
insert into public.feature_flags (key, enabled, label, description) values
  ('channels', false, 'Channels',
   'Member-written shows: the editor inside a space, the review queue in the backoffice, and the public directory at /xo-universe/channels. Off takes all three away and leaves already-released episodes unreachable rather than deleted.')
on conflict (key) do nothing;
