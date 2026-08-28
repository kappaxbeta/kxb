-- ============================================================================
-- Backoffice roles, and a log of what was done with them
-- ----------------------------------------------------------------------------
-- Until now `backoffice_admins` was the whole model: an email was in it or it
-- was not, and being in it meant everything. That is the right shape for one or
-- two founders and the wrong one the moment somebody should see the reports but
-- not the billing, or read analytics without being able to revoke a link.
--
-- So a second, finer table sits beside it. `backoffice_admins` keeps its
-- meaning exactly - a *superadmin*, who may reach every section, manage the
-- people below, and read this log - and `is_backoffice_admin()` is untouched,
-- because a dozen RLS policies across the platform read it as "a full platform
-- operator" and must go on meaning that. The new table grants a named person a
-- named level on one named section, and nothing else.
--
-- Keyed by email like the table it extends, and for the same reason: access is
-- handed to somebody before they have ever signed in, when the address exists
-- and the account does not.
--
-- The section is free text, not an enum. The list of sections is the backoffice
-- nav, which lives in TypeScript and gains a tab without a migration; pinning it
-- into a Postgres type here would mean a migration every time a page is added,
-- to buy a check the app already makes against its own registry. A grant to a
-- section that no longer exists is dead weight the roles page can show and
-- delete, not a corruption.
-- ============================================================================

create table if not exists public.backoffice_grants (
  /** Lowercased. Matched against the JWT email, like backoffice_admins.email. */
  email      text        not null,
  /** A backoffice section key - see src/domain/backoffice/sections.ts. */
  section    text        not null,
  /** 'view' reads the section; 'write' also acts in it. No third level. */
  level      text        not null check (level in ('view', 'write')),
  granted_by uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (email, section)
);

alter table public.backoffice_grants enable row level security;

-- ----------------------------------------------------------------------------
-- The three questions the app asks
-- ----------------------------------------------------------------------------
-- All SECURITY DEFINER and reading the email from the verified JWT, so the
-- answer cannot be spoofed by the request and a policy may consult the table
-- without recursing - the same reasoning as `is_backoffice_admin()` next door.

-- The level this caller holds on a section, as the strongest word that applies:
-- a superadmin is 'write' on everything; otherwise it is their grant, or null.
create or replace function public.backoffice_section_level(p_section text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_backoffice_admin() then 'write'
    else (
      select g.level
        from public.backoffice_grants g
       where g.email = lower((select auth.jwt() ->> 'email'))
         and g.section = p_section
    )
  end;
$$;

-- May this caller open the backoffice at all? A superadmin, or anybody holding
-- even one grant. This is the gate on the whole surface; the per-section
-- questions decide what they see once inside.
create or replace function public.is_backoffice_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_backoffice_admin() or exists (
    select 1
      from public.backoffice_grants g
     where g.email = lower((select auth.jwt() ->> 'email'))
  );
$$;

grant execute on function public.backoffice_section_level(text) to authenticated;
grant execute on function public.is_backoffice_user()          to authenticated;

-- ----------------------------------------------------------------------------
-- Who may change the grants
-- ----------------------------------------------------------------------------
-- Only a superadmin. A scoped operator can hold 'write' on a section and still
-- have no say over who else gets in - handing out access is the superadmin's
-- power, kept apart from acting inside any one section on purpose. So the write
-- policies key on `is_backoffice_admin()`, not on a grant to some "admins"
-- section, which would be the same power wearing a disguise.
--
-- Reading is wider: a scoped operator may see the roster (the roles page shows
-- it), but through `is_backoffice_user()` so a signed-in stranger still gets an
-- empty table rather than a permission error.
create policy "backoffice_grants_select"
  on public.backoffice_grants for select
  using (public.is_backoffice_user());

create policy "backoffice_grants_insert"
  on public.backoffice_grants for insert
  with check (public.is_backoffice_admin());

create policy "backoffice_grants_update"
  on public.backoffice_grants for update
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

create policy "backoffice_grants_delete"
  on public.backoffice_grants for delete
  using (public.is_backoffice_admin());

-- ============================================================================
-- The audit log
-- ----------------------------------------------------------------------------
-- Every consequential thing done from the backoffice, written down: who, in
-- which section, what, and against what. Not for catching wrongdoing so much as
-- for answering "who revoked this link" and "when did that space get comped" six
-- weeks later, which right now nothing can.
--
-- A plain table, append-only in practice. It is not an event stream folded into
-- a read model - there is nothing to fold, each row is already the fact - and it
-- is deliberately outside the tenant event logs, because a platform operator
-- acting on somebody's space is not that space's own history.
--
-- Written through the service role from `recordBackofficeAction`, so there is no
-- insert policy: the app already proved the actor's right to *do* the thing
-- before it logs that they did, and a client-writable audit log is one anybody
-- can forge an entry in. Reading is the superadmin's, plus anyone granted the
-- `audit` section.
-- ============================================================================

create table if not exists public.backoffice_audit (
  id          uuid        primary key default gen_random_uuid(),
  /** The signed-in operator, as the JWT knew them at the time. */
  actor_email text        not null,
  actor_id    uuid        references auth.users (id) on delete set null,
  /** The section the action belongs to - a key from the registry. */
  section     text        not null,
  /** A short verb-ish key, e.g. 'guest_link.revoke', 'grant.add'. */
  action      text        not null,
  /** One human sentence, rendered straight into the log table. */
  summary     text        not null,
  /** Whatever structured context is worth keeping - ids, before/after. */
  detail      jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists backoffice_audit_created_idx
  on public.backoffice_audit (created_at desc);

create index if not exists backoffice_audit_section_idx
  on public.backoffice_audit (section, created_at desc);

alter table public.backoffice_audit enable row level security;

-- Read: superadmin, or anybody granted the `audit` section. No insert/update/
-- delete policy at all - the service role bypasses RLS to append, and nobody,
-- superadmin included, edits or deletes a line of it through PostgREST. An audit
-- log you can rewrite is a diary, not a record.
create policy "backoffice_audit_select"
  on public.backoffice_audit for select
  using (
    public.is_backoffice_admin()
    or public.backoffice_section_level('audit') is not null
  );

comment on table public.backoffice_audit is
  'Append-only record of consequential backoffice actions. Written by the service role via recordBackofficeAction; never edited. See src/domain/backoffice/audit.ts.';
