-- ============================================================================
-- Health samples
-- ----------------------------------------------------------------------------
-- What the machines looked like, on a clock.
--
-- Deliberately not event-sourced, for the same reason as `error_reports` and
-- `page_views`: a memory reading is not a decision anybody made about a thing
-- the app owns, nothing folds it into state, and no rule depends on the order
-- two of them arrived in. It is platform plumbing, belonging to nobody's
-- workspace.
--
-- The problem it solves is the one the live health page cannot: a page that
-- probes on load answers "is it healthy now", which is the wrong question at
-- 3am when it is already down. "Was it degrading for an hour first, and which
-- replica went first" needs something to have been writing it down.
--
-- ----------------------------------------------------------------------------
-- One row per replica per sample, not one row per sample
-- ----------------------------------------------------------------------------
-- kxb.team runs two app replicas behind Caddy. Averaging them into one row
-- would hide the failure mode that actually happens here - one replica wedged
-- while the other serves fine, so the site is "up" and half of all requests are
-- slow. `replica` is therefore part of the natural key, and every chart is
-- per-replica or it is lying.
--
-- ----------------------------------------------------------------------------
-- Counters are cumulative, and reset
-- ----------------------------------------------------------------------------
-- `requests_total` and `errors_total` are the process's own counters since it
-- started, not a delta. Deltas are computed at read time, because the thing
-- that makes a delta wrong is a deploy: the process restarts, the counter goes
-- back to zero, and a naive `value - previous` produces a large negative
-- number. `health_series` handles that explicitly - see the reset clause there.
-- Storing the raw counter means the reset stays visible and recoverable rather
-- than being baked into the row wrong.
-- ============================================================================

create table if not exists public.health_samples (
  id              uuid        primary key default gen_random_uuid(),
  sampled_at      timestamptz not null default now(),
  /**
   * Which process this reading came from.
   *
   * The compose service name (`app`, `app2`) where the sampler reached a peer
   * over the container network, and the container hostname otherwise. Not a
   * foreign key to anything - replicas are cattle, and a name that stops
   * appearing is a replica that went away, which is itself worth seeing.
   */
  replica         text        not null,
  status          text        not null
                    check (status in ('ok', 'degraded', 'down')),

  -- Process. Null when the replica did not answer at all, which is precisely
  -- when `status` is 'down' - a down replica still gets a row, because a gap in
  -- the series is indistinguishable from the sampler itself not having run.
  rss_bytes         bigint,
  heap_used_bytes   bigint,
  heap_total_bytes  bigint,
  uptime_seconds    double precision,
  /**
   * How late a zero-delay timer actually fired, in milliseconds.
   *
   * The saturation signal that matters for this app. Node is single-threaded
   * and the box has two cores; when a render is CPU-bound, memory looks fine
   * and every request queues behind it. Lag is what makes that visible.
   */
  event_loop_lag_ms double precision,
  /** Next's BUILD_ID. Two replicas disagreeing here is the ChunkLoadError. */
  build_id          text,

  -- Cumulative since process start. See the header.
  requests_total  bigint,
  errors_total    bigint,

  -- The uploads volume, which is a bind mount and fills up independently of
  -- the container's own disk.
  disk_free_bytes  bigint,
  disk_total_bytes bigint,

  -- Postgres, as seen from the app. Sampled once per sweep and copied onto
  -- every replica's row, because it describes the shared backend rather than
  -- the replica - denormalised on purpose so a chart needs no join.
  db_size_bytes    bigint,
  db_connections   int,

  /**
   * Dependency probes, as `{ "postgres": { "status": "ok", "ms": 12 }, ... }`.
   *
   * jsonb rather than columns because the set of things worth probing changes
   * more often than this table should. Nothing queries inside it in SQL - the
   * page reads it whole - so it needs no gin index.
   */
  deps jsonb not null default '{}'::jsonb
);

-- Every read is "the recent window, oldest first, per replica". The replica
-- trails the timestamp because the window is always narrowed first.
create index if not exists health_samples_time_idx
  on public.health_samples (sampled_at desc, replica);

alter table public.health_samples enable row level security;

-- Readable by backoffice admins, writable by nobody holding a session key.
-- Inserts go through the service role from the sampler, the same shape as
-- `error_reports`: there is no user behind a cron job, and a session-writable
-- metrics table is a way to forge the graph somebody makes decisions from.
create policy "health_samples_admin_read"
  on public.health_samples for select
  to authenticated
  using (public.is_backoffice_admin());

comment on table public.health_samples is
  'Infrastructure readings on a clock, one row per replica per sweep. Written by /api/cron/sample-health with the service role; read by /backbitch/health.';

