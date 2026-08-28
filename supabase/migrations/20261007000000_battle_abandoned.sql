-- A match that ended because everybody left, rather than because it finished.
--
-- One boolean rather than a fifth `status`, and the argument is the same one the
-- event makes (see `BattleEnded.abandoned`): the *result* is not in question. A
-- football match walked away from at 2-1 was 2-1, and it belongs in the ended
-- pile with its score on it. What a reader would otherwise get wrong is only
-- that nobody blew the whistle, which is exactly one bit.
--
-- A fifth status would have been the expensive version of that bit: every query
-- that filters on `status in ('ended','cancelled')`, every switch in the client,
-- and the check constraint, all changed so that a lobby could print one word
-- differently.
--
-- Not null with a default, because the answer for every match ever played is no
-- and a nullable column would make "we do not know" a third state that nothing
-- means. The backstop is the only thing that ever sets it true.

alter table public.battles_read_model
  add column if not exists abandoned boolean not null default false;

comment on column public.battles_read_model.abandoned is
  'TRUE when the 24h backstop closed this match rather than a whistle. See ABANDON_AFTER_HOURS.';
