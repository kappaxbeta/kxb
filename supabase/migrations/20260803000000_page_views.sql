-- ============================================================================
-- Page views
-- ----------------------------------------------------------------------------
-- Traffic, not history. This is the one table in the schema that is deliberately
-- *not* event-sourced: a hit is not a decision anybody made, nothing folds it
-- into state, and no rule anywhere depends on the sequence. Putting it in the
-- event log would mean replaying a million rows of noise to answer a question
-- the log was never asked.
--
-- Cookieless on purpose. The banner promises essential cookies only, so nothing
-- here sets one: a visitor is a *daily-rotating salted hash* of their address
-- and user agent, which counts "how many people" without being able to say who,
-- and stops being comparable to yesterday's hash at midnight. The raw address is
-- never stored.
-- ============================================================================

create table if not exists public.page_views (
  id            bigint      generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  /** Path only - never the query string, which is where ids and tokens live. */
  path          text        not null,
  /** The referring host, or NULL for a direct hit. Hosts, not full URLs. */
  referrer_host text,
  /** ISO-3166 alpha-2, when the proxy in front of us knows it. */
  country       text,
  /** Primary language tag, as a weak signal when country is unknown. */
  language      text,
  /** desktop | mobile | tablet | bot */
  device        text        not null default 'desktop',
  /** Unreversible, and only stable within one UTC day. See the header above. */
  visitor_hash  text        not null,
  /** Set when the hit came from a signed-in session; NULL for the public site. */
  user_id       uuid        references auth.users (id) on delete set null
);

-- Every question the backoffice asks is "the last N days, grouped by
-- something", so the window comes first in the index and the grouping follows.
create index if not exists page_views_occurred_at_idx
  on public.page_views (occurred_at desc);
create index if not exists page_views_path_idx
  on public.page_views (occurred_at desc, path);

alter table public.page_views enable row level security;

-- Readable by backoffice admins, writable by nobody with a session. Inserts
-- come from the service role in the track endpoint, which is what keeps a
-- client from stuffing the table with invented hits under someone else's id.
create policy "page_views_select_admin"
  on public.page_views for select
  to authenticated
  using (public.is_backoffice_admin());
