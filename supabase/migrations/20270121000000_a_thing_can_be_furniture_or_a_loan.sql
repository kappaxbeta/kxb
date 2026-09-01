-- ============================================================================
-- Whether a summoned thing outlives whoever summoned it
-- ----------------------------------------------------------------------------
-- Two different acts wear one gesture. Somebody arranging a room and somebody
-- getting a ball out to kick about both press the same button, and until now
-- both left the room permanently changed - so a space fills up with the residue
-- of an afternoon, and tidying it is a job for whoever notices.
--
-- `keep` is the difference. True is furniture: the room stays arranged. False
-- is a loan - a ball, a chair pulled over for a conversation, a target somebody
-- is practising against - and it goes when its owner leaves the world.
--
-- ----------------------------------------------------------------------------
-- Why the row carries it rather than the tab that placed it
-- ----------------------------------------------------------------------------
-- Because the sweep is best-effort by construction. A browser closed mid-
-- session never gets to tidy up after itself, so something else has to be able
-- to know that the chair in the corner was never meant to stay: the next
-- visitor's client, a cron, an admin pressing a button. A flag that lived only
-- in the tab that placed it could be swept by nothing.
--
-- Default true, and the event's field is optional for the same reason: every
-- thing summoned before this existed was placed to stay, and it has to keep
-- meaning that. There is nothing to backfill - the default is the backfill.
-- ============================================================================

alter table public.thingiverse_things_read_model
  add column if not exists keep boolean not null default true;

comment on column public.thingiverse_things_read_model.keep is
  'Whether this outlives whoever summoned it. True is furniture; false is a loan, swept when its owner leaves the world. Projected from ThingSummoned.keep and ThingKeepSet.';

-- What a sweep asks for: this world's loans, by who left them.
create index if not exists thingiverse_things_loans_idx
  on public.thingiverse_things_read_model (tenant_id, world_id, placed_by)
  where not keep and not deleted;
