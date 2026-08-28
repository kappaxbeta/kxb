-- ============================================================================
-- Analytics events, and the variant a hit was served
-- ----------------------------------------------------------------------------
-- Two additions, one table and one column, and they answer two questions
-- `page_views` cannot:
--
--   1. "What did people *do*", not just what did they look at. A page view is a
--      good proxy for interest and a bad one for intent: the whole question
--      behind a funnel is which people who saw the door went through it, and a
--      table of paths cannot tell a click on the CTA from a scroll past it.
--
--   2. "Which version were they shown." An A/B test is only a test if the hit
--      and the click both carry the arm they belong to.
--
-- Same posture as `page_views`, deliberately, because the honest thing is that
-- these are more sensitive rather than less - an event says what somebody did,
-- and a sequence of them is a session:
--
--   * Not event-sourced. Nothing folds these into state and no rule depends on
--     the sequence; putting behaviour telemetry in the append-only log would
--     make it permanent, which is the opposite of what it should be.
--   * Cookieless. `visitor_hash` is the same daily-rotating salted hash of
--     address and agent that `page_views` uses, and it is reused rather than
--     re-invented so a funnel can join views to events for one person on one
--     day. It stops being comparable at midnight, on purpose - see below.
--   * The raw address is never stored, here or there.
--
-- ----------------------------------------------------------------------------
-- Why the visitor hash still rotates daily
-- ----------------------------------------------------------------------------
-- Counting "how many distinct people" over a *week* would want a hash that
-- lasts a week, and that is exactly the change this migration does not make.
-- A stable identifier joining every action somebody took across days is a
-- behavioural profile, cookie or no cookie, and the banner on the site promises
-- essential cookies only on the grounds that we are not building one.
--
-- So the window is a day, and every "unique visitors" number downstream is
-- unique-per-day summed - which slightly over-counts anybody who came back on
-- Tuesday. That over-count is the price of the promise and should be stated
-- wherever the number is displayed rather than quietly fixed by widening the
-- window.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The variant a hit was served
-- ----------------------------------------------------------------------------
-- Namespaced `experiment:arm`, the same trick `?src=` plays with
-- `referrer_host`: a bare `dusk` sitting in a column is a value nobody can
-- attribute six months later, and a colon cannot occur in either half.
--
-- Nullable, and null is the ordinary case - every page that is not under test
-- writes nothing here.
alter table public.page_views
  add column if not exists variant text;

-- The A/B report asks one question: for a window, group by variant. Partial,
-- because the overwhelming majority of rows have no variant and there is no
-- reason to carry them in an index that only ever filters them out.
create index if not exists page_views_variant_idx
  on public.page_views (occurred_at desc, variant)
  where variant is not null;

-- ----------------------------------------------------------------------------
-- Events
-- ----------------------------------------------------------------------------
create table if not exists public.analytics_events (
  id            bigint      generated always as identity primary key,
  occurred_at   timestamptz not null default now(),
  /**
   * What happened, as a slug from a fixed vocabulary.
   *
   * Checked in the domain against a registry rather than accepted as free text
   * - see `domain/analytics/events.ts`. Free event names are how an events
   * table becomes unqueryable within a month: `cta_click`, `ctaClick` and
   * `cta-click` are three rows for one thing, and the funnel that counts two of
   * them is wrong in a way nobody notices.
   */
  name          text        not null,
  /** Where it happened. Path only, no query string - same rule as page_views. */
  path          text        not null,
  /** The A/B arm this happened under, `experiment:arm`, or null. */
  variant       text,
  /** Unreversible, and only stable within one UTC day. See the header. */
  visitor_hash  text        not null,
  /** Set when the actor had a session; null for the public site. */
  user_id       uuid        references auth.users (id) on delete set null,
  /**
   * A little structured context, or nothing.
   *
   * Capped hard in the domain: a handful of short keys with short scalar
   * values. It exists so `cta_click` can say *which* CTA without needing a
   * separate event name per button, and explicitly not so that a page can post
   * a blob of session state into the analytics table.
   */
  props         jsonb       not null default '{}'::jsonb
);

-- Every question is "the last N days, grouped by something", so the window
-- leads and the grouping follows - the same shape page_views' indexes take.
create index if not exists analytics_events_occurred_at_idx
  on public.analytics_events (occurred_at desc);
create index if not exists analytics_events_name_idx
  on public.analytics_events (occurred_at desc, name);
create index if not exists analytics_events_variant_idx
  on public.analytics_events (occurred_at desc, variant)
  where variant is not null;
-- The funnel's own join: everything one visitor did, in order, within a day.
create index if not exists analytics_events_visitor_idx
  on public.analytics_events (visitor_hash, occurred_at);

alter table public.analytics_events enable row level security;

-- Readable by backoffice admins, writable by nobody with a session. Inserts
-- come from the service role in the beacon endpoint, which is what keeps a
-- client from stuffing the table with invented events under someone else's id.
create policy "analytics_events_select_admin"
  on public.analytics_events for select
  to authenticated
  using (public.is_backoffice_admin());
