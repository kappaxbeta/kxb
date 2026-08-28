-- ============================================================================
-- Usernames: people identify each other by a handle, not by an email address
-- ----------------------------------------------------------------------------
-- Until now "who is that" was answered with an email address, everywhere: the
-- members list, the task authors, the event log, the name floating over an
-- avatar in the lounge. That was expedient - every account has an email and it
-- is unique - but it means joining a workspace hands your email address to
-- everyone already in it, and there is no way to be in a shared space under a
-- name of your choosing.
--
-- This migration introduces a per-account username and then does the harder
-- half: it takes email addresses *out* of the places members can read.
--
-- Three things move:
--
--   1. public.user_profiles - a new global row per account, holding the handle.
--      Not a projection, for the same reasons profile_avatars is not one: it
--      belongs to the person rather than to any workspace, and "was called bob
--      in March" is not a fact anybody will query.
--
--   2. tenant_members.email is dropped, and MemberJoined stops carrying an
--      email. The members list joins user_profiles instead.
--
--   3. Invitations stop being keyed by email address. They are keyed by an
--      *invitee key* - `user:<uuid>` when the invitee already has an account,
--      `token:<opaque>` when they do not - and the plaintext address for the
--      second case lives in a separate table beside the log rather than in it.
--
-- ----------------------------------------------------------------------------
-- Why the log had to change too
-- ----------------------------------------------------------------------------
-- Hiding a column would not have been enough. Every member can read their
-- tenant's whole event stream (`events_select_tenant`), and they have to be
-- able to: executeCommand() derives its optimistic-concurrency version from the
-- last event it loaded, so a member who could not see part of the stream would
-- compute the wrong expected version and never be able to append. Filtering the
-- log per reader is not on the table.
--
-- So the invariant is the strong one: no email address is written into the
-- tenant event log at all. What the log records about an invitation is that one
-- exists, at what role, and an opaque key naming its addressee. Resolving that
-- key to an actual mailbox needs public.tenant_invitation_emails, which is
-- readable only by the owners and admins who sent the invitation.
--
-- ----------------------------------------------------------------------------
-- What this does not fix
-- ----------------------------------------------------------------------------
-- Events already in the log keep the emails they were written with. Rewriting
-- them is exactly what an append-only store is supposed to refuse, so a
-- workspace that existed before this migration still has its members' addresses
-- in its own history, readable by its own members. Only new history is clean.
-- The read models are clean either way, which is what the UI shows.
-- ============================================================================


-- ============================================================================
-- 1. The username itself
-- ----------------------------------------------------------------------------
-- Lowercase, 2-32 characters, letters/digits/hyphen/underscore, and it may not
-- start or end with a separator. The same shape is a zod schema in
-- src/domain/profile/username-commands.ts; the copy here is the one that cannot
-- be bypassed by talking to PostgREST directly.
--
-- Uniqueness is a plain UNIQUE constraint rather than a reservation table like
-- tenant_slugs. The difference is that a slug is claimed *before* the aggregate
-- that will own it exists, so the claim has to outlive a failed create; a
-- username is written to its own row in one statement, so the constraint is
-- already the whole mechanism.
--
-- Changing your username releases the old one. That is a deliberate choice and
-- it does mean a name can be picked up by somebody else - usernames identify
-- you to people who can already see you, they are not credentials, and nothing
-- in this codebase authorizes anything by handle.
-- ============================================================================

create table if not exists public.user_profiles (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  username   text        not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_profiles_username_shape
    check (username ~ '^[a-z0-9][a-z0-9_-]{0,30}[a-z0-9]$')
);

alter table public.user_profiles enable row level security;

-- ----------------------------------------------------------------------------
-- Deriving a first username from an email address
-- ----------------------------------------------------------------------------
-- Nobody should hit a "choose a handle" wall before they can use the product,
-- and a members list where half the rows say "not set yet" is worse than one
-- with imperfect names in it. So everyone gets one immediately, from the local
-- part of their address, and can change it afterwards.
--
-- This is the one place the two identifiers touch, and it is a one-way
-- derivation at account-creation time: jane.doe@example.com becomes `jane-doe`
-- and nothing afterwards can recover the domain, the plus-tag, or the fact that
-- there was an email involved at all. A handle that happens to resemble
-- somebody's address is a hint, not a disclosure - and they can change it.
-- ----------------------------------------------------------------------------

create or replace function public.username_seed(p_email text)
returns text
language plpgsql
immutable
as $$
declare
  v text;
