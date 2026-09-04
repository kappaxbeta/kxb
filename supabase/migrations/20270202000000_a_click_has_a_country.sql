-- ============================================================================
-- A click has a country
-- ----------------------------------------------------------------------------
-- `page_views` has carried `country` since the beginning and
-- `analytics_events` never did, which made one perfectly ordinary question
-- unanswerable: *where* were the people who pressed the button. Traffic by
-- country and clicks by country are different facts - the whole point of
-- measuring a call to action is that looking is not the same as acting - and
-- joining the two tables cannot recover it, because the visitor hash rotates at
-- midnight and a country is not stored per visitor anywhere else.
--
-- Same value, same source, same promise as the column on `page_views`: two
-- letters resolved from the request address by `domain/analytics/geo.ts`, which
-- reads a registry table baked into the build. The address itself is still
-- never stored, here or there, and the answer is still a country and nothing
-- finer. Adding this does not make the table more identifying than the one
-- beside it; leaving it off only made the table less useful.
--
-- Nullable, and null stays ordinary: an address the registry table cannot place
-- is a null rather than a guess, and every row written before this migration is
-- a null forever. Any report over this column has to say so rather than let a
-- reader read the nulls as a country with no name.
-- ============================================================================

alter table public.analytics_events
  add column if not exists country text;

-- The one shape the question takes: a window, a name, then group by country.
-- Partial on the name being a CTA click would be narrower still, but a name is
-- one comparison and a second index per event name is how a table ends up with
-- six of them.
create index if not exists analytics_events_country_idx
  on public.analytics_events (occurred_at desc, name, country)
  where country is not null;
