-- ============================================================================
-- Two tiers: xo and xp
-- ----------------------------------------------------------------------------
-- Until now this product had one price and one shape. A space was paid for or
-- it was not. This splits it in two:
--
--   xo  EUR  5/month  the lounge, the world lobby, matches in the built-in games
--   xp  EUR 10/month  all of that, plus the XP suite - player, editor, story, VR
--
-- ----------------------------------------------------------------------------
-- Why the tier hangs off the *space* and not off the person
-- ----------------------------------------------------------------------------
-- `user_entitlements` answers "how many spaces may this person own", which is a
-- fact about a person and stays that way. The tier is a different question -
-- "what is this space allowed to do" - and it belongs to the space, because one
-- account very reasonably owns a quiet xo space for a book club and an xp space
-- for the thing it is actually building. Forcing both onto one account-wide
-- tier would mean the book club pays for VR.
--
-- So it goes on `subscriptions_read_model`, which already exists one row per
-- tenant and already holds what was bought for that tenant.
--
-- ----------------------------------------------------------------------------
-- What this does NOT do, deliberately
-- ----------------------------------------------------------------------------
-- It does not take anything away from anybody. The old EUR 20 price is no
-- longer sold, but every subscription on it is still live, and those customers
-- were paying twice the top tier - so they are grandfathered onto xp, in
-- `domain/billing/prices.ts` where the price ids live. `tenant_is_entitled`
-- below grows a branch rather than losing one, for the same reason: a migration
-- that makes a paying customer's space read-only is not a migration, it is an
-- outage with a version number.
-- ============================================================================

-- ============================================================================
-- 1. What a space is on
-- ----------------------------------------------------------------------------
-- Nullable, and that is not laziness. Three states have to be distinguishable:
--
--   NULL      no subscription has ever been started for this space. Every row
--             that existed before this migration is here, and so is every space
--             created from now on before its owner picks a tier.
--   'xo'      paying for, or granted, the relaxed tier.
--   'xp'      paying for, or granted, the full tier.
--
-- A `not null default 'xo'` would have collapsed the first into the second and
-- told every existing space it was on the cheap plan, including the ones on the
-- legacy EUR 20 price who are owed xp. The backfill below fills in what can be
-- known; what cannot stays NULL and is answered by `tenant_tier()`.
-- ============================================================================

alter table public.subscriptions_read_model
  add column if not exists tier text
    check (tier is null or tier in ('xo', 'xp'));

-- ----------------------------------------------------------------------------
-- The change that has not happened yet
-- ----------------------------------------------------------------------------
-- Upgrades and downgrades both land at the end of the paid period, never in the
-- middle of it. That is a product decision with a billing reason behind it: a
-- mid-cycle swap means proration, and a proration line on an invoice is the
-- single most common thing a customer writes in about. Waiting until the period
-- ends means the price on the next invoice is the price on the card they
-- clicked, to the cent.
--
-- Stripe owns the schedule - see `scheduleTierChange` - so these two columns are
-- a mirror for rendering "you move to xp on the 25th", not the mechanism. If
-- they disagree with Stripe, Stripe is right; the webhook overwrites them when
-- the change actually lands.
alter table public.subscriptions_read_model
  add column if not exists pending_tier text
    check (pending_tier is null or pending_tier in ('xo', 'xp'));

alter table public.subscriptions_read_model
  add column if not exists pending_tier_at timestamptz;

-- ----------------------------------------------------------------------------
-- Winding down
-- ----------------------------------------------------------------------------
-- `status = 'canceled'` already means "ended, read-only". This is the state
-- before that: still live, still writable, paid through `current_period_end`,
-- and not renewing. `user_entitlements` has carried the same flag per person
-- since the cancel-at-period-end migration; this is the per-space answer, which
-- is the one that matters now that a subscription belongs to a space.
alter table public.subscriptions_read_model
  add column if not exists cancel_at_period_end boolean not null default false;

-- ----------------------------------------------------------------------------
-- Backfill
-- ----------------------------------------------------------------------------
-- Every subscription that predates this migration was sold at EUR 20, which is
-- xp under the grandfather rule. `amount_cents` is what was actually charged,
-- so it decides rather than a blanket update: a row at 500 or 1000 could only
-- have come from a tier price, and anything else is the legacy plan.
--
-- Rows with no amount recorded stay NULL and fall through to `tenant_tier()`,
-- which is the honest answer for a subscription whose first invoice never
-- settled.
update public.subscriptions_read_model
   set tier = case
                when amount_cents = 500  then 'xo'
                when amount_cents = 1000 then 'xp'
                else 'xp'
              end
 where tier is null
   and amount_cents is not null;

