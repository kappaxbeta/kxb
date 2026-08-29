-- ============================================================================
-- Who won is not a column a player writes
-- ----------------------------------------------------------------------------
-- A regression this sequence introduced, and it deserves saying plainly:
-- 20270106000000 promoted `recount_battle_scores()` to SECURITY DEFINER so it
-- could write past the guard on `battle_scores`, and argued that this was safe
-- because its inputs had gone under a trigger. That was half true.
-- `battle_participants` had. `battles_read_model` had not, and the recount
-- reads two columns off it to decide who won:
--
--   count(*) filter (
--     where (b.winner_type = 'player' and b.winner_id = p.user_id::text)
--        or (b.winner_type = 'side'   and b.winner_id = p.side)
--   )
--
-- So a member of the space could rewrite the winner of a finished match and
-- then ask the trusted function to write it down. Measured, on a match somebody
-- else won:
--
--   update battles_read_model set winner_id = :me where id = :match  -> 1 row
--   select recount_battle_scores(:space)
--   select won from battle_scores where user_id = :me                -> 1
--
-- Which is the laundering machine 20270106000000's own header named and then
-- failed to close. A definer is only as trustworthy as the least trustworthy
-- table it reads, and "its inputs are trigger-owned" has to mean *all* of them.
--
-- ---------------------------------------------------------------------------
-- Three columns, not the whole row
-- ---------------------------------------------------------------------------
-- `status`, `winner_type` and `winner_id`. Those are what anything *decides*
-- with: the recount reads the winner, and `can_act_in_battle()` reads the
-- status - which is the other reason this row could not stay open, because
-- 20270105000000 bounded a seat's authority to a match that is `open` or
-- `live`, and a member who can write `status` can un-end a match to lift that
-- bound.
--
-- Everything else on the row stays with `battlesProjection`: the name, the
-- mode, the settings, the clocks, `abandoned`, `rematch_battle_id`. They are
-- description, nothing gates on them, and moving them would mean transcribing
-- a large fold into SQL for no security gain. The same split as
-- `xps_read_model` in 20270104000000, for the same reason.
-- ============================================================================

create or replace function public.battle_verdict_fold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  case new.type
    when 'BattleCreated' then
      -- The row itself is the projection's to insert - it carries a dozen
      -- columns this trigger has no opinion about. This only pins the status
      -- once it exists, and does nothing when it does not yet.
      update public.battles_read_model set status = 'open'
       where id = new.stream_id and status is distinct from 'open';

    when 'BattleStarted' then
      update public.battles_read_model set status = 'live' where id = new.stream_id;

    when 'BattleEnded' then
      update public.battles_read_model
         set status      = 'ended',
             -- Null for a draw. `status` is what tells a draw apart from a
             -- match still running, so the two share a null winner safely -
             -- the projection's own note, kept because it is the reason this
             -- can be written unconditionally.
             winner_type = new.data -> 'winner' ->> 'type',
             winner_id   = new.data -> 'winner' ->> 'id'
       where id = new.stream_id;

      /**
       * The recount, here rather than in the roster fold, and the move is the
       * point.
       *
       * 20270106000000 hung it off `battle_roster_fold`'s `BattleEnded` branch.
       * Two AFTER triggers on the same row fire in **alphabetical order** by
       * trigger name, and `events_battle_roster_fold` sorts before
       * `events_battle_verdict_fold` - so the recount ran before the three
       * lines above, read a match that was not yet `ended`, and counted
       * nothing. Caught by a probe that played a match through the log and
       * looked for the record afterwards; the fold looked right in isolation
       * and was wrong in company.
       *
       * Ordering by name is a fact nobody should have to remember, so the fix
       * is not to rename a trigger into the right order: it is to put the
       * derivation immediately after the state it derives from, in one branch
       * of one function, where the sequence is written down rather than
       * implied.
       */
      perform public.recount_battle_scores(new.tenant_id);

    when 'BattleCancelled' then
      update public.battles_read_model set status = 'cancelled' where id = new.stream_id;

    else
      null;
  end case;

  return null;
end;
$$;

comment on function public.battle_verdict_fold() is
  'Folds status and the winner out of the battle stream. recount_battle_scores() reads the winner and can_act_in_battle() reads the status, so neither may come from a session.';

drop trigger if exists events_battle_verdict_fold on public.events;
create trigger events_battle_verdict_fold
  after insert on public.events
  for each row when (new.stream_type = 'battle')
  execute function public.battle_verdict_fold();

/**
 * A session may describe a match. It may not decide how it ended.
 *
 * Column-level, like `xps_read_model`'s guard and unlike the whole-row ones:
 * the projection legitimately writes the rest of this row in a member's
 * session, and on every event. Pinning three columns to their previous values
 * lets that keep working while making the two questions anything asks about a
 * match unanswerable from a browser.
 *
 * SECURITY INVOKER. `current_user` is the discriminator and a definer would pin
 * it to the owner - the mistake 20270104000000 records having made.
 */
create or replace function public.battles_verdict_is_the_triggers()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    /**
     * A new match starts `open` and unwon, whatever the caller said.
     *
     * Not dropped, unlike the guards on the trigger-owned tables: this row is
     * the projection's to create and carries columns nothing else knows. What
     * is refused is a session *inventing* a finished match - which would
     * otherwise be one insert away from a forged record, since the recount
     * counts every row with `status = 'ended'`.
     */
    new.status := 'open';
    new.winner_type := null;
    new.winner_id := null;
    return new;
  end if;

  new.status := old.status;
  new.winner_type := old.winner_type;
  new.winner_id := old.winner_id;
  return new;
end;
$$;

comment on function public.battles_verdict_is_the_triggers() is
  'Keeps status, winner_type and winner_id as the log left them when the writer is a browser session.';

drop trigger if exists battles_verdict_is_the_triggers on public.battles_read_model;
create trigger battles_verdict_is_the_triggers
  before insert or update on public.battles_read_model
  for each row execute function public.battles_verdict_is_the_triggers();

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'battles_read_model'
       and t.tgname = 'battles_verdict_is_the_triggers'
       and not t.tgisinternal
  ) then
    raise exception 'battles_verdict_is_the_triggers must exist - recount_battle_scores() is a definer that reads winner_id, so a session writer here is a forged record';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The roster fold gives the recount up
-- ---------------------------------------------------------------------------
-- It is the same function 20270105000000 and 20270106000000 built, with the
-- `BattleEnded` branch removed: that call has moved into `battle_verdict_fold`
-- above, for the ordering reason argued there. Restated in full rather than
-- patched, because a `create or replace` that is a diff of a diff is a function
-- nobody can read in one place.
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

    else
      null;
  end case;

  return null;
end;
$$;
