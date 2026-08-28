-- ============================================================================
-- A shelf is only worth raiding if you can see it
-- ----------------------------------------------------------------------------
-- One migration old and already corrected, by the level that wants the feature
-- rather than by a review. `20261109000000` hard-coded `scope = 'player'`, on the
-- argument in `XpVisit` that a `shared` field is "a scoreboard".
--
-- `steal-a-plant` says otherwise, and says it in its own data block: every
-- player's shelf is `shared` - yours to write, the space's to read - precisely
-- because **that is the only scope in which a visitor can see there is anything
-- to take**. A `player` field is invisible to everybody but its owner, so a
-- steal against one only makes sense once entering somebody else's world is a
-- feature, which is docs/xp/state.md §7.6's harder half and is not built.
--
-- Both are one row per person: `xp_store` is unique on
-- `(xp_id, scope, account_id)`, so the transaction is identical and only the
-- visibility differs. `space` remains the one that cannot be taken from - one
-- row for the whole space, and nobody to take it from - and `parseXp` refuses
-- it, which is why an unreadable scope here is a refusal rather than a guess.
--
-- ---------------------------------------------------------------------------
-- The scope comes out of the level, like the amount
-- ---------------------------------------------------------------------------
-- This function already reads the published document for what may be taken, so
-- it reads the *scope* of the field from the same place - `data -> <take> ->
-- scope`, which is where `parseXp` checked it. The whole document is fetched
-- once rather than twice: two queries for two answers out of one row is two
-- chances for them to disagree.
--
-- The whole function is restated, as every migration that touches one here has
-- been.
-- ============================================================================

create or replace function public.xp_visit(p_xp uuid, p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller     uuid := auth.uid();
  published  integer;
  level      jsonb;
  rules      jsonb;
  take_key   text;
  take_scope text;
  amount     integer;
  cooldown   integer;
  last_at    timestamptz;
  wait_left  integer;
  theirs     jsonb;
  mine       jsonb;
  theirs_id  uuid;
  mine_id    uuid;
  theirs_now integer;
  mine_now   integer;
begin
  if caller is null then
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'sign in to visit');
  end if;

  if p_owner is null or p_owner = caller then
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'you cannot visit yourself');
  end if;

  -- The store's own rule for who may touch an XP at all, rather than a second
  -- permission model written here.
  if not public.xp_in_my_space(p_xp) then
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'this level is not in a space you are in');
  end if;

  select published_version into published
  from public.xps_read_model
  where id = p_xp;

  if published is null then
    return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'this level has not been published');
  end if;

  /**
   * The whole document, once, because two blocks are read out of it: what may
   * be taken, and which scope the field it names lives in. A second query for
   * the second answer would be a second chance for them to disagree.
   */
  select document into level
  from public.xp_versions
  where xp_id = p_xp and version = published;

  rules := level -> 'visit';

  if rules is null then
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'nothing may be taken from this level');
  end if;

  take_key := rules ->> 'take';
  amount   := (rules ->> 'amount')::integer;
  cooldown := (rules ->> 'cooldown')::integer;

  /**
   * Which scope the field lives in, read from the level rather than assumed.
   *
   * The first version of this function hard-coded `player`, which was wrong for
   * the level that wants the feature: `steal-a-plant` keeps every shelf in
   * `shared` - yours to write, the space's to read - because that is the only
   * scope in which a visitor can *see* there is anything to take. Both are one
   * row per person, so the transaction is identical and only the visibility
   * differs; `space` is the one that cannot be taken from and `parseXp` refuses
   * it, which is why the fallback here is a refusal rather than a guess.
   */
  take_scope := level -> 'data' -> take_key ->> 'scope';

  /**
   * The document is trusted about shape because `parseXp` is the door it came
   * through, and checked here anyway for the two things that would be silent:
   * a missing key would move `null` and a non-positive amount would be a gift.
   */
  if take_key is null or amount is null or amount < 1 or cooldown is null
     or take_scope is null or take_scope not in ('player', 'shared') then
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'this level s visiting rules are incomplete');
  end if;

  select at into last_at
  from public.xp_visits
  where xp_id = p_xp and owner_id = p_owner and visitor_id = caller;

  if last_at is not null and last_at > now() - make_interval(secs => cooldown) then
    wait_left := ceil(extract(epoch from (last_at + make_interval(secs => cooldown)) - now()));
    return jsonb_build_object(
      'ok', false,
      'why', 'refused',
      'message', format('you have already taken from here - %s seconds left', wait_left),
      'outcome', jsonb_build_object('wait', wait_left)
    );
  end if;

  /**
   * Both rows, in one statement, in a fixed order.
   *
   * See the header: two visitors going opposite ways deadlock, and the fix is
   * the `order by`, not a retry. The rows are read after the lock rather than
   * before, because read-then-write is how two visits in one moment both see
   * ten coins and both take three.
   */
  perform 1 from public.xp_store
  where xp_id = p_xp and scope = take_scope and account_id in (p_owner, caller)
  order by id
  for update;

  select id, value into theirs_id, theirs
  from public.xp_store
  where xp_id = p_xp and scope = take_scope and account_id = p_owner;

  if theirs_id is null then
    return jsonb_build_object('ok', false, 'why', 'stale', 'message', 'they have not played this yet');
  end if;

  theirs_now := coalesce((theirs ->> take_key)::integer, 0);
  if theirs_now < amount then
    return jsonb_build_object(
      'ok', false,
      'why', 'refused',
      'message', format('there is no %s left to take', take_key),
      'outcome', jsonb_build_object('theirs', theirs_now)
    );
  end if;

  select id, value into mine_id, mine
  from public.xp_store
  where xp_id = p_xp and scope = take_scope and account_id = caller;

  mine_now := coalesce((mine ->> take_key)::integer, 0);

  update public.xp_store
  set value = value || jsonb_build_object(take_key, theirs_now - amount)
  where id = theirs_id;

  if mine_id is null then
    -- A visitor who has never played this level still gets what they took. The
    -- rest of the row is whatever the level writes on their first run.
    insert into public.xp_store (xp_id, scope, account_id, value)
    values (p_xp, take_scope, caller, jsonb_build_object(take_key, amount));
  else
    update public.xp_store
    set value = value || jsonb_build_object(take_key, mine_now + amount)
    where id = mine_id;
  end if;

  insert into public.xp_visits (xp_id, owner_id, visitor_id, at)
  values (p_xp, p_owner, caller, now())
  on conflict (xp_id, owner_id, visitor_id) do update set at = now();

  return jsonb_build_object(
    'ok', true,
    'outcome', jsonb_build_object(
      'took', amount,
      'key', take_key,
      -- Both numbers as they now stand, so a client draws the result of the
      -- visit rather than its own arithmetic about it.
      'mine', mine_now + amount,
      'theirs', theirs_now - amount,
      'cooldown', cooldown
    )
  );
end;
$$;

comment on function public.xp_visit(uuid, uuid) is
  'Take what the published level s visit block allows from another player s save '
  'in the same XP. Two rows under one lock in id order, a per-pair cooldown in '
  'xp_visits, and an XpVerdict either way. The only rule here that reads a level.';

revoke all on function public.xp_visit(uuid, uuid) from public;
grant execute on function public.xp_visit(uuid, uuid) to authenticated;