-- ============================================================================
-- 2. Vouchers carry a tier
-- ----------------------------------------------------------------------------
-- A code was previously worth "a month", full stop, because there was only one
-- thing a month could be of. Now there are two, and a code has to say which -
-- a flyer handed out at a games night is an xp code, a code in a newsletter is
-- probably xo, and the difference is EUR 5 a head.
--
-- Default 'xo', which is the cautious direction and matches `DEFAULT_TIER` in
-- `domain/billing/tiers.ts`: a code minted before this column existed, or by a
-- form that forgets to send the field, gives away the cheaper thing.
-- ============================================================================

alter table public.promo_codes
  add column if not exists tier text not null default 'xo'
    check (tier in ('xo', 'xp'));

-- Copied onto the redemption at redemption time, for exactly the reason
-- `granted_days` is: an admin editing a code's tier afterwards must not be able
-- to retroactively change what somebody was already promised.
alter table public.promo_redemptions
  add column if not exists granted_tier text not null default 'xo'
    check (granted_tier in ('xo', 'xp'));

-- ----------------------------------------------------------------------------
-- One free month per tier, rather than one free month ever
-- ----------------------------------------------------------------------------
-- The old index was `unique (user_id)`, and its migration called that index
-- *the* eligibility rule rather than a backstop for it. It still is - this only
-- changes what the rule says.
--
-- What it says now: somebody who has never had xp can try xp free for a month,
-- even if they are already an xo customer. That is the whole point of having
-- two tiers and a voucher for each. Under the old index an existing xo customer
-- could never redeem anything, which would have made the xp vouchers
-- unredeemable by exactly the people most likely to upgrade.
--
-- It does mean a brand new account can end up with two free months - one of
-- each tier - and that is intended rather than tolerated. They are two
-- different products; trying one is not trying the other.
--
-- The paid half of eligibility moves into `account_has_had_tier` below, because
-- "new account" also has to become per-tier or an xo subscriber is refused an
-- xp voucher for having a Stripe history.
drop index if exists public.promo_redemptions_user_key;

create unique index if not exists promo_redemptions_user_tier_key
  on public.promo_redemptions (user_id, granted_tier);

-- ============================================================================
-- 2b. Has this account had this tier before?
-- ----------------------------------------------------------------------------
-- The paid half of voucher eligibility. Separated out because it is asked twice
-- - once inside `redeem_promo_code` where it decides, and once by the redeem
-- box to decide whether to offer the field at all - and a second copy of a rule
-- that hands out months is a copy that will drift.
--
-- "Had" is historical and deliberately so: it counts cancelled and suspended
-- subscriptions too. Otherwise the loop is obvious - subscribe to xp, cancel,
-- redeem an xp voucher, repeat - and a free month becomes a permanent discount
-- for anybody willing to click twice a month.
-- ============================================================================

