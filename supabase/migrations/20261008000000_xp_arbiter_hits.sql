-- ============================================================================
-- A point for the kill, not for every hit
-- ----------------------------------------------------------------------------
-- 20261005000000 shipped the arbiter with one rule called `kill` that took a
-- life and gave a point in the same breath. That is a scoreboard counting
-- *hits*, and §0.3 asks for kills - three shots to put somebody down would have
-- read as three kills, which is wrong in the direction nobody notices until the
-- scores are absurd.
--
-- ---------------------------------------------------------------------------
-- Where the numbers come from, when the server has never read the document
-- ---------------------------------------------------------------------------
-- How much health a body has and how hard a weapon hits are in the XP document.
-- The database has never seen it and should not - it is a file in a bucket that
-- changes without a migration.
--
-- Asking the client is the obvious move and it is the hole: a client that sends
-- its own damage number sends a large one. But every client in an instance has
-- *the same document*, so they will all send the same numbers - and that is the
-- property to lean on. **The first join pins the rules; every later join has to
-- agree or is refused.** A liar is then refused entry rather than believed, and
-- the honest majority never notices this exists.
--
-- It is not a signature and it does not have to be. The first joiner could lie,
-- and what they get for it is a match nobody else can join.
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
  victim   text;
  want_hp  integer;
  want_dmg integer;
  left_hp  integer;
  fatal    boolean := false;
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

  -- Locked before it is read, which is the entire reason this is SQL: two hits
  -- in the same tick that both read 40 health would both write 30, and the
  -- second one would be free.
  select state into current
  from public.xp_arbiter_state
  where instance = p_instance
  for update;

  settings := current -> 'settings';
  health   := coalesce(current -> 'health', '{}'::jsonb);
  scores   := coalesce(current -> 'scores', '{}'::jsonb);

  if p_action = 'join' then
    want_hp  := greatest(1, least(10000, coalesce((p_payload ->> 'hp')::integer, 100)));
    want_dmg := greatest(1, least(10000, coalesce((p_payload ->> 'damage')::integer, 10)));

    if settings is null then
      settings := jsonb_build_object('hp', want_hp, 'damage', want_dmg);
    elsif (settings ->> 'hp')::integer <> want_hp or (settings ->> 'damage')::integer <> want_dmg then
      -- Refused rather than adjusted. Quietly adopting the room's numbers would
      -- mean a client playing a different game to the one on its own screen,
      -- and the player would experience that as the game being wrong.
      return jsonb_build_object(
        'ok', false,
        'why', 'refused',
        'message', 'this match was opened with different rules'
      );
    end if;

    -- Rejoining does not refill you. A client that reconnects mid-fight would
    -- otherwise come back whole, which is a reload button that heals.
    if not (health ? caller::text) then
      health := health || jsonb_build_object(caller::text, (settings ->> 'hp')::integer);
      scores := scores || jsonb_build_object(caller::text, coalesce((scores ->> caller::text)::integer, 0));
    end if;

  elsif p_action = 'hit' then
    if settings is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody has joined this match');
    end if;

    victim := p_payload ->> 'victim';

    if victim is null then
      return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'no victim');
    end if;
    -- The credit is `auth.uid()` and the payload's opinion about who fired is
    -- ignored, so a client that names the scorer cannot score for somebody else.
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
      -- Not an error worth shouting about: two people firing at the same body
      -- is ordinary, and only one of them can have the kill.
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'already down');
    end if;

    left_hp := (health ->> victim)::integer - (settings ->> 'damage')::integer;
    if left_hp <= 0 then
      left_hp := 0;
      fatal := true;
      -- The point, and only here. This is the whole difference between this
      -- migration and the one it replaces.
      scores := scores || jsonb_build_object(caller::text, coalesce((scores ->> caller::text)::integer, 0) + 1);
    end if;
    health := health || jsonb_build_object(victim, left_hp);

  elsif p_action = 'revive' then
    if settings is null then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'nobody has joined this match');
    end if;
    -- Only ever yourself. A revive that took an id would be a client standing
    -- somebody else back up, which is the same shape of hole as scoring for
    -- them.
    if not (health ? caller::text) then
      return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'you are not in this match');
    end if;
    health := health || jsonb_build_object(caller::text, (settings ->> 'hp')::integer);

  else
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', format('no rule for "%s"', p_action));
  end if;

  update public.xp_arbiter_state
  set state = jsonb_build_object('settings', settings, 'health', health, 'scores', scores),
      updated_at = now()
  where instance = p_instance;

  return jsonb_build_object(
    'ok', true,
    'outcome', jsonb_build_object(
      'scores', scores,
      'health', health,
      -- Named rather than inferred from the health going to zero, because the
      -- caller has to draw two different things and "did I just get the kill"
      -- should not be a subtraction the client repeats.
      'fatal', fatal,
      'victim', victim
    )
  );
end;
$$;

comment on function public.xp_arbitrate(text, text, jsonb) is
  'Ask for an outcome in one XP instance: join, hit, revive. Returns an '
  'XpVerdict as jsonb. The caller is auth.uid() and never the payload, and the '
  'match rules are pinned by the first join.';

create or replace function public.xp_arbiter_view(p_instance text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller  uuid := auth.uid();
  current jsonb;
begin
  select state into current
  from public.xp_arbiter_state
  where instance = p_instance;

  return jsonb_build_object(
    'scores', coalesce(current -> 'scores', '{}'::jsonb),
    'health', coalesce(current -> 'health', '{}'::jsonb),
    'settings', current -> 'settings',
    -- So a client never has to work out which of these rows is its own from an
    -- id it is holding somewhere else.
    'me', caller
  );
end;
$$;

comment on function public.xp_arbiter_view(text) is
  'What this client may know about an instance, redacted server-side. The only '
  'read path to xp_arbiter_state.';
