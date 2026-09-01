-- ============================================================================
-- Reporting something somebody made, and taking it down
-- ----------------------------------------------------------------------------
-- `world_reports` (20260803080000) already does this for one kind of thing, and
-- its shape is right: a queue, an open-per-reporter index, and a side table for
-- the verdict so the projection stays rebuildable. This is the same shape for
-- everything else people publish - blueprints and the vehicles among them,
-- clips, XPs and the scripts inside them, and movies.
--
-- One table rather than six, because those are not six features. They are one:
-- somebody published something offensive and it has to go. Six tables would be
-- six policies, six queues on the moderation page, and six chances for the
-- fifth to be forgotten when a seventh kind of content ships.
--
-- The cost is that `target_id` cannot have a foreign key, because it points
-- into one of four tables depending on `kind`. That turns out to be the
-- behaviour we want rather than the price: a cascade would delete a report at
-- exactly the moment it started to matter, since the most interesting reports
-- are the ones whose target is gone - which is what upholding one causes.
--
-- See src/domain/moderation/content.ts, which holds the kind -> table mapping
-- and is the only place it is written down.
-- ============================================================================

create table if not exists public.content_reports (
  id          uuid        primary key default gen_random_uuid(),

  /**
   * What kind of thing, and which one.
   *
   * No foreign key, on purpose - see the note above. The check constraint is
   * the only guard, and it is deliberately the same list as `REPORT_KINDS`;
   * adding a kind is a migration *and* a change there, which is the right
   * amount of friction for a word that appears in a moderation queue.
   */
  kind        text        not null
                check (kind in ('blueprint', 'vehicle', 'clip', 'xp', 'script', 'movie')),
  target_id   uuid        not null,

  /**
   * What it was called when it was reported.
   *
   * Captured rather than joined, because by the time an admin opens the queue
   * the thing may be hidden, retired or deleted - and a report that reads "a
   * blueprint" and a uuid is one nobody can act on. This is a label, not
   * evidence: it is whatever the shelf was showing the person who complained.
   */
  title       text,

  /** Who reported it, and from which space. */
  reported_by uuid        references auth.users (id) on delete set null,
  tenant_id   uuid        references public.tenants_read_model (id) on delete set null,

  reason      text        not null,
  status      text        not null default 'open'
                check (status in ('open', 'upheld', 'dismissed')),
  resolved_by uuid        references auth.users (id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists content_reports_open_idx
  on public.content_reports (status, created_at desc);

create index if not exists content_reports_target_idx
  on public.content_reports (kind, target_id);

-- One open report per person per thing. Without it a frustrated reporter's
-- repeated clicking becomes a queue of identical rows - and makes the report
-- count look like consensus. The same index `world_reports` carries.
create unique index if not exists content_reports_one_open_per_reporter_idx
  on public.content_reports (kind, target_id, reported_by)
  where status = 'open';

alter table public.content_reports enable row level security;

-- Anybody signed in may report, and may read back what they filed. Deliberately
-- *not* readable by the space being reported: knowing who complained is the
-- thing that makes people not complain.
create policy "content_reports_insert_own"
  on public.content_reports for insert
  to authenticated
  with check (reported_by = (select auth.uid()));

create policy "content_reports_select_own"
  on public.content_reports for select
  to authenticated
  using (reported_by = (select auth.uid()));

create policy "content_reports_admin_all"
  on public.content_reports for all
  to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

-- ----------------------------------------------------------------------------
-- What upholding one does
-- ----------------------------------------------------------------------------
-- Hides rather than deletes, which is `banned_worlds`' decision and its
-- reasoning: a ban takes something off the platform, it does not confiscate
-- somebody's building. Three things follow, and all three are the point - it is
-- reversible without reconstructing anything, `resetProjection` cannot
-- resurrect something that was taken down, and the author is not silently
-- robbed. What they see is that nobody else can see it.
--
-- Readable by everyone signed in, because the queries that hide this content
-- run as the caller. Being hidden is not a secret; it is the reason something
-- vanished.
-- ----------------------------------------------------------------------------
create table if not exists public.hidden_content (
  kind       text        not null
               check (kind in ('blueprint', 'vehicle', 'clip', 'xp', 'script', 'movie')),
  target_id  uuid        not null,
  reason     text        not null,
  hidden_by  uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  /**
   * Keyed on the target alone, not on the kind.
   *
   * Because two kinds can name the same row - a vehicle and a blueprint are one
   * table - and a thing hidden as a `vehicle` must not still be visible to a
   * query asking about `blueprint`s. `kind` is kept for the record of what it
   * was reported as, and is not part of the identity.
   */
  primary key (target_id)
);

alter table public.hidden_content enable row level security;

create policy "hidden_content_select"
  on public.hidden_content for select
  to authenticated
  using (true);

create policy "hidden_content_admin_write"
  on public.hidden_content for all
  to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());
