-- ============================================================================
-- Host samples
-- ----------------------------------------------------------------------------
-- CPU and memory of the machines themselves, which nothing else in this system
-- can see.
--
-- ----------------------------------------------------------------------------
-- Why this is pushed by an agent and not read by the app
-- ----------------------------------------------------------------------------
-- The app already reports its own process memory, and Postgres already reports
-- the database size. Neither is the same question as "is the box out of RAM" -
-- and the box that matters most, the Strato machine running Supabase, has no
-- app process on it at all. The lounge going quiet because Realtime got
-- OOM-killed is invisible to every other measurement here.
--
-- Two routes to that number were considered and rejected:
--
--   1. A SECURITY DEFINER function reading /proc through `pg_read_file`. It
--      works, but only after granting `pg_read_server_files` to the `postgres`
--      role - which is a standing privilege to read any file on the database
--      server, granted permanently, to buy a memory gauge. Too much power for
--      what it buys.
--   2. A metrics container (node-exporter and friends) on the Supabase stack.
--      Correct, and much more than is wanted here: another container, another
--      port, another thing in the Caddy config to keep private.
--
-- What is here instead: a shell script on each box reads /proc and posts the
-- numbers to the app. No new privileges, no new ports, no new containers, and
-- the collector is a file in this repo that can be read in full. See
-- `scripts/health-cron.sh`, which installs it.
--
-- ----------------------------------------------------------------------------
-- CPU is stored cumulative, like the request counters
-- ----------------------------------------------------------------------------
-- /proc/stat counts jiffies since boot, so a single reading says nothing about
-- current load - CPU percentage only exists between two samples. The raw
-- counters are stored and the percentage is worked out at read time, for the
-- same reason `health_samples` stores raw request counts: a reboot resets them,
-- and a reset is recoverable only if the reset is still visible in the data.
--
-- `load1` is stored alongside precisely because it needs no second sample, so
-- the live page has something to show the first time the agent ever runs.
-- ============================================================================

create table if not exists public.host_samples (
  id           uuid        primary key default gen_random_uuid(),
  sampled_at   timestamptz not null default now(),
  /**
   * Which machine. 'app' for the Hetzner box running the replicas, 'db' for the
   * Strato box running Supabase.
   *
   * A short fixed name rather than a hostname, because it is what the reader
   * needs to know - "the database box is out of memory" is the sentence being
   * enabled here, and it should not depend on remembering which of two
   * hostnames is which.
   */
  host         text        not null check (host in ('app', 'db')),
  /** The machine's own hostname, for matching a row to an SSH session. */
  hostname     text,

  cpu_cores    int,
  load1        double precision,
  load5        double precision,
  load15       double precision,
  -- Cumulative jiffies from /proc/stat. See the header.
  cpu_total    bigint,
  cpu_idle     bigint,

  mem_total_bytes     bigint,
  /**
   * Available, not free.
   *
   * MemFree on a healthy Linux box is always small - the kernel uses everything
   * spare as cache, and reporting it is how you end up believing a perfectly
   * fine machine is out of memory. MemAvailable is the kernel's own estimate of
   * what a new process could actually get, which is the number that means
   * something.
   */
  mem_available_bytes bigint,
  swap_total_bytes    bigint,
  swap_free_bytes     bigint,

  disk_total_bytes bigint,
  disk_free_bytes  bigint,

  uptime_seconds double precision
);

create index if not exists host_samples_time_idx
  on public.host_samples (sampled_at desc, host);

alter table public.host_samples enable row level security;

-- Readable by backoffice admins; written only by the service role, from the
-- ingest route. Same posture as `health_samples` and for the same reason: a
-- metrics table anybody's session can write to is a way to forge the graph
-- somebody makes decisions from.
create policy "host_samples_admin_read"
  on public.host_samples for select
  to authenticated
  using (public.is_backoffice_admin());

comment on table public.host_samples is
  'CPU, memory and disk of the app and database machines. Pushed by scripts/health-agent.sh via /api/cron/host-sample; read by /backbitch/health.';

-- ----------------------------------------------------------------------------
-- host_series()
-- ----------------------------------------------------------------------------
-- The window, per host, with CPU turned from cumulative jiffies into a busy
-- percentage for each interval.
create or replace function public.host_series(
  p_hours int default 24,
  p_limit int default 2000
)
returns table (
  sampled_at          timestamptz,
  host                text,
  hostname            text,
  cpu_cores           int,
  load1               double precision,
  load5               double precision,
  load15              double precision,
  cpu_busy            double precision,
  mem_total_bytes     bigint,
  mem_available_bytes bigint,
  swap_total_bytes    bigint,
  swap_free_bytes     bigint,
  disk_total_bytes    bigint,
  disk_free_bytes     bigint,
  uptime_seconds      double precision
)
language sql
stable
set search_path = public
as $$
  with windowed as (
    select
      h.*,
      lag(h.cpu_total) over w as prev_total,
      lag(h.cpu_idle)  over w as prev_idle
    from public.host_samples h
    where h.sampled_at > now() - make_interval(hours => p_hours)
    window w as (partition by h.host order by h.sampled_at)
  )
  select
    w.sampled_at,
    w.host,
    w.hostname,
    w.cpu_cores,
    w.load1,
    w.load5,
    w.load15,
    /**
     * Busy time as a fraction of total time across the interval.
     *
     * Null rather than zero wherever it cannot be computed - the first sample
     * of a host, or a reboot, which shows up as the cumulative counter going
     * backwards. A reboot rendered as "0% busy" would be a flat healthy line
     * across exactly the event worth seeing.
     */
    case
      when w.prev_total is null or w.cpu_total is null then null
      when w.cpu_total <= w.prev_total then null
      else 1 - ((w.cpu_idle - w.prev_idle)::double precision
                / (w.cpu_total - w.prev_total))
    end as cpu_busy,
    w.mem_total_bytes,
    w.mem_available_bytes,
    w.swap_total_bytes,
    w.swap_free_bytes,
    w.disk_total_bytes,
    w.disk_free_bytes,
    w.uptime_seconds
  from windowed w
  order by w.sampled_at
  limit p_limit
$$;

grant execute on function public.host_series(int, int) to authenticated;

-- Retention, on the same schedule and for the same reasons as health_prune.
create or replace function public.host_prune(p_keep_days int default 14)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  removed bigint;
begin
  if not (public.is_backoffice_admin() or (select auth.role()) = 'service_role') then
    raise exception 'host_prune: not permitted';
  end if;

  delete from public.host_samples
   where sampled_at < now() - make_interval(days => p_keep_days);

  get diagnostics removed = row_count;
  return removed;
end;
$$;

grant execute on function public.host_prune(int) to authenticated;
