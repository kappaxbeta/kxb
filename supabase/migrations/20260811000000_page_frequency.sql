-- ============================================================================
-- Page frequency, and what a typical space looks like
-- ----------------------------------------------------------------------------
-- Two more reads, both of them things the summary panels cannot do because
-- they are capped lists.
--
-- 1. `page_frequency()` - every path, with how often it was opened in the last
--    day, week, month and year side by side. The traffic tab's top-30 answers
--    "what is busiest"; this answers "how often is *this* page opened, and is
--    that going up or down", which needs the buckets next to each other on one
--    row and needs the long tail rather than the head.
--
--    The buckets are nested, not exclusive: a view today is also in the week's
--    count and the year's. That is what lets a row be read straight across -
--    the year column is always the total, and each narrower one is a share of
--    it. Exclusive buckets would make every row require arithmetic to read.
--
-- 2. `space_activity()` - traffic per workspace, with the median of it.
--
--    The median rather than the mean, because one space that somebody is
--    building in all week drags an average clean off the distribution and the
--    resulting "average space" then describes nothing that exists. The median
--    space is a real space.
-- ============================================================================


create or replace function public.page_frequency()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_backoffice_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  with hits as (
    select *
      from public.page_views
     where occurred_at >= now() - interval '365 days'
       and device <> 'bot'
  )
  select jsonb_build_object(
    'paths', coalesce((
      select jsonb_agg(row)
        from (
          select jsonb_build_object(
                   'path',     path,
                   'section',  public.path_template(path),
                   'day',      count(*) filter (where occurred_at >= now() - interval '1 day'),
                   'week',     count(*) filter (where occurred_at >= now() - interval '7 days'),
                   'month',    count(*) filter (where occurred_at >= now() - interval '30 days'),
                   'year',     count(*),
                   'visitors', count(distinct visitor_hash),
                   'lastSeen', max(occurred_at)
                 ) as row
            from hits
           group by path
           order by count(*) desc
           -- Bounded, but far past the point where a list is still a list -
           -- an unbounded jsonb_agg over a year of a busy site is a response
           -- nobody can render and nothing here needs.
           limit 500
        ) t
    ), '[]'::jsonb),
    -- The same, folded to routes. Short enough to always be complete, which is
    -- what makes it the view worth reading first.
    'sections', coalesce((
      select jsonb_agg(row)
        from (
          select jsonb_build_object(
                   'section',  public.path_template(path),
                   'day',      count(*) filter (where occurred_at >= now() - interval '1 day'),
                   'week',     count(*) filter (where occurred_at >= now() - interval '7 days'),
                   'month',    count(*) filter (where occurred_at >= now() - interval '30 days'),
                   'year',     count(*),
                   'visitors', count(distinct visitor_hash),
                   'lastSeen', max(occurred_at)
                 ) as row
            from hits
           group by public.path_template(path)
           order by count(*) desc
           limit 200
        ) t
    ), '[]'::jsonb),
    -- How many rows the 500 above left out, so a truncated table says so.
    'distinctPaths', (select count(distinct path) from hits)
  ) into result;

  return result;
end;
$$;


-- ----------------------------------------------------------------------------
-- Per-space traffic, and the median space
-- ----------------------------------------------------------------------------
-- The slug is the third segment of `/t/acme/...`, which is where it is for
-- every workspace route - the same assumption `path_template()` makes, and if
-- one ever moves they both want changing.
-- ----------------------------------------------------------------------------

create or replace function public.space_activity(days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since       timestamptz;
  window_days integer;
  result      jsonb;
begin
  if not public.is_backoffice_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  window_days := least(greatest(coalesce(days, 30), 1), 365);
  since := now() - make_interval(days => window_days);

  with per_space as (
    select
      split_part(path, '/', 3)               as slug,
      count(*)                               as views,
      count(distinct user_id)                as accounts,
      count(distinct visitor_hash)           as visitors,
      max(occurred_at)                       as last_seen
      from public.page_views
     where occurred_at >= since
       and device <> 'bot'
       and path like '/t/%'
       and split_part(path, '/', 3) <> ''
     group by split_part(path, '/', 3)
  )
  select jsonb_build_object(
    'days', window_days,
    'spaces', coalesce((
      select jsonb_agg(row)
        from (
          select jsonb_build_object(
                   'slug',     slug,
                   'views',    views,
                   'accounts', accounts,
                   'visitors', visitors,
                   'lastSeen', last_seen
                 ) as row
            from per_space
           order by views desc
           limit 100
        ) t
    ), '[]'::jsonb),
    -- The typical space. `percentile_cont` interpolates between the two middle
    -- rows on an even count, which is the right answer for a continuous
    -- quantity like a view count.
    'median', (
      select jsonb_build_object(
        'views',    coalesce(percentile_cont(0.5) within group (order by views), 0),
        'accounts', coalesce(percentile_cont(0.5) within group (order by accounts), 0)
      ) from per_space
    ),
    -- Everything under /t/:slug added up, which is the number the median is a
    -- description of the shape of.
    'combined', (
      select jsonb_build_object(
        'spaces',   count(*),
        'views',    coalesce(sum(views), 0),
        -- Summing per-space account counts would count one person once per
        -- space they are in, so the distinct is taken over the window again.
        'accounts', (
          select count(distinct user_id)
            from public.page_views
           where occurred_at >= since
             and device <> 'bot'
             and path like '/t/%'
             and user_id is not null
        )
      ) from per_space
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.page_frequency() from public;
revoke all on function public.space_activity(integer) from public;
grant execute on function public.page_frequency() to authenticated;
grant execute on function public.space_activity(integer) to authenticated;
