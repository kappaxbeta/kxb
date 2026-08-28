-- ============================================================================
-- A hole the log will never fill
-- ============================================================================
-- `events_since_checkpoint` stops at the first hole in `tenant_seq` rather than
-- stepping over it, and 20261120000000 explains why: a hole means "the event
-- with that number exists and has not committed yet", so stepping over it is
-- the silent skip that whole line of work exists to remove.
--
-- It says one more thing about that check, and this is the part that turned out
-- to matter: **"That check should never fire."** It fires. It has been firing on
-- production since 2026-08-13, and because the reader answers a hole with an
-- empty result rather than an error, `runProjection` reads zero rows, applies
-- nothing, writes no checkpoint and returns 0. No throw, no log line, no failed
-- sweep. The projection is simply parked, for ever.
--
-- On the `alpha` space, on the day this was written:
--
--   * the log head is at tenant_seq 1237, and 54 numbers between 1 and 1237 do
--     not exist
--   * twelve projections are parked at a hole - `magazine_read_model` at 660
--     since 2026-08-15, `xps_read_model` at 738, `board_posts_read_model` at
--     1154, `battles_read_model` at 1230
--   * every command still succeeded. Four XPs were taken in, the events are all
--     in the log, and `magazine_read_model` has no rows at all - so the shelf
--     reads as empty on a space that has been filling it for a week
--
-- That is the failure this reader was built to prevent, arrived at from the
-- other side: instead of one event silently skipped, every event after it
-- silently skipped.
--
-- ----------------------------------------------------------------------------
-- Waiting is right for a second. It is not right for a week.
-- ----------------------------------------------------------------------------
-- An uncommitted append is a live transaction, and a live transaction here is
-- bounded by the statement timeout - single-digit seconds. So the honest
-- version of "wait for the hole to fill" is *wait a while*, and the honest
-- version of "step over it" is *only once nothing could still be arriving*.
--
-- Five minutes, measured against the `created_at` of the first event after the
-- hole, which is that event's own transaction start. If the row on the far side
-- of the hole was written more than five minutes ago, any transaction that
-- could still fill the hole started before that and is still running - which is
-- not an append, it is an incident, and blocking every read model behind it is
-- not the response to one.
--
-- Deliberately generous. The cost of waiting five minutes too long is a read
-- model five minutes stale; the cost of stepping over one second too early is a
-- fact lost until somebody replays. Those are not the same size.
--
-- ----------------------------------------------------------------------------
-- Why the holes are there is a separate question, and it is still open
-- ----------------------------------------------------------------------------
-- Not answered here, on purpose. Every one of `alpha`'s 54 holes sits between
-- two `battle` events, `pg_stat_user_tables` reports 1496 deleted tuples on a
-- table with no delete policy and no delete anywhere in the app, and the
-- streams either side are missing whole versions - stream 253c805c has versions
-- 3 and 6 and not 4 or 5. Something removed committed rows.
--
-- That wants finding. It does not want *this* to keep being the way it is
-- discovered, which is: it is not, until somebody happens to look at a shelf.
--
-- ----------------------------------------------------------------------------
-- The prefix is computed, not implied
-- ----------------------------------------------------------------------------
-- `tenant_seq = cursor + rn` on its own is a prefix test only while every row
-- either passes or every row after it fails. Adding an age clause breaks that:
-- `created_at` is a transaction *start* time, so a long transaction can commit
-- a higher `tenant_seq` with an earlier timestamp, and a bare OR would then
-- keep a row from beyond a hole that is still fresh.
--
-- So the run is computed with `bool_and` over the window, and a row is returned
-- only if every row before it was reachable too. Same answer in the ordinary
-- case, and the ordering rule is stated rather than assumed.
-- ============================================================================

-- Same signature and same return type as 20261122000000, so this replaces
-- rather than drops - no window in which the function is missing, and no
-- grant to re-issue.
create or replace function public.events_since_checkpoint(
  p_tenant_id  uuid,
  p_projection text,
  p_limit      int default 500
)
returns table (
  last_seq     bigint,
  tenant_seq   bigint,
  global_seq   bigint,
  tenant_id    uuid,
  stream_id    uuid,
  stream_type  text,
  version      int,
  type         text,
  data         jsonb,
  metadata     jsonb,
  actor_id     uuid,
  created_at   timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with checkpoint as (
    select coalesce(
      (select c.last_seq
         from projection_checkpoints c
        where c.projection = p_projection
          and c.tenant_id  = p_tenant_id),
      0
    )::bigint as last_seq
  ),
  candidate as (
    select e.*, row_number() over (order by e.tenant_seq) as rn, c.last_seq as cursor
      from checkpoint c
      left join lateral (
        select *
          from events ev
         where ev.tenant_id = p_tenant_id
           and ev.tenant_seq > c.last_seq
         order by ev.tenant_seq
         limit greatest(1, least(p_limit, 1000))
      ) e on true
  ),
  judged as (
    select candidate.*,
           -- Contiguous from the cursor, or old enough that the number is not
           -- coming. `null` for the row a caught-up projection returns, which
           -- `is not false` below keeps.
           candidate.tenant_seq = candidate.cursor + candidate.rn
             or candidate.created_at < now() - interval '5 minutes' as readable
      from candidate
  ),
  reachable as (
    select judged.*,
           bool_and(judged.readable) over (
             order by judged.tenant_seq
             rows between unbounded preceding and current row
           ) as run
      from judged
  )
  select
    reachable.cursor as last_seq,
    reachable.tenant_seq,
    reachable.global_seq,
    reachable.tenant_id,
    reachable.stream_id,
    reachable.stream_type,
    reachable.version,
    reachable.type,
    reachable.data,
    reachable.metadata,
    reachable.actor_id,
    reachable.created_at
  from reachable
  where reachable.run is not false
  order by reachable.tenant_seq;
$$;

comment on function public.events_since_checkpoint(uuid, text, int) is
  'One projection''s cursor and the run of events after it. Stops at a hole in tenant_seq while the missing write could still be in flight, and steps over it once the event after it is more than five minutes old - a hole that outlives a transaction is permanent, and blocking every read model behind it for ever is worse than the skip the stop exists to prevent. Returns tenant_seq, which is the only number a caller may advance by. Security invoker - RLS on public.events is the authorization.';
