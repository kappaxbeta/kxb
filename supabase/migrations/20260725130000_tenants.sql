-- ============================================================================
-- Tenants
-- ----------------------------------------------------------------------------
-- Until now every row was owned by one user and RLS was a single comparison
-- against auth.uid(). This migration re-scopes the whole system to a *tenant*:
-- events, checkpoints and read models all carry a tenant_id, and "may I see
-- this row" becomes "am I a member of this tenant".
--
-- The tenant itself is an aggregate like any other - it has a stream, its
-- history is in public.events, and its rules live in a TypeScript decider
-- (src/domain/tenants/aggregate.ts). What is *not* like any other aggregate is
-- its membership, and that distinction drives most of the design below. See
-- section 3.
--
-- The file is ordered by dependency rather than by topic: columns, then tables,
-- then the functions that read them, then the policies that call the functions.
-- SQL function bodies are parsed when the function is created, so a helper that
-- mentions events.tenant_id cannot be written before that column exists.
--
-- This migration assumes an empty log. Adding a NOT NULL tenant_id to existing
-- events would mean inventing a tenant for history that never had one, and
-- rewriting the log is exactly what an append-only store is supposed to refuse.
-- ============================================================================

do $$
begin
  if exists (select 1 from public.events limit 1) then
    raise exception using
      message = 'Refusing to run: public.events is not empty.',
      hint    = 'This migration adds a NOT NULL tenant_id and cannot invent one '
                'for existing events. Reset the database (bun run db:reset), or '
                'write a backfill migration that assigns each user a tenant.';
  end if;
end;
$$;

-- ============================================================================
-- 1. Re-shape the event store
-- ----------------------------------------------------------------------------
-- owner_id becomes actor_id. The rename is the point: the column never meant
-- "who owns this data" as well as it meant "who wrote this row", and now that
-- ownership belongs to tenant_id, leaving it called owner_id would be a lie
-- that outlives everyone who remembers it.
--
-- The old policies are dropped here rather than left to be replaced. A policy
-- expression depends on the columns it names, so anything that survives this
-- section would block the column changes in later ones.
-- ============================================================================

drop policy if exists "events_select_own" on public.events;
drop policy if exists "events_insert_own" on public.events;

alter table public.events rename column owner_id to actor_id;
alter table public.events add column tenant_id uuid not null;

drop index if exists public.events_owner_seq_idx;

-- The cursor index. Projections read forward within one tenant, so this is the
-- shape every projection query uses.
create index if not exists events_tenant_seq_idx
  on public.events (tenant_id, global_seq);

-- ============================================================================
-- 2. Slug reservation
-- ----------------------------------------------------------------------------
-- "No two tenants may share a slug" is a rule about the *set* of tenants, and
-- an aggregate can only see its own stream. A decider folding one tenant's
-- events has no idea what the others are called, so it physically cannot
-- enforce uniqueness - this is the classic set-based validation problem.
--
-- The fix is a reservation: claim the slug in a table with a primary key, and
-- only then append TenantCreated. Postgres enforces uniqueness, the aggregate
-- stays ignorant of its siblings, and a lost race surfaces as a 23505 that the
-- action turns into "that URL is taken".
--
-- Slugs are never re-pointed at a different tenant, which is why there is no
-- update policy: the claim is the identity of the tenant's URL.
-- ============================================================================

