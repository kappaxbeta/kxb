-- ============================================================================
-- Whether the arrival ring is drawn on the floor
-- ----------------------------------------------------------------------------
-- The ring marks where people land - see src/app/world/lounge/spawn-mark.tsx,
-- which sizes it from the spread `arrivalCell` actually uses, so it covers a
-- nine-block circle in the middle of a room. That is exactly what you want while
-- you are deciding where the door goes and exactly what you do not want in the
-- room afterwards, so it has to be possible to put it away.
--
-- It began as a per-device preference in localStorage, and that was the wrong
-- shape for it. How a room *looks* is a property of the room: an owner who tidies
-- the chalk away has tidied it away for the people walking in, not only for the
-- browser they happened to press the button in - and the same owner on a phone
-- would have found it back again. One column, on the row that already says where
-- the door is.
--
-- `not null default true` so every world that already has a spawn keeps drawing
-- its ring: this migration changes nothing anybody can see until somebody turns
-- one off.
--
-- Note what governs it: the same policies as the rest of the row, which means
-- owner and admin write, everybody in the space reads. That is deliberate rather
-- than incidental - it is the same authority that decides *where* the door is,
-- and there is no sensible world in which those two answers belong to different
-- people.
-- ============================================================================

alter table public.world_spawns
  add column if not exists show_ring boolean not null default true;
