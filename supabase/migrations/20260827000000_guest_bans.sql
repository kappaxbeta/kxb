-- ============================================================================
-- Bans: making a removal stick
-- ----------------------------------------------------------------------------
-- Removing a guest already works - `removeGuest` deletes their `tenant_guests`
-- row and they are gone on their next query. What it does not do is *keep* them
-- gone: the link that let them in is still live, and following it again mints a
-- brand new anonymous account with a brand new id. The person who was thrown
-- out at 2am is back at 2:01 under a different name.
--
-- ----------------------------------------------------------------------------
-- What this can and cannot do, stated plainly
-- ----------------------------------------------------------------------------
-- This is worth being honest about in the schema rather than discovering during
-- an event.
--
-- A ban is recorded against the *identity* that was banned - the anonymous
-- auth.users id. That stops:
--
--   * the same browser session coming back, which is the overwhelmingly common
--     case, because the person who was removed is annoyed rather than
--     determined;
--   * somebody wandering back in ten minutes later having forgotten.
--
-- It does not stop somebody who clears their site data, opens a private window,
-- or uses another browser. Nothing keyed to a cookie can. The client-side
-- marker the app writes alongside this (see `guestBanMarker`) is *friction*,
-- not a boundary, and it is labelled that way everywhere it appears.
--
-- ----------------------------------------------------------------------------
-- Why not ban by IP
-- ----------------------------------------------------------------------------
-- It is the obvious next idea and it is specifically wrong *for events*, which
-- is the only place this feature matters. Eighty people at a hackathon are
-- behind one venue NAT: banning the address that threw one person out throws
-- out the entire room, including the organisers. A control whose failure mode
-- is "the event ends" is worse than one that a determined person can evade.
--
-- The real recourse against somebody determined is the one that already exists:
-- revoke the link, which ejects everybody it admitted, and hand out a new one.
-- That is a deliberate, visible, recoverable act, and it is what the UI points
-- an admin at once a ban has been evaded.
-- ============================================================================

create table if not exists public.tenant_bans (
  tenant_id  uuid        not null references public.tenants_read_model (id) on delete cascade,
  /**
   * The identity that was banned.
   *
   * No foreign key to auth.users, for the same reason `tenant_guests.guest_id`
   * has none: it is an anonymous id that may be reaped later, and a ban that
   * disappeared when its subject's account was tidied up would be a ban that
   * quietly expired. The row outliving the account is the point.
   */
  guest_id   uuid        not null,
  /** What they were called at the door. The only human-readable handle there is. */
  display_name text,
  banned_by  uuid        references auth.users (id) on delete set null,
  /** Why. The column that makes a ban explicable to the next admin on shift. */
  reason     text,
  created_at timestamptz not null default now(),

  primary key (tenant_id, guest_id)
);

comment on table public.tenant_bans is
  'Guests refused re-entry to a space. Keyed by anonymous identity, so it stops the same session returning and not a determined person - see the migration.';

create index if not exists tenant_bans_tenant_idx
  on public.tenant_bans (tenant_id, created_at desc);

alter table public.tenant_bans enable row level security;

-- Read and write by the space's own owners and admins - the people running the
-- event, who are the ones standing in the room when it happens. Not a guest:
-- the ban list is the roster of everybody thrown out, and it is not something
-- to hand to the next visitor.
drop policy if exists "tenant_bans_admin_all" on public.tenant_bans;

create policy "tenant_bans_admin_all"
  on public.tenant_bans for all
  to authenticated
  using (public.tenant_role(tenant_id) in ('owner', 'admin'))
  with check (public.tenant_role(tenant_id) in ('owner', 'admin'));

-- ============================================================================
-- The check at the door
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER and granted to `anon` as well as `authenticated`, because
-- the guest door runs before anybody has an identity worth the name.
-- ============================================================================

create or replace function public.is_guest_banned(p_tenant_id uuid, p_guest_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_bans b
     where b.tenant_id = p_tenant_id
       and b.guest_id  = p_guest_id
  );
$$;

grant execute on function public.is_guest_banned(uuid, uuid) to authenticated, anon;

-- ----------------------------------------------------------------------------
-- A ban is also an eviction
-- ----------------------------------------------------------------------------
-- Banning somebody who is standing in the room has to remove them from it, or
-- the admin presses the button and watches nothing happen - which is the
-- failure that makes a moderation control untrustworthy. Same argument
-- `revokeGuestLink` makes about the guests it admitted.
--
-- A trigger rather than two writes in TypeScript, so that a ban inserted by any
-- route - the UI, a script, the import at the end of an event - ejects its
-- subject. The admission is deleted rather than marked, because it is a fact
-- about who is in the room right now and that fact has just changed.
-- ----------------------------------------------------------------------------

create or replace function public.evict_on_ban()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.tenant_guests
   where tenant_id = new.tenant_id
     and guest_id  = new.guest_id;

  delete from public.world_occupancy
   where tenant_id = new.tenant_id
     and user_id   = new.guest_id;

  return new;
end;
$$;

drop trigger if exists tenant_bans_evict on public.tenant_bans;

create trigger tenant_bans_evict
  after insert on public.tenant_bans
  for each row execute function public.evict_on_ban();