begin
  v := lower(coalesce(split_part(p_email, '@', 1), ''));
  -- Anything outside the allowed alphabet becomes a hyphen, then the ends are
  -- trimmed: '.j+doe.' -> '-j-doe-' -> 'j-doe'.
  v := regexp_replace(v, '[^a-z0-9_-]+', '-', 'g');
  v := regexp_replace(v, '^[^a-z0-9]+', '');
  v := regexp_replace(v, '[^a-z0-9]+$', '');
  v := left(v, 32);
  -- left() can re-expose a separator that was in the middle a moment ago.
  v := regexp_replace(v, '[^a-z0-9]+$', '');

  if length(v) < 2 then
    return 'member';
  end if;

  return v;
end;
$$;

comment on function public.username_seed(text) is
  'The handle an address suggests, before uniqueness is considered.';

-- ----------------------------------------------------------------------------
-- Claiming one
-- ----------------------------------------------------------------------------
-- Insert, and on collision try the next suffix. The loop catches the unique
-- violation rather than looking first, because looking first is a race: two
-- accounts created in the same instant would both see `jane-doe` free.
--
-- SECURITY DEFINER because its callers are the signup trigger and the backfill
-- below, neither of which runs as the user whose row is being written.
-- ----------------------------------------------------------------------------

create or replace function public.claim_username(p_user_id uuid, p_seed text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base    text := public.username_seed(p_seed);
  v_attempt text;
  v_existing text;
  n         integer := 0;
begin
  select username into v_existing from public.user_profiles where user_id = p_user_id;
  if v_existing is not null then
    return v_existing;
  end if;

  loop
    if n = 0 then
      v_attempt := v_base;
    else
      -- Truncate the base, not the suffix: 'a-very-long-handle-4' has to stay
      -- inside 32 characters and stay unique, and the digits are what make it
      -- unique.
      v_attempt := left(v_base, 31 - length(n::text)) || '-' || n::text;
    end if;

    begin
      insert into public.user_profiles (user_id, username) values (p_user_id, v_attempt);
      return v_attempt;
    exception
      when unique_violation then
        -- Either the handle went to somebody else between the check and the
        -- insert, or this account acquired a row concurrently. Distinguish.
        select username into v_existing from public.user_profiles where user_id = p_user_id;
        if v_existing is not null then
          return v_existing;
        end if;

        n := n + 1;
        if n > 5000 then
          raise exception 'could not allocate a username from seed %', v_base;
        end if;
    end;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- Every new account gets one, on the way in
-- ----------------------------------------------------------------------------
-- A trigger on auth.users rather than a call from the sign-up action, so that
-- an account created any other way - the Supabase dashboard, an admin API call,
-- a future OAuth provider - is not silently handle-less.
--
-- Deliberately swallows its own failures. A username is a nicety; refusing to
-- create the account because we could not allocate one would be a spectacular
-- over-reaction, and readUsername() already degrades to a short id for a row
-- that is not there.
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.claim_username(new.id, new.email);
  exception
    when others then
      raise warning 'could not allocate a username for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_username on auth.users;

create trigger on_auth_user_created_username
  after insert on auth.users
  for each row
  execute function public.handle_new_user_username();

-- Everyone who already exists.
do $$
declare
  r record;
begin
  for r in select id, email from auth.users loop
    perform public.claim_username(r.id, r.email);
  end loop;
end;
$$;


-- ============================================================================
-- 2. Rebuild the invitation tables
-- ----------------------------------------------------------------------------
-- An invitation used to *be* an email address: primary key (tenant_id, email).
-- It becomes an *invitee key*, one of
--
--   user:<uuid>     - they already have an account. Nothing about their mailbox
--                     is recorded anywhere, because we never needed it: they
--                     find the invitation on /invitations by being signed in.
--   token:<opaque>  - they do not. The log records the token; the address it
--                     stands for lives in tenant_invitation_emails.
--   email:<address>  - what rows written before this migration are keyed by.
--                     Kept working rather than deleted, because a pending
--                     invitation is somebody waiting on an answer.
--
-- The key is chosen by the domain (src/domain/tenants/aggregate.ts) and this
-- trigger only mirrors it, which is the same division of labour as before: the
-- decider decides, SQL records the consequence.
-- ============================================================================

alter table public.tenant_invitations
  add column if not exists invitee_key text;

alter table public.tenant_invitations
  add column if not exists invited_user_id uuid references auth.users (id) on delete cascade;

-- Legacy rows keep their addressee, spelled the new way.
update public.tenant_invitations
   set invitee_key = 'email:' || lower(email)
 where invitee_key is null;

alter table public.tenant_invitations alter column invitee_key set not null;

-- The addresses, moved out of the log's reach.
--
-- Not derived from events, and that is the point of it. It is written directly
-- by the inviting action (see inviteMember in src/domain/tenants/actions.ts),
-- read by the two owners-and-admins queries that need to show what was typed,
-- and deleted by the trigger when the invitation resolves. Keeping it beside
-- the log rather than in it is what lets an address be forgotten at all - the
-- log cannot forget anything.
create table if not exists public.tenant_invitation_emails (
  tenant_id   uuid        not null,
  invitee_key text        not null,
  email       text        not null,
  created_at  timestamptz not null default now(),

  primary key (tenant_id, invitee_key)
);

create unique index if not exists tenant_invitation_emails_addr_idx
  on public.tenant_invitation_emails (tenant_id, lower(email));

insert into public.tenant_invitation_emails (tenant_id, invitee_key, email, created_at)
select tenant_id, invitee_key, lower(email), invited_at
  from public.tenant_invitations
 where email is not null
on conflict do nothing;

-- The old shape can go now that everything is carried over.
--
-- The policy first, as ever: a policy expression depends on the columns it
-- names, and Postgres refuses to drop a column out from under one. The
-- replacement is in section 4, once the helper it calls exists.
drop policy if exists "tenant_invitations_select_visible" on public.tenant_invitations;

drop index if exists public.tenant_invitations_email_idx;
alter table public.tenant_invitations drop constraint if exists tenant_invitations_pkey;
alter table public.tenant_invitations drop column if exists email;
alter table public.tenant_invitations add primary key (tenant_id, invitee_key);

create index if not exists tenant_invitations_user_idx
  on public.tenant_invitations (invited_user_id)
  where invited_user_id is not null;

-- ----------------------------------------------------------------------------
-- Members no longer carry an address
-- ----------------------------------------------------------------------------
-- Dropped rather than hidden behind a column grant. A column nothing may read
-- is a column that will be read by the next person who writes `select *`, and
-- the trigger that used to fill it has nothing to fill it from any more.
--
-- The backoffice view has to be rebuilt first, since it named the column. It
-- showed each workspace's owner by address; it shows their handle now. Nothing
-- is lost there - /backoffice already lists every account with its email beside
-- it, from the admin API, and this column was only ever a label on a row.
-- ----------------------------------------------------------------------------

-- Dropped rather than replaced: CREATE OR REPLACE VIEW cannot rename a column.
drop view if exists public.backoffice_workspaces;

create view public.backoffice_workspaces
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
      select p.username
        from public.tenant_members m
        join public.user_profiles p on p.user_id = m.user_id
       where m.tenant_id = t.id and m.role = 'owner'
       order by m.joined_at
       limit 1
    ) as owner_username
  from public.tenants_read_model t;

