-- ----------------------------------------------------------------------------
-- The mech
-- ----------------------------------------------------------------------------
-- A twelfth body on the shelf, and the first that is not a person or a monster.
-- The art arrived as `public/xp/packs/spacenina` and rides the dummy's rig bone
-- for bone, so nothing downstream needed teaching: `isSkinLook` already says
-- yes to a slash, the thumbnail is `/xp/thumbs/spacenina/CombatMech.webp` like
-- every other catalogue id, and the lounge draws it down the same skinned path
-- a Knight takes. What was missing was only this row - a skin nobody can buy
-- is a model in a folder.
--
-- Priced like a plain adventurer rather than a super: €3 or one voucher, in
-- both currencies, so it is reachable by whichever of the two an account
-- happens to hold. The supers are the ones with no cash price, and making the
-- newest and most obvious character un-buyable with money is not the shape of
-- that decision.
--
-- `do nothing` on conflict, as with the nine and the two before it: after this
-- insert the backoffice owns the name, the price and the words, and dropping
-- it to free is one edit at /ovaloffice/skins rather than another migration.
-- ----------------------------------------------------------------------------
insert into public.skins (id, name, tier, price_cents, voucher_cost, backstory, active) values
  ('spacenina/CombatMech', 'Rustbucket', 'skin', 300, 1,
   'Rustbucket was built for a war that never came and has spent every year since being extremely helpful instead. Carries the shopping, reaches the top shelf, wins at every game involving a hammer. The armour plating is decorative. The politeness is factory-fitted, and nobody has found the switch.',
   true)
on conflict (id) do nothing;
