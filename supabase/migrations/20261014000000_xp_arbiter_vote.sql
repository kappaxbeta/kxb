-- ============================================================================
-- A vote, and what a majority is when somebody has left
-- ----------------------------------------------------------------------------
-- The last server-side piece of the voting game. Roles are dealt
-- (20261012000000), elimination sticks (20261013000000), and this is the bit
-- between them: the room decides, rather than a shot deciding.
--
-- ---------------------------------------------------------------------------
-- Three things that had to be decided rather than defaulted
-- ---------------------------------------------------------------------------
-- **Who counts.** Only players who are still in. Somebody eliminated does not
-- vote and is not counted in the majority - if they were, a game that had
-- knocked out half the room would need a majority nobody alive could reach, and
-- the vote would stop working exactly when it matters most.
--
-- **What a majority is.** Strictly more than half of those still in, not "most
-- votes". Four players, two for Ana and one for Bo is not a majority, and
-- eliminating on a plurality means three players can lose to two. A round with
-- no majority ends with nobody out, which is a result and is recorded as one.
--
-- **When it ends.** Either everybody still in has voted, or the deadline
-- passes. Both go through the same tally, because two code paths deciding the
-- same thing is how the answer comes to depend on which one ran.
--
-- The deadline is `now()` on this server, never a timestamp from a client - a
-- client that supplies its own clock is a client that closes the vote the
-- moment it likes the count.
-- ============================================================================

create or replace function public.xp_arbiter_tally(state jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  cast_votes jsonb := coalesce(state -> 'vote' -> 'cast', '{}'::jsonb);
  lives      jsonb := coalesce(state -> 'lives', '{}'::jsonb);
  health     jsonb := coalesce(state -> 'health', '{}'::jsonb);
  standing   integer;
  counts     jsonb := '{}'::jsonb;
  target     text;
  leader     text;
  best       integer := 0;
  tied       boolean := false;
begin
  /**
   * Who is still in, which is who counts twice over: they vote, and they are
   * the denominator the majority is measured against.
   *
   * A match with no lives has nobody out, so everybody who joined is standing -
   * which is what makes this rule work in a game where the vote is the *only*
   * way out.
   */
  select count(*) into standing
  from jsonb_object_keys(health) as players(id)
  where not (lives ? id) or coalesce((lives ->> id)::integer, 0) > 0;

  for target in select value from jsonb_each_text(cast_votes) as votes(voter, value) loop
    counts := counts || jsonb_build_object(target, coalesce((counts ->> target)::integer, 0) + 1);
  end loop;

  for target in select key from jsonb_object_keys(counts) as keys(key) loop
    if coalesce((counts ->> target)::integer, 0) > best then
      best := (counts ->> target)::integer;
      leader := target;
      tied := false;
    elsif coalesce((counts ->> target)::integer, 0) = best then
      tied := true;
    end if;
  end loop;

  return jsonb_build_object(
    'counts', counts,
    'standing', standing,
    'cast', (select count(*) from jsonb_object_keys(cast_votes)),
    -- Strictly more than half, and never on a tie. `skip` is an ordinary target
    -- here: a majority to skip is a majority, and it ends the round with
    -- nobody out rather than with the runner-up out.
    'eliminated', case
      when leader is null or tied then null
      when leader = 'skip' then null
      when best * 2 > standing then leader
      else null
    end,
    'majority', case when leader is not null and not tied and best * 2 > standing then true else false end
  );
end;
$$;

comment on function public.xp_arbiter_tally(jsonb) is
  'Count an open vote: who leads, whether it is a majority of those still in, '
  'and who that eliminates. Pure, so both the last-vote and deadline paths can '
  'use it. See docs/xp/server-authority.md.';

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
  holders   text[];
  holder    text;
  at        integer;
  vote_now  jsonb;
  tally     jsonb;
  choice    text;
  seconds   integer;
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
    vote_now := jsonb_build_object(
      'closes', to_char(now() + make_interval(secs => seconds), 'YYYY-MM-DD"T"HH24:MI:SS.MSOF'),
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
        'lastVote', current -> 'lastVote'
      ) - (case when vote_now is null then 'vote' else '' end),
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
      'dealt', jsonb_array_length(coalesce(jsonb_path_query_array(secrets, '$.keyvalue().key'), '[]'::jsonb))
    )
  );
end;
$$;

comment on function public.xp_arbitrate(text, text, jsonb) is
  'Ask for an outcome in one XP instance: join, deal, hit, revive, vote_open, '
  'vote, vote_close. Returns an XpVerdict as jsonb, and never a secret.';
