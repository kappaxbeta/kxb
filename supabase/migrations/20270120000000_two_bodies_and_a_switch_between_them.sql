-- Two bodies, and a switch between them
--
-- Everybody has a peep and an XP body at the same time. `profile_avatars` holds
-- the first, `profile_skins` the second, and neither is spent by choosing the
-- other. `in_lounge` was always meant to be the third thing - a *mode*, saying
-- which of the two a world draws - and it stays exactly that.
--
-- What was wrong was who wrote it. Equipping a body for the games went through
-- one action that upserted the model and set this flag in the same statement,
-- so buying a Knight silently answered a question nobody had asked: the peep
-- was replaced in every space the account walked into, and the only way back
-- was to pick an animal a second time. Equipping and being seen are two calls
-- now (`chooseSkin` and `wearSkinInLounge`), and the equip write names every
-- column except this one.
--
-- Which leaves the rows that flag already set. Not one of them was a choice -
-- there was no control that set it on its own - so they are the bug's residue
-- rather than a preference, and carrying them forward would leave exactly the
-- people who reported this still standing in a Knight. Off is also the column
-- default, so this returns the table to what a fresh account gets: a peep in
-- the space, an XP body in the games.

update public.profile_skins
   set in_lounge = false
 where in_lounge;

comment on column public.profile_skins.in_lounge is
  'Mode, not costume: whether a world draws this account''s XP body instead of '
  'their peep. Off by default, written only by wearSkinInLounge - equipping a '
  'body (chooseSkin) must never touch it, or the peep is overwritten platform-'
  'wide by a purchase.';
