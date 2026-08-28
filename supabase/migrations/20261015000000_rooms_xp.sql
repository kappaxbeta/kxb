-- ============================================================================
-- A room can be a level
-- ----------------------------------------------------------------------------
-- docs/xp/backlog.md §11.5, and the answer to the question the pin left open.
--
-- `xp_pins` made a level survive its match, and it did it beside the rooms
-- rather than as one - so a standing level had no chat, no visitor list, no
-- capacity, no rename and no close. Every one of those already exists on a room
-- and works, and building a second set for a second kind of place is how a
-- product ends up with two of everything and one of them worse.
--
-- So: **a room may name a level, and then it is that level.** Everything else
-- about it stays exactly what it was - its own Realtime topic, its own chat
-- (`room_id` on the chat rows), its own door, its own place in the sidebar. The
-- only thing that changes is what gets drawn inside it: the lounge scene, or the
-- XP runtime.
--
-- ---------------------------------------------------------------------------
-- One nullable column, and null is what every room ever opened is
-- ---------------------------------------------------------------------------
-- The same shape `battles_read_model.xp_id` took for the same reason, down to
-- the check: a reference ends up in a path on the server, so a column that would
-- hold `../../etc` is one that only fails to matter until somebody upstream
-- forgets a validator.
--
-- It is not settable after the fact on purpose - there is no `SetRoomXp`. A room
-- full of blocks that becomes a level would strand the blocks, and a level that
-- becomes a room would strand whatever the store held for it. Opening a second
-- room is cheap; converting one is a migration of somebody's afternoon.
-- ============================================================================

alter table public.rooms_read_model
  add column if not exists xp_ref text;

alter table public.rooms_read_model
  drop constraint if exists rooms_read_model_xp_ref_shape;

alter table public.rooms_read_model
  add constraint rooms_read_model_xp_ref_shape
  check (xp_ref is null or xp_ref ~ '^[a-z0-9][a-z0-9-]{0,63}$');

comment on column public.rooms_read_model.xp_ref is
  'The level this room is, as domain/xps/ref.ts spells it. NULL for an ordinary lounge room.';
