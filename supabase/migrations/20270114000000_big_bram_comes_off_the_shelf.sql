-- ============================================================================
-- Big Bram comes off the shelf
-- ----------------------------------------------------------------------------
-- The large barbarian does not survive being drawn at a person's height: the
-- mesh is authored as a boss twice everybody else's size, and the rig scale
-- that makes an adventurer stand eye to eye with a peep folds it into
-- something nobody would pay two bucks for. It is a modelling problem, not a
-- pricing one, so it is withdrawn rather than repriced.
--
-- `active = false` rather than a delete, which is the whole reason that column
-- exists. The row still answers for the ownership and voucher rows that point
-- at it, anybody who already bought it keeps wearing it, and putting it back
-- is one switch in the backoffice rather than a migration - so "for now" is
-- literally true.
-- ============================================================================

update public.skins
   set active = false, updated_at = now()
 where id = 'adventurers/Barbarian_Large';
