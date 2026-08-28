-- ============================================================================
-- A shelf that follows
-- ----------------------------------------------------------------------------
-- The shelf has always resolved to the newest version a space may play - a
-- room gets `ShelfRow.ref`, which is current - and the entry itself kept
-- whatever reference was taken in. Since the version badge shipped, somebody
-- has to press "Take v4" on every level, every time an author ships one.
--
-- This is the switch that says do not ask. One setting per space, because the
-- shelf is a property of the space and not of a person: two members must not
-- see different answers to "is this level current", or the one who follows and
-- the one who does not will disagree about what the Friday game is.
--
-- ----------------------------------------------------------------------------
-- Why a table rather than a column on the shelf
-- ----------------------------------------------------------------------------
-- `magazine_read_model` is keyed per entry, and this is not a fact about an
-- entry. Putting it there would mean storing the same boolean on every row and
-- deciding what a shelf with no rows believes - and a space switches this on
-- *before* it has taken anything in as often as after.
--
-- Projected from the magazine stream like the entries are, so the setting is in
-- the log beside the takings-in it changes the meaning of. "Who turned this on,
-- and when did these six levels start moving on their own" is one question, and
-- it should have one answer in one place.
-- ============================================================================

create table if not exists public.magazine_settings (
  tenant_id  uuid        primary key references public.tenants_read_model (id) on delete cascade,
  /**
   * Take a new version without asking.
   *
   * Default false, and the direction is deliberate. A level changing under a
   * room somebody is standing in is the surprising outcome, so the surprising
   * one is the one you opt into. It also matches every existing shelf: nothing
   * that is on a shelf today was put there by a space that had been asked this.
   */
  auto_update boolean     not null default false,
  updated_at  timestamptz not null default now()
);

comment on table public.magazine_settings is
  'Per-space shelf settings. Projected from the magazine stream - see domain/magazine/projection.ts. One row per space, and its absence means the defaults.';

alter table public.magazine_settings enable row level security;

drop policy if exists "magazine_settings_select" on public.magazine_settings;

-- ----------------------------------------------------------------------------
-- Read by any member, written by nobody.
--
-- The same shape as `magazine_read_model` beside it and for the same two
-- reasons: a guest who may see the shelf may see whether it follows, because it
-- explains what they are looking at; and the rows are *projected*, so a member
-- who could write here could change what the space believes without an event.
-- The projection runs as the service role, which bypasses this entirely.
-- ----------------------------------------------------------------------------
create policy "magazine_settings_select" on public.magazine_settings
  for select
  using (public.tenant_role(tenant_id) is not null);
