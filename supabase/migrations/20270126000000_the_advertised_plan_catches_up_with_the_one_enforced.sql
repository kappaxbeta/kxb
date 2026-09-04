-- ============================================================================
-- The advertised plan catches up with the one being enforced
-- ----------------------------------------------------------------------------
-- `tiers` is what the pricing table *quotes*. `TIER_LIMITS` in
-- `src/domain/billing/tiers.ts` is what `resolveLimit` actually *enforces* -
-- see `domain/billing/limits.ts`, which reads the constants and never this
-- table. The two are meant to agree, and they had drifted badly:
--
--   * free was seeded at `xoPlaces: 0, xpPlaces: 0, projects: 0` - the tier as
--     it was before XP stopped being a rung and became a quantity. The
--     constants have said 5 / 4 / 1 since, so every free space could already
--     open rooms, stand in levels and edit one, while the landing page told
--     them to upgrade first. Copy that turns people away from something they
--     already have is the one kind of stale row worth a migration.
--   * xo had been hand-edited on the production box down to `xpPlaces: 0,
--     projects: 0`, which the enforcement path has never honoured. A plan
--     advertising less than it grants is only marginally better than one
--     advertising more.
--
-- So all three rows are set to the constants, once. `do update` rather than the
-- seed's `do nothing`, and the difference in posture is deliberate: `do
-- nothing` protects an operator's edits from a *repeated* seed, and this is a
-- single correction that has to land on rows which already exist. It is
-- idempotent for the same reason the seed is not - running it again writes the
-- same numbers.
--
-- What this does *not* touch: `cents`, `sold`, `shown_on_landing`, `label`,
-- `tagline` or any price id. Those are commercial settings an operator owns
-- from `/ovaloffice/pricing`, and none of them had drifted from anything.
--
-- Keep this in step with `TIER_LIMITS` by hand or not at all. There is no
-- machine holding them together, on purpose - the constants move on a commit
-- that also moves the public copy, and this table exists so the *next* change
-- to a number does not need a deploy.
-- ============================================================================

insert into public.tiers (id, rank, cents, sold, limits, label, tagline) values
  (
    'free', 0, 0, false,
    '{"seats":2,"guests":1,"xoPlaces":5,"xpPlaces":4,"magazine":null,"projects":1,"matches":5,"pages":1,"pictures":0}'::jsonb,
    'free', 'Your own space, for you and one other.'
  ),
  (
    'xo', 1, 500, true,
    '{"seats":6,"guests":3,"xoPlaces":20,"xpPlaces":4,"magazine":null,"projects":3,"matches":15,"pages":null,"pictures":10}'::jsonb,
    'xo', 'Room for the group, and a shelf to build from.'
  ),
  (
    'xp', 2, 1500, true,
    '{"seats":12,"guests":8,"xoPlaces":30,"xpPlaces":10,"magazine":null,"projects":null,"matches":30,"pages":null,"pictures":100}'::jsonb,
    'xp', 'Everything in xo, and room to build without counting.'
  )
on conflict (id) do update set limits = excluded.limits;
