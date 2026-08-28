-- ============================================================================
-- Room performance samples
-- ----------------------------------------------------------------------------
-- What a live xo room looked like from inside the browsers standing in it.
--
-- Deliberately not event-sourced, for exactly the reasons `health_samples`
-- gives: a frame time is not a decision anybody made about a thing the app
-- owns, nothing folds it into state, and no rule depends on the order two of
-- them arrived in. The event log is immutable history; this is disposable
-- measurement, and mixing the two would mean carrying a room's frame rate
-- forever in the stream that decides who owns a space.
--
-- ----------------------------------------------------------------------------
-- Why the server cannot answer any of this
-- ----------------------------------------------------------------------------
-- Everything the lounge and the battle rooms do at speed happens on a Realtime
-- channel and in a frame loop. On a self-hosted stack the app process cannot
-- read either: it does not subscribe to the topic, it has no idea how many
-- packets crossed it, and it has never drawn a frame. `health_samples` answers
-- "is the box alive"; a room can be perfectly served by a healthy box and still
-- be unplayable. The only witness is the browser, so the browser is what writes
-- here.
--
-- ----------------------------------------------------------------------------
-- One row per client per window, not one row per room
-- ----------------------------------------------------------------------------
-- The same argument `health_samples` makes about replicas, one layer up. A room
-- averaged into one row hides the failure that actually happens: five people
-- fine and the sixth on a phone at 14fps with a channel that keeps dropping.
-- That person is the one having a bad time, and the room's mean says nothing
-- about them.
--
-- `conn` rather than `user_id` alone is the natural key's tail, because one
-- person can be two clients - the ball election already depends on that being
-- true (see `ballOwner`), and two tabs have two frame rates.
--
-- ----------------------------------------------------------------------------
-- Rates are stored as counts and a window, never as a rate
-- ----------------------------------------------------------------------------
-- `sent` and `received` are counts of what actually crossed the wire during
-- `window_ms`, and every per-second figure is division done at read time. The
-- performance study this follows found the same thing twice over: counts were
-- reproducible under conditions where wall-clock timings swung by an order of
-- magnitude. Storing a client's own idea of "packets per second" would bake one
-- browser's arithmetic - and one browser's idea of how long a second is - into
-- the number an operator makes decisions from.
--
-- ----------------------------------------------------------------------------
-- Round trip, never one-way
-- ----------------------------------------------------------------------------
-- `rtt_*` is a round trip measured on one clock: this client broadcast a nonce,
-- some peer echoed it, this client matched the echo and subtracted. There is no
-- one-way column here and there must never be one. Two browsers do not share a
-- clock - `MoveMessage.t` is the sender's `performance.now()`, whose epoch is
-- the moment that tab opened - so a stamp from one machine subtracted from
-- another's clock produces a confident, meaningless number. Halving a round
-- trip is a presentation choice the page makes and labels; it is not a
-- measurement, and so it is not a column.
-- ============================================================================

