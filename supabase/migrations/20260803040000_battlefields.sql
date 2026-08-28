-- ============================================================================
-- Battlefields
-- ----------------------------------------------------------------------------
-- A saved world, and the list you pick one from. The blocks are not here - they
-- are in lounge_blocks_read_model under this row's `world_id`, built with the
-- same tools that build the lounge. See src/domain/battlefields/events.ts.
--
-- Two spaces are involved in a battlefield's life and they get different
-- rights, which is the whole reason this table needs policies of its own:
--
--   * The space that built it may rename, retire, and go on building in it.
--   * Any other space may *find and fight on* one marked public - and may not
--     place a single block in it. An arena you can be challenged onto is not an
--     arena the challenger can edit while you stand in it.
-- ============================================================================

create table if not exists public.battlefields_read_model (
  /** The world id. Also the battlefield aggregate's stream id - see events.ts. */
  world_id   uuid        primary key,
  /** The space that built it, and the only one that may change it. */
  tenant_id  uuid        not null references public.tenants_read_model (id) on delete cascade,
  name       text        not null,
  visibility text        not null default 'space' check (visibility in ('space', 'public')),
  archived   boolean     not null default false,
  created_by uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    integer     not null default 0
);

create index if not exists battlefields_tenant_idx
  on public.battlefields_read_model (tenant_id)
  where archived = false;

-- The index behind the cross-space search. Partial, because a search only ever
-- asks for arenas that are both public and still in use.
create index if not exists battlefields_public_idx
  on public.battlefields_read_model (visibility)
  where visibility = 'public' and archived = false;

alter table public.battlefields_read_model enable row level security;

-- Read: your own space's arenas, or anybody's public ones.
create policy "battlefields_select"
  on public.battlefields_read_model for select
  to authenticated
  using (
    public.tenant_role(tenant_id) is not null
    or (visibility = 'public' and archived = false)
  );

-- Write: the projection runs as the signed-in member, so the owning space's
-- members are the ones who need insert/update here. No delete policy at all -
-- retiring a battlefield sets `archived`, and the read model is rebuilt from
-- the log rather than edited by hand.
create policy "battlefields_insert"
  on public.battlefields_read_model for insert
  to authenticated
  with check (public.tenant_role(tenant_id) is not null);

create policy "battlefields_update"
  on public.battlefields_read_model for update
  to authenticated
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

-- ----------------------------------------------------------------------------
-- Reading another space's public arena
-- ----------------------------------------------------------------------------
-- The block table's existing select policy is `tenant_role(tenant_id) is not
-- null` - you may read blocks belonging to a space you are in. That is right
-- for the lounge and too narrow for a public battlefield, which the whole point
-- of `visibility = 'public'` is to let strangers stand in.
--
-- So this adds a second select policy rather than widening the first. Policies
-- for the same command are OR-ed, so members keep exactly the access they had
-- and outsiders gain read on public arenas only. Insert, update and delete are
-- untouched: a visiting space can see the walls and never move them.
-- ----------------------------------------------------------------------------
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
    )
  );

-- ----------------------------------------------------------------------------
-- The flag
-- ----------------------------------------------------------------------------
-- Off by default, like `agents` before it and for the same reason: this seeds
-- a feature that is still being built, and a resolver outage must not be what
-- ships it. The lounge's own ambient sparring is not behind this flag - that
-- shipped with the lounge and stays under `lounge`.
-- ----------------------------------------------------------------------------
insert into public.feature_flags (key, enabled, label, description) values
  ('battle', false, 'Battle system',
   'Saved battlefields, matches (all-vs-all, teams, one-vs-everyone), challenges between spaces, and tournaments.')
on conflict (key) do nothing;
