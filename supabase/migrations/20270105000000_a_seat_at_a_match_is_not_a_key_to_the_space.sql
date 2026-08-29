-- ============================================================================
-- A seat at a match is not a key to the space
-- ----------------------------------------------------------------------------
-- The fourth and last of the member-writable read models that decide something,
-- and it holds a capability that outlives the thing it was granted for.
--
-- ---------------------------------------------------------------------------
-- What was measured
-- ---------------------------------------------------------------------------
-- `can_act_in_battle()` answers true for anybody with a row in
-- `battle_participants`, and the `events` insert policy consults it:
--
--   ((stream_type = 'battle') AND can_act_in_battle(stream_id, auth.uid()))
--
-- so does `battle_presence_read` / `battle_presence_write` on
-- `realtime.messages`. That branch exists for a good reason - a challenge match
-- is fought by people who are *not* members of each other's spaces, and the
-- roster is the only thing that says they belong in it.
--
-- But a roster row has no end. Take a guest, admitted on a link, who plays a
-- match. Their admission expires; `tenant_guests` drops the row; `tenant_role()`
-- answers NULL - they are nobody to this space. Measured, in that state:
--
--   tenant_role(space)                 -> (none)
--   can_act_in_battle(battle, them)    -> true
--   insert into events (…'battle'…)    -> ALLOWED
--
-- So a link that opened for an afternoon leaves behind a permanent right to
-- append to that space's log. The guest-access review of 2026-08-23 found the
-- bounded version of this - a kicked guest keeps a live tab for up to an hour,
-- because a JWT cannot be un-issued - and fixed it with `GuestPulse`. This one
-- is not bounded by anything: `can_act_in_battle` is a fresh query on every
-- insert, and it keeps saying yes.
--
-- The second door is the ordinary one, the same as the three read models
-- before it: `battle_participants`'s write policy is `tenant_role(...) is not
-- null` through `battles_read_model`, so anybody with any standing in the
-- space - **guests included** - can insert a roster row for anybody, delete
-- somebody from a match, or flip `defeated` and `ready` on a player who is
-- not them.
--
-- ---------------------------------------------------------------------------
-- Two changes, and the second is the one that matters
-- ---------------------------------------------------------------------------
--   1. The roster moves under a trigger, folded from the battle stream, with a
--      guard that discards what a browser sends. The same shape as the tenant
--      stream, the xp stream, and for the same reason - `can_act_in_battle()`
--      reads this table, so it is authorization state and cannot be writable by
--      the people it authorizes.
--
--   2. `can_act_in_battle()` is bounded to a match that is still running. That
--      is what the branch was always *for*: "you are fighting here, so you may
--      act here". A match that has ended or been cancelled is not somewhere
--      anybody needs to act, and the row that remains is a record rather than a
--      permission.
--
-- Note what (2) deliberately does not do: it does not require standing in the
-- space. That would break the case the function exists for - the challenger
-- from another space, and the guest who is still mid-match when their afternoon
-- runs out. Somebody in a live match keeps playing it. What ends is the right
-- to keep writing to a space's log for the rest of time because of a game they
-- once played there.
--
-- `battles_read_model.status` is itself member-writable and is not fixed here.
-- It is a smaller thing than it looks: forging `live` on a finished match buys
-- a *member* the right to append to a space they can already append to, and the
-- expired guest this migration is about cannot write that table at all -
-- `tenant_role()` is NULL for them, and the policy refuses. It is written up
-- with `battle_scores` and `login_streaks_read_model` as what is left.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The roster, folded from the stream
-- ---------------------------------------------------------------------------

/**
 * The battle roster, in the database.
 *
 * The authorization half of `battlesProjection`, transcribed. The projection
 * keeps `battles_read_model`, `battle_goals` and the scores; this takes the one
 * table something else reads to decide what a person may do.
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
        -- A re-join after switching sides must not resurrect somebody who was
        -- already defeated - but a switch can only happen before the start,
        -- when nobody is. False is correct in both cases, and the projection's
        -- own comment says so.
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

comment on function public.battle_roster_fold() is
  'Folds the battle stream into battle_participants. can_act_in_battle() reads that table, so the roster is authorization state and has no session writer.';

drop trigger if exists events_battle_roster_fold on public.events;
create trigger events_battle_roster_fold
  after insert on public.events
  for each row when (new.stream_type = 'battle')
  execute function public.battle_roster_fold();

/**
 * A session may play a match. It may not write the roster.
 *
 * SECURITY INVOKER, like the two guards before it: the discriminator is
 * `current_user`, and a definer would pin it to the owner and admit everybody.
 * OLD on a delete, NEW otherwise - the distinction that cost an unshare in
 * 20270104000000.
 */
create or replace function public.battle_participants_is_the_triggers()
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

comment on function public.battle_participants_is_the_triggers() is
  'Discards writes to battle_participants that did not come from the fold, a migration, or the service role.';

drop trigger if exists battle_participants_is_the_triggers on public.battle_participants;
create trigger battle_participants_is_the_triggers
  before insert or update or delete on public.battle_participants
  for each row execute function public.battle_participants_is_the_triggers();

-- ---------------------------------------------------------------------------
-- 2. A seat authorizes for as long as the match is on
-- ---------------------------------------------------------------------------

create or replace function public.can_act_in_battle(p_battle_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    /**
     * Already fighting here, **and here is still happening.**
     *
     * The join on the match is the whole change. Without it this row is a
     * permanent right to append to a space's log, held by anybody who ever
     * played there - including a guest whose admission ended months ago, for
     * whom `tenant_role()` now answers NULL and every other door is shut.
     *
     * `open` as well as `live`, because the lobby is where people say ready and
     * pick a side, and those are appends too. `ended` and `cancelled` are not
     * places anybody acts.
     */
    exists (
      select 1
      from public.battle_participants p
      join public.battles_read_model b on b.id = p.battle_id
      where p.battle_id = p_battle_id
        and p.user_id = p_user_id
        and b.status in ('open', 'live')
    )
    -- Or a member of a space that an accepted challenge brought to this match.
    or exists (
      select 1
      from public.space_challenges c
      join public.tenant_members m
        on m.tenant_id in (c.challenger_tenant_id, c.challenged_tenant_id)
      where c.battle_id = p_battle_id
        and c.status = 'accepted'
        and m.user_id = p_user_id
    )
    -- Or this is the rematch of a match they were in.
    or exists (
      select 1
      from public.battles_read_model b
      join public.battle_participants p on p.battle_id = b.id
      where b.rematch_battle_id = p_battle_id
        and p.user_id = p_user_id
    );
$$;

comment on function public.can_act_in_battle(uuid, uuid) is
  'May this person act in this match? A seat authorizes while the match is open or live, not for ever after.';

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'battle_participants'
       and t.tgname = 'battle_participants_is_the_triggers'
       and not t.tgisinternal
  ) then
    raise exception 'battle_participants_is_the_triggers must exist - can_act_in_battle() reads this table, so a session writer is a way into somebody else''s space';
  end if;

  if position('''open'', ''live''' in pg_get_functiondef(
       (select oid from pg_proc where proname = 'can_act_in_battle'))) = 0 then
    raise exception 'can_act_in_battle must bound the roster branch to a running match - see the header';
  end if;
end;
$$;
