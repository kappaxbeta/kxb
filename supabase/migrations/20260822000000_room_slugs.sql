-- ============================================================================
-- Rooms are addressed by name
-- ----------------------------------------------------------------------------
-- A room's URL was `/t/<space>/rooms/<uuid>`, which is unreadable, unsayable
-- and impossible to check against the room you meant to open. It is
-- `/t/<space>/rooms/<name>` now, and the name is what everybody calls the place
-- anyway.
--
-- Two things follow from that, and both live here:
--
--   1. **A slug column.** Derived, not authored - it is always
--      `slugifyRoomName(name)` (src/domain/rooms/slug.ts), written by the
--      projection on every RoomCreated and RoomRenamed. Nothing new goes in the
--      log: a replay recomputes every slug from the name it already records, so
--      this column can be dropped and rebuilt at any time.
--
--   2. **Names are unique per space.** They were not, and `createRoom` said so
--      out loud - "Meeting 2 is a name somebody will want twice". Addressing a
--      room by name makes that impossible: two rooms called the same thing are
--      one URL pointing at two places. So the space gets the name once.
--
-- Unique among *open* rooms only, which is what makes closing a room release
-- its name. Closing is already a delisting rather than a deletion - the blocks
-- stay exactly where they are - and a name held hostage by a room nobody can
-- walk into would be a room you have to reopen to rename.
-- ============================================================================

alter table public.rooms_read_model
  add column if not exists slug text;

-- ----------------------------------------------------------------------------
-- Backfill
-- ----------------------------------------------------------------------------
-- The same shape as the TypeScript, for ASCII: lowercase, every run of
-- non-alphanumerics becomes one dash, no dashes at the ends, 60 characters.
-- Accented names are the one place the two disagree - `slugifyRoomName` strips
-- the accent ("Café" -> `cafe`) and this cannot without `unaccent`, which is not
-- guaranteed to be installed. That divergence is harmless and self-correcting:
-- the row is only ever read alongside the link that was built from it, and the
-- next rename or projection rebuild writes the JavaScript answer.
--
-- A name that slugifies to nothing at all - emoji, or a script this does not
-- cover - falls back to the room id, exactly as `roomSlug` does.
-- ----------------------------------------------------------------------------
update public.rooms_read_model
set slug = coalesce(
  nullif(
    trim(both '-' from left(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), 60)),
    ''
  ),
  room_id::text
)
where slug is null;

-- Rooms that were opened under the old rule and share a name would fail the
-- index below, so the older one keeps the name and the rest fall back to their
-- ids. They are still reachable, still listed, and a rename fixes the URL.
with clashes as (
  select
    room_id,
    row_number() over (
      partition by tenant_id, slug
      order by created_at, room_id
    ) as rank
  from public.rooms_read_model
  where closed = false
)
update public.rooms_read_model r
set slug = r.room_id::text
from clashes c
where c.room_id = r.room_id
  and c.rank > 1;

alter table public.rooms_read_model
  alter column slug set not null;

-- Partial, matching `rooms_tenant_idx`: the constraint is about rooms you can
-- walk into, and it doubles as the lookup index for the room page, which
-- resolves a URL by (tenant, slug).
create unique index if not exists rooms_tenant_slug_idx
  on public.rooms_read_model (tenant_id, slug)
  where closed = false;

comment on column public.rooms_read_model.slug is
  'URL name, derived from name by slugifyRoomName. Unique per tenant among open rooms.';
