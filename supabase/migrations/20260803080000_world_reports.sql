-- ============================================================================
-- Reporting a world, and banning one
-- ----------------------------------------------------------------------------
-- A battlefield can be opened to every space on the platform. That is the point
-- of `visibility = 'public'`, and it is also the moment a space's private room
-- becomes something strangers can be sent into - so there has to be a way to
-- say "this one is not alright" and somebody able to act on it.
--
-- Plain tables rather than an aggregate, for the same reason `feature_flags`
-- and `backoffice_admins` are: this is platform moderation, it belongs to
-- nobody's workspace, and the interesting history is the two columns that say
-- who acted and why. Putting a ban on the battlefield's own stream would be
-- worse than merely inelegant - the stream belongs to the space being
-- moderated, and RLS lets that space write to it.
-- ============================================================================

create table if not exists public.world_reports (
  id          uuid        primary key default gen_random_uuid(),
  /** The battlefield being reported. */
  world_id    uuid        not null references public.battlefields_read_model (world_id) on delete cascade,
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

create index if not exists world_reports_open_idx
  on public.world_reports (status, created_at desc);

create index if not exists world_reports_world_idx
  on public.world_reports (world_id);

-- One open report per person per world. Without it, a frustrated reporter's
-- repeated clicking becomes a queue of identical rows for an admin to wade
-- through - and makes the report count look like consensus.
create unique index if not exists world_reports_one_open_per_reporter_idx
  on public.world_reports (world_id, reported_by)
  where status = 'open';

alter table public.world_reports enable row level security;

-- Anybody signed in may report a world they can see, and may read back the
-- reports they filed. Deliberately *not* readable by the space being reported:
-- knowing who complained is the thing that makes people not complain.
create policy "world_reports_insert_own"
  on public.world_reports for insert
  to authenticated
  with check (reported_by = (select auth.uid()));

create policy "world_reports_select_own"
  on public.world_reports for select
  to authenticated
  using (reported_by = (select auth.uid()));

-- Backoffice admins see and resolve everything. `is_backoffice_admin()` is the
-- same email-allowlist function the rest of the backoffice is gated on.
create policy "world_reports_admin_all"
  on public.world_reports for all
  to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

-- ----------------------------------------------------------------------------
-- The ban list
-- ----------------------------------------------------------------------------
-- Separate from `battlefields_read_model` rather than a column on it, because
-- that table is a projection: it is rebuilt from the battlefield's event
-- stream, and a ban is not something that stream says. Keeping it out here
-- means `resetProjection` can rebuild every arena from the log without
-- resurrecting a banned one.
--
-- Readable by everyone signed in, because the queries that hide banned worlds
-- run as the caller. A ban is not a secret - it is the reason an arena
-- vanished.
-- ----------------------------------------------------------------------------
create table if not exists public.banned_worlds (
  world_id   uuid        primary key references public.battlefields_read_model (world_id) on delete cascade,
  reason     text        not null,
  banned_by  uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.banned_worlds enable row level security;

create policy "banned_worlds_select"
  on public.banned_worlds for select
  to authenticated
  using (true);

create policy "banned_worlds_admin_write"
  on public.banned_worlds for all
  to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

-- ----------------------------------------------------------------------------
-- A banned arena stops being readable by outsiders
-- ----------------------------------------------------------------------------
-- The select policy added in 20260803040000 let anybody read the blocks of a
-- public battlefield. That is exactly the reach a ban has to cut off, so the
-- policy is replaced with one that excludes banned worlds.
--
-- The space that built it keeps full access through its own policy - a ban
-- takes an arena off the platform, it does not confiscate somebody's building.
-- ----------------------------------------------------------------------------
drop policy if exists "lounge_blocks_read_model_select_public_battlefield" on public.lounge_blocks_read_model;
create policy "lounge_blocks_read_model_select_public_battlefield"
  on public.lounge_blocks_read_model for select
  to authenticated
  using (
    exists (
      select 1
      from public.battlefields_read_model b
      where b.world_id = lounge_blocks_read_model.world_id
        and b.visibility = 'public'
        and b.archived = false
        and not exists (
          select 1 from public.banned_worlds x where x.world_id = b.world_id
        )
    )
  );

-- Same for the arena's own row: a banned world drops out of every space's
-- search. Its owners still see it, through the membership clause.
drop policy if exists "battlefields_select" on public.battlefields_read_model;
create policy "battlefields_select"
  on public.battlefields_read_model for select
  to authenticated
  using (
    public.tenant_role(tenant_id) is not null
    or (
      visibility = 'public'
      and archived = false
      and not exists (
        select 1 from public.banned_worlds x where x.world_id = battlefields_read_model.world_id
      )
    )
  );