create or replace function public.account_has_had_tier(p_user_id uuid, p_tier text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- A space they own has been on this tier at some point, live or not.
    exists (
      select 1
        from public.tenant_members m
        join public.subscriptions_read_model s on s.tenant_id = m.tenant_id
       where m.user_id = p_user_id
         and m.role = 'owner'
         and s.tier = p_tier
    )
    -- Or they are on the retired EUR 20 plan, which is grandfathered to xp.
    -- See the note at the top of this file: those customers have effectively
    -- had xp all along, so an xp voucher is not theirs to claim. An xo voucher
    -- still is, which is odd but harmless - it is a downgrade nobody wants.
    or (
      p_tier = 'xp'
      and exists (
        select 1
          from public.user_entitlements e
         where e.user_id = p_user_id
           and e.stripe_customer_id is not null
      )
    );
$$;

grant execute on function public.account_has_had_tier(uuid, text)
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Redeeming, now with a tier
-- ----------------------------------------------------------------------------
-- Byte for byte the function from 20260918000000_promo_codes.sql, with the tier
-- read off the code, written onto the redemption, and returned so the caller
-- can say "a month of xp" rather than "a month". Every refusal, every race
-- guarantee and every eligibility rule is unchanged - see that migration for
-- why each of them is the way it is.
--
-- Dropped first because the return type is changing, and CREATE OR REPLACE
-- refuses that.
-- ----------------------------------------------------------------------------

drop function if exists public.redeem_promo_code(text, uuid, text, uuid, text);

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

  -- Already had a free month *of this tier*. Having had the other one does not
  -- count: see the note on `promo_redemptions_user_tier_key` above.
  if exists (
    select 1
      from public.promo_redemptions r
     where r.user_id = p_user_id
       and r.granted_tier = v_code.tier
  ) then
    return query select 'already'::text, null::timestamptz, v_code.id, null::text;
    return;
  end if;

  -- Never paid for this tier. The check used to be "has this account ever been
  -- through Stripe at all", which was right when there was one thing to buy and
  -- is wrong now: it would refuse an xp voucher to every xo customer, who are
  -- precisely the people it should reach.
  if public.account_has_had_tier(p_user_id, v_code.tier) then
    return query select 'not_new'::text, null::timestamptz, v_code.id, null::text;
    return;
  end if;

  v_until := now() + make_interval(days => v_code.free_days);

  insert into public.promo_redemptions
    (code_id, user_id, tenant_id, granted_days, granted_until, granted_tier,
     source, campaign)
  values
    (v_code.id, p_user_id, p_tenant_id, v_code.free_days, v_until, v_code.tier,
     coalesce(p_source, 'link'), p_campaign);

  update public.promo_codes
     set uses = uses + 1
   where id = v_code.id;

  return query select 'ok'::text, v_until, v_code.id, v_code.tier;
end;
$$;

grant execute on function public.redeem_promo_code(text, uuid, text, uuid, text)
  to authenticated, service_role;

-- ============================================================================
-- 3. Is this space paid for?
-- ----------------------------------------------------------------------------
-- Replaces the version in 20260918000000_promo_codes.sql. Same question, same
-- signature, one more way to answer yes: the space has a live subscription of
-- its own.
--
-- That new branch is the whole point of the tier work. A subscription is now
-- bought *for a space* - `startCheckout` stamps the tenant id into Stripe
-- metadata and always has - so the space's own row is the first place to look.
--
-- The two older branches stay, and stay first-class rather than being a
-- compatibility shim:
--
--   - The promo grant is a fact about a person and always was. Somebody's free
--     month covers the space they are standing in.
--   - The account seat is what every existing customer has. They bought seats
--     at EUR 20 before spaces had their own subscriptions, and their spaces
--     must not go read-only on the day this deploys. When the last legacy
--     subscription is gone this branch can go with it; until then, removing it
--     is a silent downgrade of the only people who have ever paid us.
--
-- Which statuses count is deliberately generous - 'pending' and 'past_due' both
-- keep a space writable, per the table's own comment. One returned direct debit
-- is a bank hiccup, not a deadbeat, and only Stripe giving up ('suspended') or
-- the owner deciding ('canceled') stops the writes.
-- ============================================================================

create or replace function public.tenant_is_entitled(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- The space's own subscription.
    exists (
      select 1
        from public.subscriptions_read_model s
       where s.tenant_id = p_tenant_id
         and s.status in ('pending', 'active', 'past_due')
    )
    -- Or an owner is inside a granted month, or holds an account seat.
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
                and r.granted_until > now()
           )
         )
    );
$$;

grant execute on function public.tenant_is_entitled(uuid) to authenticated;

-- ============================================================================
-- 4. Which tier is this space on?
-- ----------------------------------------------------------------------------
-- The companion to `tenant_is_entitled`, and SECURITY DEFINER for the same
-- reason: every page behind /t/[slug] asks this, the caller is usually not the
-- owner, and `subscriptions_read_model` is readable by members but
-- `promo_redemptions` and `user_entitlements` are not. This hands back one
-- word and leaks nothing else - not who pays, not how much, not until when.
--
-- Returns NULL when the space has no tier from any source. NULL is not 'xo':
-- the caller decides what an unknown tier means, and the two callers want
-- different things. `resolveTier` in TypeScript maps it to DEFAULT_TIER for
-- rendering; the entitlement check above never consults this at all.
--
-- ----------------------------------------------------------------------------
-- The order of the branches is the answer to "who wins"
-- ----------------------------------------------------------------------------
-- 1. The space's own subscription, when it is live. Somebody paying EUR 10 for
--    this space gets xp here whatever else is going on with their account.
-- 2. A live promo grant held by an owner, at the tier the code was minted for.
-- 3. A legacy account seat, which means xp - see the grandfather note at the
--    top of this file and in `domain/billing/prices.ts`.
--
-- Highest first within each branch, via `order by`, so an owner holding both an
-- xo grant and an xp grant is not decided by which row was inserted first.
-- ============================================================================

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
    -- 2. The best live grant any owner of this space is holding.
    (
      select r.granted_tier
        from public.promo_redemptions r
        join public.tenant_members m on m.user_id = r.user_id
       where m.tenant_id = p_tenant_id
         and m.role = 'owner'
         and r.granted_until > now()
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
