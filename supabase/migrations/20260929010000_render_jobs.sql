-- ============================================================================
-- Render jobs: a scene becomes a picture, somewhere other than the tab
-- ----------------------------------------------------------------------------
-- Drawing a scene has always happened in whichever browser was looking at it.
-- That is fine for the studio, where a person is watching, and useless for
-- everything else: a card that wants a thumbnail, a post that wants a still, a
-- catalogue that wants twenty of them. Those callers do not have a canvas, and
-- the ones that do should not be made to wait behind a glTF download and a
-- shadow pass.
--
-- So a render becomes a *row* first and a picture second. That ordering is the
-- whole design and it is worth being plain about why: the alternative - render,
-- then record what happened - has no way to describe a render that was asked
-- for and never finished. A worker that dies mid-frame leaves nothing behind,
-- and "the thumbnail never appeared" is indistinguishable from "nobody ever
-- asked for one". Registering first means every render that was ever requested
-- is visible, including the ones that failed, including the ones still queued,
-- and a crashed worker leaves a `running` row with a claim time on it rather
-- than silence.
--
-- ---------------------------------------------------------------------------
-- Why the input is a document and not a foreign key
-- ---------------------------------------------------------------------------
-- The obvious table here is `(scene_id, image)`, and it would have been wrong
-- within a week. The board wants a still of a post's scene; the catalogue wants
-- a card for a saved scene; a space wants a hero image; a script wants the
-- landing page's six heaps, none of which are rows in `published_scenes` at
-- all. Keying the queue to any one of those makes the other three either
-- impossible or a second queue.
--
-- What every one of them can produce is a shot document - `src/domain/studio/
-- shot.ts` is already the one parser, and `shotFromScene` already lifts a still
-- into a shot. So the job carries the document, and `scene_id` below is
-- provenance rather than input: it says where this came from, and nothing reads
-- it to decide what to draw. A scene deleted after its thumbnail was made does
-- not invalidate the thumbnail.
--
-- Opaque to the database, like `published_scenes.document` and for the same
-- reason - it is validated by `parseShot` on the way in and on the way out, and
-- a check constraint here would be a second copy of the document's shape, kept
-- in step by hand.
-- ============================================================================

create table if not exists public.render_jobs (
  id            uuid        primary key default gen_random_uuid(),

  -- --------------------------------------------------------------------------
  -- What to draw
  -- --------------------------------------------------------------------------
  /** A ShotSpec, exactly as the studio serialises it. See the note above. */
  document      jsonb       not null,
  /**
   * Which instant of it.
   *
   * A shot is a function of time and a picture is one value of that function -
   * `sceneAt(shot, t)` in src/domain/studio/shot.ts. Zero is the first frame,
   * which is what almost every caller wants and none of them should have to
   * say.
   */
  at_seconds    real        not null default 0 check (at_seconds >= 0),
  width         integer     not null check (width between 16 and 2048),
  height        integer     not null check (height between 16 and 2048),

  -- --------------------------------------------------------------------------
  -- Where it came from
  -- --------------------------------------------------------------------------
  /**
   * Free text, and deliberately not an enum.
   *
   * This is a label for the operator watching the queue - 'board', 'catalogue',
   * 'studio', 'shoot-scenes' - and nothing branches on it. An enum would mean a
   * migration every time something new wanted a picture, which is the exact
   * coupling this table was shaped to avoid.
   */
  source        text        not null check (length(source) between 1 and 40),
  /** Provenance, not input. Null for anything not saved as a scene. */
  scene_id      uuid        references public.published_scenes(id) on delete set null,
  /** Null for a platform render. A space's renders are its own to look at. */
  tenant_id     uuid,
  requested_by  uuid        references auth.users(id) on delete set null,

  -- --------------------------------------------------------------------------
  -- What happened to it
  -- --------------------------------------------------------------------------
  status        text        not null default 'pending'
                            check (status in ('pending', 'running', 'done', 'failed')),
  /**
   * Bumped by the claim, not by the finish.
   *
   * So a worker that dies without ever reporting back still leaves evidence
   * that it tried, and a job that kills a renderer three times can be told
   * apart from a job nobody has reached yet. `claim_render_job` below is what
   * enforces the ceiling.
   */
  attempts      integer     not null default 0,
  claimed_at    timestamptz,
  finished_at   timestamptz,
  /** Why it failed, in the worker's own words. Shown in the backoffice. */
  error         text,
  /** Object key in the `renders` bucket, once there is one. */
  storage_path  text,
  created_at    timestamptz not null default now(),

  /**
   * The two states that must agree with the rest of the row.
   *
   * Not decoration: `done` with no path is a job the backoffice would render as
   * a broken image, and `failed` with no reason is a support conversation with
   * nothing in it. Both are mistakes a worker makes at four in the morning, so
   * they are refused here rather than reviewed later.
   */
  constraint render_jobs_done_has_a_picture
    check (status <> 'done' or storage_path is not null),
  constraint render_jobs_failed_has_a_reason
    check (status <> 'failed' or error is not null)
);

/**
 * The worker's query, and the only index that exists for it.
 *
 * Partial on `pending`, because that is the whole of what a drain looks at and
 * the finished rows are the part that grows without bound. A full index on
 * `status` would carry every render ever made in order to answer "is there
 * anything to do".
 */
create index if not exists render_jobs_pending_idx
  on public.render_jobs (created_at)
  where status = 'pending';

/** For the backoffice list and for a space looking at its own. */
create index if not exists render_jobs_recent_idx
  on public.render_jobs (created_at desc);

comment on table public.render_jobs is
  'A request to turn a shot document into an image. Registered before anything '
  'is drawn, so a render that was asked for and never finished is visible '
  'rather than absent.';

