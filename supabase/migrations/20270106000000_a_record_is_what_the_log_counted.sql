-- ============================================================================
-- A record is what the log counted
-- ----------------------------------------------------------------------------
-- The last two member-writable read models, and the end of the walk that
-- 20261230000000 started. Neither decides what anybody *may do*, which is why
-- they come last - but both are things people are shown and compare themselves
-- against, and a leaderboard somebody can type into is not a leaderboard.
--
-- Measured, as a plain member of the space, over PostgREST:
--
--   insert into login_streaks_read_model (…, current_streak, longest_streak, total_days, …)
--   values (:space, :me, …, 999, 999, 999, …)          -> 1 row
--
--   insert into battle_scores (tenant_id, user_id, played, won, updated_at)
--   values (:space, :me, 999, 999, now())              -> 1 row, reads back 999 won
--
-- ---------------------------------------------------------------------------
-- The two want different treatment, and the difference is worth naming
-- ---------------------------------------------------------------------------
-- **The streak is folded**, like every read model before it in this sequence:
-- `DayVisited` carries the numbers already, computed by the aggregate from the
-- stream, so the trigger only has to write down what the event says.
--
-- **The scores are derived.** `recount_battle_scores()` recomputes a whole
-- space's table from the roster and the finished matches, and there is no event
-- carrying "played 12, won 5" to fold. So it stays the writer and becomes
-- SECURITY DEFINER, which is what lets it write past the guard below - and it
-- is safe to promote *now* in a way it would not have been last week: its
-- inputs are `battle_participants`, which 20270105000000 put under a trigger,
-- and `battles_read_model.status`. Before that, a definer over a member-writable
-- roster would have been a laundering machine.
--
-- It gains a standing check on the way. Not because recounting another space
-- could forge anything - it recomputes the same truth from the same rows,
-- whoever asks - but because a definer that writes a table for any tenant id it
-- is handed is a shape this codebase has been bitten by twice already
-- (`redeem_promo_code`, `claim_free_month`, both in 20261230000000), and the
-- check costs one line.
--
-- The deployed application is unaffected by either. `streaksProjection`'s
-- upsert lands on the guard and is discarded - a success that changes nothing,
-- because the trigger has already written the same row - and its call to
-- `recount_battle_scores` still works, because a definer runs as its owner and
-- the guard lets the owner through. The same version-skew property
-- 20270103000000 argued for.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The streak, folded
-- ---------------------------------------------------------------------------

create or replace function public.streak_stream_fold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type <> 'DayVisited' then
    return null;
  end if;

  /**
   * No actor, no row.
   *
   * `streaksProjection` opens with the same guard and the same reasoning: a
   * visit is only ever recorded on a real member's behalf, so an event without
   * one is a hole in the log rather than a visit by nobody - see
   * 20261223000000, which is where those holes came from and how they were
   * closed. Skipping is right; inventing a user id would be worse.
   */
  if new.actor_id is null then
    return null;
  end if;

  insert into public.login_streaks_read_model
    (tenant_id, user_id, stream_id, current_streak, longest_streak, total_days,
     last_day, updated_at)
  values (
    new.tenant_id,
    new.actor_id,
    new.stream_id,
    (new.data ->> 'streak')::integer,
    (new.data ->> 'longest')::integer,
    (new.data ->> 'total')::integer,
    (new.data ->> 'day')::date,
    new.created_at
  )
  on conflict (tenant_id, user_id) do update
    set stream_id      = excluded.stream_id,
        current_streak = excluded.current_streak,
        longest_streak = excluded.longest_streak,
        total_days     = excluded.total_days,
        last_day       = excluded.last_day,
        updated_at     = excluded.updated_at;

  return null;
end;
$$;

comment on function public.streak_stream_fold() is
  'Folds DayVisited into login_streaks_read_model. The numbers come from the event, which is where the aggregate computed them.';

drop trigger if exists events_streak_stream_fold on public.events;
create trigger events_streak_stream_fold
  after insert on public.events
  for each row when (new.stream_type = 'login_streak')
  execute function public.streak_stream_fold();

create or replace function public.login_streaks_is_the_triggers()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  return null;
end;
$$;

comment on function public.login_streaks_is_the_triggers() is
  'Discards writes to login_streaks_read_model that did not come from the fold, a migration, or the service role.';

drop trigger if exists login_streaks_is_the_triggers on public.login_streaks_read_model;
create trigger login_streaks_is_the_triggers
  before insert or update or delete on public.login_streaks_read_model
  for each row execute function public.login_streaks_is_the_triggers();

-- ---------------------------------------------------------------------------
-- 2. The record, derived
-- ---------------------------------------------------------------------------

