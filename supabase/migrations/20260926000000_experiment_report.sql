-- ============================================================================
-- The A/B report
-- ----------------------------------------------------------------------------
-- One function, one shape, for the question an experiment exists to answer: of
-- the visits that saw each arm, what share went on to do the thing.
--
-- ----------------------------------------------------------------------------
-- "Visitors" here means visitors-per-day, summed
-- ----------------------------------------------------------------------------
-- `visitor_hash` is a *daily-rotating* salted hash - see the page_views
-- migration - so two rows from the same person on two days are two different
-- hashes and there is no way to tell they are one person. That is deliberate
-- and is not worked around here.
--
-- So `visitors` counts distinct (day, hash) pairs, which is exactly "unique
-- visitors per day, added up". Somebody who came on Monday and Tuesday counts
-- twice. That over-count is the price of not building a cross-day profile, and
-- every surface that renders this number has to say so rather than let a reader
-- assume it means people.
--
-- Rates are computed against `views` rather than `visitors` for the same
-- reason: a view is a well-defined denominator and a summed-daily-distinct is
-- not one anybody can reason about.
-- ============================================================================

create or replace function public.experiment_report(days int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with window_bounds as (
    select now() - make_interval(days => greatest(days, 1)) as since
  ),

  -- Every view that carried an arm, split into experiment and arm. `split_part`
  -- rather than a regex: the format is fixed at `experiment:arm` by
  -- `variantKey`, and anything that is not that shape was dropped before it was
  -- ever written.
  views as (
    select
      split_part(variant, ':', 1) as experiment,
      split_part(variant, ':', 2) as arm,
      occurred_at::date            as day,
      visitor_hash
    from public.page_views, window_bounds
    where variant is not null
      and occurred_at >= window_bounds.since
  ),

  view_totals as (
    select
      experiment,
      arm,
      count(*)                                  as views,
      count(distinct (day, visitor_hash))       as visitors
    from views
    group by experiment, arm
  ),

  -- Events under each arm, by name. A funnel is not computed here: this answers
  -- "how many `cta_click`s did arm B get", which is the comparison an
  -- experiment is decided on, and leaves ordered journeys to the funnel report.
  event_totals as (
    select
      split_part(variant, ':', 1) as experiment,
      split_part(variant, ':', 2) as arm,
      name,
      count(*)                    as count,
      count(distinct (occurred_at::date, visitor_hash)) as visitors
    from public.analytics_events, window_bounds
    where variant is not null
      and occurred_at >= window_bounds.since
    group by 1, 2, 3
  )

  select coalesce(
    jsonb_object_agg(experiment, arms),
    '{}'::jsonb
  )
  from (
    select
      v.experiment,
      jsonb_object_agg(
        v.arm,
        jsonb_build_object(
          'views', v.views,
          'visitors', v.visitors,
          'events', coalesce(
            (
              select jsonb_object_agg(
                e.name,
                jsonb_build_object('count', e.count, 'visitors', e.visitors)
              )
              from event_totals e
              where e.experiment = v.experiment and e.arm = v.arm
            ),
            '{}'::jsonb
          )
        )
      ) as arms
    from view_totals v
    group by v.experiment
  ) grouped;
$$;

-- Admins only. `security definer` is what lets the function read tables whose
-- RLS admits nobody without a backoffice role, so the check has to be inside
-- rather than left to the caller's policies.
revoke execute on function public.experiment_report(int) from public, anon, authenticated;

create or replace function public.experiment_report_admin(days int default 30)
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
  return public.experiment_report(days);
end;
$$;

grant execute on function public.experiment_report_admin(int) to authenticated;
