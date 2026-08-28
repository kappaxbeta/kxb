-- ============================================================================
-- Read model: one workspace's café, house and garden
-- ----------------------------------------------------------------------------
-- Three tables, folded from a single `homestead` stream per tenant.
--
-- Why the purse is its own row rather than a column on tenants_read_model: it
-- changes on every burger. Putting a counter that moves a few times a minute on
-- the row that also holds the workspace's name would make every rename contend
-- with the lunch rush, and would drag the tenant row into a projection that has
-- nothing to do with tenancy.
--
-- Why props and ground are separate tables rather than jsonb on the purse row:
-- a placement changes one square, and `update ... where tile = $1` is the whole
-- statement. A jsonb blob would mean read-modify-write on every click, which is
-- both slower and a lost-update waiting to happen when two members decorate at
-- once. Same shape, and the same reasoning, as lounge_blocks_read_model.
--
-- What is deliberately NOT here: where anybody is standing. Positions move
-- sixty times a second and are stale before they are written - presence carries
-- them over realtime instead. See src/domain/homestead/events.ts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The purse, and the two stats worth keeping
-- ----------------------------------------------------------------------------
create table if not exists public.homestead_read_model (
  tenant_id  uuid        primary key,
  /**
   * Shared across all three places. The single-stream design exists to make
   * this number safe: with a stream per place, two members could spend the same
   * coins at the same moment and both writes would succeed.
   */
  coins      integer     not null default 0,
  served     integer     not null default 0,
  /** Lifetime takings. The one stat that cannot be re-derived from the rest. */
  earned     integer     not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version    integer     not null
);

-- ----------------------------------------------------------------------------
-- Furniture: one row per occupied square
-- ----------------------------------------------------------------------------
create table if not exists public.homestead_props_read_model (
  tenant_id     uuid    not null,
  /** 'cafe' | 'home' | 'outdoor'. Constrained so a typo cannot invent a room. */
  place         text    not null check (place in ('cafe', 'home', 'outdoor')),
  /** "x,z", the same key the grid uses. */
  tile          text    not null,
  prop_id       text    not null,
  rot_y         real    not null default 0,
  /**
   * A decoration standing on this prop's worktop, denormalised onto the same
   * row rather than given a table of its own.
   *
   * There can only ever be one, it is meaningless without the thing underneath
   * it, and it is always read and written together with it - which is the
   * definition of a column rather than a relation. A second table would buy a
   * join on every render to model a fact that cannot exist independently.
   */
  topper_id     text,
  topper_rot_y  real,
  placed_at     timestamptz not null default now(),

  primary key (tenant_id, place, tile)
);

create index if not exists homestead_props_place_idx
  on public.homestead_props_read_model (tenant_id, place);

-- ----------------------------------------------------------------------------
-- Ground bought beyond what each place opened with
-- ----------------------------------------------------------------------------
-- Only *purchases* live here. The starting floor plan is in code and is the
-- same for every workspace, so storing it would mean writing forty identical
-- rows per tenant to say "the house is house-shaped".
-- ----------------------------------------------------------------------------
create table if not exists public.homestead_ground_read_model (
  tenant_id uuid not null,
  place     text not null check (place in ('cafe', 'home', 'outdoor')),
  tile      text not null,
  bought_at timestamptz not null default now(),

  primary key (tenant_id, place, tile)
);

-- ----------------------------------------------------------------------------
-- Row level security
-- ----------------------------------------------------------------------------
-- Reads: any member of the workspace. The whole point is that it is shared -
-- you cannot render a room your colleague furnished without being able to see
-- what they put in it.
--
-- Writes: also membership-scoped, and not `auth.uid()`-scoped, for the reason
-- the lounge documents at length. A projection run catches the tenant up on
-- *every* pending event under whichever session happened to trigger it, so the
-- member who opens the café may be the one who first writes the row for a sofa
-- somebody else bought last night. A self-only check would make that run fail,
-- and the failure would land on whoever unluckily went second.
--
-- The authorization that matters is upstream: the server action proves
-- membership before it appends anything, and nothing reaches these tables that
-- did not come through the event log.
-- ----------------------------------------------------------------------------
alter table public.homestead_read_model        enable row level security;
alter table public.homestead_props_read_model  enable row level security;
alter table public.homestead_ground_read_model enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'homestead_read_model',
    'homestead_props_read_model',
    'homestead_ground_read_model'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select using (public.tenant_role(tenant_id) is not null)',
      t || '_select', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for insert with check (public.tenant_role(tenant_id) is not null)',
      t || '_write', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update using (public.tenant_role(tenant_id) is not null) with check (public.tenant_role(tenant_id) is not null)',
      t || '_update', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete using (public.tenant_role(tenant_id) is not null)',
      t || '_delete', t
    );
  end loop;
end
$$;
