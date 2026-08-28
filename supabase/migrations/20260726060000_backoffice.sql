-- ============================================================================
-- Backoffice access
-- ----------------------------------------------------------------------------
-- Who may see every account in the system. That is a different question from
-- every other permission here: workspace roles are scoped to one tenant and
-- derived from that tenant's event log, whereas this is global and belongs to
-- nobody's workspace.
--
-- So it is a plain table rather than an aggregate. There is no interesting
-- history to fold - a person either has the key or does not - and inventing a
-- `backoffice` aggregate to hold two rows would be ceremony, not modelling.
--
-- Keyed by email, not user id, because access is usually granted to someone
-- before they have signed in for the first time. The id does not exist yet; the
-- address does.
-- ============================================================================

create table if not exists public.backoffice_admins (
  /** Lowercased. Matched against the JWT's email claim. */
  email      text        primary key,
  /** Who granted it. NULL for the seeded first admin, who granted themselves. */
  granted_by uuid        references auth.users (id) on delete set null,
  note       text,
  created_at timestamptz not null default now()
);

alter table public.backoffice_admins enable row level security;

-- ----------------------------------------------------------------------------
-- is_backoffice_admin()
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER for the same reason tenant_role() is: the policies on this
-- table need to consult the table, and a policy that reads the table it guards
-- recurses forever.
--
-- It also means the answer cannot be spoofed by a client - the email comes from
-- the verified JWT, not from anything the request supplied.
-- ----------------------------------------------------------------------------

create or replace function public.is_backoffice_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.backoffice_admins a
     where a.email = lower((select auth.jwt() ->> 'email'))
  );
$$;

grant execute on function public.is_backoffice_admin() to authenticated;

-- Only admins can see or change the list. A non-admin gets an empty table
-- rather than a permission error, which is the same "reveal nothing" posture
-- the tenant policies take.
create policy "backoffice_admins_select"
  on public.backoffice_admins for select
  using (public.is_backoffice_admin());

create policy "backoffice_admins_insert"
  on public.backoffice_admins for insert
  with check (public.is_backoffice_admin());

create policy "backoffice_admins_delete"
  on public.backoffice_admins for delete
  using (public.is_backoffice_admin());

-- ----------------------------------------------------------------------------
-- The first admin
-- ----------------------------------------------------------------------------
-- Bootstrapping problem: only an admin can grant admin, so the first one has to
-- come from a migration. Everyone after this is added through the backoffice.
-- ----------------------------------------------------------------------------

-- No first admin is seeded here, because this repository does not know who
-- you are. Add yourself once, against your own database, after signing up:
--
--   insert into public.backoffice_admins (email, note)
--   values ('you@example.com', 'first admin')
--   on conflict (email) do nothing;
--
-- Locally that is `supabase db reset` then psql; on a deployed stack it is a
-- one-off statement run with the service role. Everyone after you is added
-- through the backoffice itself.

-- ============================================================================
-- Workspace overview
-- ----------------------------------------------------------------------------
-- Member counts for the backoffice list. A view rather than a query in the app
-- because counting members per workspace is a GROUP BY, and PostgREST cannot
-- express one - the alternative was fetching every membership row and folding
-- them in TypeScript, which is the same shape as the bug that truncated the
-- lounge at 1,000 rows.
--
-- security_invoker so the view respects whatever policies the caller has. The
-- backoffice reads it with the service role after checking is_backoffice_admin()
-- itself; nothing here grants access on its own.
-- ============================================================================

create or replace view public.backoffice_workspaces
with (security_invoker = true) as
  select
    t.id,
    t.slug,
    t.name,
    t.archived,
    t.created_at,
    (select count(*) from public.tenant_members m where m.tenant_id = t.id)     as member_count,
    (select count(*) from public.tenant_invitations i where i.tenant_id = t.id) as pending_invitations,
    (
      select m.email
        from public.tenant_members m
       where m.tenant_id = t.id and m.role = 'owner'
       order by m.joined_at
       limit 1
    ) as owner_email
  from public.tenants_read_model t;

grant select on public.backoffice_workspaces to authenticated;
