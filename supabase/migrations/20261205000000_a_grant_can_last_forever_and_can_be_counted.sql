-- ============================================================================
-- A grant with no end, and a grant that covers only so many spaces
-- ----------------------------------------------------------------------------
-- Two things the backoffice could not say, asked for together: *for some time
-- or always*, and *how many*.
--
-- ----------------------------------------------------------------------------
-- Forever is NULL, not a date a long way off
-- ----------------------------------------------------------------------------
-- The tempting version is `free_days = 36500` and a check widened to match: no
-- reader changes, because every one of them already asks `granted_until >
-- now()` and a date in 2126 answers yes. It was rejected because it is a lie
-- the database then repeats - every screen would print "until 3 March 2126",
-- every report would count it as expiring, and the day somebody asks "which
-- accounts are comped permanently" the answer is a magic number nobody wrote
-- down.
--
-- So `granted_until` becomes nullable and NULL means *no end*, which is what
-- NULL already means in `promo_codes.expires_at` two tables over. The cost is
-- exactly the six places that compare it, and they are all in this file: a
-- comparison against NULL is NULL, which is not true, so an unamended reader
-- would silently treat a permanent grant as an expired one - the failure that
-- would have been found by a customer rather than by a test.
--
-- ----------------------------------------------------------------------------
-- How many spaces, and which ones
-- ----------------------------------------------------------------------------
-- A grant is held by an *account* and `tenant_tier()` hands it to every space
-- that account owns. That is right for a comp of one space and wrong for an
-- operator who wants to put somebody's team space on xp without covering the
-- four side projects they also own.
--
-- `granted_spaces` is that number, NULL meaning "all of them" - so every row
-- written before today keeps behaving exactly as it did, and the new field is
-- opt-in rather than a default that quietly narrows old grants.
--
-- **Which** spaces is the part that needs deciding rather than discovering, and
-- the rule is: the ones they have owned longest, `joined_at` first and the id
-- to break a tie. Two properties earn it. It is stable - making a sixth space
-- cannot take the grant off the five that had it, which "the newest" would do
-- and would look exactly like the grant randomly failing. And it is
-- explainable in one sentence to the person who asks why their new space is on
-- free, which is the only test of a rule like this that matters.
--
-- The alternative - letting the operator name the spaces - is a better feature
-- and a much larger one: it needs the grant to know about tenants, a picker
-- that can search somebody else's spaces, and an answer for what happens when
-- one is deleted. A number is what was asked for.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The columns
-- ----------------------------------------------------------------------------

alter table public.promo_codes
  alter column free_days drop not null;

alter table public.promo_codes
  drop constraint if exists promo_codes_free_days_check;

alter table public.promo_codes
  add constraint promo_codes_free_days_check
  check (free_days is null or free_days between 1 and 365);

comment on column public.promo_codes.free_days is
  'How many days this code grants, or NULL for a grant with no end.';

alter table public.promo_codes
  add column if not exists spaces integer
  check (spaces is null or spaces >= 1);

comment on column public.promo_codes.spaces is
  'How many of the holder''s spaces this covers, oldest first, or NULL for all of them.';

alter table public.promo_redemptions
  alter column granted_days  drop not null,
  alter column granted_until drop not null;

comment on column public.promo_redemptions.granted_until is
  'When this grant ends, or NULL for never. Every liveness check has to spell that out.';

alter table public.promo_redemptions
  add column if not exists granted_spaces integer
  check (granted_spaces is null or granted_spaces >= 1);

comment on column public.promo_redemptions.granted_spaces is
  'Copied from the code, like granted_days: what was granted, not what the code says today.';

-- ----------------------------------------------------------------------------
-- 2. Redeeming, with an end that may not exist
-- ----------------------------------------------------------------------------
-- Byte for byte the function from 20260923000000_tiers.sql, with two lines
-- changed: the interval is only added when there is one to add, and the space
-- count is copied onto the redemption the same way the day count always was.
-- Every refusal and every race guarantee is unchanged - see that migration.
-- ----------------------------------------------------------------------------

