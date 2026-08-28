-- ============================================================================
-- Published scenes
-- ----------------------------------------------------------------------------
-- What the motion studio makes, kept somewhere other than a link.
--
-- A scene has always travelled as its own document base64'd into the query
-- string - see src/domain/studio/shot.ts, which still explains why that was
-- right when the only reader was the admin who composed it and the artefact was
-- a downloaded file. It is no longer the only reader: a scene now gets posted
-- to a space's pinboard and played there, which means the document has to exist
-- somewhere both of them can reach, under a name, with somebody's name on it.
--
-- The cost the old note admitted has also come due. "Lose the link and you have
-- lost the arrangement" is an honest trade for a throwaway render and a bad one
-- for the tenth take of something somebody spent an evening on.
--
-- ---------------------------------------------------------------------------
-- Why a table and not an aggregate
-- ---------------------------------------------------------------------------
-- The same two reasons 20260831000000_published_worlds.sql gives, and they
-- apply unchanged:
--
--   1. A scene published from /ovaloffice has **no tenant**. `append_events()`
--      is security invoker and `events_insert_tenant` demands membership of the
--      tenant being written to, so a platform admin - a member of nothing -
--      cannot emit a domain event at all.
--   2. The content is one opaque document replaced wholesale on every save.
--      "What did this scene look like on Tuesday" is not a question anybody has
--      asked, and a log whose payload is the entire state on every write costs
--      what a table costs and answers nothing extra.
--
-- ---------------------------------------------------------------------------
-- Every document here is a *shot*
-- ---------------------------------------------------------------------------
-- The studio has two documents - a still (`?s=`) and a shot (`?v=`) - and only
-- one of them is in this table. A still is a shot of one frame, `shotFromScene`
-- already lifts one into the other, and the pinboard's whole trick is playing
-- what it is given. Storing both kinds would mean two parsers, two players and
-- a `kind` column that every reader has to branch on, in order to represent
-- something the shot document can already say.
-- ============================================================================

create table if not exists public.published_scenes (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (length(name) between 1 and 60),
  /** One line under the title on a card. Optional, often better empty. */
  blurb       text        check (blurb is null or length(blurb) <= 280),

  /**
   * The ShotSpec, exactly as the studio serialises it.
   *
   * Opaque to the database on purpose. It is validated on the way in *and* on
   * the way out by `parseShot`, which clamps every number and drops any action,
   * avatar or block model it does not recognise - so the trust boundary is the
   * parser in the app, not a check constraint here that would have to be kept
   * in step with the document by hand.
   */
  document    jsonb       not null,

  /**
   * A still of the first frame, as a data URL.
   *
   * In the row rather than in Storage, which is the one place this departs from
   * published_worlds. Three reasons, in order of how much they decided it:
   *
   *   1. The upload route is tenant-scoped (`requireTenant`), and a scene
   *      published from /ovaloffice has no tenant - the same wall the note at
   *      the top describes. A platform poster would need a second upload path
   *      with its own authority, for a thumbnail.
   *   2. It is tiny. A 480px JPEG of a flat-shaded scene is 10-20KB, which is
   *      smaller than the document beside it.
   *   3. It is always wanted with the row and never without it. A separate
   *      object would be a second round trip on every card, to save a column
   *      the query is going to read anyway.
   *
   * Capped so a hand-rolled POST cannot put a megabyte of base64 in a list
   * query. Null is legal and renders as a placeholder - a scene saved from a
   * context with no canvas is still a scene.
   */
  poster      text        check (poster is null or length(poster) <= 400000),

  /** Seconds, copied out of the document so a card can say so without parsing it. */
  seconds     numeric(6,2) not null default 0,
  /** How many animals are in it. Same reason. */
  cast_size   integer      not null default 0,

  visibility  text        not null default 'private' check (visibility in ('private', 'public')),

  /**
   * Where it came from, which a card shows as a badge.
   *
   * 'platform' is a scene made in /ovaloffice - "from the kxb.team team".
   * 'space' is one a workspace made. Stored rather than derived from
   * `tenant_id is null` because the pair is what the check constraint below
   * keeps honest, and because a reader should not have to know that a null
   * tenant means us.
   */
  origin      text        not null check (origin in ('platform', 'space')),
  tenant_id   uuid        references public.tenants_read_model (id) on delete cascade,

  /** Who made it. Nullable so deleting an account does not delete their scenes. */
  author_id   uuid        references auth.users (id) on delete set null,

  /**
   * The scene this one was forked from, if it was.
   *
   * `on delete set null`: a fork outlives its parent. The link is attribution,
   * not ownership - the fork's document is its own copy from the moment it is
   * made, so a deleted parent leaves a scene that is complete and merely
   * anonymous about where it started.
   */
  forked_from uuid        references public.published_scenes (id) on delete set null,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- The two halves of `origin` have to agree with the tenant column, or a scene
  -- could claim to be ours while belonging to a space, which is exactly the
  -- badge nobody could then trust.
  constraint published_scenes_origin_tenant check (
    (origin = 'platform' and tenant_id is null)
    or (origin = 'space' and tenant_id is not null)
  )
);

-- The public listing: newest first.
create index if not exists published_scenes_public_idx
  on public.published_scenes (updated_at desc)
  where visibility = 'public';

create index if not exists published_scenes_tenant_idx
  on public.published_scenes (tenant_id, updated_at desc);

create index if not exists published_scenes_author_idx
  on public.published_scenes (author_id, updated_at desc);

alter table public.published_scenes enable row level security;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
-- Two policies rather than one with an `or auth.uid() is not null` in it,
-- because they are different sentences: anonymous readers get exactly the
-- public list, and a signed-in reader additionally gets their own drafts and
-- their space's.
--
-- A public scene is public in the ordinary sense: it is pinned to a board that
-- a guest may be looking at, and the poster has to render for them.
create policy "published_scenes_select_public"
  on public.published_scenes for select
  to anon
  using (visibility = 'public');

create policy "published_scenes_select"
  on public.published_scenes for select
  to authenticated
  using (
    visibility = 'public'
    or author_id = (select auth.uid())
    or (tenant_id is not null and public.tenant_role(tenant_id) is not null)
    or public.is_backoffice_admin()
  );

-- ---------------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------------
-- You publish as yourself, into a place you belong to. `author_id` is pinned to
-- the caller so a scene cannot be published in somebody else's name, and the
-- two origins are gated separately: a space scene needs membership of that
-- space, a platform scene needs the backoffice.
create policy "published_scenes_insert"
  on public.published_scenes for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (origin = 'space' and public.tenant_role(tenant_id) is not null)
      or (origin = 'platform' and public.is_backoffice_admin())
    )
  );

-- Editing is the author's, or the space's leadership - somebody has to be able
-- to rename or unpublish a scene when the person who made it has left. The
-- `with check` repeats the `using` clause so an update cannot hand a scene to
-- another space or another author on its way past.
create policy "published_scenes_update"
  on public.published_scenes for update
  to authenticated
  using (
    author_id = (select auth.uid())
    or (tenant_id is not null and public.tenant_role(tenant_id) in ('owner', 'admin'))
    or public.is_backoffice_admin()
  )
  with check (
    author_id = (select auth.uid())
    or (tenant_id is not null and public.tenant_role(tenant_id) in ('owner', 'admin'))
    or public.is_backoffice_admin()
  );

create policy "published_scenes_delete"
  on public.published_scenes for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    or (tenant_id is not null and public.tenant_role(tenant_id) in ('owner', 'admin'))
    or public.is_backoffice_admin()
  );
