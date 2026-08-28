-- ============================================================================
-- Published worlds
-- ----------------------------------------------------------------------------
-- The builder's output, kept somewhere other people can find it.
--
-- A built world used to live in one browser's localStorage and travel as a
-- `.json` file or a very long link (see src/domain/builder/world.ts, which
-- still explains why *that* was right when the only reader was the admin who
-- built it). It is no longer the only reader: a space wants to pick a world
-- somebody else laid out and stand in it, which means the document has to
-- exist somewhere both of them can reach.
--
-- ---------------------------------------------------------------------------
-- Why a table and not an aggregate
-- ---------------------------------------------------------------------------
-- Everything else with a lifecycle in this app is an event stream, and this
-- deliberately is not. Two reasons, and the first is decisive:
--
--   1. A world published from /ovaloffice has **no tenant**. `append_events()`
--      is security invoker and `events_insert_tenant` demands membership of the
--      tenant being written to, so a platform admin - who is a member of
--      nothing - cannot emit a domain event at all. The same wall
--      20260803080000_world_reports.sql ran into.
--   2. The interesting content is one big opaque document that is replaced
--      wholesale on every save. "What did this world look like on Tuesday" is
--      not a question anybody has asked, and an event log whose payload is the
--      entire state on every write is a log that costs what a table costs and
--      answers nothing extra.
--
-- The blocks are not in here either, which is the same split battlefields
-- makes: this row is the *document* - what the builder reopens and forks - and
-- a space that uses a world gets its own battlefield with its own chunk
-- streams, copied at the moment it asks. A copy, never a link, for the reason
-- domain/lounge/copy.ts gives: two spaces standing in one set of blocks would
-- mean either could rearrange the ground under the other.
-- ============================================================================

create table if not exists public.published_worlds (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (length(name) between 1 and 60),
  /** One line under the title on the discovery page. Optional, often better empty. */
  blurb       text        check (blurb is null or length(blurb) <= 200),

  /**
   * The BuilderWorld document, exactly as the editor serialises it.
   *
   * Opaque to the database on purpose. It is validated on the way in *and* on
   * the way out by `parseWorld`, which drops any model that is not in the
   * shipped catalogue - so the trust boundary is the parser in the app, not a
   * check constraint here that would have to be kept in step with 1308 model
   * ids by hand.
   */
  document    jsonb       not null,

  /**
   * How the discovery page is sorted through.
   *
   * A text array rather than a join table. Tags here are a fixed vocabulary
   * chosen from a list in the app (src/domain/worlds/tags.ts) - there is no tag
   * entity with a name, a colour and a lifecycle of its own, so a table would
   * be two joins in service of a value.
   */
  tags        text[]      not null default '{}' check (array_length(tags, 1) is null or array_length(tags, 1) <= 6),

  visibility  text        not null default 'private' check (visibility in ('private', 'public')),

  /**
   * Where it came from, which the discovery page shows as a badge.
   *
   * 'platform' is a world built in /ovaloffice - "from the kxb.team team".
   * 'space' is one a workspace built and chose to share. Stored rather than
   * derived from `tenant_id is null` because the pair is what the check
   * constraint below keeps honest, and because a reader should not have to know
   * that a null tenant means us.
   */
  origin      text        not null check (origin in ('platform', 'space')),
  tenant_id   uuid        references public.tenants_read_model (id) on delete cascade,

  /** Who built it. Nullable so deleting an account does not delete their worlds. */
  author_id   uuid        references auth.users (id) on delete set null,

  /**
   * The world this one was forked from, if it was.
   *
   * `on delete set null`: a fork outlives its parent. The link is attribution,
   * not ownership - the fork's document is its own copy from the moment it is
   * made, so a deleted parent leaves a world that is complete and merely
   * anonymous about where it started.
   */
  forked_from uuid        references public.published_worlds (id) on delete set null,

  /** Counted at save time, so the cards can show a size without parsing every document. */
  placements  integer     not null default 0,
  /**
   * How many of those placements survive into a walkable world.
   *
   * A builder world may use any of the 1308 shipped models; a world people walk
   * around in accepts the 58 in the lounge palette. The difference is real and
   * a space deserves to see it *before* it copies one in - "3,102 blocks, 214
   * props left behind" is the honest version of a button that would otherwise
   * quietly drop a park.
   */
  blocks      integer     not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- The two halves of `origin` have to agree with the tenant column, or a
  -- world could claim to be ours while belonging to a space, which is exactly
  -- the badge nobody could then trust.
  constraint published_worlds_origin_tenant check (
    (origin = 'platform' and tenant_id is null)
    or (origin = 'space' and tenant_id is not null)
  )
);

-- The discovery page's index: public worlds, newest first.
create index if not exists published_worlds_public_idx
  on public.published_worlds (updated_at desc)
  where visibility = 'public';

-- Tag filtering. GIN over the array, because `tags && '{arena}'` is the query.
create index if not exists published_worlds_tags_idx
  on public.published_worlds using gin (tags);

create index if not exists published_worlds_tenant_idx
  on public.published_worlds (tenant_id, updated_at desc);

create index if not exists published_worlds_author_idx
  on public.published_worlds (author_id, updated_at desc);

alter table public.published_worlds enable row level security;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
-- Public worlds are public in the ordinary sense of the word: /worlds is a page
-- a visitor can open without an account, the same way /demo is. That is the
-- point of publishing one.
--
-- Two policies rather than one with an `or auth.uid() is not null` in it,
-- because they are different sentences: anonymous readers get exactly the
-- public list, and a signed-in reader additionally gets their own drafts and
-- their space's.
create policy "published_worlds_select_public"
  on public.published_worlds for select
  to anon
  using (visibility = 'public');

create policy "published_worlds_select"
  on public.published_worlds for select
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
-- the caller so a world cannot be published in somebody else's name, and the
-- two origins are gated separately: a space world needs membership of that
-- space, a platform world needs the backoffice.
create policy "published_worlds_insert"
  on public.published_worlds for insert
  to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (origin = 'space' and public.tenant_role(tenant_id) is not null)
      or (origin = 'platform' and public.is_backoffice_admin())
    )
  );

-- Editing is the author's, or the space's leadership - somebody has to be able
-- to retag or unpublish a world when the person who built it has left. The
-- `with check` repeats the `using` clause so an update cannot hand a world to
-- another space or another author on its way past.
create policy "published_worlds_update"
  on public.published_worlds for update
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

create policy "published_worlds_delete"
  on public.published_worlds for delete
  to authenticated
  using (
    author_id = (select auth.uid())
    or (tenant_id is not null and public.tenant_role(tenant_id) in ('owner', 'admin'))
    or public.is_backoffice_admin()
  );
