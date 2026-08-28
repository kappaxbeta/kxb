-- ============================================================================
-- Nobody chooses who they raid
-- ----------------------------------------------------------------------------
-- The call site's design question, answered: *they write the team name, or
-- random once a day*. It is random once a day, and the reason to prefer it is
-- not that it is less work.
--
-- **A visitor who can name their target will name the same one.** That is the
-- sentence docs/xp/state.md §7.6 spends a bullet on - *without them the
-- strongest player farms the weakest until they leave* - and every fairness
-- rule it lists exists to blunt a choice this design simply does not offer. A
-- client that cannot say who cannot farm anybody, and no cap, cooldown or
-- protection window has to hold that line on its own.
--
-- It is also the version with no interface: naming somebody means knowing their
-- name and typing it, and a text field in a level whose pointer is locked is a
-- panel that takes the camera away from whoever is playing. One button, once a
-- day, and the answer says who it was.
--
-- ---------------------------------------------------------------------------
-- What changed under it
-- ---------------------------------------------------------------------------
-- **The cooldown is per visitor now, not per pair.** A per-pair cooldown is the
-- rule you need when the visitor chooses - it stops them coming back to the
-- same person - and here it would bound nothing at all. `xp_visits` is keyed by
-- `(xp_id, visitor_id)`, and `owner_id` stays as a column because *who it was*
-- is worth keeping and is what the second guard reads.
--
-- **And nobody is raided twice inside one window.** That is §7.6's *protection
-- after being hit*, and with a random pick it is the other half of the same
-- fairness: without it, four visitors on the same morning can all land on the
-- one person who left plants on their shelf overnight.
--
-- **`p_owner` is gone**, and the old two-argument function with it. It is a day
-- old and nothing has ever called it.
--
-- The whole function is restated, as every migration that touches one here has
-- been.
-- ============================================================================

-- One row per visitor per level, rather than one per pair. Dropped and rebuilt
-- rather than migrated: the table is a day old, local only, and holds nothing
-- worth keeping.
delete from public.xp_visits;
alter table public.xp_visits drop constraint if exists xp_visits_pkey;
alter table public.xp_visits add primary key (xp_id, visitor_id);

-- The second guard reads by owner rather than by visitor.
create index if not exists xp_visits_owner_idx
  on public.xp_visits (xp_id, owner_id, at desc);

create or replace function public.xp_visit(p_xp uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller     uuid := auth.uid();
  owner      uuid;
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

  /**
   * How often *you* may raid at all, which is not how often a given shelf may
   * be raided.
   *
   * The key changed with the design: one row per visitor rather than one per
   * pair. A per-pair cooldown is the rule you need when the visitor chooses
   * their target - it stops them coming back to the same person - and nobody
   * chooses one here, so what it has to bound is the raiding rather than the
   * pairing.
   */
  select at into last_at
  from public.xp_visits
  where xp_id = p_xp and visitor_id = caller;

  if last_at is not null and last_at > now() - make_interval(secs => cooldown) then
    wait_left := ceil(extract(epoch from (last_at + make_interval(secs => cooldown)) - now()));
    return jsonb_build_object(
      'ok', false,
      'why', 'refused',
      'message', format('you have taken your turn - %s seconds left', wait_left),
      'outcome', jsonb_build_object('wait', wait_left)
    );
  end if;

  /**
   * Who, decided here, at random, among everybody who can spare it.
   *
   * The client does not name a target and cannot: a visitor who could choose
   * would choose the same person every time, which is the failure state.md §7.6
   * names in one line - *without them the strongest player farms the weakest
   * until they leave*. So the eligible set is everybody in this level who is
   * not the caller and holds at least the amount, minus anybody the room has
   * already taken from inside the same window, which is the *protection after
   * being hit* the same paragraph asks for.
   *
   * `order by random()` over what is at most a space's membership. It is not a
   * fair queue - two raids can land on the same person once the window has
   * passed - and it is the version that needs no bookkeeping to be honest.
   *
   * The lock below is what makes this safe rather than this select: two
   * visitors can pick the same owner in the same moment, and the second one
   * finds the row already down.
   */
  select account_id into owner
  from public.xp_store theirs
  where theirs.xp_id = p_xp
    and theirs.scope = take_scope
    and theirs.account_id <> caller
    and coalesce((theirs.value ->> take_key)::integer, 0) >= amount
    and not exists (
      select 1 from public.xp_visits guard
      where guard.xp_id = p_xp
        and guard.owner_id = theirs.account_id
        and guard.at > now() - make_interval(secs => cooldown)
    )
  order by random()
  limit 1;

  if owner is null then
    return jsonb_build_object(
      'ok', false,
      'why', 'stale',
      'message', format('nobody here has %s to spare right now', take_key)
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
  where xp_id = p_xp and scope = take_scope and account_id in (owner, caller)
  order by id
  for update;

  select id, value into theirs_id, theirs
  from public.xp_store
  where xp_id = p_xp and scope = take_scope and account_id = owner;


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
  values (p_xp, owner, caller, now())
  on conflict (xp_id, visitor_id) do update set at = now(), owner_id = excluded.owner_id;

  return jsonb_build_object(
    'ok', true,
    'outcome', jsonb_build_object(
      'took', amount,
      'key', take_key,
      -- Who it was, so the level can say a name. The id, because a roster maps
      -- one to the other and a name from here is one that is wrong the moment
      -- somebody renames themselves - the rule `XpLine` already follows.
      'from', owner,
      -- Both numbers as they now stand, so a client draws the result of the
      -- visit rather than its own arithmetic about it.
      'mine', mine_now + amount,
      'theirs', theirs_now - amount,
      'cooldown', cooldown
    )
  );
end;
$$;

comment on function public.xp_visit(uuid) is
  'Take what the published level s visit block allows, from somebody this '
  'function picks at random among those who can spare it. One raid per visitor '
  'per cooldown, nobody raided twice inside one, two rows under one lock in id '
  'order, and an XpVerdict either way. The only rule here that reads a level.';

drop function if exists public.xp_visit(uuid, uuid);
revoke all on function public.xp_visit(uuid) from public;
grant execute on function public.xp_visit(uuid) to authenticated;
