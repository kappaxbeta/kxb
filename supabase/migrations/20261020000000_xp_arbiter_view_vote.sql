-- ============================================================================
-- The view forgot the vote
-- ----------------------------------------------------------------------------
-- `vote_open` put a vote in the state and returned it to whoever called it, and
-- `xp_arbiter_view` never mentioned it. Two consequences, and the first is the
-- one that makes the feature not work at all:
--
-- **The caller's own panel vanished a second later.** The client sets the vote
-- from the verdict and then polls the view, which said nothing about a vote -
-- so `seen.vote ?? null` cleared it on the very next tick.
--
-- **Nobody else ever knew.** A vote the room cannot see is not a vote. Every
-- other client learns state from this function and this function was the one
-- place the vote was missing.
--
-- Found by running it: two signed-in browsers in one room, one pressing `B`,
-- and a panel that appeared and disappeared while the row in the database said
-- a vote was open. Neither `bun test` nor the SQL checks could have caught it -
-- both call `xp_arbitrate` and read its outcome, which was always right.
-- ============================================================================

create or replace function public.xp_arbiter_view(p_instance text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller  uuid := auth.uid();
  current jsonb;
  secrets jsonb;
begin
  select state into current
  from public.xp_arbiter_state
  where instance = p_instance;

  secrets := coalesce(current -> 'secrets', '{}'::jsonb);

  return jsonb_build_object(
    'scores', coalesce(current -> 'scores', '{}'::jsonb),
    'health', coalesce(current -> 'health', '{}'::jsonb),
    'lives', coalesce(current -> 'lives', '{}'::jsonb),
    'settings', current -> 'settings',
    'me', caller,
    'secret', case when caller is null then null else secrets -> caller::text end,
    'dealt', (select count(*) from jsonb_object_keys(secrets)),
    -- Public, and it has to be: a vote is the room deciding together, so every
    -- client needs the same deadline and the same running count. What is cast
    -- is not a secret either - a vote nobody can watch is a vote nobody plays.
    'vote', current -> 'vote',
    'lastVote', current -> 'lastVote',
    -- So a client can tell a rematch from a scoreboard that has gone to zero.
    'round', coalesce((current ->> 'round')::integer, 0)
  );
end;
$$;

comment on function public.xp_arbiter_view(text) is
  'What this client may know about an instance, redacted server-side: its own '
  'secret in full and everybody else s as a count. Lives, the open vote and the '
  'round are public. The only read path to xp_arbiter_state.';