create table if not exists public.tenant_slugs (
  slug       text        primary key,
  tenant_id  uuid        not null unique,
  -- Nullable, and ON DELETE SET NULL rather than CASCADE: deleting the account
  -- that created a workspace must not release that workspace's URL while it is
  -- still there for everyone else.
  claimed_by uuid        references auth.users (id) on delete set null,
  claimed_at timestamptz not null default now(),

  -- 2-40 characters, no leading or trailing hyphen. Mirrors slugSchema in
  -- src/domain/tenants/commands.ts; the copy here is the one that cannot be
  -- bypassed by talking to PostgREST directly.
  constraint tenant_slugs_shape check (slug ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$')
);

-- ============================================================================
-- 3. Trusted projections: membership and invitations
-- ----------------------------------------------------------------------------
-- Everywhere else in this codebase, read models are built in TypeScript, are
-- eventually consistent, and are written by the signed-in user (see
-- src/es/projection.ts). Membership cannot work that way, for two reasons:
--
--   1. RLS depends on it. If "am I an admin" is answered by a table the user
--      themselves is allowed to write, then any member can UPDATE their own row
--      to role='owner' and escalate. Authorization state must not be
--      user-writable.
--
--   2. Timing. A user creating a tenant, or accepting an invitation, has to be
--      allowed to write the *next* event in the same batch. An async projection
--      that catches up "soon" is too late - the second INSERT is already being
--      policy-checked.
--
-- So these two tables are maintained by a SECURITY DEFINER trigger on
-- public.events (section 6), in the same transaction as the append. They are
-- still derived data - drop them, replay the log, get them back - but derived
-- *synchronously and by the database*, because they are the security boundary
-- rather than a view for the UI.
--
-- The rule of thumb: projections that answer "what should I render" can be
-- async and rebuildable. Projections that answer "what am I allowed to do"
-- cannot.
-- ============================================================================

create table if not exists public.tenant_members (
  tenant_id uuid        not null,
  user_id   uuid        not null references auth.users (id) on delete cascade,
  email     text        not null,
  role      text        not null check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null,

  primary key (tenant_id, user_id)
);

create index if not exists tenant_members_user_idx
  on public.tenant_members (user_id);

-- Invitations are keyed by email, not user id: the whole point is that the
-- invitee may not have an account yet. An invitation becomes a membership at
-- the moment it is accepted, which is when a user id finally exists.
create table if not exists public.tenant_invitations (
  tenant_id  uuid        not null,
  email      text        not null,
  role       text        not null check (role in ('admin', 'member')),
  invited_by uuid        not null references auth.users (id) on delete cascade,
  invited_at timestamptz not null,

  primary key (tenant_id, email)
);

create index if not exists tenant_invitations_email_idx
  on public.tenant_invitations (email);

-- ============================================================================
-- 4. Authorization helpers
-- ----------------------------------------------------------------------------
-- Every policy in this migration is written in terms of these functions.
--
-- They are SECURITY DEFINER so they can read the tables above without being
-- subject to those tables' own policies - otherwise "you may read
-- tenant_members if you are a member" would have to consult tenant_members to
-- decide, and recurse forever.
-- ============================================================================

create or replace function public.tenant_role(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.role
    from public.tenant_members m
   where m.tenant_id = p_tenant_id
     and m.user_id = (select auth.uid());
$$;

comment on function public.tenant_role(uuid) is
  'The caller''s role in a tenant, or NULL if they are not a member.';

-- Does this tenant exist at all - as opposed to "can you see any of it".
--
-- The two answers differ exactly when somebody has lost their membership, which
-- is the case the slug delete policy below has to get right: written as a plain
-- subquery it would run under the caller's own RLS, so an ex-member would see
-- no events, conclude the workspace was never created, and be allowed to
-- release a live workspace's URL for anyone else to claim.
create or replace function public.tenant_has_events(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e where e.tenant_id = p_tenant_id
  );
$$;

-- True while a tenant id has never been written to by anyone else.
--
-- This is the bootstrap hole, and it needs to be exactly this shape. Creating a
-- tenant means appending TenantCreated *before* any membership exists, so the
-- insert policy cannot require membership. Allowing "nobody else has touched
-- this id" is enough: the moment another user has written to a tenant this is
-- false for everyone but them, and once the trigger has recorded a membership
-- the normal rules take over.
create or replace function public.tenant_is_unclaimed(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
      from public.events e
     where e.tenant_id = p_tenant_id
       and e.actor_id <> (select auth.uid())
  );
$$;

create or replace function public.has_tenant_invitation(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.tenant_invitations i
     where i.tenant_id = p_tenant_id
       and i.email = lower((select auth.jwt() ->> 'email'))
  );
$$;

-- Which tenant a stream belongs to. A stream is bound to one tenant for life;
-- this exists so append_events() can enforce that without RLS hiding the
-- evidence - a member of tenant A must not be able to append into a stream
-- belonging to tenant B just because they cannot see B's rows.
create or replace function public.stream_tenant(p_stream_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.tenant_id
    from public.events e
   where e.stream_id = p_stream_id
   limit 1;
$$;

grant execute on function public.tenant_role(uuid)           to authenticated;
grant execute on function public.tenant_has_events(uuid)     to authenticated;
grant execute on function public.tenant_is_unclaimed(uuid)   to authenticated;
grant execute on function public.has_tenant_invitation(uuid) to authenticated;
grant execute on function public.stream_tenant(uuid)         to authenticated;

-- ============================================================================
-- 5. Policies
-- ============================================================================

-- ----------------------------------------------------------------------------
-- events
-- ----------------------------------------------------------------------------
-- Members read their tenant's whole log.
--
-- The second branch lets someone holding an invitation read the tenant stream
-- and nothing else. They need it: accepting an invitation is a command, and a
-- command has to load the stream it decides against. It does mean an invitee
-- can see the tenant's membership history - who joined, who left - before they
-- accept. That is a real disclosure, and it is bounded to stream_type='tenant'
-- precisely so it stops there; tasks stay invisible until they are a member.
create policy "events_select_tenant"
  on public.events for select
  using (
    public.tenant_role(tenant_id) is not null
    or (stream_type = 'tenant' and public.has_tenant_invitation(tenant_id))
  );

-- Still no UPDATE or DELETE policy anywhere: the log is append-only, and the
-- absence of a policy is what enforces it.
create policy "events_insert_tenant"
  on public.events for insert
  with check (
    actor_id = (select auth.uid())
    and (
      public.tenant_role(tenant_id) is not null
      or public.tenant_is_unclaimed(tenant_id)
      or (stream_type = 'tenant' and public.has_tenant_invitation(tenant_id))
    )
  );

-- ----------------------------------------------------------------------------
-- tenant_slugs
-- ----------------------------------------------------------------------------

alter table public.tenant_slugs enable row level security;

-- Any signed-in user may resolve a slug to a tenant id. They still cannot read
-- the tenant's events or read models without a membership - this only reveals
-- that the name is taken, which is unavoidable for anything handing out unique
-- public URLs.
create policy "tenant_slugs_select_authenticated"
  on public.tenant_slugs for select
  to authenticated
  using (true);

create policy "tenant_slugs_insert_own"
  on public.tenant_slugs for insert
  to authenticated
  with check (claimed_by = (select auth.uid()));

-- Only to clean up a claim whose TenantCreated never landed. Once the tenant
-- has events, the claim is permanent.
create policy "tenant_slugs_delete_unused"
  on public.tenant_slugs for delete
  to authenticated
  using (
    claimed_by = (select auth.uid())
    and not public.tenant_has_events(tenant_id)
  );

-- ----------------------------------------------------------------------------
-- tenant_members / tenant_invitations
-- ----------------------------------------------------------------------------
-- Readable by the tenant, writable by nobody. There is deliberately no
-- INSERT/UPDATE/DELETE policy: the only writer is the SECURITY DEFINER trigger
-- below, which derives every row from an event that already passed the events
-- insert policy.
-- ----------------------------------------------------------------------------

alter table public.tenant_members enable row level security;
alter table public.tenant_invitations enable row level security;

create policy "tenant_members_select_same_tenant"
  on public.tenant_members for select
  using (public.tenant_role(tenant_id) is not null);

-- Two audiences: members of the tenant see who is pending, and the invitee sees
-- their own invitation - which is how it shows up on /invitations before they
-- have any relationship to the tenant at all.
create policy "tenant_invitations_select_visible"
  on public.tenant_invitations for select
  using (
    public.tenant_role(tenant_id) is not null
    or email = lower((select auth.jwt() ->> 'email'))
  );

-- ============================================================================
-- 6. The trusted membership trigger
-- ----------------------------------------------------------------------------
-- Mirrors the tenant aggregate's membership decisions into the two tables RLS
-- consults. This is intentionally dumb: it records what the event says, and it
-- is the decider in src/domain/tenants/aggregate.ts that decides whether the
-- event was allowed to happen at all. Keeping the rules in TypeScript and only
-- the consequence in SQL is what stops this from becoming a second, divergent
-- implementation of the domain.
--
-- Note InvitationAccepted writes the membership *and* clears the invitation in
-- one step. Splitting it would strand the invitee mid-batch: their invitation
-- would be gone while their membership did not yet exist, and the next INSERT
-- in the same command would fail the events insert policy.
-- ============================================================================

create or replace function public.sync_tenant_authorization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  case new.type
    when 'MemberJoined' then
      insert into public.tenant_members (tenant_id, user_id, email, role, joined_at)
      values (
        new.tenant_id,
        (new.data ->> 'userId')::uuid,
        lower(new.data ->> 'email'),
        new.data ->> 'role',
        new.created_at
      )
      on conflict (tenant_id, user_id) do update
        set role  = excluded.role,
            email = excluded.email;

    when 'MemberInvited' then
      insert into public.tenant_invitations (tenant_id, email, role, invited_by, invited_at)
      values (
        new.tenant_id,
        lower(new.data ->> 'email'),
        new.data ->> 'role',
        new.actor_id,
        new.created_at
      )
      on conflict (tenant_id, email) do update
        set role       = excluded.role,
            invited_by = excluded.invited_by,
            invited_at = excluded.invited_at;

    when 'InvitationAccepted' then
      insert into public.tenant_members (tenant_id, user_id, email, role, joined_at)
      values (
        new.tenant_id,
        (new.data ->> 'userId')::uuid,
        lower(new.data ->> 'email'),
        new.data ->> 'role',
        new.created_at
      )
      on conflict (tenant_id, user_id) do update
        set role  = excluded.role,
            email = excluded.email;

      delete from public.tenant_invitations
       where tenant_id = new.tenant_id
         and email = lower(new.data ->> 'email');

    when 'InvitationRevoked', 'InvitationDeclined' then
      delete from public.tenant_invitations
       where tenant_id = new.tenant_id
         and email = lower(new.data ->> 'email');

    when 'MemberRoleChanged' then
      update public.tenant_members
         set role = new.data ->> 'role'
       where tenant_id = new.tenant_id
         and user_id = (new.data ->> 'userId')::uuid;

    when 'MemberRemoved', 'MemberLeft' then
      delete from public.tenant_members
       where tenant_id = new.tenant_id
         and user_id = (new.data ->> 'userId')::uuid;

    else
      -- TenantCreated, TenantRenamed, TenantArchived, and anything a future
      -- version adds. Not authorization state; the TypeScript projection deals
      -- with those.
      null;
  end case;

  return null;
end;
$$;

drop trigger if exists events_sync_tenant_authorization on public.events;

create trigger events_sync_tenant_authorization
  after insert on public.events
  for each row
  when (new.stream_type = 'tenant')
  execute function public.sync_tenant_authorization();

-- ============================================================================
-- 7. append_events(), now tenant-aware
-- ----------------------------------------------------------------------------
-- Same contract as before plus p_tenant_id, and one new check: a stream may
-- never change tenants. Without it, a member of A who learned a stream id
-- belonging to B could append rows tagged A into B's stream and break B's
-- version sequence - invisible to B, since RLS would hide those rows from them.
-- ============================================================================

drop function if exists public.append_events(uuid, text, integer, jsonb);

create or replace function public.append_events(
  p_tenant_id        uuid,
  p_stream_id        uuid,
  p_stream_type      text,
  p_expected_version integer,
  p_events           jsonb
)
returns setof public.events
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actual_version integer;
  v_stream_tenant  uuid;
  v_event          jsonb;
  v_version        integer;
begin
  if (select auth.uid()) is null then
    raise exception 'append_events: not authenticated'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'append_events: p_events must be a JSON array, got %',
      coalesce(jsonb_typeof(p_events), 'null')
      using errcode = '22023';
  end if;

  -- Nothing to do. A decider that returns no events is a valid no-op.
  if jsonb_array_length(p_events) = 0 then
    return;
  end if;

  v_stream_tenant := public.stream_tenant(p_stream_id);

  if v_stream_tenant is not null and v_stream_tenant <> p_tenant_id then
    raise exception
      'append_events: stream % belongs to another tenant', p_stream_id
      using errcode = '42501';
  end if;

  select coalesce(max(version), 0)
    into v_actual_version
    from public.events
   where stream_id = p_stream_id;

  if v_actual_version <> p_expected_version then
    raise exception
      'append_events: concurrency conflict on stream % (expected version %, actual %)',
      p_stream_id, p_expected_version, v_actual_version
      using errcode = '40001';
  end if;

  v_version := v_actual_version;

  for v_event in select * from jsonb_array_elements(p_events)
  loop
    v_version := v_version + 1;

    return query
      insert into public.events (
        tenant_id, stream_id, stream_type, version, type, data, metadata, actor_id
      )
      values (
        p_tenant_id,
        p_stream_id,
        p_stream_type,
        v_version,
        v_event ->> 'type',
        coalesce(v_event -> 'data', '{}'::jsonb),
        coalesce(v_event -> 'metadata', '{}'::jsonb),
        (select auth.uid())
      )
      returning *;
  end loop;
end;
$$;

-- ============================================================================
-- 8. Re-scope the projection checkpoints
-- ----------------------------------------------------------------------------
-- The cursor used to be per (projection, user) because each user had a private
-- slice of the log. Now the slice belongs to the tenant, so the cursor does
-- too - and every member of a tenant shares one, which is what makes the read
-- model shared rather than rebuilt per person.
-- ============================================================================

-- Policies first: a policy expression depends on the columns it names, and
-- Postgres refuses to drop a column out from under one.
drop policy if exists "checkpoints_select_own" on public.projection_checkpoints;
drop policy if exists "checkpoints_insert_own" on public.projection_checkpoints;
drop policy if exists "checkpoints_update_own" on public.projection_checkpoints;

alter table public.projection_checkpoints drop constraint projection_checkpoints_pkey;
alter table public.projection_checkpoints drop column owner_id;
alter table public.projection_checkpoints add column tenant_id uuid not null;
alter table public.projection_checkpoints
  add constraint projection_checkpoints_pkey primary key (projection, tenant_id);

create policy "checkpoints_select_tenant"
  on public.projection_checkpoints for select
  using (public.tenant_role(tenant_id) is not null);

create policy "checkpoints_insert_tenant"
  on public.projection_checkpoints for insert
  with check (
    public.tenant_role(tenant_id) is not null
    or public.tenant_is_unclaimed(tenant_id)
  );

create policy "checkpoints_update_tenant"
  on public.projection_checkpoints for update
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

-- ============================================================================
-- 9. Read model: tenants
-- ----------------------------------------------------------------------------
-- Built in TypeScript by src/domain/tenants/projection.ts, unlike the two
-- membership tables in section 3. Nothing here is consulted by a policy, so it
-- is free to be eventually consistent and user-writable like any other read
-- model.
--
-- Note what is *not* here: a member_count column. Counting is accumulation, and
-- accumulation is not idempotent - a replayed MemberJoined would count twice.
-- The members list is a cheap query against tenant_members, so the honest
-- answer is to not cache it.
-- ============================================================================

create table if not exists public.tenants_read_model (
  -- Same id as the aggregate's stream_id, and the same id every other table
  -- means by tenant_id.
  id         uuid        primary key,
  slug       text        not null,
  name       text        not null,
  archived   boolean     not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version    integer     not null
);

create index if not exists tenants_read_model_slug_idx
  on public.tenants_read_model (slug);

alter table public.tenants_read_model enable row level security;

create policy "tenants_read_model_select_member"
  on public.tenants_read_model for select
  using (
    public.tenant_role(id) is not null
    or public.has_tenant_invitation(id)
  );

create policy "tenants_read_model_insert_member"
  on public.tenants_read_model for insert
  with check (
    public.tenant_role(id) is not null
    or public.tenant_is_unclaimed(id)
  );

create policy "tenants_read_model_update_member"
  on public.tenants_read_model for update
  using (public.tenant_role(id) is not null)
  with check (public.tenant_role(id) is not null);

create policy "tenants_read_model_delete_member"
  on public.tenants_read_model for delete
  using (public.tenant_role(id) in ('owner', 'admin'));

-- ============================================================================
-- 10. Re-scope the tasks read model
-- ----------------------------------------------------------------------------
-- Tasks stop being personal. The list is the tenant's, every member sees the
-- same rows, and created_by is kept so the UI can say who added what - it comes
-- from the event's actor_id, not from a session at render time.
-- ============================================================================

-- Again, policies before columns.
drop policy if exists "tasks_read_model_select_own" on public.tasks_read_model;
drop policy if exists "tasks_read_model_insert_own" on public.tasks_read_model;
drop policy if exists "tasks_read_model_update_own" on public.tasks_read_model;
drop policy if exists "tasks_read_model_delete_own" on public.tasks_read_model;

alter table public.tasks_read_model drop column owner_id;
alter table public.tasks_read_model add column tenant_id uuid not null;
alter table public.tasks_read_model add column created_by uuid not null;

drop index if exists public.tasks_read_model_owner_idx;

create index if not exists tasks_read_model_tenant_idx
  on public.tasks_read_model (tenant_id, deleted, created_at desc);

create policy "tasks_read_model_select_tenant"
  on public.tasks_read_model for select
  using (public.tenant_role(tenant_id) is not null);

create policy "tasks_read_model_insert_tenant"
  on public.tasks_read_model for insert
  with check (public.tenant_role(tenant_id) is not null);

create policy "tasks_read_model_update_tenant"
  on public.tasks_read_model for update
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

create policy "tasks_read_model_delete_tenant"
  on public.tasks_read_model for delete
  using (public.tenant_role(tenant_id) is not null);
