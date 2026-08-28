-- ============================================================================
-- XP projects: a game becomes a folder, owned by an account, living in a space
-- ----------------------------------------------------------------------------
-- B2 of docs/xp/backend.md. Until now an XP has been a file in `public/xp/xps/`
-- - which docs/xp/creator.md §3.1 chose deliberately and defended well, on the
-- grounds that a tool three people open has no permission story to answer. This
-- is the revisit, and what changed is not the number of people: it is that an
-- XP now carries its own art, so the document stopped being the whole game and
-- became the index of one.
--
-- ---------------------------------------------------------------------------
-- The two facts every project carries, and why they are different columns
-- ---------------------------------------------------------------------------
-- `owner_id` is an account. `tenant_id` is a space. They are not the same
-- question and collapsing them loses one of the answers:
--
--   * The owner named it, can publish it, transfer it and delete it, and
--     nobody can take it from them.
--   * The space is where it lives, who else can see it, and whose subscription
--     pays for the bytes. The space's owner may always *remove* a project from
--     their space - it is their space and their bill - and may never edit,
--     rename, publish or become the owner of one.
--
-- Both columns are here from the first migration rather than added later.
-- Ownership is the shape of this table, not a feature on top of it, and
-- retrofitting an owner onto rows that already exist means inventing one.
--
-- ---------------------------------------------------------------------------
-- A project cannot leave its space, and that is the schema talking
-- ---------------------------------------------------------------------------
-- `events.tenant_id` is not null and the log is append-only, so a project
-- cannot change space by changing a field. Moving one is a *copy*: a new stream
-- in the target tenant carrying the current document and manifest, the blobs
-- re-keyed under the new tenant's prefix, and `XpMovedOut` closing the
-- original. Nothing in this migration makes that easier or harder; it is
-- recorded here because the shape of these tables only makes sense once you
-- know a move is not an update.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The bucket
-- ----------------------------------------------------------------------------
-- Private, with no policies on `storage.objects`, exactly as `uploads` is and
-- for the reason written at length in 20260901000000_uploads_storage.sql: the
-- authorization record is the row, the serving route is the only door, and a
-- public policy here would quietly reopen the hole these tables exist to close.
--
-- The mime list is the one `src/lib/xp-formats.ts` sniffs for, so a file whose
-- bytes say PNG can still only be stored as something on this list. It is the
-- backstop for a future bug in the sniffer, not the check - the check ran
-- before anything reached Storage.
--
-- No `.html`, no `.js`, and no `image/svg+xml`. See docs/xp/backend.md §1.2:
-- serving a stranger's markup from our origin is stored XSS with the visitor's
-- session, and the containment that works is a second origin rather than a
-- careful list.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'xp',
  'xp',
  false,
  -- The largest per-file cap in CAPS.bytes (video, 32MB). Per-kind caps are
  -- enforced in `xp-intake.ts`; this is the one number Storage can express.
  33554432,
  array[
    'application/json',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'audio/ogg', 'audio/wav', 'audio/mpeg',
    'video/mp4', 'video/webm',
    'model/gltf-binary'
  ]
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- xp_files: one row per distinct blob per space
-- ----------------------------------------------------------------------------
-- Content-addressed, which is what makes a save a diff: the editor sends a
-- manifest, the server answers with the hashes it does not hold, and an
-- unchanged 16MB model is never uploaded twice. Ten published versions of a
-- project share every asset that did not change between them.
--
-- Keyed by (tenant_id, sha) rather than by sha alone even though the hash makes
-- collisions impossible. Two reasons, and neither is paranoia: a global
-- namespace would let one space confirm another holds a given file by uploading
-- it and watching the dedup, and "delete everything this space ever uploaded"
-- is a prefix rather than a query.
create table if not exists public.xp_files (
  tenant_id   uuid        not null references public.tenants_read_model (id) on delete cascade,
  /** sha256 of the stored bytes, hex. Also the object key's stem. */
  sha         text        not null check (sha ~ '^[0-9a-f]{64}$'),
  ext         text        not null check (ext ~ '^[a-z0-9]{1,8}$'),
  mime        text        not null,
  bytes       bigint      not null check (bytes > 0),

  /**
   * The verdict of the check that let this in.
   *
   * `clean` is the only value the app writes today, because every check in
   * `src/lib/xp-intake.ts` is inline - a failure returns an error instead of
   * inserting a row. `pending` and `rejected` exist for the day a scanner runs
   * off the request, and the serving route already filters on `clean`, which is
   * the entire difference between a quarantine state and a column nobody reads.
   *
   * The same column, the same three values and the same argument as
   * `uploads.scan_status` (20260919000000). Deliberately not shared: that one
   * belongs to a pipeline with its own caps and its own bucket, and one table
   * serving both would be a join on every asset read.
   */
  scan_status text        not null default 'clean'
    check (scan_status in ('pending', 'clean', 'rejected')),

  created_at  timestamptz not null default now(),

  primary key (tenant_id, sha)
);

