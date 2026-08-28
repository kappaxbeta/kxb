-- ============================================================================
-- A move is a thing the table agrees on
-- ============================================================================
-- The roll became a shared fact in the migration before this one, and the
-- end-to-end run then found the larger half of the same problem: the *board*
-- did not agree either. Every client spawns a level's entities from the same
-- document and runs its own world from there, and the only thing holding those
-- worlds together is `WorldShare` - despawns, held things, health, clips and
-- motions. No positions and no properties. A piece that moved on one screen
-- moved on no other, and the marker remembering which field it is on was local
-- too.
--
-- The fix is not a bigger share. A board game is a deterministic machine driven
-- by facts the table already agrees on - whose turn it is, what was rolled - so
-- the move becomes one of those facts rather than sixteen positions broadcast
-- sixty times a second. Four small fields, because entity ids are the document's
-- own order and therefore the same number on every client.
--
-- Reliability is why it is here rather than on the socket. A dropped position
-- sample is a body that jumps; a dropped *move* is a board that is permanently
-- wrong.
--
-- **The rules are still the document s.** This does not check that a move is
-- legal, which piece may move, or how far - that would be the database knowing
-- what a six means, and `roll` already refused to know in the other direction.
-- What this owns is that everybody hears the same move, once.
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
  face_now  integer;
  roll_now  jsonb;
  move_now  jsonb;
  want_lethal text;
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
    /**
     * Which dealt role, if any, has the working gun.
     *
     * Pinned at the join beside `hp` and `damage` and for the same reason: it
     * comes out of the document, every client in the room has the same
     * document, and a client that could name it later could name itself. It is
     * never compared against the deck here - the deck never reaches this
     * function, and does not need to. A value nobody is dealt refuses every hit
     * in the room, which is why `rulesProblems` refuses it in the editor.
     */
    want_lethal := nullif(p_payload ->> 'lethal', '');

    if settings is null then
      settings := jsonb_build_object('hp', want_hp, 'damage', want_dmg)
        || case when want_lives is null then '{}'::jsonb else jsonb_build_object('lives', want_lives) end
        || case when want_lethal is null then '{}'::jsonb else jsonb_build_object('lethal', want_lethal) end;
    elsif (settings ->> 'hp')::integer <> want_hp
       or (settings ->> 'damage')::integer <> want_dmg
       or (settings ->> 'lives') is distinct from (case when want_lives is null then null else want_lives::text end)
       or (settings ->> 'lethal') is distinct from want_lethal
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

    /**
     * The top of the deck, and only then shuffled.
     *
     * Cut before the shuffle rather than after it, which is the whole fix: a
     * ten-card deck holding one bug, shuffled and dealt to three, is a bug in
     * the room three times in ten. Cut first and the bug is the first card,
     * every time, and what chance decides is *who gets it* - which is the only
     * thing chance was ever wanted for here.
     *
     * It makes `rules.roles` a priority list, said out loud in its own doc: the
     * roles that must be in play go first. That is how a board game with a
     * variable player count has always handed out roles, and the alternative -
     * a document declaring a deck per player count - is a format nobody could
     * write by hand.
     */
    values_in := values_in[1:array_length(holders, 1)];
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
     * Whose shot this was, which is the only thing here that reads a secret.
     *
     * One dealt role's shots count and nobody else's do. Before the deal nobody
     * holds it, so nobody can hurt anybody - which is right, because the round
     * has not started.
     *
     * Checked *before* the victim's condition on purpose. "Already down" about
     * a body this shooter could never have affected is a fact they should not
     * be able to collect, and shooting the room one player at a time is
     * otherwise a way to read the health map through the refusals.
     *
     * The message is for one person and says nothing about anybody else. It
     * does not name the victim's role, because the shooter's own role is the
     * whole reason the shot did nothing and the victim had no part in it.
     */
    if settings ? 'lethal' then
      if coalesce(secrets ->> caller::text, '') <> (settings ->> 'lethal') then
        return jsonb_build_object(
          'ok', false,
          'why', 'refused',
          'message', 'your shots do not decide anything here'
        );
      end if;
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
    -- With the rest of the round. The next `pass` seats the table again, which
    -- is also how somebody who arrived during the last round gets a seat.
    turn_now := null;
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
    if turn_now is not null and turn_now ->> 'at' <> caller::text then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'it is not your turn');
    end if;

    want_sides := coalesce((p_payload ->> 'sides')::integer, 6);
    if want_sides < 2 or want_sides > 100 then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'a dice has between 2 and 100 faces');
    end if;

    face_now := 1 + floor(random() * want_sides)::integer;
    /**
     * Recorded, which reverses the decision the note above used to make.
     *
     * It said the face is "the level's business - it lands in the document's own
     * `data`, which is where a rule reads it and where it is already stored",
     * and that keeping a copy here would be a second answer to "what did I
     * roll". The first half is true of exactly one client: the one that pressed.
     *
     * A four-seat table found it. The roll reached the roller and nobody else's
     * screen ever heard about it, because a level's `data` is not a channel -
     * and on the builtin route there is no store behind it at all, so `space`
     * shares nothing there by any path. Three players watched one of them roll
     * an invisible die.
     *
     * There is still only one answer, which is the part the old note was right
     * about: this is *the* roll, and every client's `data` is a mirror of it
     * rather than a second opinion. `by` and `at` are what make it usable as
     * one - a client has to be able to tell last turn's four from this turn's,
     * and a bare number cannot say.
     */
    roll_now := jsonb_build_object(
      'key', p_payload ->> 'key',
      'face', face_now,
      'by', caller,
      'at', coalesce((current ->> 'rolls')::bigint, 0) + 1
    );

  elsif p_action = 'moved' then
    /**
     * A piece went somewhere, said once so the whole table can agree it did.
     *
     * -------------------------------------------------------------------------
     * Why the arbiter and not the socket
     * -------------------------------------------------------------------------
     * Every client spawns a level's entities from the same document in the same
     * order, so an entity's id is the same number on all of them - which makes a
     * move describable in four small fields instead of a position stream. What it
     * still needs is a channel that does not lose things, and the socket is
     * explicitly not one: a dropped position sample is a body that jumps, and a
     * dropped *move* is a board that is permanently wrong.
     *
     * This is the same shape as `roll` one branch up and for the same reason. A
     * board game is a deterministic machine driven by facts the table agrees on;
     * the roll was one, and this is the other.
     *
     * -------------------------------------------------------------------------
     * What is deliberately not checked
     * -------------------------------------------------------------------------
     * **Whether the move is legal.** The rules live in the document - which
     * piece may move, how far, and what happens when it lands - and the arbiter
     * has never read one. Putting them here would mean the database knowing what
     * a six means, which is the thing `roll` refused to do in the other
     * direction. What this owns is that everybody hears the same move, once.
     *
     * `at` is a counter rather than a clock, so a client can tell a move it has
     * applied from one it has not without either of us agreeing what time it is.
     */
    if p_payload ->> 'along' is null then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'a move names the track it is on');
    end if;

    move_now := jsonb_build_object(
      'id', (p_payload ->> 'id')::integer,
      'along', p_payload ->> 'along',
      'to', (p_payload ->> 'to')::integer,
      'by', caller,
      'at', coalesce((current ->> 'moves')::bigint, 0) + 1
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

    select array_agg(key order by key) into order_in
    from jsonb_object_keys(health) as keys(key)
    where not ((lives ? key) and coalesce((lives ->> key)::integer, 0) <= 0);

    if order_in is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody is left to take a turn');
    end if;

    turn_now := jsonb_build_object('at', order_in[1]);

  elsif p_action = 'pass' then
    /**
     * Hand the turn on - and seat the table if nobody has.
     *
     * The one check that matters is unchanged: a client that could pass
     * somebody else's turn could skip the player who is winning. What is new is
     * the case where there is no turn to pass, which used to be answered
     * *nobody is taking turns* and was, until this migration, the only answer a
     * level could ever get - nothing outside SQL could reach `turn_start`.
     *
     * **So the first `pass` seats the table.** A document that says `pass` is a
     * document that means turns, because that verb has never meant anything
     * else, and the alternative was a second way to say the same thing in a
     * format that would then have two. It is still `turn_start`'s rule that
     * decides who is in the order and `turn_start` is still there for anybody
     * who wants to say it out loud.
     *
     * What it deliberately does not decide is *when* a turn should end. Rolling
     * a six and going again is a rule about a game, and the arbiter has never
     * been told any of those.
     */
    /**
     * Everybody still in the match, which is not everybody in `health`.
     *
     * A player the room voted out - or who ran out of lives - stays in that map
     * for good: it is the scoreboard, and a name that disappeared would read as
     * somebody leaving. Taking the order from it unfiltered meant an eliminated
     * player kept being handed turns they are not allowed to take, and the table
     * waited for somebody who is watching.
     *
     * Skipping them is the *room's* rule rather than one invented here, which is
     * the whole reason this is the fix and a timeout is not: being out is a
     * majority decision the vote already carries, and this only stops the order
     * disagreeing with it.
     */
    select array_agg(key order by key) into order_in
    from jsonb_object_keys(health) as keys(key)
    where not ((lives ? key) and coalesce((lives ->> key)::integer, 0) <= 0);

    if order_in is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody is left to take a turn');
    end if;

    seat := array_position(order_in, caller::text);
    if seat is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'you are not in this match');
    end if;

    /**
     * A turn held by somebody who is out is a turn anybody may move on.
     *
     * They cannot pass it themselves - `pass` refuses a caller who is not in the
     * order at all - so without this the table stops at the moment the room
     * eliminates whoever happened to be holding it, which is the most likely
     * moment of all. The turn goes to the next player *after* them in the full
     * order rather than to the first: being eliminated should not hand the lead
     * back to the top of the table.
     */
    if turn_now is not null and not (turn_now ->> 'at' = any(order_in)) then
      /**
       * Unsticking is not the same as being done.
       *
       * The turn goes to the next player *after* the one who is out - not to the
       * first, because being knocked out should not hand the lead back to the
       * top of the table - and the caller's own turn is **not** consumed. A
       * press that rescued the table and then gave away the go it rescued would
       * punish whoever noticed.
       *
       * One expression rather than a `select ... into`: the value is a bare id
       * and this variable is `jsonb`, so assigning it directly asks Postgres to
       * read a uuid as JSON, and it says so at the first eliminated holder.
       */
      turn_now := jsonb_build_object('at', coalesce(
        (select key from unnest(order_in) as keys(key)
          where key > turn_now ->> 'at' order by key limit 1),
        order_in[1]
      ));
    else
      if turn_now is null then
        turn_now := jsonb_build_object('at', caller::text);
      elsif turn_now ->> 'at' <> caller::text then
        return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'it is not your turn to pass');
      end if;

      -- Round the table. `array_position` is one-based, so `seat % length + 1`
      -- is the next player and wraps to the first from the last.
      turn_now := jsonb_build_object('at', order_in[(seat % array_length(order_in, 1)) + 1]);
    end if;

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
        -- The last roll, and the count of them. Kept when this call was not a
        -- roll, so the table does not forget the face between one press and the
        -- next - which is the whole point of recording it.
        'roll', coalesce(roll_now, current -> 'roll'),
        'rolls', coalesce((roll_now ->> 'at')::bigint, (current ->> 'rolls')::bigint, 0),
        -- The last move, kept between calls exactly as the roll is: a client
        -- that joins late reads the board's most recent change rather than a
        -- gap where one happened.
        'move', coalesce(move_now, current -> 'move'),
        'moves', coalesce((move_now ->> 'at')::bigint, (current ->> 'moves')::bigint, 0)
      ) - (case when vote_now is null then array['vote'] else array[]::text[] end)
        - (case when turn_now is null then array['turn'] else array[]::text[] end)
        - (case when coalesce(roll_now, current -> 'roll') is null then array['roll'] else array[]::text[] end)
        - (case when coalesce(move_now, current -> 'move') is null then array['move'] else array[]::text[] end),
      updated_at = now()
  where instance = p_instance;

  if roll_now is not null then
    -- The same reply the roller has always had, so nothing on the client
    -- changes for the person who pressed.
    return jsonb_build_object('ok', true, 'outcome', jsonb_build_object('face', face_now));
  end if;

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
      /**
       * Whose turn it is now, so the client that just passed learns where the
       * turn went rather than only that it left.
       */
      'turn', turn_now,
      'dealt', jsonb_array_length(coalesce(jsonb_path_query_array(secrets, '$.keyvalue().key'), '[]'::jsonb))
    )
  );
