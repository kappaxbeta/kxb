-- ============================================================================
-- Something one player knows and another does not
-- ----------------------------------------------------------------------------
-- The other half of docs/xp/server-authority.md §4. The first half was
-- integrity - two numbers moving together, decided somewhere no client can
-- reach. This is secrecy, and it is what §7.2 refused to give a save scope to:
-- *"a secret the client fetches is not a secret"*, so it cannot be an xp_store
-- row and has to be somewhere that decides what each caller may know.
--
-- Deliberately not shaped like a card game. §4 says so in as many words - built
-- inside the first game that needs it, it ends up shaped like poker forever - so
-- what a secret *is* here is one opaque value per player. A role in a voting
-- game, a hand, a sealed bid, which square hides the mine: the arbiter neither
-- knows nor cares, and every one of those is the same shape.
--
-- ---------------------------------------------------------------------------
-- The dealer must not be the seeded stream
-- ---------------------------------------------------------------------------
-- `world.random` was built for exactly this kind of job and is exactly wrong
-- here, which is worth writing down before somebody reaches for it. That stream
-- is `hash(seed, tick, index)` and every client holds the seed - that is what
-- makes two machines roll the same dice. It also makes every value in it
-- computable by anybody who wants to: a client could work out everybody's role
-- from numbers it already has, and the game would be over before it began.
--
-- So the deal uses the database's own randomness, which nothing outside this
-- function has ever seen. Public agreement and secrecy are opposite
-- requirements and they need opposite sources.
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
  caller   uuid := auth.uid();
  current  jsonb;
  settings jsonb;
  health   jsonb;
  scores   jsonb;
  secrets  jsonb;
  victim   text;
  want_hp  integer;
  want_dmg integer;
  left_hp  integer;
  fatal    boolean := false;
  values_in text[];
  holders   text[];
  holder    text;
  at        integer;
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

  if p_action = 'join' then
    want_hp  := greatest(1, least(10000, coalesce((p_payload ->> 'hp')::integer, 100)));
    want_dmg := greatest(1, least(10000, coalesce((p_payload ->> 'damage')::integer, 10)));

    if settings is null then
      settings := jsonb_build_object('hp', want_hp, 'damage', want_dmg);
    elsif (settings ->> 'hp')::integer <> want_hp or (settings ->> 'damage')::integer <> want_dmg then
      return jsonb_build_object(
        'ok', false,
        'why', 'refused',
        'message', 'this match was opened with different rules'
      );
    end if;

    if not (health ? caller::text) then
      health := health || jsonb_build_object(caller::text, (settings ->> 'hp')::integer);
      scores := scores || jsonb_build_object(caller::text, coalesce((scores ->> caller::text)::integer, 0));
    end if;

  elsif p_action = 'deal' then
    /**
     * One value each, shuffled, to everybody who has joined.
     *
     * Refused once it has happened, and that is the rule that matters: a second
     * deal is a player who did not like their role asking again, and it would
     * also hand somebody a *different* role to the one everybody else has been
     * playing against for ten minutes.
     */
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
    -- Fewer values than players would leave somebody with nothing and no way to
    -- tell whether that was the game or a bug. The document is what sizes this,
    -- so it is the document that is wrong, and saying so beats dealing anyway.
    if array_length(values_in, 1) < array_length(holders, 1) then
      return jsonb_build_object(
        'ok', false,
        'why', 'refused',
        'message', format('%s players and only %s to deal', array_length(holders, 1), array_length(values_in, 1))
      );
    end if;

    /**
     * `random()`, and not the seeded stream every client can reproduce.
     *
     * See the header. This is the one place in the whole engine where being
     * unable to agree is the requirement rather than the bug.
     */
    select array_agg(value order by random()) into values_in from unnest(values_in) as shuffled(value);

    -- `holder` and not `victim`: reusing the hit rule's variable left the last
    -- player dealt to sitting in the outcome's `victim` field, which is a deal
    -- reporting somebody as shot. Nothing secret escaped through it and it was
    -- still the wrong answer to a question nobody asked.
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
    if coalesce((health ->> victim)::integer, 0) <= 0 then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'already down');
    end if;

    left_hp := (health ->> victim)::integer - (settings ->> 'damage')::integer;
    if left_hp <= 0 then
      left_hp := 0;
      fatal := true;
      scores := scores || jsonb_build_object(caller::text, coalesce((scores ->> caller::text)::integer, 0) + 1);
    end if;
    health := health || jsonb_build_object(victim, left_hp);

  elsif p_action = 'revive' then
    if settings is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody has joined this match');
    end if;
    if not (health ? caller::text) then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'you are not in this match');
    end if;
    health := health || jsonb_build_object(caller::text, (settings ->> 'hp')::integer);

  else
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', format('no rule for "%s"', p_action));
  end if;

  update public.xp_arbiter_state
  set state = jsonb_build_object(
        'settings', settings,
        'health', health,
        'scores', scores,
        'secrets', secrets
      ),
      updated_at = now()
  where instance = p_instance;

  /**
   * The outcome carries no secrets, and never will.
   *
   * A deal returns *that* it dealt and how many - the values go out through the
   * view, one caller at a time. Returning them here would put every role in the
   * reply to whoever happened to press the button, which is the whole failure
   * this entry exists to prevent, arriving through the door marked "outcome".
   */
  return jsonb_build_object(
    'ok', true,
    'outcome', jsonb_build_object(
      'scores', scores,
      'health', health,
      'fatal', fatal,
      'victim', victim,
      'dealt', jsonb_array_length(coalesce(jsonb_path_query_array(secrets, '$.keyvalue().key'), '[]'::jsonb))
    )
  );
end;
$$;

comment on function public.xp_arbitrate(text, text, jsonb) is
  'Ask for an outcome in one XP instance: join, deal, hit, revive. Returns an '
  'XpVerdict as jsonb, and never a secret. The caller is auth.uid() and never '
  'the payload.';

-- ----------------------------------------------------------------------------
-- The per-player view, now that there is something to keep back
-- ----------------------------------------------------------------------------
-- Until this migration the view was the whole state, because a deathmatch has
-- nothing in it worth hiding. §4.1's rule is that a client is *told what it may
-- know* rather than sent everything and asked not to look, and this is the
-- function where that becomes true rather than aspirational.
--
-- Yours in full; everybody else's as the fact that they have one. The count is
-- deliberately offered - "three of us have a role" is public in every game of
-- this kind, and a client left to infer it from the roster would infer it wrong
-- the moment somebody disconnected.
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
    'settings', current -> 'settings',
    'me', caller,
    -- Ours, or null before a deal. Null and "you were dealt nothing" are the
    -- same thing to a client and there is no third case to tell apart.
    'secret', case when caller is null then null else secrets -> caller::text end,
    'dealt', (select count(*) from jsonb_object_keys(secrets))
  );
end;
$$;

comment on function public.xp_arbiter_view(text) is
  'What this client may know about an instance, redacted server-side: its own '
  'secret in full and everybody else s as a count. The only read path to '
  'xp_arbiter_state.';
