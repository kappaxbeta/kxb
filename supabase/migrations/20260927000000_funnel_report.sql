-- ============================================================================
-- The funnel report
-- ----------------------------------------------------------------------------
-- "Of the people who did the first thing, how many did the second."
--
-- The steps are passed in rather than declared here, as a jsonb array of arrays
-- of event names: `[["cta_click"], ["demo_open"], ["signup_start","demo_join_click"]]`.
-- They live in `domain/analytics/events.ts` beside the vocabulary they are made
-- of, so a funnel cannot name an event that does not exist - and keeping them
-- there rather than in SQL means changing one is a code review rather than a
-- migration.
--
-- A step is satisfied by *any* of its names, which is what lets "asked for an
-- account" mean either of two doors without the funnel growing a branch.
--
-- ----------------------------------------------------------------------------
-- Every funnel is a within-a-day funnel, and that is not a choice
-- ----------------------------------------------------------------------------
-- `visitor_hash` rotates at midnight, so Monday's hash and Tuesday's hash for
-- one person are unrelated strings and nothing can join them. A funnel is a
-- claim about one person doing several things, so the longest window it can
-- honestly span is a day.
--
-- The consequence is real and has to be stated wherever this is rendered:
-- somebody who saw the pricing page on Monday and subscribed on Wednesday is
-- not in the "subscribed" step. Long consideration cycles will read as leaks at
-- whatever step the sleep happens after. This under-counts conversion; it never
-- over-counts it, which is the right direction for a number to be wrong in.
--
-- Order within the day is deliberately not required. Requiring it would mean
-- storing and comparing timestamps per step, and the events here are fired by
-- pages that a person moves between freely - somebody who opens the pricing
-- section, wanders into the demo and comes back to subscribe has done the
-- funnel, in a sequence no ordering rule would accept.
-- ============================================================================

create or replace function public.funnel_report(steps jsonb, days int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select now() - make_interval(days => greatest(days, 1)) as since
  ),

  -- One row per step, zero-indexed, with its names as a text array.
  step_defs as (
    select
      (ordinality - 1)::int as idx,
      array(select jsonb_array_elements_text(value)) as names
    from jsonb_array_elements(steps) with ordinality
  ),

  -- Which steps each (day, visitor) satisfied. Grouped rather than joined so a
  -- visitor who fired the same event nine times counts once.
  hits as (
    select distinct
      e.occurred_at::date as day,
      e.visitor_hash      as visitor,
      s.idx
    from public.analytics_events e
    cross join bounds b
    join step_defs s on e.name = any(s.names)
    where e.occurred_at >= b.since
  ),

  per_visitor as (
    select day, visitor, array_agg(idx) as reached
    from hits
    group by day, visitor
  )

  select coalesce(
    jsonb_agg(
      jsonb_build_object('step', s.idx, 'visitors', c.count)
      order by s.idx
    ),
    '[]'::jsonb
  )
  from step_defs s
  cross join lateral (
    -- A visitor is at step N only if they reached every step up to N. The
    -- containment test is what makes it a funnel rather than a list of totals:
    -- without it, a step further down could show more people than the one above
    -- it, which is the classic broken-funnel chart.
    select count(*) as count
    from per_visitor p
    where p.reached @> (select array_agg(g)::int[] from generate_series(0, s.idx) g)
  ) c;
$$;

revoke execute on function public.funnel_report(jsonb, int) from public, anon, authenticated;

create or replace function public.funnel_report_admin(steps jsonb, days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_backoffice_admin() then
    raise exception 'not permitted';
  end if;
  return public.funnel_report(steps, days);
end;
$$;

grant execute on function public.funnel_report_admin(jsonb, int) to authenticated;