create table if not exists public.room_perf_samples (
  id          uuid        primary key default gen_random_uuid(),
  sampled_at  timestamptz not null default now(),

  /**
   * Which space this client is playing from.
   *
   * Not derivable from `topic`: a `battle:` room can hold two spaces fighting
   * each other, and a `hall:` topic names a room rather than its owner. It is
   * the tenant whose `perf` flag admitted this write, which is also the tenant
   * an operator turned collection on for.
   */
  tenant_id   uuid        not null
                references public.tenants_read_model (id) on delete cascade,

  /**
   * The Realtime topic, verbatim: `lounge:<tenant>`, `battle:<battle>` or
   * `hall:<room>`. Stored whole rather than split, because it is the identity
   * of the room as every client on it already knows it, and the page's picker
   * hands it straight back to filter by.
   */
  topic       text        not null check (topic ~ '^(lounge|battle|hall):'),
  /** The prefix, kept as a column so the picker can group without parsing. */
  room_kind   text        not null check (room_kind in ('lounge', 'battle', 'hall')),

  /** Whoever auth.uid() was - a member, or a guest holding a door pass. */
  user_id     uuid        not null,
  /**
   * Which *tab*. One person with the lounge open twice is two clients with two
   * frame rates and two sockets, and the room's traffic is the sum of both.
   */
  conn        text        not null,

  /** How long this row covers, in milliseconds. Every rate divides by it. */
  window_ms   int         not null check (window_ms > 0),

  -- Connection ------------------------------------------------------------
  /**
   * What `channel.subscribe()` last said: `subscribed`, `closed`, `errored`,
   * `timed_out`, or `joining` for a client that has never been anything else.
   * Free text with a check rather than an enum, because supabase-js owns this
   * vocabulary and a new state must not be a failed insert in somebody's room.
   */
  channel_state text      not null,
  /** How many times this client has re-subscribed since the room was opened. */
  reconnects    int       not null default 0,
  /**
   * Milliseconds since anything at all arrived on the channel. Null when
   * nothing ever has, which is a different and worse state than a large number.
   */
  quiet_ms      int,
  /**
   * supabase-js logged "Realtime send() is automatically falling back to REST
   * API" at least once in this window.
   *
   * Worth its own column rather than being left in a console nobody is reading:
   * the fallback silently changes the transport under a room that still looks
   * connected, and it is the explanation for a room where everybody is
   * subscribed and movement still arrives in lumps.
   */
  rest_fallback boolean   not null default false,

  -- Throughput ------------------------------------------------------------
  /**
   * Counts by event name - `{"move": 118, "ball": 0, "emote": 2, "chat": 1}`.
   *
   * jsonb rather than a column per event for the reason `health_samples.deps`
   * gives: the set of events on this channel changes more often than this table
   * should, and a room recorded before an event existed should read as "did not
   * have one" rather than as a migration.
   */
  sent        jsonb       not null default '{}'::jsonb,
  received    jsonb       not null default '{}'::jsonb,
  /** The two sums, computed by `record_room_perf` so a client cannot disagree
   *  with its own breakdown. Denormalised so the picker needs no jsonb walk. */
  sent_total  int         not null default 0,
  recv_total  int         not null default 0,
  /** People on the channel as this client saw them, excluding itself. Fan-out
   *  is quadratic in this number, so it is what makes a rate interpretable. */
  peers       int         not null default 0,

  -- Render ----------------------------------------------------------------
  /** Frames actually drawn in the window. Zero is legitimate - see hidden_ms. */
  frames        int       not null default 0,
  /**
   * Frame time in milliseconds, at the median and the 95th percentile.
   *
   * Percentiles rather than a mean, because a mean cannot tell the two failures
   * apart: a steady 50fps and a 60fps that hitches average the same and feel
   * completely different. p95 is the hitch.
   *
   * Null when the window drew too few frames to say anything, which is not the
   * same as zero and must not be drawn as a floor.
   */
  frame_p50_ms  double precision,
  frame_p95_ms  double precision,
  /**
   * How much of the window the tab was hidden for.
   *
   * A hidden tab gets no `requestAnimationFrame`, so a sampler that ignored
   * this would record 0fps and an operator would read a backgrounded tab as a
   * broken room. The gap is measured and stored so the page can say "hidden"
   * where it would otherwise draw a zero.
   */
  hidden_ms     int       not null default 0,

  -- Propagation -----------------------------------------------------------
  /** Round trips completed in this window, and the ones nobody echoed. */
  rtt_samples   int       not null default 0,
  rtt_lost      int       not null default 0,
  rtt_p50_ms    double precision,
  rtt_p95_ms    double precision,
  /**
   * What `peer-motion` already knows, for free.
   *
   * The interpolation buffer computes a jitter estimate and an adaptive playout
   * delay for every peer on every packet - that is already "how bad is this
   * peer's link", and it cost nothing to expose. The worst peer rather than the
   * mean, on the same reasoning as p95: the room is as good as the person
   * having the worst time in it.
   */
  link_jitter_ms double precision,
  link_delay_ms  double precision
);

/**
 * Every read narrows to one room and a recent window, or groups the recent
 * window by room. Both start from the time, so it leads.
 */
create index if not exists room_perf_samples_time_idx
  on public.room_perf_samples (sampled_at desc, topic);

alter table public.room_perf_samples enable row level security;

drop policy if exists "room_perf_samples_admin_read" on public.room_perf_samples;

/**
 * Readable by backoffice admins, writable by nobody directly.
 *
 * No insert policy on purpose. Writes go through `record_room_perf()` below,
 * which is where the flag is checked - a table a session could insert into
 * directly would be a table whose flag gate is a client-side suggestion, and
 * this one is written by browsers rather than by a cron job with the service
 * role. Same posture as `health_samples`, reached a different way.
 */
create policy "room_perf_samples_admin_read"
  on public.room_perf_samples for select
  to authenticated
  using (public.is_backoffice_admin());

comment on table public.room_perf_samples is
  'How a live xo room ran, one row per client per window. Written by browsers through record_room_perf() while the perf flag is on; read by /ovaloffice/performance.';

