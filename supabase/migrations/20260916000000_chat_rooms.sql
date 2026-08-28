-- ============================================================================
-- Chat, per room
-- ----------------------------------------------------------------------------
-- A space had one conversation. That was right while a space *was* one room -
-- the lounge - and stopped being right the moment rooms existed: everybody in
-- the café, the house and four side rooms was typing into the same feed, and
-- the only way to have a conversation with the people you were standing next to
-- was to ask everybody else to ignore it.
--
-- So a message names a room. Nullable, and null means the lounge, which is the
-- same shape and the same reasoning `lounge_blocks_read_model.world_id` uses:
-- every row written up to now was said in the lounge, so the absence of a value
-- *is* the value, and there is no backfill to get wrong and no moment where the
-- old conversation is missing. See `roomOf` in src/domain/chat/events.ts, which
-- is the reading half of it, and `worldOf`, which it is copied from.
--
-- No foreign key to `rooms_read_model`, deliberately. A closed room's history is
-- still history - a moderator reading a report about something said in a room
-- that has since been shut needs the message, not a dangling reference error -
-- and the read model this points at is itself a projection that can be rebuilt.
-- The same argument `chat_messages_read_model.tenant_id` already makes by having
-- no key to `tenants_read_model`.
-- ============================================================================

alter table public.chat_messages_read_model
  add column if not exists room_id uuid;

-- ----------------------------------------------------------------------------
-- The scrollback query, which now has a room in it
-- ----------------------------------------------------------------------------
-- `(tenant_id, room_id, created_at desc)` rather than adding room_id to the end:
-- the query is always "this space, this room, newest first", so room_id belongs
-- beside the equality it is part of. Postgres treats nulls as ordinary values in
-- a btree, so the lounge - every row where room_id is null - is one contiguous
-- run of the index rather than a special case.
--
-- The old index stays. It still answers "everything this space has ever said",
-- which is what the moderation queue asks, and that question has no room in it.
-- ----------------------------------------------------------------------------
create index if not exists chat_messages_read_model_by_room_idx
  on public.chat_messages_read_model (tenant_id, room_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Nothing changes about who may read or write
-- ----------------------------------------------------------------------------
-- The policies are untouched, and that is a decision rather than an omission.
-- Membership of the *space* is what governs chat, exactly as before: a room is
-- somewhere to hold a conversation, not a permission boundary, and `rooms` has
-- its own visibility rules for who may walk into one. Making chat rows visible
-- only to people who can enter the room would put a second, subtly different
-- copy of that logic in a policy, where the two would drift and where the
-- divergence would show up as history that silently disappears.
--
-- If a private room's conversation should be private, that is a real feature and
-- it belongs in `rooms` alongside the admission rules - not smuggled in here.
-- ============================================================================
