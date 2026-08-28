-- ============================================================================
-- The room measurements, as the migration beside them already describes them
-- ----------------------------------------------------------------------------
-- Nothing new. Both functions here are verbatim copies of the ones in
-- 20261211000000_a_room_can_say_how_it_is_running.sql, and this file exists
-- only because that one had already been applied to a database before two
-- fixes went into it.
--
-- A migration recorded as applied never runs again, so the file and the
-- database disagreed with no way to converge. What that looked like from the
-- outside: /ovaloffice/performance saying "nothing has been measured" over a
-- table with forty rows in it. Both defects are silent by construction, which
-- is why this is worth a file of its own rather than an edit nobody would
-- notice had not taken.
--
--   1. `room_perf_rooms` refused the service role. The backoffice reads it
--      through the *admin* client - as the health page reads `health_db_stats`
--      - because naming a space means reading tables an operator's own session
--      cannot. The old guard raised; the caller swallowed the error into an
--      empty list, on the reasoning that a page with no chart beats no page.
--
--   2. Its rate columns came back `numeric`. `1000.0` is a numeric literal in
--      Postgres, so `int * numeric / int` is numeric against a `double
--      precision` signature - which fails the whole call with "structure of
--      query does not match function result type", not just the column.
--
--   3. `record_room_perf` resolved the entire flag registry to read one
--      boolean. `resolve_features` calls `tenant_role()` once per flag, about
--      thirty times; measured at 3.4 seconds on a database where one
--      `tenant_role()` takes 109ms, which is past the statement timeout. Every
--      sample was refused, and the refusal looked like a permissions problem.
--
-- `create or replace`, so this is a no-op on any database that already has the
-- corrected pair - a fresh one built from the migration beside this, for
-- instance.
-- ============================================================================