-- ----------------------------------------------------------------------------
-- record_room_perf()
-- ----------------------------------------------------------------------------
-- The write path, and the third place the `perf` flag is read.
--
-- SECURITY DEFINER because it has to check two things the caller cannot see:
-- the flag (`feature_flags` is admin-only) and this table (no insert policy).
-- What crosses the boundary is one row of the caller's own measurements.
--
-- Two refusals, and they are different questions:
--
--   1. Is this caller in this space at all? `tenant_role()` returns NULL for a
--      non-member, and without this check anybody holding a session could write
--      rows against a workspace id they guessed - which would put invented
--      numbers on the page an operator makes decisions from.
--   2. Is collection on for them? Re-checked here rather than trusted from the
--      client, because a tab that was open when an operator switched the flag
--      off is a tab still sampling. Turning it off must stop the *writes*
--      without needing everybody to reload.
--
-- The flag is read *directly* rather than through `resolve_features()`, and
-- that is a performance decision with a measurement behind it. `resolve_features`
-- answers for the whole registry, and its tenant branch calls `tenant_role()`
-- once per flag - about thirty times. Measured at **3.4 seconds** on a local
-- database where a single `tenant_role()` takes 109ms, which is past the
-- statement timeout: every sample was refused, and the refusal looked like a
-- permissions problem. One flag needs one lookup.
--
-- The precedence below is the same three layers `resolve_features` applies, in
-- the same order - user override, then tenant override, then the global default
-- - so the two cannot disagree about this flag. The membership check above is
-- what makes applying the tenant layer safe here, exactly as `tenant_role(...)
-- is not null` does inside the resolver.
--
-- Silent about which of the two refused, and silent to the caller either way -
-- it returns false rather than raising. A room must not fill somebody's console
-- with errors because a flag was turned off underneath them, and a diagnostic
-- that makes noise in the room it is measuring is worse than no diagnostic.
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

grant execute on function public.record_room_perf(
  uuid, text, text, int, text, int, int, boolean, jsonb, jsonb, int, int,
  double precision, double precision, int, int, int, double precision,
  double precision, double precision, double precision
) to authenticated;

-- ----------------------------------------------------------------------------
-- room_perf_rooms()
-- ----------------------------------------------------------------------------
-- Which rooms have been measured lately, and how each one is doing - the list
-- the page's picker is made of.
--
-- The rate arithmetic is the whole reason this is SQL rather than a select the
-- page folds itself, and it is done in two steps on purpose:
--
--   per row     a client's own rate, its counts over its own window
--   per client  that client's average across the rows it wrote
--   per room    the *sum* across clients
--
-- Summing the last step is what makes the number mean something. A room's
-- traffic is what every client in it puts on the wire together, and that is
-- what meets the tenant ceiling; the per-client figure is what tells you
-- whether one person is behaving differently from the rest. Averaging clients
-- into one number would hide both.
--
-- `delivered_hz` is the other half and the one that grows quadratically: every
-- message sent into a room of n is fanned out to the n-1 others, so the work
-- the server does is not the rate anybody's tab is producing. It is measured
-- rather than derived from the room size - a client that is missing packets
-- should show it here rather than have the arithmetic assume it received them.
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

grant execute on function public.room_perf_rooms(int) to authenticated;

-- ----------------------------------------------------------------------------
-- room_perf_prune()
-- ----------------------------------------------------------------------------
-- Retention, on the same reasoning as `health_prune` and with a much shorter
-- keep: this is disposable measurement of something that is only interesting
-- while it is happening or immediately afterwards. A room of eight clients
-- sampling every fifteen seconds writes ~1900 rows an hour, so three days is
-- generous for "it was bad this morning, what did it look like" and small
-- enough that the table never becomes a thing to think about.
--
-- Called from the health sampler's cron rather than getting its own, because
-- one more thing to install on the box is one more thing that can be missing.
create or replace function public.room_perf_prune(p_keep_days int default 3)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  removed bigint;
begin
  if not (public.is_backoffice_admin() or (select auth.role()) = 'service_role') then
    raise exception 'room_perf_prune: not permitted';
  end if;

  delete from public.room_perf_samples
   where sampled_at < now() - make_interval(days => p_keep_days);

  get diagnostics removed = row_count;
  return removed;
end;
$$;

grant execute on function public.room_perf_prune(int) to authenticated;

-- ----------------------------------------------------------------------------
-- The flag
-- ----------------------------------------------------------------------------
-- Seeded off, because a flag that guards new surface must not arrive switched
-- on. Turning it on measures every space's rooms; an override narrows it to one
-- when the question is about one, which `feature_flag_overrides` already gives
-- for free and is why this needed no second mechanism.
--
-- What a *space* chooses is separate and is not a flag: `perf_display`, a space
-- capability, decides whether the people in its rooms are shown their own
-- readings. Measuring and looking at it are two decisions with two owners.
insert into public.feature_flags (key, enabled, label, description) values
  ('perf', false, 'Room performance',
   'Off, nothing in a lounge or battle room measures anything. On, every client in every space samples its own channel, frame rate and round trip and writes them for /ovaloffice/performance - about 5% extra traffic on a busy room''s channel. Add a tenant override to narrow it to one space. Whether players are shown their own readings is a separate per-space switch in Space Settings, not this. Samples already written stay readable when this goes off.')
on conflict (key) do nothing;