-- What a space is holding, for the byte quota and for a retention sweep.
create index if not exists xp_files_tenant_idx
  on public.xp_files (tenant_id, created_at);

-- Partial, because the serving route only ever asks for clean rows and the
-- planner should not walk the others. Also keeps an eventual "what is still
-- pending" sweep cheap by staying small.
create index if not exists xp_files_unclean_idx
  on public.xp_files (created_at)
  where scan_status <> 'clean';

alter table public.xp_files enable row level security;

-- Members of the space that holds the bytes. The serving route does not use
-- these policies - it reads with the service-role client after checking the
-- project - so this is what the editor's save handshake runs under.
create policy "xp_files_select"
  on public.xp_files for select
  to authenticated
  using (public.tenant_role(tenant_id) is not null);

create policy "xp_files_insert"
  on public.xp_files for insert
  to authenticated
  with check (public.tenant_role(tenant_id) is not null);

-- No update and no delete. A content address cannot come to mean different
-- bytes, so there is nothing to update; collection is a sweep that runs as the
-- service role, not something a member does by hand.

-- ----------------------------------------------------------------------------
-- xps_read_model: the projection both browse pages query
-- ----------------------------------------------------------------------------
create table if not exists public.xps_read_model (
  /** The project's stream id. */
  id                uuid        primary key,

  /** Where it lives, and whose bill it is on. */
  tenant_id         uuid        not null references public.tenants_read_model (id) on delete cascade,
  /**
   * Whose it is.
   *
   * `on delete set null` rather than cascade: a deleted account must not take a
   * space's project with it. What is left is an ownerless project the space can
   * still remove, which is recoverable; the other direction destroys work
   * belonging to people who are still here.
   */
  owner_id          uuid        references auth.users (id) on delete set null,

  name              text        not null,
  blurb             text,

  /**
   * docs/xp/backend.md §7.3. `unlisted` rather than back to `draft` on
   * unpublish, because a project that was live has links pointing at it and
   * dropping those to a 404 is worse than a page saying it was taken down.
   */
  state             text        not null default 'draft'
    check (state in ('draft', 'submitted', 'published', 'unlisted', 'removed', 'archived')),

  /** What every member of the home space may do, over and above their grants. */
  space_policy      text        not null default 'none'
    check (space_policy in ('none', 'view', 'edit')),

  /** The newest save. Moves on every save, including while published. */
  current_version   integer     not null default 0,
  /**
   * What the store serves, which is deliberately not `current_version`.
   *
   * Editing a published project does not move the store. This is the single
   * most important rule in the state machine: a system where publishing
   * approves *a project* rather than *a version of one* is a system where the
   * review is theatre, because the next save can be anything.
   */
  published_version integer,

  /** Path within the folder, resolved against the manifest at serve time. */
  cover_path        text,

  plays             bigint      not null default 0,
  bytes             bigint      not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  version           integer     not null default 0
);

-- The space library. Partial, because a library never asks for archived work.
create index if not exists xps_tenant_idx
  on public.xps_read_model (tenant_id, updated_at desc)
  where state <> 'archived';

-- "Everything I own, wherever it lives" - docs/xp/backend.md §7.6, and the
-- reason `owner_id` is a column rather than a fact inside the log. One query
-- instead of a fan-out across every space somebody belongs to.
create index if not exists xps_owner_idx
  on public.xps_read_model (owner_id, updated_at desc)
  where state <> 'archived';

