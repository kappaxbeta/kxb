-- ============================================================================
-- Whose turn it is
-- ----------------------------------------------------------------------------
-- The gap docs/xp/server-authority.md has named twice without closing: the note
-- on `reset` says the arbiter "has never been told what *ends* a match", and the
-- dice one migration ago said the same thing about turns in as many words. A
-- board game built on `roll` alone enforces its order in the document, which is
-- a rule between friends and no rule at all between strangers.
--
-- Two actions and one refusal:
--
--   - **`turn_start`** puts the joined players in an order and points at the
--     first. The order is `health`'s keys sorted — the server's map rather than
--     each client's idea of who is here, so two clients asking at the same
--     moment cannot disagree about who goes first. Refused once it is running,
--     like `deal`: restarting the order is how somebody who does not like being
--     fourth becomes first.
--   - **`pass`** hands the turn on, and only your own. A client that could pass
--     somebody else's turn could skip the player who is winning.
--   - **`roll` refuses when it is not your turn** — and only when turns are
--     actually running, because a level that never called `turn_start` is a
--     level with no turns, and refusing every roll in one would break every game
--     that is not a board game.
--
-- ---------------------------------------------------------------------------
-- What it still does not decide
-- ---------------------------------------------------------------------------
-- **When a turn should end.** Rolling a six and going again is a rule about a
-- game, and this has never been told any of those. `pass` is the client saying
-- "I am done", which is the same shape as every other rule here: the arbiter
-- decides what a client may not, and a client decides what only it knows.
--
-- A player who has left is stepped over rather than waited for. `health` still
-- holds them, and a table that stops because somebody closed a tab is a table
-- nobody finishes.
--
-- The whole function is restated, as every migration that touches it has been.
-- ============================================================================

