-- ============================================================================
-- A round, in a room that is a level
-- ----------------------------------------------------------------------------
-- A board game is not a lounge: people gather, somebody deals, and from that
-- moment the table is closed until the hand is over. The room already models
-- the gathering - a door, a capacity read off the level's own `players.max`,
-- presence, chat - and this is the one thing it had no word for.
--
-- ---------------------------------------------------------------------------
-- One timestamp, and null is the room being open
-- ---------------------------------------------------------------------------
-- Not a status column with two values, because there is a question the boolean
-- cannot answer and somebody always asks it: *how long has this been going on*.
-- A round with a start also gives the 24h-backstop shape something to read
-- later if a room is ever left mid-hand, which a boolean would have needed a
-- second column for.
--
-- Null means open: people come and go as they do in any room. Set means a round
-- is running, and `admitToRoom` turns newcomers away with a sentence - the
-- people already inside are unaffected, which is the whole point of a round
-- being a thing that closes the *door* rather than the room.
--
-- ---------------------------------------------------------------------------
-- Who reopens it
-- ---------------------------------------------------------------------------
-- Any member, exactly as any member may start one. A round that only its
-- starter could end is a table left locked when they close their laptop, and
-- the space would need an admin to unstick a board game. Recorded on the stream
-- either way, so who did what is answerable.
-- ============================================================================

alter table public.rooms_read_model
  add column if not exists round_started_at timestamptz;

comment on column public.rooms_read_model.round_started_at is
  'When the current round began, or NULL when the room is open to newcomers.';
