-- ============================================================================
-- page_view_report()
-- ----------------------------------------------------------------------------
-- The one query behind the analytics tab.
--
-- This is the exception to "everything except the append runs in TypeScript",
-- and the reason is arithmetic rather than taste: PostgREST caps a response at
-- `max_rows` (1,000), so folding a month of traffic in TypeScript would mean
-- paging every hit across the wire to count them. Aggregation is the one thing
-- the database is unambiguously better at, and a count is not a domain
-- decision - there is no rule here that anyone could want to unit test.
--
-- Bots are counted separately and excluded from everything else. A crawler is
-- traffic, but it is not a visitor, and mixing the two makes the busiest page
-- on the site whichever one a spider likes best.
--
-- SECURITY DEFINER so the guard is inside the function: it is the only way in,
-- and it asks the same is_backoffice_admin() question the table's policy does.
-- ============================================================================

create or replace function public.page_view_report(days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  since timestamptz;
  window_days integer;
  result jsonb;
begin
  if not public.is_backoffice_admin() then
    raise exception 'not authorised' using errcode = '42501';
  end if;

  -- Clamped rather than trusted: the caller picks the window from a fixed set
  -- of buttons, but the argument arrives over the wire like any other.
  window_days := least(greatest(coalesce(days, 30), 1), 365);
  since := now() - make_interval(days => window_days);

  with hits as (
    select *
      from public.page_views
     where occurred_at >= since
  ),
  humans as (
    select * from hits where device <> 'bot'
  )
  select jsonb_build_object(
    'days', window_days,
    'totals', (
      select jsonb_build_object(
        'views', count(*),
        'visitors', count(distinct visitor_hash),
        'signedIn', count(*) filter (where user_id is not null),
        'bots', (select count(*) from hits where device = 'bot')
      ) from humans
    ),
    -- Which pages they open.
    'pages', coalesce((
      select jsonb_agg(row)
        from (
          select jsonb_build_object(
                   'path', path,
                   'views', count(*),
                   'visitors', count(distinct visitor_hash)
                 ) as row
            from humans
           group by path
           order by count(*) desc
           limit 30
        ) t
    ), '[]'::jsonb),
    -- Where they came from. NULL referrer is a direct hit, which is a source
    -- like any other and is named rather than dropped.
    'sources', coalesce((
      select jsonb_agg(row)
        from (
          select jsonb_build_object(
                   'source', coalesce(referrer_host, 'direct'),
                   'views', count(*),
                   'visitors', count(distinct visitor_hash)
                 ) as row
            from humans
           group by coalesce(referrer_host, 'direct')
           order by count(*) desc
           limit 20
        ) t
    ), '[]'::jsonb),
    -- Where they are. Unknown is kept as its own bucket: a report that silently
    -- drops the rows it could not place makes the total stop adding up.
    'countries', coalesce((
      select jsonb_agg(row)
        from (
          select jsonb_build_object(
                   'country', coalesce(country, 'unknown'),
                   'language', mode() within group (order by language),
                   'views', count(*),
                   'visitors', count(distinct visitor_hash)
                 ) as row
            from humans
           group by coalesce(country, 'unknown')
           order by count(*) desc
           limit 20
        ) t
    ), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(row)
        from (
          select jsonb_build_object(
                   'device', device,
                   'views', count(*),
                   'visitors', count(distinct visitor_hash)
                 ) as row
            from humans
           group by device
           order by count(*) desc
        ) t
    ), '[]'::jsonb),
    -- One row per day in the window, including the quiet ones: a chart with the
    -- empty days missing draws a busy week where there was none.
    'daily', coalesce((
      select jsonb_agg(row order by day)
        from (
          select jsonb_build_object(
                   'day', to_char(d.day, 'YYYY-MM-DD'),
                   'views', count(h.id),
                   'visitors', count(distinct h.visitor_hash)
                 ) as row,
                 d.day
            from generate_series(
                   date_trunc('day', since),
                   date_trunc('day', now()),
                   interval '1 day'
                 ) as d(day)
            left join humans h
              on date_trunc('day', h.occurred_at) = d.day
           group by d.day
        ) t
    ), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(row)
        from (
          select jsonb_build_object(
                   'at', occurred_at,
                   'path', path,
                   'source', coalesce(referrer_host, 'direct'),
                   'country', country,
                   'device', device,
                   'signedIn', user_id is not null
                 ) as row
            from hits
           order by occurred_at desc
           limit 40
        ) t
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.page_view_report(integer) from public;
grant execute on function public.page_view_report(integer) to authenticated;
