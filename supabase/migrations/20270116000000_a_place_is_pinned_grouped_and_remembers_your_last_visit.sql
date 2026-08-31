-- ============================================================================
-- Places: an admin's pin, an admin's grouping, and your own two marks
-- ----------------------------------------------------------------------------
-- The Places band in the rail used to be one flat list in the order the rooms
-- were opened, with everything but the lounge indented under it. That order is
-- the wrong one the moment a space has more than about four rooms: the room you
-- were in ten minutes ago sits wherever it was created, and the room the space
-- actually runs its week around sits wherever it was created too.
--
-- Three separate ideas fix that, and they are separate because they have three
-- different owners:
--
--   * **The space's pin** and **the space's groups** are decisions somebody
--     makes on behalf of everybody. They belong in the event log like every
--     other decision about a room - see `RoomPinSet` and `RoomGroupSet` - and
--     so they arrive here as two more projected columns rather than as a table.
--   * **Your pin** and **when you were last in there** are facts about one
--     person, and nobody else may read them. They are not decisions about a
--     thing the app owns, nothing folds them into state, and losing them costs
--     an ordering rather than a truth - so they are a plain table, on the same
--     reasoning `room_perf_samples` and `world_occupancy` are.
--
-- ----------------------------------------------------------------------------
-- Why "group" is a column on the room and not a table of groups
-- ----------------------------------------------------------------------------
-- A group here is a *caption over some rows*. It has no members beyond the
-- rooms that name it, no settings, no permissions of its own and nothing that
-- can be true of it while no room is in it. A `room_groups` table would need a
-- create screen, a rename screen, a delete-what-happens-to-the-rooms question
-- and a second projection - all to hold a string that the rooms already carry.
--
-- The cost is that renaming a group is renaming it on each of its rooms, which
-- is a loop in the action rather than one update. That is the right trade at
-- the size a space's room list actually is (tier caps it well under twenty).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The space's own two columns
-- ----------------------------------------------------------------------------
-- `pinned_at` rather than `pinned boolean`, so several pinned rooms have an
-- order that is not their creation order - the first thing an admin pins is the
-- first thing anybody sees. It is the event's `created_at`, never `now()`: a
-- replay is rebuilding a pin somebody made months ago.
--
-- `room_group` is null for every room standing today, which is what "ungrouped"
-- means and needs no backfill.
alter table public.rooms_read_model
  add column if not exists pinned_at  timestamptz,
  add column if not exists room_group text;

comment on column public.rooms_read_model.pinned_at is
  'When an owner or admin pinned this room for the whole space, or null. Projected from RoomPinSet; ordering, not permission.';
comment on column public.rooms_read_model.room_group is
  'The caption this room is listed under in the rail, or null for ungrouped. Projected from RoomGroupSet.';

-- ----------------------------------------------------------------------------
-- room_marks - one person's pins and last visits
-- ----------------------------------------------------------------------------
-- Keyed by (user_id, room_id) because every read starts from "me, in this
-- space": the rail asks for my marks on the rooms it is about to draw, and
-- nothing ever asks who has pinned a given room. `tenant_id` rides along so
-- that read is one index hit rather than a join back to the room.
--
-- **No foreign key to rooms_read_model, deliberately.** That table is a read
-- model: it is dropped and rebuilt from the log when a projection changes, and
-- a cascade from it would take everybody's pins with it - a silent data loss
-- with no event to replay it back from. A mark for a room that no longer exists
-- simply never matches a row in the list and is ignored; the sweep at the
-- bottom is what stops those accumulating.
--
-- Both marks are nullable and both are meaningful when null: no pin, and never
-- been in there. A row exists as soon as either is set.
create table if not exists public.room_marks (
  tenant_id  uuid        not null references public.tenants_read_model (id) on delete cascade,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  /** The room. A bare uuid - see above for why this is not a foreign key. */
  room_id    uuid        not null,
  /** When *you* pinned it to the top of your own list, or null. */
  pinned_at  timestamptz,
  /** When you were last standing in it. Written by the room page on the way in. */
  seen_at    timestamptz,
  updated_at timestamptz not null default now(),

  primary key (user_id, room_id)
);

-- The one read there is: my marks, in this space.
create index if not exists room_marks_mine_idx
  on public.room_marks (user_id, tenant_id);

alter table public.room_marks enable row level security;

-- ----------------------------------------------------------------------------
-- Row level security: your own rows, in a space you are in
-- ----------------------------------------------------------------------------
-- Narrower than every read model beside it, and that is the point - this is the
-- first table in the app whose rows are *private to one member of a space*. A
-- space-wide select policy here would let anybody in the space read which rooms
-- everybody else keeps going back to, which is a different product from the one
-- anybody asked for.
--
-- The membership half is not redundant with the ownership half: without it a
-- member who has left a space could still write rows against it, and the rail
-- would be reading marks scoped to a space they cannot see.
--
-- Guests are included on purpose, through `tenant_role()` rather than
-- `is_tenant_member()`. A guest sees exactly one room and so has almost nothing
-- to order, but the room page writes `seen_at` for whoever walks in, and a
-- policy that refused them would turn every guest's page load into a failed
-- write to swallow.
create policy "room_marks_select"
  on public.room_marks for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    and public.tenant_role(tenant_id) is not null
  );

create policy "room_marks_insert"
  on public.room_marks for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.tenant_role(tenant_id) is not null
  );

create policy "room_marks_update"
  on public.room_marks for update
  to authenticated
  using (
    (select auth.uid()) = user_id
    and public.tenant_role(tenant_id) is not null
  )
  with check (
    (select auth.uid()) = user_id
    and public.tenant_role(tenant_id) is not null
  );

-- Unpinning clears a column rather than removing the row, so there is no delete
-- policy - the same posture the rooms listing takes about closing.

comment on table public.room_marks is
  'One member''s private marks on the rooms of one space: their own pin, and when they were last in there. Not event-sourced - see the migration header.';
