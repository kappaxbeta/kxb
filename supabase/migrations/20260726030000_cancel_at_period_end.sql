-- ============================================================================
-- Entitlements: is this subscription winding down?
-- ----------------------------------------------------------------------------
-- Cancelling sets `cancel_at_period_end` on the Stripe subscription rather than
-- deleting it: the customer paid through a date and keeps everything until that
-- date arrives. Until then the subscription is still `active`, so `status`
-- alone cannot distinguish "renewing" from "ending on the 25th" - and those
-- need very different words on screen.
--
-- Mirrored here so the daily sync keeps it current and the billing page does
-- not need its own Stripe round trip to render a sentence.
-- ============================================================================

alter table public.user_entitlements
  add column if not exists cancel_at_period_end boolean not null default false;
