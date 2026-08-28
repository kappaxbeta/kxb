-- ============================================================================
-- Frecency buckets and account KPIs
-- ----------------------------------------------------------------------------
-- Two additions to what 20260809000000_visitor_profiles.sql already returns.
--
-- 1. `visitor_profile().sections` gains age buckets. "Where are they most" is
--    badly answered by a raw count: a section somebody lived in three weeks ago
--    and has not opened since outranks the one they were in this morning, and
--    the ranking then describes their past rather than their present.
--
--    The fix is frecency - frequency weighted by recency - and the weighting is
--    a judgement call, not arithmetic. So this function does not make it. It
--    returns the counts split by age and `frecency()` in TypeScript applies the
--    weights, where the rule is one readable function with tests around it. The
--    split is four numbers per row either way; nothing is paged over the wire
--    to compute it.
--
-- 2. `visitor_profiles()` gains a `kpis` block: daily, weekly and monthly
--    active accounts, over fixed windows.
--
--    Fixed on purpose, and not affected by the range selector - "monthly active
--    users" means the last 30 days or it means nothing, and an MAU that changes
--    when you click 7d is a number that cannot be compared to last month's.
--
--    These count accounts, never anonymous visitors. A visitor hash rotates at
--    midnight UTC by design, so the same anonymous person on two days is two
--    hashes and any "monthly visitors" built on it would be a count of
--    person-days dressed up as people. Counting only what can honestly be
--    counted is the whole posture of this table.
-- ============================================================================

create or replace function public.visitor_profile(p_user_id uuid, days integer default 30)
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

  if p_user_id is null then
    raise exception 'a profile needs an account' using errcode = '22023';
  end if;

  window_days := least(greatest(coalesce(days, 30), 1), 365);
  since := now() - make_interval(days => window_days);

  with hits as (
    select *
      from public.page_views
     where occurred_at >= since
       and user_id = p_user_id
       and device <> 'bot'
  )
  select jsonb_build_object(
    'days', window_days,
    'userId', p_user_id,
    'username', (select username from public.user_profiles where user_id = p_user_id),
    'totals', (
      select jsonb_build_object(
        'views',      count(*),
        'activeDays', count(distinct date_trunc('day', occurred_at)),
        'firstSeen',  min(occurred_at),
        'lastSeen',   max(occurred_at)
      ) from hits
    ),
    -- Ordered by plain count here; the frecency ranking is applied in
    -- TypeScript, and 25 rows is a list, not a page of them. The cut is by
    -- count because a section with one view a month ago cannot outrank the top
    -- 25 by any weighting that is not perverse.
    'sections', coalesce((
      select jsonb_agg(row)
        from (
          select jsonb_build_object(
                   'section',  public.path_template(path),
                   'views',    count(*),
                   -- The three buckets frecency() weights. Nested, not
                   -- exclusive: today's views are also in the week's.
                   'today',    count(*) filter (where occurred_at >= now() - interval '1 day'),
                   'thisWeek', count(*) filter (where occurred_at >= now() - interval '7 days'),
                   'thisMonth',count(*) filter (where occurred_at >= now() - interval '30 days'),
                   'lastSeen', max(occurred_at)
                 ) as row
            from hits
           group by public.path_template(path)
           order by count(*) desc
           limit 25
        ) t
    ), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(row)
        from (
          select jsonb_build_object('path', path, 'views', count(*)) as row
            from hits
           group by path
           order by count(*) desc
           limit 25
        ) t
    ), '[]'::jsonb),
    'hours', coalesce((
      select jsonb_agg(row order by hour)
        from (
          select jsonb_build_object(
                   'hour',  h.hour,
                   'views', count(x.id)
                 ) as row,
                 h.hour
            from generate_series(0, 23) as h(hour)
            left join hits x
              on extract(hour from x.occurred_at at time zone 'UTC') = h.hour
           group by h.hour
        ) t
    ), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(row order by day)
        from (
          select jsonb_build_object(
                   'day',   to_char(d.day, 'YYYY-MM-DD'),
                   'views', count(x.id)
                 ) as row,
                 d.day
            from generate_series(
                   date_trunc('day', since),
                   date_trunc('day', now()),
                   interval '1 day'
                 ) as d(day)
            left join hits x on date_trunc('day', x.occurred_at) = d.day
           group by d.day
        ) t
    ), '[]'::jsonb),
    'countries', coalesce((
      select jsonb_agg(row)
        from (
          select jsonb_build_object(
                   'country', coalesce(country, 'unknown'),
                   'views',   count(*)
                 ) as row
            from hits
           group by coalesce(country, 'unknown')
           order by count(*) desc
           limit 10
        ) t
    ), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(row)
        from (
          select jsonb_build_object('device', device, 'views', count(*)) as row
            from hits
           group by device
           order by count(*) desc
        ) t
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;


-- ----------------------------------------------------------------------------
-- The list, now with the numbers above it
-- ----------------------------------------------------------------------------

create or replace function public.visitor_profiles(days integer default 30)
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

  with hits as (
    select *
      from public.page_views
     where occurred_at >= since
       and user_id is not null
       and device <> 'bot'
  ),
  per_user as (
    select
      user_id,
      count(*)                                            as views,
      count(distinct date_trunc('day', occurred_at))      as active_days,
      min(occurred_at)                                    as first_seen,
      max(occurred_at)                                    as last_seen,
      mode() within group (order by public.path_template(path)) as top_section,
      mode() within group (order by device)               as device,
      mode() within group (order by country)              as country
      from hits
     group by user_id
  ),
  -- Fixed windows, independent of the selector above them. Read from the table
  -- directly rather than from `hits`, which is only as wide as the selection.
  active as (
    select
      count(distinct user_id) filter (where occurred_at >= now() - interval '1 day')   as dau,
      count(distinct user_id) filter (where occurred_at >= now() - interval '7 days')  as wau,
      count(distinct user_id) filter (where occurred_at >= now() - interval '30 days') as mau
      from public.page_views
     where occurred_at >= now() - interval '30 days'
       and user_id is not null
       and device <> 'bot'
  )
  select jsonb_build_object(
    'days', window_days,
    'accounts', coalesce((
      select jsonb_agg(row)
        from (
          select jsonb_build_object(
                   'userId',     u.user_id,
                   'username',   p.username,
                   'views',      u.views,
                   'activeDays', u.active_days,
                   'firstSeen',  u.first_seen,
                   'lastSeen',   u.last_seen,
                   'topSection', u.top_section,
                   'device',     u.device,
                   'country',    u.country
                 ) as row
            from per_user u
            left join public.user_profiles p on p.user_id = u.user_id
           order by u.active_days desc, u.views desc
           limit 100
        ) t
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
        'accounts', count(*),
        'views',    coalesce(sum(views), 0)
      ) from per_user
    ),
    'kpis', (
      select jsonb_build_object(
        'dau', a.dau,
        'wau', a.wau,
        'mau', a.mau,
        -- New in the last 30 days: an account whose *first ever* hit falls in
        -- the window, which is a question the window itself cannot answer -
        -- hence the separate scan of the whole table.
        'newThisMonth', (
          select count(*)
            from (
              select user_id, min(occurred_at) as first_ever
                from public.page_views
               where user_id is not null and device <> 'bot'
               group by user_id
            ) f
           where f.first_ever >= now() - interval '30 days'
        ),
        -- Everyone who has ever been seen, as the denominator for the above.
        'everSeen', (
          select count(distinct user_id)
            from public.page_views
           where user_id is not null and device <> 'bot'
        )
      ) from active a
    )
  ) into result;

  return result;
end;
$$;
