-- ============================================================================
-- Out, and staying out
-- ----------------------------------------------------------------------------
-- The voting game's other half. Hidden roles landed in 20261012000000; this is
-- *elimination that sticks*, which docs/xp/backlog.md §0.3 names as a spectator
-- state rather than a respawn.
--
-- ---------------------------------------------------------------------------
-- Why the server has to hold this and the client cannot
-- ---------------------------------------------------------------------------
-- Being down is already client-side and correctly so: your body, your screen,
-- your respawn timer. Being *out* is the opposite - it is a fact about the
-- match that everybody else has to agree with, and the one player who must not
-- be able to overrule it is the one it happened to. A client that owns its own
-- elimination is a client that reloads the page.
--
-- So `revive` grows a refusal. It is the same call it always was and it now
-- says no to somebody with no lives left, which is the whole mechanism: the
-- runtime keeps calling it, keeps being told no, and stays a spectator without
-- needing a second code path for "am I allowed back".
--
-- ---------------------------------------------------------------------------
-- Lives are opt-in, and absent means the game it already was
-- ---------------------------------------------------------------------------
-- No `lives` in the settings means infinite, which is every deathmatch built so
-- far - you go down, you come back, forever. A document that wants elimination
-- says a number, and it is pinned by the first join like the rest of the
-- settings, so a client that disagrees is refused rather than believed.
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
  lives    := coalesce(current -> 'lives', '{}'::jsonb);

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

  else
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', format('no rule for "%s"', p_action));
  end if;

  update public.xp_arbiter_state
  set state = jsonb_build_object(
        'settings', settings,
        'health', health,
        'scores', scores,
        'secrets', secrets,
        'lives', lives
      ),
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
      'dealt', jsonb_array_length(coalesce(jsonb_path_query_array(secrets, '$.keyvalue().key'), '[]'::jsonb))
    )
  );
end;
$$;

comment on function public.xp_arbitrate(text, text, jsonb) is
  'Ask for an outcome in one XP instance: join, deal, hit, revive. Returns an '
  'XpVerdict as jsonb, and never a secret. The caller is auth.uid() and never '
  'the payload. Lives are opt-in and absent means infinite.';

-- ----------------------------------------------------------------------------
-- Who is out is public
-- ----------------------------------------------------------------------------
-- Unlike a role, and the difference is worth being explicit about: hiding who
-- has been eliminated would be hiding it from the room as well as from the
-- player, and every game of this kind announces it. It is also what the
-- scoreboard needs in order to draw somebody as out rather than as quiet.
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
    'dealt', (select count(*) from jsonb_object_keys(secrets))
  );
end;
$$;

comment on function public.xp_arbiter_view(text) is
  'What this client may know about an instance, redacted server-side: its own '
  'secret in full and everybody else s as a count. Lives are public, because '
  'who is out is something the room is told. The only read path to '
  'xp_arbiter_state.';
