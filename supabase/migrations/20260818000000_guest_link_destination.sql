-- ============================================================================
-- Where a guest link lets out
-- ----------------------------------------------------------------------------
-- Every link admitted its guest to the lounge, because the lounge is the room a
-- guest can actually do something in and for a long time it was the only place
-- worth arriving in. The `Invite guest` button inside a match broke that
-- assumption: somebody is mid-game, pulls a friend in, and the friend lands in
-- an empty lounge two navigations away from the thing they were invited to.
--
-- The destination is a property of the *invitation*, not of the visitor, which
-- is why it is a column here rather than a query parameter on the URL. A knock
-- link makes the difference concrete: the visitor is redirected to a doormat,
-- polls from a client that was never told where they were headed, and is let in
-- by somebody else entirely. The row is the only thing that survives all of
-- that intact - and, unlike a parameter, it is not something the visitor can
-- edit on the way in.
--
-- NULL means the lounge, and no backfill runs: every link minted before this
-- existed meant the lounge, and writing the lounge path into thousands of rows
-- would be recording a default as though it were a decision.
-- ============================================================================

alter table public.guest_links
  add column if not exists destination text;

comment on column public.guest_links.destination is
  'Relative path this link admits its guest to, e.g. /t/acme/battle/<id>. NULL means the lounge. Validated on write; re-checked against the tenant on redemption.';
