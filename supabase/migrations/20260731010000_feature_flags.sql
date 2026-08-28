-- ============================================================================
-- Feature flags
-- ----------------------------------------------------------------------------
-- One switch per feature, answered at three levels: a global default, an
-- override for a workspace, an override for one person. The most specific one
-- that exists wins.
--
-- The point of collapsing all three into one flag is that "turn billing on for
-- everyone" and "let this one person in for free" stop being separate
-- mechanisms. Both are the `billing` flag; they differ only in which row was
-- written. A second mechanism for comping accounts is how you end up with a
-- customer who is exempt according to one check and billable according to
-- another.
--
-- Plain tables rather than an aggregate, for the same reason as
-- `backoffice_admins`: this is global config, it belongs to nobody's workspace,
-- and there is no interesting history to fold. `granted_by` and `note` carry
-- the part of the history anyone actually asks about - who comped this account,
-- and why.
-- ============================================================================

create table if not exists public.feature_flags (
  /** Stable identifier. Mirrored by FeatureKey in src/domain/flags/keys.ts. */
  key         text        primary key,
  /** The answer when no override applies. */
  enabled     boolean     not null default false,
  /** Shown in the backoffice. */
  label       text        not null,
  description text,
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Overrides
-- ----------------------------------------------------------------------------
-- `scope_id` deliberately has no foreign key. It points at either a tenant or
-- an auth user depending on `scope`, and Postgres cannot express a reference
-- whose target depends on a sibling column. Two nullable columns with a check
-- constraint would type it properly; one column keeps the resolver a single
-- readable query, which matters more for a table this small.
--
-- The trade is that deleting a workspace leaves its override behind. Harmless -
-- nothing will ever ask for it again - and the backoffice shows overrides whose
-- subject no longer resolves, so they can be cleaned up.
-- ----------------------------------------------------------------------------

create table if not exists public.feature_flag_overrides (
  flag_key   text        not null references public.feature_flags (key) on delete cascade,
  scope      text        not null check (scope in ('tenant', 'user')),
  scope_id   uuid        not null,
  enabled    boolean     not null,
  /** Which admin set it. NULL if it came from a migration. */
  granted_by uuid        references auth.users (id) on delete set null,
  /** Why. The column that makes a comped account explicable a year later. */
  note       text,
  created_at timestamptz not null default now(),
  primary key (flag_key, scope, scope_id)
);

create index if not exists feature_flag_overrides_scope_idx
  on public.feature_flag_overrides (scope, scope_id);

alter table public.feature_flags          enable row level security;
alter table public.feature_flag_overrides enable row level security;

-- Only the backoffice may read or write these tables directly. Ordinary users
-- never touch them - they call resolve_features() below, which hands back the
-- answers for themselves and nothing else. A member who could read the override
-- table could see every comped account in the system.
-- Dropped first so the whole migration can be re-run. `create table if not
-- exists` and `on conflict do nothing` already make the rest idempotent, and a
-- migration that is idempotent everywhere except its policies fails halfway
-- through on the second run - which is the worst of both, because by then it
-- has already made changes.
drop policy if exists "feature_flags_admin_all"          on public.feature_flags;
drop policy if exists "feature_flag_overrides_admin_all" on public.feature_flag_overrides;

create policy "feature_flags_admin_all"
  on public.feature_flags for all
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

create policy "feature_flag_overrides_admin_all"
  on public.feature_flag_overrides for all
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

-- ============================================================================
-- resolve_features(tenant)
-- ----------------------------------------------------------------------------
-- Every flag, resolved for the caller, as one JSON object: {"billing": true,
-- "pages": false, ...}. One round trip rather than one per flag, because this
-- runs inside requireTenant() on every request behind a workspace.
--
-- SECURITY DEFINER so it can read tables the caller is denied. What crosses the
-- boundary is only the resolved booleans - never which layer decided, never
-- anyone else's overrides.
--
-- The tenant layer is applied only when the caller is actually a member of
-- `p_tenant_id`. Without that check the function would answer for any workspace
-- id a client cared to guess, which turns a config table into a directory of
-- who has which features. tenant_role() returns NULL for a non-member.
--
-- Callable while signed out - auth.uid() is NULL, no override matches, and
-- everyone gets the global defaults. That is what the public lounge needs.
-- ============================================================================

create or replace function public.resolve_features(p_tenant_id uuid default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with scoped as (
    select
      f.key,
      coalesce(
        (select o.enabled
           from public.feature_flag_overrides o
          where o.flag_key = f.key
            and o.scope    = 'user'
            and o.scope_id = (select auth.uid())),
        (select o.enabled
           from public.feature_flag_overrides o
          where o.flag_key = f.key
            and o.scope    = 'tenant'
            and o.scope_id = p_tenant_id
            and p_tenant_id is not null
            and public.tenant_role(p_tenant_id) is not null),
        f.enabled
      ) as enabled
    from public.feature_flags f
  )
  select coalesce(jsonb_object_agg(key, enabled), '{}'::jsonb) from scoped;
$$;

grant execute on function public.resolve_features(uuid) to authenticated, anon;

-- ============================================================================
-- The flags themselves
-- ----------------------------------------------------------------------------
-- Seeded here so a fresh database behaves like a running one. `do nothing` on
-- conflict, because the global default is a value an admin is expected to
-- change - a re-run of this migration must not switch billing back on
-- underneath somebody.
-- ============================================================================

insert into public.feature_flags (key, enabled, label, description) values
  ('billing', true,  'Billing',
   'Off means no subscription is required: workspaces stay writable and anyone can create one. Override off for a single user or workspace to comp them.'),
  ('pages',   true,  'Pages',
   'The documents surface at /t/[slug]/pages.'),
  ('lounge',  true,  'Lounge',
   'The multiplayer 3D lounge.'),
  ('cafe',    true,  'Café and world',
   'The café and the house and garden the travel bar leads to.')
on conflict (key) do nothing;
