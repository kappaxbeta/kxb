-- ============================================================================
-- The XP flag
-- ----------------------------------------------------------------------------
-- Off by default, like `worlds`, `battle`, `agents` and `radio` before it, and
-- for the same reason: this seeds new surface rather than describing something
-- already shipped, so a resolver outage must not be what turns it on.
--
-- The damage from a wrong default is specific enough to name here as well as in
-- the registry: an XP match opens a Realtime topic per room, and every client in
-- it sends eight messages a second for as long as the tab is open. Defaulting to
-- on would not merely reveal a control - it would put that traffic in the budget
-- of spaces that never asked for it.
--
-- What it gates is the *space* half: the XP section in the summon wizard,
-- creating a match with an `xp_id` on it, and the room the match is played in.
-- It does not gate /xp, which is the creator's own workbench - an operator tool
-- with its own gate and no tenant to read a flag from, the same split `worlds`
-- and `scenes` make.
--
-- ----------------------------------------------------------------------------
-- Why this file exists at all, which is worth writing down
-- ----------------------------------------------------------------------------
-- The key was added to the registry in `src/domain/flags/keys.ts` and the
-- backoffice showed nothing, because that list is built from feature_flags
-- *rows* and a key with no row is filtered out. The registry decides which keys
-- the code may branch on; the table decides which ones exist. A new flag needs
-- both, and forgetting this one looks exactly like the feature not shipping.
-- ============================================================================

insert into public.feature_flags (key, enabled, label, description) values
  ('xp', false, 'XP',
   'A space can fight a match inside an XP: its own level with its own rules, played in the battle room, with everybody who joins in one room and able to see each other move. No score comes back out of an XP yet.')
on conflict (key) do nothing;
