-- ============================================================================
-- The xp_sales flag: launch on xo, keep xp behind "soon"
-- ----------------------------------------------------------------------------
-- Off, and unlike most of the flags seeded off this one is not guarding an
-- unfinished *feature* - it is pausing a *sale*. The XP suite works; two of the
-- four things the xp card promises (story, VR) do not exist yet, and taking
-- €10 a month for them today is a refund with extra steps.
--
-- So the tier ships, the plumbing ships, and the price stays behind this switch
-- until the card is true. Flipping it on is the launch, and it needs no deploy.
--
-- ----------------------------------------------------------------------------
-- What it gates, and the one thing it deliberately does not
-- ----------------------------------------------------------------------------
-- It gates *taking money for xp*: the Checkout session, the scheduled move up
-- from xo, and the copy on the three surfaces that quote a price.
--
-- It does not gate `xpOpen()`. A space already holding xp - through a voucher,
-- or grandfathered off the retired €20 plan - keeps the XP suite while this is
-- off. Withdrawing a product from people who already have it is a different
-- decision from pausing sales, and one switch that did both would make the
-- first one by accident the moment somebody made the second.
--
-- That split is also what makes this useful rather than merely restrictive:
-- with sales off, an xp promo code is still redeemable and still works, so the
-- tier can be put in front of real people before it is put on sale.
--
-- ----------------------------------------------------------------------------
-- Why a row and not just a registry key
-- ----------------------------------------------------------------------------
-- The same lesson 20260922000000_xp_flag.sql wrote down: the registry in
-- src/domain/flags/keys.ts decides which keys the code may branch on, and this
-- table decides which ones exist. `listFeatureFlags` builds the backoffice list
-- from feature_flags *rows*, so a key with no row is filtered out and the
-- toggle an operator needs on launch day would simply not be there.
-- ============================================================================

insert into public.feature_flags (key, enabled, label, description) values
  ('xp_sales', false, 'xp tier on sale',
   'Whether the €10 xp plan can be bought. Off means xo is the only plan on sale and xp shows as coming soon; spaces that already hold xp by voucher or grandfathering keep it either way. Turning this on is the xp launch.')
on conflict (key) do nothing;