-- The public store.
create index if not exists xps_published_idx
  on public.xps_read_model (updated_at desc)
  where state = 'published';

alter table public.xps_read_model enable row level security;

-- ----------------------------------------------------------------------------
-- xp_grants: one row per person a project is shared with
-- ----------------------------------------------------------------------------
-- Its own table rather than an array on the row, because it is joined against
-- on every read and because revoking one person should not rewrite the row
-- every reader is looking at.
--
-- Sharing is the owner's power and not the space's (§7.4): an `edit` grant
-- survives the grantee leaving the space, and the owner is who revokes it. If
-- sharing were a space power, a space admin could hand somebody else's work to
-- a third party.
create table if not exists public.xp_grants (
  xp_id      uuid        not null references public.xps_read_model (id) on delete cascade,
  account_id uuid        not null references auth.users (id) on delete cascade,
  "right"    text        not null check ("right" in ('view', 'edit')),
  granted_by uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  primary key (xp_id, account_id)
);

create index if not exists xp_grants_account_idx
  on public.xp_grants (account_id);

alter table public.xp_grants enable row level security;

-- ----------------------------------------------------------------------------
-- Who may read a project
-- ----------------------------------------------------------------------------
-- Four ways in, and they are OR-ed because they are four different
-- relationships rather than four levels of one. Written as a function so that
-- the read model, the versions table and any future reader ask the same
-- question - the permission ladder in §7.4 is one function in TypeScript for
-- the same reason, and these two are the two copies that have to agree.
--
-- `security definer` so it can read `xp_grants` while deciding whether the
-- caller may read `xps_read_model`, without needing a policy on the grants
-- table that would itself have to consult the project. That mutual recursion is
-- the failure mode this avoids, and it is why the search path is pinned.
create or replace function public.may_read_xp(p_xp_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.xps_read_model x
    where x.id = p_xp_id
      and (
        -- Published is published. No account required, which is the whole of
        -- PRODUCT.md's fourth principle applied to a game.
        x.state = 'published'
        -- The owner, wherever it lives and whatever the space thinks.
        or x.owner_id = (select auth.uid())
        -- Anyone in the space, subject to what the project lets the space do.
        or (x.space_policy <> 'none' and public.tenant_role(x.tenant_id) is not null)
        -- The space's own members always see that it exists, even under
        -- `none` - it is on their bill and their owner may need to remove it.
        or public.tenant_role(x.tenant_id) is not null
        -- Somebody it was shared with.
        or exists (
          select 1 from public.xp_grants g
          where g.xp_id = x.id and g.account_id = (select auth.uid())
        )
      )
  );
$$;

comment on function public.may_read_xp(uuid) is
  'Can the caller see this project at all. The read half of the permission '
  'ladder in docs/xp/backend.md §7.4; the write half stays in TypeScript '
  'because it also depends on canWrite() and the tier, which are not facts '
  'this database has.';

create policy "xps_select"
  on public.xps_read_model for select
  using (
    state = 'published'
    or owner_id = (select auth.uid())
    or public.tenant_role(tenant_id) is not null
    or exists (
      select 1 from public.xp_grants g
      where g.xp_id = id and g.account_id = (select auth.uid())
    )
  );

-- The projection runs as the signed-in member, so the owning space's members
-- are who need insert and update. No delete policy: retiring sets `state`, and
-- the read model is rebuilt from the log rather than edited by hand.
create policy "xps_insert"
  on public.xps_read_model for insert
  to authenticated
  with check (public.tenant_role(tenant_id) is not null);

create policy "xps_update"
  on public.xps_read_model for update
  to authenticated
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

create policy "xp_grants_select"
  on public.xp_grants for select
  to authenticated
  using (
    account_id = (select auth.uid())
    or public.may_read_xp(xp_id)
  );

-- Writes go through the projection, which runs as a member of the space the
-- project lives in. The narrower rule - that only the *owner* may share - is
-- enforced in the decider, which knows who the owner is; a policy here cannot
-- ask that without reading the read model it is projecting into.
create policy "xp_grants_write"
  on public.xp_grants for all
  to authenticated
  using (
    exists (
      select 1 from public.xps_read_model x
      where x.id = xp_id and public.tenant_role(x.tenant_id) is not null
    )
  )
  with check (
    exists (
      select 1 from public.xps_read_model x
      where x.id = xp_id and public.tenant_role(x.tenant_id) is not null
    )
  );