create or replace function public.record_room_perf(
  p_tenant_id     uuid,
  p_topic         text,
  p_conn          text,
  p_window_ms     int,
  p_channel_state text,
  p_reconnects    int              default 0,
  p_quiet_ms      int              default null,
  p_rest_fallback boolean          default false,
  p_sent          jsonb            default '{}'::jsonb,
  p_received      jsonb            default '{}'::jsonb,
  p_peers         int              default 0,
  p_frames        int              default 0,
  p_frame_p50_ms  double precision default null,
  p_frame_p95_ms  double precision default null,
  p_hidden_ms     int              default 0,
  p_rtt_samples   int              default 0,
  p_rtt_lost      int              default 0,
  p_rtt_p50_ms    double precision default null,
  p_rtt_p95_ms    double precision default null,
  p_link_jitter_ms double precision default null,
  p_link_delay_ms  double precision default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := (select auth.uid());
  v_kind  text := split_part(p_topic, ':', 1);
  v_on    boolean;
  v_sent  int;
  v_recv  int;
begin
  if v_user is null then return false; end if;
  if p_topic !~ '^(lounge|battle|hall):' then return false; end if;
  if public.tenant_role(p_tenant_id) is null then return false; end if;

  select coalesce(
    (select o.enabled from public.feature_flag_overrides o
      where o.flag_key = 'perf' and o.scope = 'user' and o.scope_id = v_user),
    (select o.enabled from public.feature_flag_overrides o
      where o.flag_key = 'perf' and o.scope = 'tenant' and o.scope_id = p_tenant_id),
    (select f.enabled from public.feature_flags f where f.key = 'perf'),
    false
  ) into v_on;

  if not v_on then return false; end if;

  /**
   * A floor and a ceiling on the window.
   *
   * Not validation for its own sake: the window is the denominator of every
   * rate on the page, so a client claiming a 10ms window turns 3 packets into
   * 300 per second. The floor is well under the sampler's own interval and the
   * ceiling is well over it, so an honest client is never clamped and a broken
   * one cannot invent a spike.
   */
  if p_window_ms < 1000 or p_window_ms > 600000 then return false; end if;

  /**
   * One row per client per five seconds, whatever the client thinks.
   *
   * The sampler batches on a much slower interval than this, so this is not a
   * rate limit anybody honest will meet. It exists because the flag makes every
   * member of an enabled space a writer to this table, and a table that browsers
   * write to needs a bound that does not depend on the browser being the one we
   * shipped.
   */
  if exists (
    select 1 from public.room_perf_samples s
     where s.topic = p_topic
       and s.conn  = p_conn
       and s.sampled_at > now() - interval '5 seconds'
  ) then
    return false;
  end if;

  -- Summed here rather than taken from the client, so the total and the
  -- breakdown are the same number by construction.
  select coalesce(sum((value)::int), 0) into v_sent
    from jsonb_each_text(coalesce(p_sent, '{}'::jsonb));
  select coalesce(sum((value)::int), 0) into v_recv
    from jsonb_each_text(coalesce(p_received, '{}'::jsonb));

  insert into public.room_perf_samples (
    tenant_id, topic, room_kind, user_id, conn, window_ms,
    channel_state, reconnects, quiet_ms, rest_fallback,
    sent, received, sent_total, recv_total, peers,
    frames, frame_p50_ms, frame_p95_ms, hidden_ms,
    rtt_samples, rtt_lost, rtt_p50_ms, rtt_p95_ms,
    link_jitter_ms, link_delay_ms
  ) values (
    p_tenant_id, p_topic, v_kind, v_user, p_conn, p_window_ms,
    p_channel_state, greatest(coalesce(p_reconnects, 0), 0), p_quiet_ms,
    coalesce(p_rest_fallback, false),
    coalesce(p_sent, '{}'::jsonb), coalesce(p_received, '{}'::jsonb),
    v_sent, v_recv, greatest(coalesce(p_peers, 0), 0),
    greatest(coalesce(p_frames, 0), 0), p_frame_p50_ms, p_frame_p95_ms,
    least(greatest(coalesce(p_hidden_ms, 0), 0), p_window_ms),
    greatest(coalesce(p_rtt_samples, 0), 0), greatest(coalesce(p_rtt_lost, 0), 0),
    p_rtt_p50_ms, p_rtt_p95_ms, p_link_jitter_ms, p_link_delay_ms
  );

  return true;
end;
$$;

create or replace function public.room_perf_rooms(p_minutes int default 15)
returns table (
  topic          text,
  room_kind      text,
  tenant_id      uuid,
  tenant_name    text,
  clients        int,
  people         int,
  samples        int,
  last_seen      timestamptz,
  /** What the room put on the wire, per second, summed across its clients. */
  sent_hz        double precision,
  /** What its clients took off the wire, per second, summed. The fan-out. */
  delivered_hz   double precision,
  /** Clients whose channel was anything but subscribed in their last window. */
  unhealthy      int,
  /** Any client that saw the REST fallback at all. */
  rest_fallback  boolean,
  /** The worst client in the room, which is what the room feels like. */
  worst_frame_p95_ms double precision,
  worst_rtt_p95_ms   double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  /**
   * An admin session, or the service role.
   *
   * The second half is not optional and was missing at first: the backoffice
   * reads this through the *admin* client - as the health page reads
   * `health_db_stats` - because resolving a space's name means reading tables
   * an operator's own session cannot. Without it this raised, the caller
   * swallowed the error into an empty list on the reasoning that a page with no
   * chart beats no page, and the tab said "nothing has been measured" over a
   * table with rows in it. `auth.role()` reads the verified JWT, so neither
   * branch trusts anything the request supplied.
   */
  if not (public.is_backoffice_admin() or (select auth.role()) = 'service_role') then
    raise exception 'room_perf_rooms: not permitted';
  end if;

  return query
  with per_row as (
    select
      s.topic, s.room_kind, s.tenant_id, s.conn, s.user_id, s.sampled_at,
      /**
       * `::float8`, and it is not decoration.
       *
       * `1000.0` is a *numeric* literal in Postgres, so `int * numeric / int`
       * is numeric - and this function declares these columns `double
       * precision`. Without the cast every call fails outright with "structure
       * of query does not match function result type", which is a picker that
       * renders nothing rather than a number that is slightly off.
       */
      (s.sent_total * 1000.0 / s.window_ms)::float8 as sent_hz,
      (s.recv_total * 1000.0 / s.window_ms)::float8 as recv_hz,
      s.channel_state, s.rest_fallback, s.frame_p95_ms, s.rtt_p95_ms,
      row_number() over (partition by s.topic, s.conn order by s.sampled_at desc) as recency
    from public.room_perf_samples s
    where s.sampled_at > now() - make_interval(mins => p_minutes)
  ),
  per_client as (
    select
      r.topic,
      max(r.room_kind)  as room_kind,
      /* One conn is one tenant and one person, so "the newest row's" is only
         a way of picking a representative without a min/max over a uuid. */
      (array_agg(r.tenant_id order by r.sampled_at desc))[1] as tenant_id,
      r.conn,
      (array_agg(r.user_id   order by r.sampled_at desc))[1] as user_id,
      avg(r.sent_hz)    as sent_hz,
      avg(r.recv_hz)    as recv_hz,
      count(*)::int     as samples,
      max(r.sampled_at) as last_seen,
      bool_or(r.rest_fallback) as rest_fallback,
      max(r.frame_p95_ms) as frame_p95_ms,
      max(r.rtt_p95_ms)   as rtt_p95_ms,
      -- The newest row's state, not the worst one seen: a client that errored
      -- ten minutes ago and has been subscribed since is not a problem now.
      max(r.channel_state) filter (where r.recency = 1) as channel_state
    from per_row r
    group by r.topic, r.conn
  )
  select
    c.topic,
    max(c.room_kind),
    /* A cross-tenant battle has two, and the room is one room - so the picker
       is labelled with whichever space was heard from last rather than being
       split into two half-rooms whose traffic figures are each wrong. */
    (array_agg(c.tenant_id order by c.last_seen desc))[1],
    max(t.name),
    count(*)::int,
    count(distinct c.user_id)::int,
    sum(c.samples)::int,
    max(c.last_seen),
    sum(c.sent_hz),
    sum(c.recv_hz),
    count(*) filter (where c.channel_state is distinct from 'subscribed')::int,
    bool_or(c.rest_fallback),
    max(c.frame_p95_ms),
    max(c.rtt_p95_ms)
  from per_client c
  left join public.tenants_read_model t on t.id = c.tenant_id
  group by c.topic
  order by max(c.last_seen) desc;
end;
$$;
