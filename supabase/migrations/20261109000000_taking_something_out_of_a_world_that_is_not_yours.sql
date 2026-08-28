-- ============================================================================
-- Taking something out of a world that is not yours
-- ----------------------------------------------------------------------------
-- docs/xp/server-authority.md §4.3, and docs/xp/state.md §7.6 before it. This is
-- the entry §4 was opened for and the last of its three arguments to be spent:
-- not secrecy, not fairness between devices, but **integrity** — two people's
-- state changing together or not at all, with one of them offline.
--
-- ---------------------------------------------------------------------------
-- It reads the level, and that is the new thing
-- ---------------------------------------------------------------------------
-- Every other rule in this schema is told its numbers by a client and pins them:
-- `join` takes `hp`, `damage` and `lethal` from whoever arrives first, and works
-- because everybody in the room holds the same document and the room is *there*.
-- **Nobody is in the room here.** The owner of the world being visited is
-- usually offline, so there is nobody to pin from and nobody to disagree with,
-- and a visitor who could name the amount could name any amount.
--
-- So this function reads `xp_versions.document -> 'visit'` for the version the
-- project has published. Nothing server-side has ever read a level before; it is
-- the decision §4.3 asked for and it is what makes a world with nobody in it
-- able to enforce its own rules. `parseXp` is the other end of that contract —
-- the block is read strictly there, with nothing defaulted, because this reads
-- it with no author watching.
--
-- **The published version and not the current one.** `current_version` moves on
-- every save; `published_version` is what the store serves and what players are
-- playing. Reading the draft would let an author change what visitors may take
-- by saving, without publishing, while people are in it.
--
-- ---------------------------------------------------------------------------
-- Two rows, one lock, one order
-- ---------------------------------------------------------------------------
-- Both saves are `player` rows of the same XP — `xp_store` is keyed by
-- `(xp_id, scope, account_id)` — so this is two rows in one table rather than a
-- transaction across saves, which is smaller than §7.6 feared.
--
-- They are taken in **one** `select ... for update` ordered by `id`, and that is
-- not tidiness. Two visitors stealing from each other at the same moment lock
-- the same two rows in opposite orders, which is a deadlock; Postgres resolves
-- it by killing one, and what that player sees is a failure nothing in the game
-- explains. One statement with a deterministic order costs a line today and is a
-- Heisenbug on any other day.
--
-- ---------------------------------------------------------------------------
-- The cooldown lives here because it cannot live anywhere else
-- ---------------------------------------------------------------------------
-- A cooldown is a fact about *the owner's* world written by somebody who is not
-- the owner, and `xp_store`'s policies forbid exactly that. It also cannot go
-- inside the value: the running client `put`s that row wholesale, so a key this
-- function wrote would be overwritten by the next save of a level that has never
-- heard of it. Hence `xp_visits` — its own table, RLS on, no policy at all, and
-- this function as the only door, the way `xp_arbiter_state` is.
--
-- ---------------------------------------------------------------------------
-- What it refuses, and why each one
-- ---------------------------------------------------------------------------
--   - **Yourself.** Taking from your own world is a way to make a number go up.
--   - **A level with no `visit` block.** Absent means nobody may take anything;
--     this is not a capability that arrives by default.
--   - **A stranger.** The visitor has to be in the space, which is the rule the
--     store's own policies already use (`xp_in_my_space`) rather than a second
--     permission model invented here.
--   - **An owner with nothing to take**, rather than driving them negative.
--   - **A cooldown that has not run out**, and it says how long is left, because
--     a refusal a player cannot act on is a wall.
--
-- ---------------------------------------------------------------------------
-- What it does not do yet
-- ---------------------------------------------------------------------------
-- Caps per visit beyond the amount, protection after being robbed, and a
-- notification. The first slice in §4.3 is deliberately one value, one lock, one
-- cooldown and a verdict — enough to prove the property the entry exists for.
-- The notification, when it comes, is an `append` the owner reads when they come
-- back rather than a push to a client that is not running.
-- ============================================================================

create table if not exists public.xp_visits (
  xp_id      uuid        not null references public.xps_read_model (id) on delete cascade,
  /** Whose world was visited. */
  owner_id   uuid        not null references auth.users (id) on delete cascade,
  /** Who visited it. */
  visitor_id uuid        not null references auth.users (id) on delete cascade,
  /**
   * When, on the server's clock.
   *
   * Never returned to a client. 20261021000000 is the reason that is worth
   * saying out loud: a timestamp rendered `+00` is one `Date.parse` reads as
   * NaN, and the countdown it fed sat at zero for a week. What a client gets
   * from here is a number of **seconds left**, computed on this side.
   */
  at         timestamptz not null default now(),

  primary key (xp_id, owner_id, visitor_id)
);

alter table public.xp_visits enable row level security;

-- No policy, deliberately, like `xp_arbiter_state`: a cooldown a visitor could
-- read is a cooldown they could time, and one they could write is no cooldown.
-- The `security definer` function below is the only door.

comment on table public.xp_visits is
  'When each visitor last took something from each owner s world. Function-only: '
  'RLS is on and there is no policy, so xp_visit is the only reader and writer.';

/**
 * Take what the level allows, from a world that is not yours.
 *
 * Answers in `XpVerdict` shape like `xp_arbitrate`, because *the server stored
 * it* and *the server agreed with you* are different sentences and a function
 * that returned one number could not say which it meant.
 */
create or replace function public.xp_visit(p_xp uuid, p_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller     uuid := auth.uid();
  published  integer;
  rules      jsonb;
  take_key   text;
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

  select document -> 'visit' into rules
  from public.xp_versions
  where xp_id = p_xp and version = published;

  if rules is null then
    return jsonb_build_object('ok', false, 'why', 'refused', 'message', 'nothing may be taken from this level');
  end if;

  take_key := rules ->> 'take';
  amount   := (rules ->> 'amount')::integer;
  cooldown := (rules ->> 'cooldown')::integer;

  /**
   * The document is trusted about shape because `parseXp` is the door it came
   * through, and checked here anyway for the two things that would be silent:
   * a missing key would move `null` and a non-positive amount would be a gift.
   */
  if take_key is null or amount is null or amount < 1 or cooldown is null then
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
  where xp_id = p_xp and scope = 'player' and account_id in (p_owner, caller)
  order by id
  for update;

  select id, value into theirs_id, theirs
  from public.xp_store
  where xp_id = p_xp and scope = 'player' and account_id = p_owner;

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
  where xp_id = p_xp and scope = 'player' and account_id = caller;

  mine_now := coalesce((mine ->> take_key)::integer, 0);

  update public.xp_store
  set value = value || jsonb_build_object(take_key, theirs_now - amount)
  where id = theirs_id;

  if mine_id is null then
    -- A visitor who has never played this level still gets what they took. The
    -- rest of the row is whatever the level writes on their first run.
    insert into public.xp_store (xp_id, scope, account_id, value)
    values (p_xp, 'player', caller, jsonb_build_object(take_key, amount));
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