create or replace function public.recount_battle_scores(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A space you have nothing to do with is not one you may recount. See the
  -- header: this cannot forge a number, and the check is here because a definer
  -- taking a tenant id and never looking at the session is the exact shape that
  -- gave away the paid tier.
  if (select auth.uid()) is not null
     and public.tenant_role(p_tenant_id) is null
     and not public.is_backoffice_admin()
  then
    return;
  end if;

  insert into public.battle_scores (tenant_id, user_id, played, won, updated_at)
  select
    p.tenant_id,
    p.user_id,
    count(*) as played,
    count(*) filter (
      where (b.winner_type = 'player' and b.winner_id = p.user_id::text)
         or (b.winner_type = 'side'   and b.winner_id = p.side)
    ) as won,
    now()
  from public.battle_participants p
  join public.battles_read_model b on b.id = p.battle_id
  where b.status = 'ended'
    and p.tenant_id = p_tenant_id
  group by p.tenant_id, p.user_id
  on conflict (tenant_id, user_id) do update
    set played = excluded.played,
        won = excluded.won,
        updated_at = excluded.updated_at;
end;
$$;

comment on function public.recount_battle_scores(uuid) is
  'Recomputes a space''s match records from the roster and its finished matches. SECURITY DEFINER so it can write past the guard on battle_scores; its inputs are trigger-owned.';

create or replace function public.battle_scores_is_the_triggers()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  return null;
end;
$$;

comment on function public.battle_scores_is_the_triggers() is
  'Discards writes to battle_scores that did not come from recount_battle_scores, a migration, or the service role.';

drop trigger if exists battle_scores_is_the_triggers on public.battle_scores;
create trigger battle_scores_is_the_triggers
  before insert or update or delete on public.battle_scores
  for each row execute function public.battle_scores_is_the_triggers();

/**
 * The log keeps the table up to date, not somebody's page load.
 *
 * `battlesProjection` calls `recount_battle_scores` on `BattleEnded` and still
 * may; this makes the recount happen whether or not anybody's session ever
 * projects that event. Appended to the roster fold rather than given a trigger
 * of its own, so the two things that happen when a match ends happen in one
 * pass over the row.
 */
create or replace function public.battle_roster_fold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  case new.type
    when 'PlayerJoined' then
      insert into public.battle_participants
        (battle_id, user_id, tenant_id, side, defeated, joined_at)
      values (
        new.stream_id,
        (new.data ->> 'userId')::uuid,
        coalesce((new.data ->> 'tenantId')::uuid, new.tenant_id),
        new.data ->> 'side',
        false,
        new.created_at
      )
      on conflict (battle_id, user_id) do update
        set side     = excluded.side,
            defeated = false;

    when 'PlayerLeft' then
      delete from public.battle_participants
       where battle_id = new.stream_id
         and user_id = (new.data ->> 'userId')::uuid;

    when 'PlayerReady' then
      update public.battle_participants
         set ready = coalesce((new.data ->> 'ready')::boolean, true)
       where battle_id = new.stream_id
         and user_id = (new.data ->> 'userId')::uuid;

    when 'RacerFinished' then
      update public.battle_participants
         set finish_place   = (new.data ->> 'place')::integer,
             finish_seconds = (new.data ->> 'seconds')::numeric
       where battle_id = new.stream_id
         and user_id = (new.data ->> 'userId')::uuid;

    when 'PlayerDefeated' then
      update public.battle_participants
         set defeated = true
       where battle_id = new.stream_id
         and user_id = (new.data ->> 'userId')::uuid;

    when 'RematchWanted' then
      update public.battle_participants
         set wants_rematch = true
       where battle_id = new.stream_id
         and user_id = (new.data ->> 'userId')::uuid;

    /**
     * The scores, once the match is over.
     *
     * After the projection has had its chance rather than instead of it: this
     * trigger fires on the event, and `battles_read_model.status` reaches
     * `ended` in the same transaction only if the projection ran there too. So
     * the recount below sees the match as ended when a session projected it,
     * and sees it on the next `BattleEnded` or the next sweep otherwise -
     * which is the same eventual answer, because the recount is a derivation
     * and not an increment.
     */
    when 'BattleEnded' then
      perform public.recount_battle_scores(new.tenant_id);

    else
      null;
  end case;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------
do $$
declare
  v_missing text;
begin
  select string_agg(want.name, ', ')
    into v_missing
  from (values
    ('login_streaks_is_the_triggers', 'login_streaks_read_model'),
    ('battle_scores_is_the_triggers', 'battle_scores'),
    ('events_streak_stream_fold',     'events')
  ) as want(name, tbl)
  where not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = want.tbl and t.tgname = want.name and not t.tgisinternal
  );

  if v_missing is not null then
    raise exception 'missing trigger(s): % - without them these tables are typeable', v_missing;
  end if;

  if not (select prosecdef from pg_proc where proname = 'recount_battle_scores') then
    raise exception 'recount_battle_scores must be SECURITY DEFINER, or the guard on battle_scores silently discards every recount';
  end if;
end;
$$;
