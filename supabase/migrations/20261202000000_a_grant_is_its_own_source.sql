-- ============================================================================
-- A grant is its own source
-- ----------------------------------------------------------------------------
-- `promo_redemptions.source` records how somebody came to redeem: they followed
-- a link, they typed a code at sign-up, they used the picker, they were already
-- in a space. Four doors, all of them a *person* arriving.
--
-- An operator putting a tester on xp is a fifth thing, and it is not any of the
-- four. It was going to be recorded as one of them - the constraint refused the
-- insert, which is the constraint doing its job - and squeezing it into `link`
-- would have been worse than the error: every funnel report that groups by
-- source would quietly count operator grants as campaign traffic, and the
-- numbers would be wrong in the direction that flatters us.
--
-- So it gets its own value. `source = 'grant'` is "nobody redeemed this, we
-- gave it to them", which is exactly what a report wants to be able to exclude.
--
-- Note the check is *widened*, never narrowed: every existing row keeps
-- validating, and this migration cannot fail on data.
-- ============================================================================

alter table public.promo_redemptions
  drop constraint if exists promo_redemptions_source_check;

alter table public.promo_redemptions
  add constraint promo_redemptions_source_check
  check (source in ('signup', 'link', 'picker', 'space', 'grant'));