-- ============================================================================
-- The bucket
-- ----------------------------------------------------------------------------
-- Public, unlike `uploads`, and the difference is worth stating because the
-- note in 20260901000000_uploads_storage.sql argues hard for the opposite.
--
-- An upload is somebody's file in somebody's space, and the authorization
-- record is the `uploads` row - the bucket is private so that the route is the
-- only door. A render is a picture of a scene that was already visible to
-- whoever asked for one, addressed by a uuid nobody can guess, and its whole
-- job is to be the `src` of an `<img>` on a card. Putting it behind a route
-- would mean every board with twelve thumbnails on it makes twelve
-- authenticated round trips through the app to serve bytes that Storage can
-- serve directly.
--
-- What that does mean: a render of a *private* scene is readable by anybody
-- holding its path. That is a real trade and the reason `path` is a uuid rather
-- than the scene's name or id - a path is not derivable from anything a reader
-- might already know, so it leaks exactly as far as the page that embeds it.
-- A private scene that must not have a shareable picture must not be rendered.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'renders',
  'renders',
  true,
  -- A 2048x2048 webp of a flat-shaded scene is well under a megabyte; this is
  -- the backstop for a worker that has gone wrong, not a working limit.
  5242880,
  -- webp only. The worker encodes, so this is not a guess about what might
  -- arrive - it is the one thing that is allowed to.
  array['image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No policies on `storage.objects` for this bucket. Writing is the worker's,
-- which holds the service role and is not subject to them; reading a public
-- bucket does not consult them at all.

-- ============================================================================
-- Row level security
-- ============================================================================

alter table public.render_jobs enable row level security;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
-- You may watch a render you asked for, your space's renders, or - as an
-- operator - all of them. Note there is no anon policy: the *picture* is public
-- once it exists, the *queue* is not. What is being rendered and for whom is
-- operational detail.
create policy "render_jobs_select"
  on public.render_jobs for select
  to authenticated
  using (
    requested_by = (select auth.uid())
    or (tenant_id is not null and public.tenant_role(tenant_id) is not null)
    or public.is_backoffice_admin()
  );

-- ---------------------------------------------------------------------------
-- Registering
-- ---------------------------------------------------------------------------
-- The insert is the request, so this policy is the whole authorization story
-- for "may you queue work on our renderer". Pinned to the caller, and scoped
-- the same way a scene is: a space's render needs membership of that space, a
-- platform render needs the backoffice.
--
-- The lifecycle columns are pinned too. A caller may say what to draw; it may
-- not say that the result is already `done`, already has a path, or has
-- burned through its attempts. Everything downstream of registration belongs
-- to the worker, and the `with check` is where that is actually true rather
-- than merely intended.
create policy "render_jobs_insert"
  on public.render_jobs for insert
  to authenticated
  with check (
    requested_by = (select auth.uid())
    and status = 'pending'
    and attempts = 0
    and claimed_at is null
    and finished_at is null
    and storage_path is null
    and error is null
    and (
      (tenant_id is not null and public.tenant_role(tenant_id) is not null)
      or (tenant_id is null and public.is_backoffice_admin())
    )
  );

-- No update or delete policy for `authenticated`, deliberately. Moving a job
-- through its states is the worker's job and the worker is the service role,
-- which RLS does not apply to. A requester who could write `status` could mark
-- their own job done and point it at somebody else's object.

-- ============================================================================
-- Claiming
-- ----------------------------------------------------------------------------
-- One row, moved to `running`, atomically, by exactly one worker.
--
-- `for update skip locked` rather than a `select` followed by an `update`: two
-- workers polling the same queue will read the same top row, and both will draw
-- it. That costs a wasted SwiftShader render, which on this box is the most
-- expensive mistake available. The lock makes the second worker take the next
-- row instead of the same one.
--
-- Security definer because it writes, and the worker is the only caller that
-- should be able to. It is granted to `service_role` alone - not to
-- `authenticated`, which would let any signed-in user drain the queue into
-- `running` and strand every job in it.
-- ============================================================================

create or replace function public.claim_render_job(p_max_attempts integer default 3)
returns public.render_jobs
language sql
security definer
set search_path = public
as $$
  update public.render_jobs
     set status     = 'running',
         attempts   = attempts + 1,
         claimed_at = now()
   where id = (
     select id
       from public.render_jobs
      where status = 'pending'
        and attempts < p_max_attempts
      order by created_at
      limit 1
      for update skip locked
   )
  returning *;
$$;

revoke execute on function public.claim_render_job(integer) from public, anon, authenticated;
grant execute on function public.claim_render_job(integer) to service_role;

-- ============================================================================
-- Requeuing what a dead worker left behind
-- ----------------------------------------------------------------------------
-- A `running` row whose worker was killed - OOM on a 4GB box is the expected
-- way - stays `running` forever, because the thing that would have moved it is
-- gone. Nothing here polls; this is called at the start of a drain, so a
-- worker's first act is to clean up after the last one.
--
-- `attempts` is not reset, which is what stops a job that reliably kills the
-- renderer from being retried until the end of time: three claims and
-- `claim_render_job` stops offering it, and it sits `pending` and visible with
-- three attempts on it. Being loudly stuck is better than a crash loop.
-- ============================================================================

create or replace function public.requeue_stale_render_jobs(p_older_than interval default '10 minutes')
returns integer
language sql
security definer
set search_path = public
as $$
  with released as (
    update public.render_jobs
       set status = 'pending'
     where status = 'running'
       and claimed_at < now() - p_older_than
    returning 1
  )
  select count(*)::integer from released;
$$;

revoke execute on function public.requeue_stale_render_jobs(interval) from public, anon, authenticated;
grant execute on function public.requeue_stale_render_jobs(interval) to service_role;