-- ----------------------------------------------------------------------------
-- health_db_stats()
-- ----------------------------------------------------------------------------
-- How big the database is and how busy, which is the half of "is it healthy"
-- the app cannot see from its own process.
--
-- SECURITY DEFINER, unlike `error_report_groups`, and for a specific reason:
-- `pg_stat_activity` shows a non-superuser only its own rows in full, so a
-- connection count taken as `service_role` under-reports - and a monitoring
-- number that is quietly wrong is worse than one that is missing. Definer means
-- it is counted by the owner, which sees everything.
--
-- Because it is definer, it checks its own caller rather than trusting the
-- grant: an admin session, or the service role that the sampler runs as.
-- `auth.role()` reads the verified JWT, so neither branch takes anything the
-- request supplied.
create or replace function public.health_db_stats()
returns table (
  db_size_bytes bigint,
  connections   int,
  max_conns     int,
  tables        jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (public.is_backoffice_admin() or (select auth.role()) = 'service_role') then
    raise exception 'health_db_stats: not permitted';
  end if;

  return query
  select
    pg_database_size(current_database())::bigint,
    (select count(*)::int from pg_stat_activity
      where datname = current_database()),
    (select setting::int from pg_settings where name = 'max_connections'),
    /**
     * The biggest tables, with their row estimates.
     *
     * `n_live_tup` is the planner's estimate, not a count - counting every row
     * of `page_views` to draw a dashboard is exactly the query that makes the
     * dashboard the outage. It is approximate and labelled as such in the UI.
     *
     * Ten is enough to see what is growing; the tail is noise on a schema this
     * size, and a monitoring page that lists sixty tables gets scrolled past.
     */
    (select coalesce(jsonb_agg(t order by t.bytes desc), '[]'::jsonb)
       from (
         select
           c.relname                                      as name,
           pg_total_relation_size(c.oid)::bigint          as bytes,
           coalesce(s.n_live_tup, 0)::bigint              as rows
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         left join pg_stat_user_tables s on s.relid = c.oid
         where n.nspname = 'public'
           and c.relkind = 'r'
         order by pg_total_relation_size(c.oid) desc
         limit 10
       ) t);
end;
$$;

grant execute on function public.health_db_stats() to authenticated;

-- ----------------------------------------------------------------------------
-- health_series()
-- ----------------------------------------------------------------------------
-- The window, per replica, oldest first, with the cumulative counters turned
-- into per-sample deltas.
--
-- Done here rather than in Node for the reason the error grouping gives: the
-- case worth designing for is the long window, and that is precisely the case
-- where the rows have no business being in the app process.
create or replace function public.health_series(
  p_hours int default 24,
  p_limit int default 2000
)
returns table (
  sampled_at        timestamptz,
  replica           text,
  status            text,
  rss_bytes         bigint,
  heap_used_bytes   bigint,
  event_loop_lag_ms double precision,
  uptime_seconds    double precision,
  build_id          text,
  db_size_bytes     bigint,
  db_connections    int,
  disk_free_bytes   bigint,
  disk_total_bytes  bigint,
  requests_delta    bigint,
  errors_delta      bigint,
  deps              jsonb
)
language sql
stable
set search_path = public
as $$
  with windowed as (
    select
      h.*,
      lag(h.requests_total) over w as prev_requests,
      lag(h.errors_total)   over w as prev_errors,
      lag(h.uptime_seconds) over w as prev_uptime
    from public.health_samples h
    where h.sampled_at > now() - make_interval(hours => p_hours)
    window w as (partition by h.replica order by h.sampled_at)
  )
  select
    w.sampled_at,
    w.replica,
    w.status,
    w.rss_bytes,
    w.heap_used_bytes,
    w.event_loop_lag_ms,
    w.uptime_seconds,
    w.build_id,
    w.db_size_bytes,
    w.db_connections,
    w.disk_free_bytes,
    w.disk_total_bytes,
    /**
     * The delta, unless the process restarted between the two samples.
     *
     * A restart is detected by uptime going *down*, not by the counter going
     * down, because those are different events and only one of them is
     * recoverable. Uptime falling means a new process: its counter started at
     * zero, so the current value is itself the delta for this interval. The
     * counter falling while uptime rose would mean something else entirely - a
     * counter that cannot happen - and is clamped to null rather than guessed
     * at, so a broken sampler reads as a gap instead of a plausible line.
     */
    case
      when w.prev_requests is null then null
      when w.prev_uptime is not null and w.uptime_seconds < w.prev_uptime
        then w.requests_total
      when w.requests_total >= w.prev_requests
        then w.requests_total - w.prev_requests
      else null
    end as requests_delta,
    case
      when w.prev_errors is null then null
      when w.prev_uptime is not null and w.uptime_seconds < w.prev_uptime
        then w.errors_total
      when w.errors_total >= w.prev_errors
        then w.errors_total - w.prev_errors
      else null
    end as errors_delta,
    w.deps
  from windowed w
  order by w.sampled_at
  limit p_limit
$$;

grant execute on function public.health_series(int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- health_prune()
-- ----------------------------------------------------------------------------
-- Retention, called by the sampler after it writes.
--
-- Sampling every five minutes across two replicas is ~576 rows a day, so
-- fourteen days is around eight thousand rows - small enough that the table
-- never becomes a thing to think about, long enough to cover "it was fine last
-- week, what changed". Kept as a function rather than a cron job so it runs on
-- the same schedule as the writes, with no second thing to install on the box.
create or replace function public.health_prune(p_keep_days int default 14)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  removed bigint;
begin
  if not (public.is_backoffice_admin() or (select auth.role()) = 'service_role') then
    raise exception 'health_prune: not permitted';
  end if;

  delete from public.health_samples
   where sampled_at < now() - make_interval(days => p_keep_days);

  get diagnostics removed = row_count;
  return removed;
end;
$$;

grant execute on function public.health_prune(int) to authenticated;
