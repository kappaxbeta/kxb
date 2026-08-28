-- ============================================================================
-- The scene renders flag
-- ----------------------------------------------------------------------------
-- Off by default, like `xp`, `worlds`, `battle`, `agents` and `radio` before
-- it, and for the same reason the note in 20260922000000_xp_flag.sql gives: a
-- key in the registry with no row here is filtered out of the backoffice
-- entirely, so a new flag needs both files or it looks exactly like the feature
-- not shipping.
--
-- What it gates is *registering* a job: the API that accepts "draw this scene"
-- and the backoffice surface that watches the queue. It does not gate the
-- worker. Turning this off is a decision to stop accepting new work, and rows
-- that were accepted while it was on still deserve to be drained rather than
-- stranded half-rendered.
--
-- The damage from defaulting this on is not a revealed control, which is why it
-- is worth spelling out twice. Behind it is a headless Chrome running
-- SwiftShader - software rasterisation, no GPU - on the same two cores that
-- serve kxb.team. A resolver blip that read `true` would let anything able to
-- reach the API put load on the box that is also answering requests.
-- ============================================================================

insert into public.feature_flags (key, enabled, label, description) values
  ('renders', false, 'Scene renders',
   'A scene can be turned into an image by a worker instead of by the browser that composed it: the request is registered as a job, a headless renderer draws it, and the picture lands in Storage. Any caller can ask - the board, the scene catalogue, a space, a script.')
on conflict (key) do nothing;