create or replace function public.xp_arbitrate(
  p_instance text,
  p_action   text,
  p_payload  jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller    uuid := auth.uid();
  current   jsonb;
  settings  jsonb;
  health    jsonb;
  scores    jsonb;
  secrets   jsonb;
  lives     jsonb;
  victim    text;
  want_hp   integer;
  want_dmg  integer;
  want_lives integer;
  left_hp   integer;
  left_lives integer;
  fatal     boolean := false;
  out_now   boolean := false;
  values_in text[];
  want_sides integer;
  holders   text[];
  holder    text;
  at        integer;
  vote_now  jsonb;
  tally     jsonb;
  choice    text;
  seconds   integer;
  want_round integer;
  round_now integer;
  turn_now  jsonb;
  order_in  text[];
  seat      integer;
begin
  if caller is null then
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'sign in to play a decided game');
  end if;

  if p_instance is null or length(p_instance) = 0 then
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'no instance');
  end if;

  insert into public.xp_arbiter_state (instance)
  values (p_instance)
  on conflict (instance) do nothing;

  select state into current
  from public.xp_arbiter_state
  where instance = p_instance
  for update;

  settings := current -> 'settings';
  health   := coalesce(current -> 'health', '{}'::jsonb);
  scores   := coalesce(current -> 'scores', '{}'::jsonb);
  secrets  := coalesce(current -> 'secrets', '{}'::jsonb);
  lives    := coalesce(current -> 'lives', '{}'::jsonb);
  vote_now := current -> 'vote';
  round_now := coalesce((current ->> 'round')::integer, 0);
  /**
   * `nullif`, because a JSON null is not a SQL NULL.
   *
   * Found by the first call: `turn_start` answered "turns have already started"
   * on a table nobody had ever sat at. `jsonb_build_object('turn', null)` stores
   * the JSON value `null`, and `current -> 'turn'` hands that back as a jsonb
   * that is very much not NULL — so `turn_now is not null` was true before
   * anything had happened. The same shape as the `not in` trap in
   * `xp_store_clear`: the absent case is the one that reads wrong.
   */
  turn_now  := nullif(current -> 'turn', 'null'::jsonb);

  if p_action = 'join' then
    want_hp  := greatest(1, least(10000, coalesce((p_payload ->> 'hp')::integer, 100)));
    want_dmg := greatest(1, least(10000, coalesce((p_payload ->> 'damage')::integer, 10)));
    -- Null rather than a default: absent means infinite, and a number would
    -- silently turn every existing deathmatch into an elimination game.
    want_lives := case
      when p_payload ->> 'lives' is null then null
      else greatest(1, least(1000, (p_payload ->> 'lives')::integer))
    end;

    if settings is null then
      settings := jsonb_build_object('hp', want_hp, 'damage', want_dmg)
        || case when want_lives is null then '{}'::jsonb else jsonb_build_object('lives', want_lives) end;
    elsif (settings ->> 'hp')::integer <> want_hp
       or (settings ->> 'damage')::integer <> want_dmg
       or (settings ->> 'lives') is distinct from (case when want_lives is null then null else want_lives::text end)
    then
      return jsonb_build_object(
        'ok', false,
        'why', 'refused',
        'message', 'this match was opened with different rules'
      );
    end if;

    if not (health ? caller::text) then
      health := health || jsonb_build_object(caller::text, (settings ->> 'hp')::integer);
      scores := scores || jsonb_build_object(caller::text, coalesce((scores ->> caller::text)::integer, 0));
      if settings ? 'lives' then
        lives := lives || jsonb_build_object(caller::text, (settings ->> 'lives')::integer);
      end if;
    end if;

  elsif p_action = 'deal' then
    if secrets <> '{}'::jsonb then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'this round has already been dealt');
    end if;

    select array_agg(value order by ordinality) into values_in
    from jsonb_array_elements_text(coalesce(p_payload -> 'values', '[]'::jsonb))
      with ordinality as elements(value, ordinality);

    if values_in is null or array_length(values_in, 1) is null then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'nothing to deal');
    end if;

    select array_agg(key) into holders from jsonb_object_keys(health) as keys(key);

    if holders is null or array_length(holders, 1) is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody has joined this match');
    end if;
    if array_length(values_in, 1) < array_length(holders, 1) then
      return jsonb_build_object(
        'ok', false,
        'why', 'refused',
        'message', format('%s players and only %s to deal', array_length(holders, 1), array_length(values_in, 1))
      );
    end if;

    select array_agg(value order by random()) into values_in from unnest(values_in) as shuffled(value);

    at := 1;
    foreach holder in array holders loop
      secrets := secrets || jsonb_build_object(holder, values_in[at]);
      at := at + 1;
    end loop;

  elsif p_action = 'hit' then
    if settings is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody has joined this match');
    end if;

    victim := p_payload ->> 'victim';

    if victim is null then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'no victim');
    end if;
    if victim = caller::text then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you cannot shoot yourself for a point');
    end if;
    if not (health ? caller::text) then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'you are not in this match');
    end if;
    if not (health ? victim) then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'no such player');
    end if;
    /**
     * Out before down, and the order is the whole reason to have both.
     *
     * Somebody eliminated is also on zero health forever, so testing health
     * first would answer every shot at them with "already down" and this branch
     * would be unreachable code that looked like a rule. Both are `stale` - a
     * claim from a client that has not caught up - and the difference is which
     * true thing the shooter is told.
     */
    if (lives ? victim) and coalesce((lives ->> victim)::integer, 0) <= 0 then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'already out');
    end if;
    if coalesce((health ->> victim)::integer, 0) <= 0 then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'already down');
    end if;

    left_hp := (health ->> victim)::integer - (settings ->> 'damage')::integer;
    if left_hp <= 0 then
      left_hp := 0;
      fatal := true;
      scores := scores || jsonb_build_object(caller::text, coalesce((scores ->> caller::text)::integer, 0) + 1);

      /**
       * A life, and possibly the last one.
       *
       * Counted here rather than at the revive because this is the moment it
       * happened: a life lost only when somebody presses respawn is a life
       * somebody keeps by closing the tab.
       */
      if lives ? victim then
        left_lives := greatest(0, (lives ->> victim)::integer - 1);
        lives := lives || jsonb_build_object(victim, left_lives);
        out_now := left_lives = 0;
      end if;
    end if;
    health := health || jsonb_build_object(victim, left_hp);

  elsif p_action = 'revive' then
    if settings is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody has joined this match');
    end if;
    if not (health ? caller::text) then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'you are not in this match');
    end if;
    /**
     * The refusal that makes elimination stick.
     *
     * `refused` and not `stale`: the round has not moved on and asking again
     * will not help, which is exactly the difference the two words carry. The
     * runtime can keep calling this forever and keep being told the same thing,
     * so being a spectator needs no second code path to ask permission with.
     */
    if (lives ? caller::text) and coalesce((lives ->> caller::text)::integer, 0) <= 0 then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you are out of this match');
    end if;
    health := health || jsonb_build_object(caller::text, (settings ->> 'hp')::integer);

  elsif p_action = 'vote_open' then
    if not (health ? caller::text) then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'you are not in this match');
    end if;
    if (lives ? caller::text) and coalesce((lives ->> caller::text)::integer, 0) <= 0 then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you are out of this match');
    end if;
    -- One at a time. A second vote opened over a running one would split the
    -- room between two questions and neither would reach a majority.
    if vote_now is not null then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'a vote is already open');
    end if;
    seconds := greatest(5, least(600, coalesce((p_payload ->> 'seconds')::integer, 60)));
    -- `now()` here and nowhere else. A deadline the client supplies is a
    -- deadline the client moves when it likes the count.
    /**
     * `to_jsonb` on the timestamp rather than `to_char` with a format string.
     *
     * The format string ended `OF`, which renders the offset as `+00` - and
     * `Date.parse('...+00')` is `NaN` in V8, because ISO 8601 wants `+00:00`.
     * Every consequence of that was silent: the countdown rendered as zero from
     * the moment a vote opened, and the client that schedules the close read
     * NaN, gave up, and scheduled nothing - so a vote nobody answered stayed
     * open forever again, through a different door to the one 1fd2b18 shut.
     *
     * Postgres's own jsonb rendering is ISO 8601 with a real offset. Nothing to
     * format, and nothing to get wrong a second time.
     */
    vote_now := jsonb_build_object(
      'closes', to_jsonb(now() + make_interval(secs => seconds)),
      'cast', '{}'::jsonb
    );

  elsif p_action = 'vote' then
    if vote_now is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'no vote is open');
    end if;
    if not (health ? caller::text) then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'you are not in this match');
    end if;
    /**
     * Somebody who is out does not vote.
     *
     * The whole reason the majority is measured against who is standing: a
     * knocked-out player who could still vote would be deciding a game they
     * are no longer in, and in a game with hidden roles that is the strongest
     * possible move for the side that lost them.
     */
    if (lives ? caller::text) and coalesce((lives ->> caller::text)::integer, 0) <= 0 then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you are out of this match');
    end if;

    choice := coalesce(p_payload ->> 'target', 'skip');
    if choice <> 'skip' and not (health ? choice) then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'no such player');
    end if;
    if choice <> 'skip' and (lives ? choice) and coalesce((lives ->> choice)::integer, 0) <= 0 then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'they are already out');
    end if;

    -- Changing your mind is allowed until it closes, and costs nothing to
    -- allow: the tally is computed from the map rather than accumulated, so a
    -- second vote from the same person replaces the first instead of adding to
    -- it. Accumulating would have made vote-changing a way to vote twice.
    vote_now := jsonb_set(vote_now, '{cast}', (vote_now -> 'cast') || jsonb_build_object(caller::text, choice));

    tally := public.xp_arbiter_tally(
      jsonb_build_object('vote', vote_now, 'lives', lives, 'health', health)
    );
    -- Closed early when everybody still in has spoken. Waiting out the clock
    -- after the last vote is a minute of watching nothing happen.
    if (tally ->> 'cast')::integer >= (tally ->> 'standing')::integer then
      if tally ->> 'eliminated' is not null then
        lives := lives || jsonb_build_object(tally ->> 'eliminated', 0);
        health := health || jsonb_build_object(tally ->> 'eliminated', 0);
      end if;
      current := jsonb_set(coalesce(current, '{}'::jsonb), '{lastVote}', tally);
      vote_now := null;
    end if;

  elsif p_action = 'vote_close' then
    if vote_now is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'no vote is open');
    end if;
    /**
     * Anybody may ask, and the server decides whether it is time.
     *
     * Which is why this is not a timer: nothing here runs on its own, so the
     * vote closes when the next person asks after the deadline. A client asking
     * early is told the truth rather than refused - it will ask again.
     */
    if now() < (vote_now ->> 'closes')::timestamptz then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'the vote is still open');
    end if;

    tally := public.xp_arbiter_tally(
      jsonb_build_object('vote', vote_now, 'lives', lives, 'health', health)
    );
    if tally ->> 'eliminated' is not null then
      lives := lives || jsonb_build_object(tally ->> 'eliminated', 0);
      health := health || jsonb_build_object(tally ->> 'eliminated', 0);
    end if;
    current := jsonb_set(coalesce(current, '{}'::jsonb), '{lastVote}', tally);
    vote_now := null;

  elsif p_action = 'reset' then
    if not (health ? caller::text) then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'you are not in this match');
    end if;
    /**
     * The round the caller believes it is starting, and it has to be the next
     * one.
     *
     * Which makes two people pressing rematch on the same frame idempotent
     * rather than two resets: the first advances the round and the second is
     * told the round it asked for has already begun. Without it, the second
     * reset would wipe a match that had already started again.
     */
    want_round := coalesce((p_payload ->> 'round')::integer, round_now + 1);
    if want_round <> round_now + 1 then
      return jsonb_build_object(
        'ok', false,
        'why', 'stale',
        'message', format('round %s has already begun', round_now)
      );
    end if;

    /**
     * Everything a round accumulated, gone; everything the *match* agreed,
     * kept.
     *
     * `settings` survives because the rules did not change - a rematch of a
     * three-life game is a three-life game, and clearing them would let the
     * next join pin different numbers. Everybody who joined stays joined and
     * comes back at full health with their lives back, which is what a rematch
     * *is*: an eliminated player who had to re-join would be a rematch that
     * some of the room cannot play.
     */
    round_now := want_round;
    secrets := '{}'::jsonb;
    vote_now := null;
    select jsonb_object_agg(key, (settings ->> 'hp')::integer) into health
    from jsonb_object_keys(health) as players(key);
    select jsonb_object_agg(key, 0) into scores
    from jsonb_object_keys(coalesce(scores, '{}'::jsonb)) as players(key);
    if settings ? 'lives' then
      select jsonb_object_agg(key, (settings ->> 'lives')::integer) into lives
      from jsonb_object_keys(health) as players(key);
    else
      lives := '{}'::jsonb;
    end if;

  elsif p_action = 'roll' then
    /**
     * A dice, decided here because a dice decided anywhere else is not one.
     *
     * The same argument `deal` makes one branch up, arriving from the other
     * side: `deal` is here so a role cannot be re-rolled, and this is here so a
     * *number* cannot. `random()` on the server rather than the seeded stream
     * every client can reproduce — see the header of 20261012000000.
     *
     * The face is returned and **not** kept in the state. What a dice came up
     * as is the level's business: it lands in the document's own `data` field,
     * which is where a rule reads it and where it is already stored. Keeping a
     * second copy here would be a second answer to "what did I roll", and the
     * two would disagree the first time somebody rolled twice in a round.
     *
     * What this deliberately does not do is decide *whose* turn it is. The
     * arbiter has never been told about turns, and refusing an out-of-turn roll
     * needs that first — see the note on `reset` in
     * docs/xp/server-authority.md, which is the same gap wearing a different
     * hat.
     */
    if health = '{}'::jsonb then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody has joined this match');
    end if;

    /**
     * Not your turn, not your roll.
     *
     * Only when a turn is actually running: a level that never called
     * `turn_start` is a level with no turns, and refusing every roll in it
     * would break every game that is not a board game. This is the whole of
     * what turn-taking buys — it was the gap the note on `reset` named, and it
     * is the difference between a rule friends keep and a rule the table keeps.
     */
    if turn_now is not null and (turn_now -> 'order' ->> coalesce((turn_now ->> 'at')::integer, 0)) <> caller::text then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'it is not your turn');
    end if;

    want_sides := coalesce((p_payload ->> 'sides')::integer, 6);
    if want_sides < 2 or want_sides > 100 then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'a dice has between 2 and 100 faces');
    end if;

    return jsonb_build_object(
      'ok', true,
      'outcome', jsonb_build_object('face', 1 + floor(random() * want_sides)::integer)
    );

  elsif p_action = 'turn_start' then
    /**
     * Begin taking turns, in the order people joined.
     *
     * The order is the `health` map's keys, which is join order and is the same
     * for everybody because it is the server's map rather than each client's
     * idea of who is here. Sorted, so two clients asking at the same moment
     * cannot disagree about who is first.
     *
     * Refused once it is running, like `deal`: restarting the order is how
     * somebody who does not like being fourth becomes first.
     */
    if turn_now is not null then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'turns have already started');
    end if;
    if health = '{}'::jsonb then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody has joined this match');
    end if;

    select array_agg(key order by key) into order_in from jsonb_object_keys(health) as keys(key);
    turn_now := jsonb_build_object('order', to_jsonb(order_in), 'at', 0);

  elsif p_action = 'pass' then
    /**
     * Hand the turn on, and only your own.
     *
     * The one check that matters: a client that could pass somebody else's turn
     * could skip the player who is winning. What it deliberately does not do is
     * decide *when* a turn should end — rolling a six and going again is a rule
     * about the game, and the arbiter has never been told any of those.
     *
     * A player who has left is stepped over rather than waited for: `health`
     * still holds them, and a table that stops because somebody closed a tab is
     * a table nobody finishes.
     */
    if turn_now is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody is taking turns');
    end if;

    select array_agg(value order by ordinality) into order_in
    from jsonb_array_elements_text(turn_now -> 'order') with ordinality as elements(value, ordinality);

    seat := coalesce((turn_now ->> 'at')::integer, 0);
    if order_in[seat + 1] <> caller::text then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'it is not your turn to pass');
    end if;

    -- Round the table, skipping anybody the match has lost. At most one lap:
    -- if nobody is left the turn stays where it is rather than looping forever.
    for at in 1..array_length(order_in, 1) loop
      seat := (seat + 1) % array_length(order_in, 1);
      exit when health ? order_in[seat + 1];
    end loop;
    turn_now := jsonb_build_object('order', turn_now -> 'order', 'at', seat);

  else
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', format('no rule for "%s"', p_action));
  end if;

  update public.xp_arbiter_state
  set state = jsonb_build_object(
        'settings', settings,
        'health', health,
        'scores', scores,
        'secrets', secrets,
        'lives', lives,
        -- Absent rather than null when there is no vote running, so `-> 'vote'`
        -- is the whole test and there is no second empty shape to check for.
        'vote', vote_now,
        'lastVote', current -> 'lastVote',
        'round', round_now,
      'turn', turn_now,
        'turn', turn_now
      ) - (case when vote_now is null then array['vote'] else array[]::text[] end)
        - (case when turn_now is null then array['turn'] else array[]::text[] end),
      updated_at = now()
  where instance = p_instance;

  return jsonb_build_object(
    'ok', true,
    'outcome', jsonb_build_object(
      'scores', scores,
      'health', health,
      'lives', lives,
      'fatal', fatal,
      -- Named separately from `fatal` because they are two different things to
      -- draw: one is "they are down for eight seconds" and the other is "they
      -- are not coming back", and a client that had to derive the second from a
      -- number reaching zero would derive it wrong in the match with no lives
      -- in it at all.
      'eliminated', out_now,
      'victim', victim,
      'vote', vote_now,
      'lastVote', current -> 'lastVote',
      -- Which round this outcome belongs to, so a client can tell a rematch
      -- from a scoreboard that happens to have gone back to zero.
      'round', round_now,
      'dealt', jsonb_array_length(coalesce(jsonb_path_query_array(secrets, '$.keyvalue().key'), '[]'::jsonb))
    )
  );
end;
$$;