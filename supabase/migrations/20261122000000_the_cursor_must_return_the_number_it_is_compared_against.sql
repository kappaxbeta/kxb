-- ============================================================================
-- The cursor must return the number it is compared against
-- ============================================================================
-- 20261120000000 moved the projection cursor from `global_seq` to `tenant_seq`
-- and did not give the reader any way to obey it. `events_since_checkpoint`
-- filters on `tenant_seq` and returns every column *except* `tenant_seq`, so
-- `runProjection` advanced its cursor with the only sequence number it could
-- see - `global_seq` - and wrote that back as the checkpoint.
--
-- The two live in different spaces. `global_seq` counts every tenant's events
-- and `tenant_seq` counts one tenant's, so on production the checkpoints read
-- 2869 against a tenant head of 688. `where tenant_seq > 2869` matches nothing.
--
-- **Every inline projection stopped, and nothing said so.** Appends kept
-- succeeding, every page kept rendering, and the read models simply stopped
-- moving. It is the exact failure mode this whole line of work exists to
-- prevent, introduced by the change that was meant to prevent it, which is
-- worth leaving on the record rather than quietly correcting.
--
-- Two lessons, both cheap and both taken here:
--
--   1. **A cursor and its comparison must be the same field, from the same
--      row.** The reader now returns `tenant_seq`, and `runProjection` uses
--      that and nothing else. There is no longer a plausible-looking wrong
--      value in scope to reach for.
--   2. **An impossible state should be visible.** A checkpoint ahead of its
--      tenant's head cannot happen and is now the first thing the repair below
--      looks for.
-- ============================================================================

-- Dropped rather than replaced: `create or replace` cannot change a function's
-- return type, and adding a column to a `returns table` is changing it. The
-- error is "cannot change return type of existing function", which reads like a
-- permissions problem and is not.
--
-- Safe to drop and recreate in one transaction - a migration is one - so no
-- caller can arrive in the gap and find the function missing.
drop function if exists public.events_since_checkpoint(uuid, text, int);

create function public.events_since_checkpoint(
  p_tenant_id  uuid,
  p_projection text,
  p_limit      int default 500
)
returns table (
  last_seq     bigint,
  -- The addition. Without it the caller has nothing correct to advance by, and
  -- the nearest thing to hand is wrong in a way that reads as working.
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
  )
  select
    candidate.cursor as last_seq,
    candidate.tenant_seq,
    candidate.global_seq,
    candidate.tenant_id,
    candidate.stream_id,
    candidate.stream_type,
    candidate.version,
    candidate.type,
    candidate.data,
    candidate.metadata,
    candidate.actor_id,
    candidate.created_at
  from candidate
  -- Unchanged: keep only the run contiguous from the cursor, so an uncommitted
  -- write is waited for rather than stepped over. `is not false` keeps the null
  -- row a caught-up projection returns.
  where (candidate.tenant_seq = candidate.cursor + candidate.rn) is not false
  order by candidate.tenant_seq;
$$;

comment on function public.events_since_checkpoint(uuid, text, int) is
  'One projection''s cursor and the contiguous run of events after it. Returns tenant_seq, which is the number the cursor is compared against and therefore the only number a caller may advance by. Security invoker - RLS on public.events is the authorization.';

grant execute on function public.events_since_checkpoint(uuid, text, int)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- The repair and the guard are NOT in this file
-- ----------------------------------------------------------------------------
-- They are in 20261123000000, and the split is an ordering requirement rather
-- than tidiness. Between this migration and the deploy that carries the fixed
-- `runProjection`, production is still running code that advances by
-- `global_seq`:
--
--   * Repairing here would be undone within a minute by that code, which would
--     write a `global_seq` straight back into the cursor.
--   * The guard here would be worse than that. It rejects exactly the write the
--     old code makes, so every command that appends events would start *failing*
--     - turning a silent stall into a user-visible outage, in the window before
--     the fix arrives.
--
-- So this file only widens what the reader returns, which is invisible to the
-- old code (an extra column it does not select) and is the prerequisite for the
-- new code. Apply it, deploy, then apply 20261123000000.
