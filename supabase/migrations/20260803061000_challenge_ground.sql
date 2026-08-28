-- ============================================================================
-- A challenge always names its ground
-- ----------------------------------------------------------------------------
-- The previous migration left `world_id` nullable and said NULL meant the
-- challenger's lounge. That cannot work, and the reason is a readability rule
-- rather than a preference: `lounge_blocks_read_model` is gated on membership,
-- so the space being challenged cannot read the challenger's lounge at all. A
-- match staged there would render as an empty void for one side.
--
-- The only ground both sides can see is a battlefield marked public, which is
-- exactly what that visibility switch is for. So a challenge names one, always.
-- ============================================================================

-- No backfill: challenges did not exist before the previous migration in this
-- same batch, so there is nothing in flight to repair.
alter table public.space_challenges
  alter column world_id set not null;

comment on column public.space_challenges.world_id is
  'The public battlefield the match is fought on. Never a lounge - neither space can read the other''s.';