grant select on public.backoffice_workspaces to authenticated;

alter table public.tenant_members drop column if exists email;


-- ============================================================================
-- 3. Authorization helpers, restated without email
-- ============================================================================

-- Is there an invitation in this tenant addressed to the caller?
--
-- Three ways to be the addressee now, matching the three key shapes. The email
-- branches read tenant_invitation_emails, which the caller cannot read for
-- themselves - being SECURITY DEFINER is what lets an invitee match against a
-- table they have no business enumerating.
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
      left join public.tenant_invitation_emails e
        on e.tenant_id = i.tenant_id
       and e.invitee_key = i.invitee_key
     where i.tenant_id = p_tenant_id
       and (
         i.invited_user_id = (select auth.uid())
         or lower(e.email) = lower((select auth.jwt() ->> 'email'))
       )
  );
$$;

-- Which invitation, specifically.
--
-- The accept and decline actions need this: the decider is handed an invitee
-- key and checks it against the folded state, and the key has to come from
-- somewhere the browser cannot influence. Same trust model as `actorId`, which
-- is stamped from the session and never from the request body.
create or replace function public.my_tenant_invitation(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select i.invitee_key
    from public.tenant_invitations i
    left join public.tenant_invitation_emails e
      on e.tenant_id = i.tenant_id
     and e.invitee_key = i.invitee_key
   where i.tenant_id = p_tenant_id
     and (
       i.invited_user_id = (select auth.uid())
       or lower(e.email) = lower((select auth.jwt() ->> 'email'))
     )
   limit 1;
$$;

-- Every workspace with an invitation waiting for the caller.
--
-- /invitations used to answer this with a plain select filtered by the user's
-- own email, which worked because the row *was* the email. It is not any more,
-- and the address that would match now lives in a table the invitee cannot
-- read, so the query moves in here where it can.
create or replace function public.my_pending_invitations()
returns table (tenant_id uuid, invitee_key text, role text, invited_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.tenant_id, i.invitee_key, i.role, i.invited_at
    from public.tenant_invitations i
    left join public.tenant_invitation_emails e
      on e.tenant_id = i.tenant_id
     and e.invitee_key = i.invitee_key
   where i.invited_user_id = (select auth.uid())
      or lower(e.email) = lower((select auth.jwt() ->> 'email'))
   order by i.invited_at desc;
$$;

-- Is this invitation addressed to the caller? Used by the RLS policy on
-- tenant_invitations, which cannot ask the question directly for the same
-- reason has_tenant_invitation() cannot.
create or replace function public.invitation_is_mine(
  p_tenant_id   uuid,
  p_invitee_key text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.tenant_invitations i
      left join public.tenant_invitation_emails e
        on e.tenant_id = i.tenant_id
       and e.invitee_key = i.invitee_key
     where i.tenant_id = p_tenant_id
       and i.invitee_key = p_invitee_key
       and (
         i.invited_user_id = (select auth.uid())
         or lower(e.email) = lower((select auth.jwt() ->> 'email'))
       )
  );
$$;

-- ----------------------------------------------------------------------------
-- Looking somebody up in order to invite them
-- ----------------------------------------------------------------------------
-- Both of these answer "does an account exist for this", which is an
-- enumeration oracle if it is handed to everyone. So both are gated on the
-- caller being an owner or admin of the workspace they are inviting into -
-- exactly the people the decider would let invite anyway. A signed-in stranger
-- gets nothing.
--
-- The email one deliberately returns only an id. It turns "invite
-- jane@example.com" into "invite user:<uuid>" whenever Jane already has an
-- account, which is what keeps her address out of the log in the common case:
-- you type an address, and nothing records that you did.
-- ----------------------------------------------------------------------------

create or replace function public.lookup_invitee_by_username(
  p_tenant_id uuid,
  p_username  text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.tenant_role(p_tenant_id) not in ('owner', 'admin') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  return (
    select p.user_id
      from public.user_profiles p
     where p.username = lower(btrim(p_username))
  );
end;
$$;

create or replace function public.lookup_invitee_by_email(
  p_tenant_id uuid,
  p_email     text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.tenant_role(p_tenant_id) not in ('owner', 'admin') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  return (
    select u.id
      from auth.users u
     where lower(u.email) = lower(btrim(p_email))
     limit 1
  );
end;
$$;

grant execute on function public.my_tenant_invitation(uuid)             to authenticated;
grant execute on function public.my_pending_invitations()               to authenticated;
grant execute on function public.invitation_is_mine(uuid, text)         to authenticated;
grant execute on function public.lookup_invitee_by_username(uuid, text) to authenticated;
grant execute on function public.lookup_invitee_by_email(uuid, text)    to authenticated;


-- ============================================================================
-- 4. Policies
-- ============================================================================

-- ----------------------------------------------------------------------------
-- user_profiles
-- ----------------------------------------------------------------------------
-- Same boundary profile_avatars draws, plus one case it does not have: somebody
-- you have invited but who has not accepted yet is not a co-member, and the
-- pending-invitations list still has to be able to say who they are. Without
-- that branch an admin would see "someone" next to the invitation they sent
-- thirty seconds ago.
--
-- Not readable by the world. Being able to see a colleague's handle is the
-- point; being able to enumerate every account on the instance is not, which is
-- also why invite-time lookup goes through a gated function rather than through
-- this table.
-- ----------------------------------------------------------------------------

drop policy if exists "user_profiles_select_self_or_shared" on public.user_profiles;
create policy "user_profiles_select_self_or_shared"
  on public.user_profiles for select
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
        from public.tenant_members mine
        join public.tenant_members theirs
          on theirs.tenant_id = mine.tenant_id
       where mine.user_id = (select auth.uid())
         and theirs.user_id = public.user_profiles.user_id
    )
    or exists (
      select 1
        from public.tenant_invitations i
       where i.invited_user_id = public.user_profiles.user_id
         and public.tenant_role(i.tenant_id) is not null
    )
  );

drop policy if exists "user_profiles_insert_self" on public.user_profiles;
create policy "user_profiles_insert_self"
  on public.user_profiles for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "user_profiles_update_self" on public.user_profiles;
create policy "user_profiles_update_self"
  on public.user_profiles for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- tenant_invitations
-- ----------------------------------------------------------------------------
-- Replaces the email-matching policy. Members of the workspace see what is
-- pending; the invitee sees their own, which is what makes /invitations work
-- before they have any relationship to the tenant at all.
-- ----------------------------------------------------------------------------

drop policy if exists "tenant_invitations_select_visible" on public.tenant_invitations;
create policy "tenant_invitations_select_visible"
  on public.tenant_invitations for select
  using (
    public.tenant_role(tenant_id) is not null
    or public.invitation_is_mine(tenant_id, invitee_key)
  );

-- ----------------------------------------------------------------------------
-- tenant_invitation_emails
-- ----------------------------------------------------------------------------
-- The one table in this migration that is written by a user rather than by the
-- trigger, because the address is an input rather than a consequence - it is
-- not in the event, so there is nothing to derive it from.
--
-- Only owners and admins, and only in a workspace they administer. The invitee
-- never reads their own row here; the SECURITY DEFINER functions above match
-- against it on their behalf. Nothing may UPDATE it: correcting a typo means
-- revoking and inviting again, which is also the only version of that story
-- that leaves an honest trail in the log.
-- ----------------------------------------------------------------------------

alter table public.tenant_invitation_emails enable row level security;

drop policy if exists "tenant_invitation_emails_select_admin" on public.tenant_invitation_emails;
create policy "tenant_invitation_emails_select_admin"
  on public.tenant_invitation_emails for select
  using (public.tenant_role(tenant_id) in ('owner', 'admin'));

drop policy if exists "tenant_invitation_emails_insert_admin" on public.tenant_invitation_emails;
create policy "tenant_invitation_emails_insert_admin"
  on public.tenant_invitation_emails for insert
  with check (public.tenant_role(tenant_id) in ('owner', 'admin'));


-- ============================================================================
-- 5. The membership trigger, restated
-- ----------------------------------------------------------------------------
-- Same job as before - mirror the decider's membership decisions into the
-- tables RLS consults - with the email columns gone and the invitation keyed by
-- whatever the event says its addressee is.
--
-- `forget_invitation` drops the address along with the invitation. An
-- invitation that has been accepted, declined or revoked has no further use for
-- the mailbox it was sent to, and the whole reason the address lives outside
-- the log is so that this delete is possible at all.
-- ============================================================================

create or replace function public.forget_invitation(
  p_tenant_id   uuid,
  p_invitee_key text
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.tenant_invitations
   where tenant_id = p_tenant_id
     and invitee_key = p_invitee_key;

  delete from public.tenant_invitation_emails
   where tenant_id = p_tenant_id
     and invitee_key = p_invitee_key;
$$;

create or replace function public.sync_tenant_authorization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  case new.type
    when 'MemberJoined' then
      insert into public.tenant_members (tenant_id, user_id, role, joined_at)
      values (
        new.tenant_id,
        (new.data ->> 'userId')::uuid,
        new.data ->> 'role',
        new.created_at
      )
      on conflict (tenant_id, user_id) do update
        set role = excluded.role;

    when 'MemberInvited' then
      v_key := new.data ->> 'invitee';

      insert into public.tenant_invitations
        (tenant_id, invitee_key, invited_user_id, role, invited_by, invited_at)
      values (
        new.tenant_id,
        v_key,
        -- Only the `user:` shape names an account. The other two are addressed
        -- to somebody who may not have one.
        case
          when v_key like 'user:%' then substring(v_key from 6)::uuid
          else null
        end,
        new.data ->> 'role',
        new.actor_id,
        new.created_at
      )
      on conflict (tenant_id, invitee_key) do update
        set role       = excluded.role,
            invited_by = excluded.invited_by,
            invited_at = excluded.invited_at;

    when 'InvitationAccepted' then
      insert into public.tenant_members (tenant_id, user_id, role, joined_at)
      values (
        new.tenant_id,
        (new.data ->> 'userId')::uuid,
        new.data ->> 'role',
        new.created_at
      )
      on conflict (tenant_id, user_id) do update
        set role = excluded.role;

      -- Membership and the invitation resolve together, in one statement pair,
      -- for the reason the previous version of this function called out: split
      -- them and the invitee is stranded mid-batch with neither.
      perform public.forget_invitation(new.tenant_id, new.data ->> 'invitee');

    when 'InvitationRevoked', 'InvitationDeclined' then
      perform public.forget_invitation(new.tenant_id, new.data ->> 'invitee');

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
      null;
  end case;

  return null;
end;
$$;
