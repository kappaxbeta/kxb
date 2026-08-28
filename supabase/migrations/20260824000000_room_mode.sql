-- ============================================================================
-- A room has its own mode
-- ----------------------------------------------------------------------------
-- Creative or battle, per room, instead of the one `tenants.lounge_mode` column
-- everywhere. The column is why this migration exists: the room page rendered
-- the scene with `mode="creative"` hardcoded and no switch at all, because the
-- only mode a room could have read was the space's - and a switch that wrote it
-- would have flipped the lobby and every other room at the same time. An owner
-- standing in a room found themselves stuck in creative with nothing to press.
--
-- So the mode moves down to the place it is about. The lounge keeps
-- `tenants.lounge_mode`, which is still right for it: the lounge is the one
-- room the whole space shares, and its mode is a fact about the space.
--
-- Defaulting to `creative` is what makes this a no-op for the rooms already
-- standing: it is the mode they have been rendered in since rooms shipped, and
-- any other default would have deployed as "somebody turned fighting on in
-- every room overnight".
--
-- No index. The mode is only ever read for a room already being loaded by id or
-- by slug, both of which are indexed, and it is not something anything filters
-- a list by.
-- ============================================================================

alter table public.rooms_read_model
  add column if not exists mode text not null default 'creative'
  check (mode in ('creative', 'battle'));

comment on column public.rooms_read_model.mode is
  'creative = building, battle = sparring. Per room, unlike the lounge''s tenants.lounge_mode - see the migration.';
