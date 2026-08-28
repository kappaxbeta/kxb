-- ============================================================================
-- The cursor and its events, in one ask
-- ============================================================================
-- `runProjection` reads a checkpoint, then reads the events after it. Two round
-- trips to PostgREST, on every command, in the user's request - because
-- projections run inline here rather than from a worker following the log.
--
-- The second query cannot be issued until the first has answered, so this is
-- latency in series, not in parallel. On a write path that already costs a
-- `loadStream`, an `append_events` and a `writeCheckpoint`, it is one of four
-- fixed round trips and the only one that exists purely because the two facts
-- live in different tables.
--
-- ----------------------------------------------------------------------------
-- What this does NOT change
-- ----------------------------------------------------------------------------
-- Stated plainly because the temptation was there and it would have been wrong.
--
-- The obvious "optimisation" is to skip reading the log at all and project the
-- events `append_events` just returned - the caller is holding them. That is
-- unsound here, and the reason is subtle: `global_seq` is global, not per
-- tenant, so the events after a tenant's checkpoint are not contiguous with the
-- ones just appended. Another member of the same space writing concurrently
-- lands between them, and projecting only your own would step over theirs while
-- moving the checkpoint past it - the read model would lose an event
-- permanently, with no error and no way to notice short of a replay.
--
-- That is the same class of bug the cursor already has (see `projection.ts` on
-- identity values being handed out before commit), and the fix for it is a
-- transactional outbox or a `pg_current_snapshot()` cursor - a project, with
-- its own design document. This migration deliberately does not pretend to
-- solve it. It reads exactly what the two queries read, in one call, and
-- returns the same rows in the same order.
--
-- So: same semantics, same ordering, same batch size, one fewer round trip.
-- ============================================================================

create or replace function public.events_since_checkpoint(
  p_tenant_id  uuid,
  p_projection text,
  p_limit      int default 500
)
returns table (
  -- The cursor the batch starts from, returned so the caller does not need the
  -- separate read. Comes back even when there are no events - a projection that
  -- is fully caught up still has a position, and the caller writes it back.
  last_seq     bigint,
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
  -- SECURITY INVOKER, unlike the health functions, and this is the important
  -- line in the file. The events table is protected by RLS keyed on tenant
  -- membership; a definer function here would read the log with the owner's
  -- rights and hand any caller any tenant's history. The tenant filter below is
  -- a second lock on a door RLS already holds - if a policy is ever loosened by
  -- accident this degrades to "no rows" rather than "somebody else's rows",
  -- which is exactly the reasoning `loadStream` documents for doing the same.
  with checkpoint as (
    select coalesce(
      (select c.last_seq
         from projection_checkpoints c
        where c.projection = p_projection
          and c.tenant_id  = p_tenant_id),
      0
    )::bigint as last_seq
  )
  select
    checkpoint.last_seq,
    e.global_seq,
    e.tenant_id,
    e.stream_id,
    e.stream_type,
    e.version,
    e.type,
    e.data,
    e.metadata,
    e.actor_id,
    e.created_at
  from checkpoint
  -- LEFT JOIN, not a plain FROM: a caught-up projection must still get its
  -- cursor back. An inner join returns zero rows there, the caller reads the
  -- checkpoint as 0, and every projection replays its whole history on every
  -- command that appends nothing.
  left join lateral (
    select *
      from events ev
     where ev.tenant_id = p_tenant_id
       and ev.global_seq > checkpoint.last_seq
     order by ev.global_seq
     limit greatest(1, least(p_limit, 1000))
  ) e on true
  order by e.global_seq;
$$;

comment on function public.events_since_checkpoint(uuid, text, int) is
  'One projection''s cursor and the events after it, in a single call. Security invoker - RLS on public.events is the authorization. Returns one row with a null global_seq when the projection is already caught up.';

grant execute on function public.events_since_checkpoint(uuid, text, int)
  to authenticated, service_role;