create or replace function public.redeem_promo_code(
  p_code      text,
  p_user_id   uuid,
  p_source    text default 'link',
  p_tenant_id uuid  default null,
  p_campaign  text  default null
)
returns table (outcome text, granted_until timestamptz, code_id uuid, granted_tier text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code   public.promo_codes%rowtype;
  v_until  timestamptz;
begin
  select * into v_code
    from public.promo_codes
   where code = upper(btrim(p_code))
   for update;

  if not found then
    return query select 'unknown'::text, null::timestamptz, null::uuid, null::text;
    return;
  end if;

  if v_code.revoked_at is not null
     or (v_code.starts_at  is not null and v_code.starts_at  > now())
     or (v_code.expires_at is not null and v_code.expires_at <= now())
     or (v_code.max_uses   is not null and v_code.uses >= v_code.max_uses)
  then
    return query select 'inactive'::text, null::timestamptz, v_code.id, null::text;
    return;
  end if;

  if exists (
    select 1
      from public.promo_redemptions r
     where r.user_id = p_user_id
       and r.granted_tier = v_code.tier
  ) then
    return query select 'already'::text, null::timestamptz, v_code.id, null::text;
    return;
  end if;

  if public.account_has_had_tier(p_user_id, v_code.tier) then
    return query select 'not_new'::text, null::timestamptz, v_code.id, null::text;
    return;
  end if;

  -- NULL days is NULL until, which is what a permanent grant looks like all the
  -- way down. `make_interval(days => null)` would return NULL anyway; it is
  -- written out so the intent survives somebody reading only this line.
  v_until := case
               when v_code.free_days is null then null
               else now() + make_interval(days => v_code.free_days)
             end;

  insert into public.promo_redemptions
    (code_id, user_id, tenant_id, granted_days, granted_until, granted_tier,
     granted_spaces, source, campaign)
  values
    (v_code.id, p_user_id, p_tenant_id, v_code.free_days, v_until, v_code.tier,
     v_code.spaces, coalesce(p_source, 'link'), p_campaign);

  update public.promo_codes
     set uses = uses + 1
   where id = v_code.id;

  return query select 'ok'::text, v_until, v_code.id, v_code.tier;
end;
$$;

grant execute on function public.redeem_promo_code(text, uuid, text, uuid, text)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. The free month, on the same terms
-- ----------------------------------------------------------------------------
-- `FIRST-MONTH` has thirty days on it and always will, so this changes nothing
-- today. It is amended anyway: a function that would write a NULL interval into
-- a NOT NULL column if somebody edited one row is a trap left lying about, and
-- the fix is three lines while the two functions still read the same.
-- ----------------------------------------------------------------------------

create or replace function public.claim_free_month(
  p_user_id   uuid,
  p_source    text default 'picker',
  p_tenant_id uuid default null
)
returns table (outcome text, granted_until timestamptz, granted_tier text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code  public.promo_codes%rowtype;
  v_until timestamptz;
begin
  if p_tenant_id is not null and not exists (
    select 1
      from public.tenant_members m
     where m.tenant_id = p_tenant_id
       and m.user_id   = p_user_id
       and m.role      = 'owner'
  ) then
    return query select 'refused'::text, null::timestamptz, null::text;
    return;
  end if;

  select * into v_code
    from public.promo_codes
   where code = 'FIRST-MONTH'
   for update;

  if not found
     or v_code.revoked_at is not null
     or (v_code.starts_at  is not null and v_code.starts_at  > now())
     or (v_code.expires_at is not null and v_code.expires_at <= now())
     or (v_code.max_uses   is not null and v_code.uses >= v_code.max_uses)
  then
    return query select 'inactive'::text, null::timestamptz, null::text;
    return;
  end if;

  if exists (
    select 1
      from public.promo_redemptions r
     where r.user_id      = p_user_id
       and r.granted_tier = v_code.tier
  ) then
    return query select 'already'::text, null::timestamptz, null::text;
    return;
  end if;

  v_until := case
               when v_code.free_days is null then null
               else now() + make_interval(days => v_code.free_days)
             end;

  insert into public.promo_redemptions
    (code_id, user_id, tenant_id, granted_days, granted_until, granted_tier,
     granted_spaces, source, campaign)
  values
    (v_code.id, p_user_id, p_tenant_id, v_code.free_days, v_until, v_code.tier,
     v_code.spaces,
     case when p_source in ('signup', 'link', 'picker', 'space', 'grant')
          then p_source else 'picker' end,
     v_code.campaign);

  update public.promo_codes
     set uses = uses + 1
   where id = v_code.id;

  return query select 'ok'::text, v_until, v_code.tier;
end;
$$;

grant execute on function public.claim_free_month(uuid, text, uuid)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Which spaces a grant reaches
-- ----------------------------------------------------------------------------
-- One function rather than the same correlated subquery pasted into the two
-- callers below. It is the rule from the top of this file, and having it in one
-- place is what stops "is this space entitled" and "which tier is it on"
-- drifting into disagreeing - a space that is entitled and tierless renders as
-- a paid space with no plan, which is a state nothing else in the app has a
-- name for.
-- ----------------------------------------------------------------------------

create or replace function public.grant_covers_tenant(
  p_user_id   uuid,
  p_tenant_id uuid,
  p_spaces    integer
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_spaces is null
      or p_tenant_id in (
           select m.tenant_id
             from public.tenant_members m
            where m.user_id = p_user_id
              and m.role    = 'owner'
            order by m.joined_at, m.tenant_id
            limit p_spaces
         );
$$;

grant execute on function public.grant_covers_tenant(uuid, uuid, integer)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. The two readers
-- ----------------------------------------------------------------------------

create or replace function public.tenant_is_entitled(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
        from public.subscriptions_read_model s
       where s.tenant_id = p_tenant_id
         and s.status in ('pending', 'active', 'past_due')
    )
    or exists (
      select 1
        from public.tenant_members m
       where m.tenant_id = p_tenant_id
         and m.role = 'owner'
         and (
           exists (
             select 1
               from public.user_entitlements e
              where e.user_id = m.user_id
                and e.status in ('active', 'trialing')
                and e.seats > 0
           )
           or exists (
             select 1
               from public.promo_redemptions r
              where r.user_id = m.user_id
                -- NULL is forever. Written out rather than left to the
                -- comparison, which would be NULL and therefore not true.
                and (r.granted_until is null or r.granted_until > now())
                and public.grant_covers_tenant(m.user_id, p_tenant_id, r.granted_spaces)
           )
         )
    );
$$;

grant execute on function public.tenant_is_entitled(uuid) to authenticated;

create or replace function public.tenant_tier(p_tenant_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- 1. What this space itself is paying for.
    (
      select s.tier
        from public.subscriptions_read_model s
       where s.tenant_id = p_tenant_id
         and s.status in ('pending', 'active', 'past_due')
         and s.tier is not null
       limit 1
    ),
    -- 2. The best live grant any owner of this space is holding, and only if
    --    this space is one the grant reaches.
    (
      select r.granted_tier
        from public.promo_redemptions r
        join public.tenant_members m on m.user_id = r.user_id
       where m.tenant_id = p_tenant_id
         and m.role = 'owner'
         and (r.granted_until is null or r.granted_until > now())
         and public.grant_covers_tenant(r.user_id, p_tenant_id, r.granted_spaces)
       order by case r.granted_tier when 'xp' then 1 else 0 end desc
       limit 1
    ),
    -- 3. Grandfathered: an owner on the retired EUR 20 plan.
    (
      select 'xp'
       where exists (
         select 1
           from public.tenant_members m
           join public.user_entitlements e on e.user_id = m.user_id
          where m.tenant_id = p_tenant_id
            and m.role = 'owner'
            and e.status in ('active', 'trialing')
            and e.seats > 0
       )
    )
  );
$$;

grant execute on function public.tenant_tier(uuid) to authenticated;
