-- ============================================================================
-- Error reports
-- ----------------------------------------------------------------------------
-- What broke, where, and for whom.
--
-- Deliberately not event-sourced, for the same reason as `contact_messages` and
-- `page_views`: a crash is not a decision anybody made about a thing the app
-- owns, nothing folds it into state, and no rule depends on the order two of
-- them arrived in. It is platform plumbing, belonging to nobody's workspace.
--
-- The problem this solves is that the only record of a production failure was
-- `docker logs`, on whichever of two replicas happened to serve the request.
-- A digest printed to stdout on one container and shown to the person on the
-- other is not a trail anybody can follow.
--
-- Rows arrive from three places, and `source` says which:
--   server     - instrumentation.ts onRequestError, the render/action/route
--                that threw. Carries the digest Next showed the visitor.
--   client     - the error boundary in the browser, reporting itself.
--   not-found  - somebody landing on a 404 from a route that rendered, which
--                in this app usually means requireTenant() or requireFeature()
--                refusing them. Not an error, but a member who cannot reach
--                their own workspace looks the same from the outside, and a 404
--                nobody can explain is worth the same look. A URL matching no
--                route at all is not recorded - see report-crash.tsx.
-- ============================================================================

create table if not exists public.error_reports (
  id          uuid        primary key default gen_random_uuid(),
  /**
   * What makes two crashes the same crash.
   *
   * Next's digest when there is one - it is already a hash of the error and is
   * stable across replicas - and otherwise a hash of the source, the route and
   * the message with its variable parts rubbed out. See fingerprint.ts, which
   * is where that decision actually lives; this column only stores it.
   */
  fingerprint text        not null,
  /** Next's own identifier, and the one thing that joins a row to `docker logs`. */
  digest      text,
  message     text        not null,
  stack       text,
  source      text        not null
                check (source in ('server', 'client', 'not-found')),
  /** The route *file*, e.g. /t/[slug]/lounge. Null when only the URL is known. */
  route       text,
  /** The URL path it happened on. */
  path        text,
  method      text,
  status      text        not null default 'open'
                check (status in ('open', 'resolved')),
  /**
   * Who hit it, when that is knowable.
   *
   * Null for every `server` row, and that is a limitation rather than an
   * oversight: onRequestError runs outside the request's React context, so
   * there is no session client to ask, and decoding the auth cookie by hand
   * would mean trusting an unverified JWT to label a diagnostic. The `client`
   * and `not-found` rows come through a Server Action and do carry it.
   */
  user_id     uuid        references auth.users (id) on delete set null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid        references auth.users (id) on delete set null
);

-- The list is always "the newest of one status", so the status leads.
create index if not exists error_reports_status_idx
  on public.error_reports (status, created_at desc);

-- Grouping, and the throttle in the reporting action - both ask about one
-- fingerprint over a recent window.
create index if not exists error_reports_fingerprint_idx
  on public.error_reports (fingerprint, created_at desc);

alter table public.error_reports enable row level security;

-- Readable and resolvable by backoffice admins, writable by nobody holding a
-- session key. Inserts go through the service role, the same shape as
-- `contact_messages`: an anon-insert policy on a table with free text columns
-- is a spam sink with no throttle in front of it, and the action is that
-- throttle.
create policy "error_reports_admin_all"
  on public.error_reports for all
  to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

-- ----------------------------------------------------------------------------
-- One row per crash, not per occurrence
-- ----------------------------------------------------------------------------
-- The backoffice wants "what is broken", and a page that lists the same
-- failure four hundred times answers a different question. So the aggregation
-- happens here rather than by pulling every row into Node and reducing it -
-- the interesting case is precisely the one where there are too many rows to
-- want in memory.
--
-- Security invoker on purpose. It is called with the service role, which
-- bypasses RLS anyway; leaving it invoker means that if anybody else ever calls
-- it, the policy above answers, rather than a definer function handing out the
-- whole table to whoever guessed its name.
create or replace function public.error_report_groups(
  p_status text default 'open',
  p_limit  int  default 50
)
returns table (
  fingerprint text,
  occurrences bigint,
  affected    bigint,
  open_count  bigint,
  first_seen  timestamptz,
  last_seen   timestamptz,
  message     text,
  source      text,
  route       text,
  path        text,
  digest      text,
  stack       text
)
language sql
stable
set search_path = public
as $$
  with scoped as (
    select *
    from public.error_reports r
    where p_status = 'all' or r.status = p_status
  )
  select
    s.fingerprint,
    count(*)                                  as occurrences,
    count(distinct s.user_id)                 as affected,
    count(*) filter (where s.status = 'open') as open_count,
    min(s.created_at)                         as first_seen,
    max(s.created_at)                         as last_seen,
    /**
     * The best row's version of each field, not the newest row's.
     *
     * One crash usually writes two rows - the server's, and the browser's
     * report of the same digest - and the browser's is the one that arrives
     * last. Taking the newest would therefore mean the list showed the client's
     * account of every server error, which in production is the *generic*
     * message: React strips the real text before it reaches the browser
     * precisely so a database error cannot land on a stranger's screen. The
     * group would read "An error occurred in the Server Components render" for
     * every distinct bug, with no route attached.
     *
     * So the server's message wins where there is one, and the rest fall back
     * to the newest row that actually has a value. Within one source, newest
     * still wins - a stack that moved with a deploy should read as where the
     * code is now.
     */
    coalesce(
      (array_agg(s.message order by s.created_at desc)
        filter (where s.source = 'server'))[1],
      (array_agg(s.message order by s.created_at desc))[1]
    ) as message,
    -- Where it came from, most authoritative first. A group with a server row
    -- in it is a server error, however many browsers went on to notice.
    case
      when bool_or(s.source = 'server') then 'server'
      when bool_or(s.source = 'client') then 'client'
      else 'not-found'
    end as source,
    (array_agg(s.route  order by s.created_at desc)
      filter (where s.route is not null))[1]  as route,
    (array_agg(s.path   order by s.created_at desc)
      filter (where s.path is not null))[1]   as path,
    (array_agg(s.digest order by s.created_at desc)
      filter (where s.digest is not null))[1] as digest,
    coalesce(
      (array_agg(s.stack order by s.created_at desc)
        filter (where s.source = 'server' and s.stack is not null))[1],
      (array_agg(s.stack order by s.created_at desc)
        filter (where s.stack is not null))[1]
    ) as stack
  from scoped s
  group by s.fingerprint
  order by max(s.created_at) desc
  limit p_limit
$$;

grant execute on function public.error_report_groups(text, int) to authenticated;
