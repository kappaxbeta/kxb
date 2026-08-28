-- ============================================================================
-- Read model: which animal each member is, per workspace
-- ----------------------------------------------------------------------------
-- One row per (workspace, member). The choice is per-workspace rather than per
-- account on purpose: a team gets to theme itself, and "who am I here" is
-- allowed to have a different answer in a different room.
--
-- The row's id is the aggregate's stream_id, derived from (tenant, user) by
-- avatarStreamId() rather than stored - the same trick the block chunks use, so
-- an avatar's stream can be found without a lookup table. Note events.stream_id
-- is unique *globally*, not per tenant, which is exactly why the tenant id is
-- part of the derivation and why the user id alone would collide across
-- workspaces.
--
-- `model` is a roster id like 'penguin', validated against the allow-list in
-- src/domain/lounge/avatars.ts before it is ever written. It is not a path: the
-- renderer builds the URL, so a stale id degrades to a missing model rather than
-- an arbitrary fetch.
-- ============================================================================

create table if not exists public.lounge_avatars_read_model (
  -- Same id as the aggregate's stream_id: avatarStreamId(tenant_id, user_id).
  id         uuid        primary key,
  tenant_id  uuid        not null,
  user_id    uuid        not null,
  /** Roster id from src/domain/lounge/avatars.ts. Never a URL or a path. */
  model      text        not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version    integer     not null,
  -- One animal per member per workspace. Redundant with the derived primary key,
  -- and worth stating anyway: it is the invariant the derivation is protecting,
  -- so a future change to the id scheme fails loudly here instead of quietly
  -- giving somebody two avatars.
  constraint lounge_avatars_member_unique unique (tenant_id, user_id)
);

create index if not exists lounge_avatars_tenant_idx
  on public.lounge_avatars_read_model (tenant_id);

alter table public.lounge_avatars_read_model enable row level security;

-- Every member can read every other member's avatar. That is the point: you
-- cannot render somebody in the room without knowing which animal they are.
drop policy if exists "lounge_avatars_select_tenant" on public.lounge_avatars_read_model;
create policy "lounge_avatars_select_tenant"
  on public.lounge_avatars_read_model for select
  using (public.tenant_role(tenant_id) is not null);

-- Writes are membership-scoped rather than `user_id = auth.uid()`, which looks
-- looser than it should be and is not.
--
-- A projection catches the tenant up on *every* pending event under whichever
-- session happened to trigger it. So when Alice changes her animal, her
-- projection run may also be the one that first processes Bob's earlier choice -
-- writing a row where user_id is Bob while auth.uid() is Alice. A self-only
-- check would make that run fail, and the failure would land on whoever
-- unluckily went second.
--
-- The authorization that matters is upstream: the server action proves
-- membership through requireTenant() and the decider only ever emits an event
-- for its own actor.
drop policy if exists "lounge_avatars_insert_tenant" on public.lounge_avatars_read_model;
create policy "lounge_avatars_insert_tenant"
  on public.lounge_avatars_read_model for insert
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "lounge_avatars_update_tenant" on public.lounge_avatars_read_model;
create policy "lounge_avatars_update_tenant"
  on public.lounge_avatars_read_model for update
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "lounge_avatars_delete_tenant" on public.lounge_avatars_read_model;
create policy "lounge_avatars_delete_tenant"
  on public.lounge_avatars_read_model for delete
  using (public.tenant_role(tenant_id) is not null);
