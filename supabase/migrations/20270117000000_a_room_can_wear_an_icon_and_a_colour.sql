-- ============================================================================
-- A room's own face in the list: an icon and a colour
-- ----------------------------------------------------------------------------
-- Every room in the Places band was drawn with the same glyph in the same
-- shade, which is fine for two rooms and useless for nine: the list becomes a
-- column of identical rows that has to be *read* rather than glanced at, and a
-- rail exists to be glanced at.
--
-- Both are the space's choice, made by an owner or admin in the Room tab, and
-- both are in the event log for the same reason the space's pin and its groups
-- are: they are decisions somebody made about how a shared thing appears to
-- everybody. See `RoomIconSet` and `RoomTintSet`.
--
-- ----------------------------------------------------------------------------
-- Names, not pictures and not colours
-- ----------------------------------------------------------------------------
-- `room_icon` holds a name out of a fixed list (`ROOM_ICONS` in
-- src/domain/rooms/look.ts) and `room_tint` a palette token out of another one.
-- Neither is an asset and neither is a hex value. The long version of why is in
-- that file's header; the short version is that an uploaded glyph is a whole
-- asset pipeline to tell two rows apart, and a free colour is a way to make a
-- room invisible against dark glass.
--
-- **No check constraint on either, deliberately.** The lists are expected to
-- grow, and a constraint would make adding the seventeenth icon a migration
-- that has to ship before the code that offers it - with the failure landing on
-- whoever picked it, as a projection that will not apply. The command schema
-- refuses an unknown name on the way in, and the reader falls back to the
-- default on the way out (`roomIcon`, `roomTint`), so a value from a build that
-- is newer than the reader draws a plain room rather than breaking one.
-- ============================================================================

alter table public.rooms_read_model
  add column if not exists room_icon text,
  add column if not exists room_tint text;

comment on column public.rooms_read_model.room_icon is
  'The glyph this room is drawn with in the rail, out of ROOM_ICONS, or null for the default. Projected from RoomIconSet.';
comment on column public.rooms_read_model.room_tint is
  'The palette token that glyph is drawn in, out of ROOM_TINTS, or null for the rail''s own colour. Projected from RoomTintSet.';
