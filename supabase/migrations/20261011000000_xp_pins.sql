-- ============================================================================
-- Pinned levels: a place that survives its match
-- ----------------------------------------------------------------------------
-- docs/xp/backlog.md §11.5, and the one thing that entry left open after the
-- rail and the store page landed.
--
-- The Places list already shows XPs standing in this space, and it shows them by
-- listing *open matches* - which works and has a wrinkle written down beside it:
-- a match is a session, so the day the backstop closes it (20261007000000) the
-- place disappears from the rail. A freeplay level, which by definition never
-- ends, is exactly the thing that should not vanish because nobody was in it on
-- Sunday.
--
-- A pin is the fix and it is the smaller half of the pair: **the place is the
-- row, the match is the session**. Walking into a pinned place finds the live
-- match for it or opens one, and closing that match leaves the pin exactly where
-- it was.
--
-- ---------------------------------------------------------------------------
-- Pin the release, not the project
-- ---------------------------------------------------------------------------
-- The reference is what `domain/xps/ref.ts` spells, so `p-<uuid>-v3` names one
-- version and `sidestep` names a document we ship. §11.5 argued this through and
-- landed on the version: the ground under people standing on it must not change
-- because an author saved. Re-pinning is how you move a place to v4, which is a
-- decision somebody makes rather than one that happens to them.
--
-- Text, matching `battles_read_model.xp_id`, and the same shape constraint - so
-- a pin and the match it opens can hold one another's value with no conversion
-- and no second alphabet to keep in step.
--
-- ---------------------------------------------------------------------------
-- A row, not a stream
-- ---------------------------------------------------------------------------
-- The same argument `xp_store` makes one migration over, applied to a much
-- smaller thing. A pin is a pointer: it is created, it may be renamed, it is
-- removed. There is no history anybody will ask for - "when did the Cliffside
-- pin move to v4" is not a question this product has - and a stream would mean a
-- decider, an event union and a projection to carry a name and a reference.
--
-- What that costs is honest and worth saying: unpinning leaves no record. If it
-- ever matters who took the space's level down, this becomes a stream and the
-- table becomes its read model, which is the shape everything else here already
-- has.
-- ============================================================================

create table if not exists public.xp_pins (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants_read_model (id) on delete cascade,

  /**
   * What the place plays, as `domain/xps/ref.ts` spells it.
   *
   * The check is the same one `battles_read_model.xp_id` carries, for the same
   * reason its own comment gives: a reference ends up in a path on the server,
   * and a column that would hold `../../etc` is one that only fails to matter
   * until somebody forgets a validator upstream.
   */
  xp_ref     text        not null check (xp_ref ~ '^[a-z0-9][a-z0-9-]{0,63}$'),

  /**
   * What the rail calls it.
   *
   * Copied from the level's name when it is pinned rather than joined at read
   * time - the rail draws this list on every page in the space, and a join
   * through `xps_read_model` to print a word is a query per render. It also
   * lets a space call its own room something other than what the author called
   * the level, which is the ordinary reason two spaces pin the same thing.
   */
  name       text        not null check (length(btrim(name)) between 1 and 60),

  pinned_by  uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

/**
 * One pin per level per space.
 *
 * Pinning the same reference twice is not two places - it is one place somebody
 * pressed the button on twice, and two rows would be two rail rows opening the
 * same room. Two *versions* of one project are deliberately allowed to coexist,
 * because the reference carries the version: a space running v3 for a
 * tournament while v4 is being tried out is a real thing to want.
 */
create unique index if not exists xp_pins_one_per_ref
  on public.xp_pins (tenant_id, xp_ref);

/** The rail's own query: this space's pins, newest first. */
create index if not exists xp_pins_tenant_idx
  on public.xp_pins (tenant_id, created_at desc);

alter table public.xp_pins enable row level security;

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------
-- Read is anybody who can see the space, guests included, and that is the point
-- of the list: a visitor at an event is exactly who needs to be told which
-- levels are standing. `tenant_role` is what `rooms_read_model` reads with, and
-- it answers for a guest where `is_tenant_member` does not.
create policy "xp_pins_select"
  on public.xp_pins for select
  to authenticated
  using (public.tenant_role(tenant_id) is not null);

-- Writing is a member's, matching rooms exactly. A pin is furniture in the
-- commons - the same kind of decision as opening a room - and the action above
-- this narrows it further to what `writeBlockedReason` allows.
create policy "xp_pins_insert"
  on public.xp_pins for insert
  to authenticated
  with check (public.is_tenant_member(tenant_id));

create policy "xp_pins_update"
  on public.xp_pins for update
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

create policy "xp_pins_delete"
  on public.xp_pins for delete
  to authenticated
  using (public.is_tenant_member(tenant_id));

comment on table public.xp_pins is
  'Levels a space keeps standing. The place is the row; the match is the session. docs/xp/backlog.md §11.5.';