-- ----------------------------------------------------------------------------
-- xp_versions: one row per save, immutable
-- ----------------------------------------------------------------------------
-- The document lives here rather than in the bucket. It is read on every load,
-- it is small, it is queried - capabilities, packs, which scenes - and a round
-- trip to object storage for 40kB of JSON is a round trip nobody should pay.
--
-- The manifest is the folder: path -> sha, with the bytes content-addressed in
-- `xp_files`. That indirection is what makes a save a diff, a version cheap,
-- and every asset URL permanently cacheable. See docs/xp/backend.md §6.0 for
-- the argument against storing a project as one object, of which the decisive
-- half is that a whole-project blob has no concurrency story - only a last
-- writer, who silently destroys the parts of somebody else's work they never
-- touched.
create table if not exists public.xp_versions (
  xp_id      uuid        not null references public.xps_read_model (id) on delete cascade,
  version    integer     not null check (version > 0),

  /** An XpDocument, validated by parseXp on the way in and on the way out. */
  document   jsonb       not null,
  /** { "<path>": { "sha": "...", "bytes": n, "mime": "..." } } */
  manifest   jsonb       not null,

  bytes      bigint      not null default 0,
  files      integer     not null default 0 check (files >= 0),

  created_by uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),

  primary key (xp_id, version)
);

alter table public.xp_versions enable row level security;

-- ----------------------------------------------------------------------------
-- Reading a version is a narrower question than reading a project
-- ----------------------------------------------------------------------------
-- `may_read_xp` is the wrong check here, and the difference is the whole point
-- of review. A published project is readable by anybody - that is what lets a
-- signed-out visitor play one - but a *version* of it is not: the author goes
-- on saving after approval, so `current_version` is an unreviewed draft sitting
-- on a project the world may read.
--
-- The serving route only ever asks for `published_version`, so this was never
-- reachable through the app. It was reachable through PostgREST, which serves
-- these tables directly: `xp_versions?xp_id=eq.<id>` would have handed a
-- stranger every unreviewed save of every published project. That is not a
-- degraded version of the rule, it is the rule inverted, and it was caught by
-- inserting two versions and reading them back as `anon` rather than by
-- reasoning about the policy.
--
-- So the public path is pinned to the approved number and everybody who may see
-- the draft is listed explicitly.
create or replace function public.may_read_xp_version(p_xp_id uuid, p_version integer)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.xps_read_model x
    where x.id = p_xp_id
      and (
        -- Anybody, including signed out - but only the version that was
        -- approved. `unlisted` keeps serving it so the page that says a project
        -- was taken down can still show what it was.
        (x.state in ('published', 'unlisted') and x.published_version = p_version)
        -- The owner, wherever it lives.
        or x.owner_id = (select auth.uid())
        -- Anybody in the space it lives in: it is on their bill, and a draft is
        -- the normal thing for a space library to show.
        or public.tenant_role(x.tenant_id) is not null
        -- Somebody it was shared with.
        or exists (
          select 1 from public.xp_grants g
          where g.xp_id = x.id and g.account_id = (select auth.uid())
        )
      )
  );
$$;

comment on function public.may_read_xp_version(uuid, integer) is
  'Can the caller read this particular save. Deliberately narrower than '
  'may_read_xp: a published project is world-readable and its unreviewed '
  'versions are not, which is the difference between review meaning something '
  'and review being theatre.';

create policy "xp_versions_select"
  on public.xp_versions for select
  using (public.may_read_xp_version(xp_id, version));

create policy "xp_versions_insert"
  on public.xp_versions for insert
  to authenticated
  with check (
    exists (
      select 1 from public.xps_read_model x
      where x.id = xp_id and public.tenant_role(x.tenant_id) is not null
    )
  );

-- No update, no delete. A version is what was saved at a moment; editing one
-- would mean the store could serve something nobody approved.

comment on table public.xp_versions is
  'One save. Immutable. The document is here and the assets are refs into '
  'xp_files - see docs/xp/backend.md §6.0 for why a project is not one blob.';