end;
$$;

comment on function public.xp_arbitrate(text, text, jsonb) is
  'Ask for an outcome in one XP instance: join, deal, hit, revive, reset, roll, '
  'turn_start / pass, and vote_open / vote / vote_close. Returns an XpVerdict as '
  'jsonb, never a secret. With a lethal role pinned at join, a hit counts only '
  'when the shooter was dealt it - everybody else votes.';


/**
 * The view, restated for one field.
 *
 * Unchanged apart from `turn`, and restated whole because that is what
 * `create or replace` takes - rebuilding it from an older copy has silently
 * dropped a branch in this file's sibling before.
 */
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
    'round', coalesce((current ->> 'round')::integer, 0),
    -- Public for the same reason the vote is, and absent when nobody is taking
    -- turns: whose turn it is is the one fact a board game draws every frame,
    -- and a table where only the player being refused knows the answer is a
    -- table nobody can watch.
    'turn', current -> 'turn',
    -- Public, for the same reason the turn is and with the same sentence
    -- behind it: a table where only the player who pressed knows the number is
    -- a table nobody else can play. `at` is a counter rather than a clock, so a
    -- client can tell this turn's four from last turn's without either of us
    -- agreeing what time it is.
    'roll', current -> 'roll',
    -- And the last move, for the same reason: a table where a piece moves on
    -- one screen and not the others is four people playing alone in one room.
    'move', current -> 'move'
  );
end;
$$;

comment on function public.xp_arbiter_view(text) is
  'What this client may know about an instance, redacted server-side: its own '
  'secret in full and everybody else s as a count. Lives, the open vote, the '
  'round and whose turn it is are public. The only read path to '
  'xp_arbiter_state.';
