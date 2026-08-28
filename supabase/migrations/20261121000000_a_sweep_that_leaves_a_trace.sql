-- ============================================================================
-- A sweep that leaves a trace
-- ============================================================================
-- `/api/cron/project` returns a good report and throws it away. The crontab
-- sends it to /dev/null - it has to, because there is nobody to read it - so the
-- one number that would tell you the sweep has stopped keeping up is computed
-- every minute and never seen by anyone.
--
-- That number is `remaining`: projection/tenant pairs that were behind when the
-- run started and were still behind when its deadline arrived. Non-zero once is
-- a backlog after a quiet period. Non-zero run after run is the sweep no longer
-- fitting in a minute, and the failure that follows is not an outage - it is
-- read models drifting further behind the log while every page still renders.
--
-- So the runs are recorded, the same way `health_samples` records the health
-- sweep and for the same reason: live probes tell you about now, and the
-- question that actually matters is whether this is worse than yesterday.
--
-- ----------------------------------------------------------------------------
-- Why not health_samples
-- ----------------------------------------------------------------------------
-- Different shape, different clock, different lifetime. `health_samples` is one
-- row per replica per five minutes describing a process; this is one row per
-- minute describing a queue, and the columns have nothing in common. Widening
-- that table would give it a dozen always-null columns and two meanings.
-- ============================================================================

create table if not exists public.projection_sweeps (
  id          bigint      generated always as identity primary key,
  ran_at      timestamptz not null default now(),

  /** Pairs behind at the start of the run. */
  pending     int         not null,
  /** Of those, drained before the deadline. */
  swept       int         not null,
  /** Events actually applied. */
  applied     int         not null,
  /**
   * Still behind when the deadline arrived.
   *
   * The column this table exists for. Everything else here is context for
   * reading it.
   */
  remaining   int         not null,
  failed      int         not null,
  /** How long the run took, so a rising number is visible before it is a problem. */
  ms          int         not null,
  /** Spaces and projections considered, so a run can be read without joining. */
  spaces      int         not null,
  projections int         not null,
  /** First few failures, if any. Null on a clean run rather than an empty array. */
  errors      jsonb
);

comment on table public.projection_sweeps is
  'One row per /api/cron/project run. `remaining` is the column that matters: non-zero run after run means the sweep no longer keeps up. Written by the service role, read by the backoffice health page.';

-- Every query this table has is "the recent ones", and it is written once a
-- minute for ever - so the index is the ordering, and without it the health
-- page sorts a growing heap on every load.
create index if not exists projection_sweeps_ran_at_idx
  on public.projection_sweeps (ran_at desc);

alter table public.projection_sweeps enable row level security;

-- No policies. The sampler writes as the service role, which bypasses RLS, and
-- the page reads through the definer function below. Nothing else has any
-- business here, and a table with RLS on and no policies says that in the one
-- language Postgres enforces.

-- ----------------------------------------------------------------------------
-- Recording a run
-- ----------------------------------------------------------------------------
-- A function rather than an insert from the route, so the pruning below happens
-- on the same clock as the writing and cannot be forgotten by a caller.
create or replace function public.record_projection_sweep(
  p_pending     int,
  p_swept       int,
  p_applied     int,
  p_remaining   int,
  p_failed      int,
  p_ms          int,
  p_spaces      int,
  p_projections int,
  p_errors      jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'record_projection_sweep: not permitted';
  end if;

  insert into public.projection_sweeps
    (pending, swept, applied, remaining, failed, ms, spaces, projections, errors)
  values
    (p_pending, p_swept, p_applied, p_remaining, p_failed, p_ms, p_spaces, p_projections,
     case when p_errors is null or jsonb_array_length(p_errors) = 0 then null else p_errors end);

  -- Once a minute is 43 200 rows a month, which is nothing to Postgres and
  -- everything to a table nobody ever prunes. Seven days is longer than any
  -- question anybody asks of this - "is it worse than last week" is the outer
  -- limit - and the deletion is cheap because the index is the ordering.
  --
  -- Done inline rather than in its own job on the same reasoning the whole file
  -- rests on: a cleanup that needs its own schedule is a cleanup that stops.
  delete from public.projection_sweeps where ran_at < now() - interval '7 days';
end;
$$;

grant execute on function public.record_projection_sweep(int, int, int, int, int, int, int, int, jsonb)
  to service_role;

-- ----------------------------------------------------------------------------
-- Reading them back
-- ----------------------------------------------------------------------------
-- The caller check is a raise, not a WHERE clause, and that is deliberate after
-- getting it wrong once: `where is_admin() or role = 'x' and ran_at > ...` parses
-- as `is_admin() or (role = 'x' and ran_at > ...)`, because AND binds tighter
-- than OR - so an admin silently receives the whole table instead of the window
-- they asked for. Authorization and filtering do not belong in the same
-- expression; the other health functions all raise, and so does this.
create or replace function public.projection_sweep_history(p_hours int default 24)
returns setof public.projection_sweeps
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_backoffice_admin() or (select auth.role()) = 'service_role') then
    raise exception 'projection_sweep_history: not permitted';
  end if;

  return query
  select *
    from public.projection_sweeps s
   where s.ran_at > now() - make_interval(hours => greatest(1, least(p_hours, 168)))
   order by s.ran_at desc
   limit 2000;
end;
$$;

grant execute on function public.projection_sweep_history(int) to authenticated, service_role;
