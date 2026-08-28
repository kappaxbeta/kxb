-- ============================================================================
-- Platform news: what the kxb.team team has to say, inside somebody's space
-- ----------------------------------------------------------------------------
-- Every existing way to reach a space belongs to the space. The board is its
-- admins', chat is its members', the event banner is its host's. There was no
-- way for the people running the platform to say "the studio can do this now"
-- except an email nobody reads, and the one surface everybody opens - the
-- board - was exactly the place we could not write to.
--
-- So: one row per announcement, written in the backoffice, read in a space.
-- It lands twice, and that is deliberate rather than duplication:
--
--   * as a banner above the board, until the reader dismisses it. Dismissal is
--     kept in the reader's browser, not here - see below.
--   * in the board's News tab, forever. Dismissing the banner is "I have read
--     this", not "destroy it", and the tab is where somebody goes to find the
--     thing they waved away last week.
--
-- ----------------------------------------------------------------------------
-- Why a table and not the event log
-- ----------------------------------------------------------------------------
-- `append_events()` is scoped to a tenant, and the whole point of this row is
-- that it usually has no tenant: `tenant_id is null` means every space. There
-- is no stream it could live in. Even the targeted case is the wrong shape for
-- a log - the content is one small document replaced wholesale on every edit,
-- and nobody will ever ask what an announcement said on Tuesday.
--
-- This is the same argument published_scenes and event_banners made, and it
-- lands harder here because of the null tenant.
--
-- ----------------------------------------------------------------------------
-- Where "I dismissed it" lives, and why it is not here
-- ----------------------------------------------------------------------------
-- In the reader's `localStorage`, keyed by the row's id.
--
-- A dismissals table would be one row per person per announcement - the widest
-- table in the schema, written on a click that nobody will ever query, growing
-- with users times announcements - to answer a question whose wrong answer
-- costs somebody one click on one browser. The trade is not close.
--
-- What it costs: a second browser shows the banner again, and clearing site
-- data brings it back. Both are survivable for a card with an x in the corner.
-- If "read by" ever becomes a thing the team wants to *count*, it wants an
-- analytics event, not a join table.
-- ============================================================================

create table if not exists public.platform_news (
  id            uuid primary key default gen_random_uuid(),

  /**
   * Who it is for.
   *
   * Null means every space, which is the common case and therefore the default
   * the backoffice offers. A tenant id narrows it to one space - "your event
   * box is live" - and the cascade means retiring a space takes its
   * announcements with it rather than leaving rows aimed at nothing.
   */
  tenant_id     uuid references public.tenants_read_model (id) on delete cascade,

  headline      text not null check (length(headline) between 1 and 80),

  /**
   * The drifting bit under the headline. Optional, and often better empty.
   *
   * Capped hard at 400. This is a 300px card, not a page: anything longer is a
   * thing to link to rather than a thing to say here, which is what `links` is
   * for.
   */
  body          text check (body is null or length(body) <= 400),

  /**
   * A picture, as a path under /public.
   *
   * A path rather than an upload, because the pictures this picks from are the
   * ones already in the repo - the thumbnails and the deco renders - and they
   * are served by the same static handler that serves them everywhere else.
   * The check keeps a row from pointing at an absolute URL on somebody else's
   * host, which is the one way this column could become a tracking pixel in
   * every space.
   */
  image         text check (image is null or image ~ '^/(thumbs|xo)/[A-Za-z0-9._/-]+$'),

  /**
   * Where it points, as `[{ "label": ..., "href": ... }]`.
   *
   * Jsonb rather than a second table for the reason a banner has one or two
   * links and never twelve: a join to render a card is a round trip bought for
   * an ordering nobody will reorder. The app validates the shape on the way in
   * and again on the way out; the constraint here only keeps the column from
   * becoming an object or a scalar.
   */
  links         jsonb not null default '[]'::jsonb check (jsonb_typeof(links) = 'array'),

  /**
   * Drafts do not travel.
   *
   * A row is written before it is meant, and an announcement that appears in
   * every space the instant somebody types a headline is a mistake with no undo
   * that anyone will believe. Unpublishing is the same switch backwards, which
   * is the closest thing to "recall" this can offer.
   */
  published     boolean not null default false,

  author_id     uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The read every space does on every board load: "anything for me, newest
-- first". Partial on `published`, because drafts are only ever listed by the
-- backoffice, which is reading the whole table anyway.
create index if not exists platform_news_live_idx
  on public.platform_news (created_at desc)
  where published;

create index if not exists platform_news_tenant_idx
  on public.platform_news (tenant_id)
  where tenant_id is not null;

alter table public.platform_news enable row level security;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
-- A published announcement is readable by anybody who belongs to the space it
-- names, and a global one by anybody signed in. That second clause is wider
-- than it looks and it is meant to be: a global announcement is public speech
-- by the platform, and the only surface that renders it is a board somebody
-- already had to be a member to open.
--
-- Drafts are the backoffice's alone, which is what makes `published` a real
-- switch rather than a rendering hint.
create policy "platform_news_select"
  on public.platform_news for select
  to authenticated
  using (
    (
      published
      and (tenant_id is null or public.tenant_role(tenant_id) is not null)
    )
    or public.is_backoffice_admin()
  );

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------
-- Only the backoffice, in all four directions. A space admin has the board for
-- their own space; this is the one channel that is explicitly not theirs, and
-- there is no membership that should ever unlock it.
create policy "platform_news_insert"
  on public.platform_news for insert
  to authenticated
  with check (public.is_backoffice_admin() and author_id = (select auth.uid()));

create policy "platform_news_update"
  on public.platform_news for update
  to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

create policy "platform_news_delete"
  on public.platform_news for delete
  to authenticated
  using (public.is_backoffice_admin());
