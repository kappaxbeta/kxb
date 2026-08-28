-- ============================================================================
-- Visitor profiles
-- ----------------------------------------------------------------------------
-- Two questions the traffic report cannot answer, because it only ever groups:
-- "who keeps coming back" and "what does this person actually use".
--
-- Both are asked of signed-in accounts only, and that is a limit of the data
-- rather than a decision taken here. `visitor_hash` rotates at midnight UTC by
-- design (see 20260803000000_page_views.sql), so an anonymous visitor cannot be
-- recognised tomorrow and there is nothing to profile. `user_id` is set when a
-- session was signed in, and that is the whole population these functions see.
--
-- What they still cannot show: an address, a hash, or anything that would let
-- one account's history be reconstructed from another's. A profile here is the
-- account's own page views, which the account itself performed.
--
-- SECURITY DEFINER with the same guard as page_view_report(), for the same
-- reason - the function is the only way in, so the check belongs inside it.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Collapsing a path to the route that produced it
-- ----------------------------------------------------------------------------
-- Every meaningful surface in this app lives under a tenant slug, so the raw
-- paths are `/t/acme/lounge`, `/t/beta/lounge`, `/t/acme/pages/41`... and a
-- ranked list of those answers "which workspace is busy", never "which part of
-- the product gets used". Folding the variable segments out is what turns a
-- page list into a feature list.
--
-- Kept as a separate immutable function rather than inlined, because it is used
-- by both functions below and is the sort of thing that will want a new rule
-- the next time a route with an id in it is added.
-- ----------------------------------------------------------------------------

create or replace function public.path_template(p_path text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when p_path is null then null
    else
      regexp_replace(
        regexp_replace(
          -- Tenant and vanity slugs are the first segment's argument.
          regexp_replace(p_path, '^/(t|v)/[^/]+', '/\1/:slug'),
          -- Anything shaped like a UUID is an id, wherever it sits.
          '/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
          '/:id',
          'g'
        ),
        -- So is a bare number.
        '/\d+',
        '/:id',
        'g'
      )
  end;
$$;


-- ----------------------------------------------------------------------------
-- Who to profile
-- ----------------------------------------------------------------------------
-- The list behind the Profiles tab: every account seen in the window, busiest
-- first. `active_days` leads the ordering rather than raw views, because ten
-- visits on ten days is a habit and ten visits in one afternoon is a session.
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
    -- The population the list is drawn from, so the page can say how much of
    -- the traffic it is actually describing.
    'totals', (
      select jsonb_build_object(
        'accounts', count(*),
        'views',    coalesce(sum(views), 0)
      ) from per_user
    )
  ) into result;

  return result;
end;
$$;


-- ----------------------------------------------------------------------------
-- One account, in detail
-- ----------------------------------------------------------------------------
-- `sections` is the answer to "where are they most" - the same fold as above,
-- ranked. `hours` is the shape of their day: 24 buckets in UTC, which is a
-- weak timezone signal in its own right and the honest one to store, since the
-- browser never told us theirs.
-- ----------------------------------------------------------------------------

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
    -- Where they are most. Folded to the route, so the workspace they were in
    -- does not split one habit across five rows.
    'sections', coalesce((
      select jsonb_agg(row)
        from (
          select jsonb_build_object(
                   'section',  public.path_template(path),
                   'views',    count(*),
                   'lastSeen', max(occurred_at)
                 ) as row
            from hits
           group by public.path_template(path)
           order by count(*) desc
           limit 25
        ) t
    ), '[]'::jsonb),
    -- The exact paths behind that, for when the fold hides the thing you were
    -- looking for - which workspace, which page.
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
    -- 24 buckets, always all 24: a histogram with the quiet hours missing
    -- draws a person who only exists in the afternoon.
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
-- Sections in the traffic report
-- ----------------------------------------------------------------------------
-- The same fold, applied to everybody: page_view_report() gains a `sections`
-- key beside its existing `pages`. Both are kept - "/t/acme/lounge is the
-- busiest page" and "the lounge is the busiest feature" are different
-- questions and the tab now shows both.
--
-- Restated in full rather than patched, because CREATE OR REPLACE FUNCTION
-- takes the whole body; everything outside the new block is as it was in
-- 20260803010000_page_view_report.sql.
-- ----------------------------------------------------------------------------

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
        'bots', (select count(*) from hits where device = 'bot'),
        -- How many distinct accounts are behind those signed-in views, which
        -- is the number the profiles tab is a list of.
        'accounts', count(distinct user_id)
      ) from humans
    ),
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
    -- Which parts of the product, as opposed to which URLs.
    'sections', coalesce((
      select jsonb_agg(row)
        from (
          select jsonb_build_object(
                   'section', public.path_template(path),
                   'views', count(*),
                   'visitors', count(distinct visitor_hash)
                 ) as row
            from humans
           group by public.path_template(path)
           order by count(*) desc
           limit 30
        ) t
    ), '[]'::jsonb),
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


-- The profile queries filter by account inside the window, which the
-- occurred_at-only index makes a scan of every hit in it.
create index if not exists page_views_user_idx
  on public.page_views (user_id, occurred_at desc)
  where user_id is not null;

revoke all on function public.visitor_profiles(integer) from public;
revoke all on function public.visitor_profile(uuid, integer) from public;
grant execute on function public.visitor_profiles(integer) to authenticated;
grant execute on function public.visitor_profile(uuid, integer) to authenticated;
