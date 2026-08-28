-- ============================================================================
-- A month on us, without a code
-- ----------------------------------------------------------------------------
-- Until now the free month existed only behind a code. That is right for a
-- code - it is a campaign, and the point of `CAFE24` is to find out that the
-- flyer worked - but it left the two people most likely to say yes with nothing
-- to click:
--
--   - A brand new account, on the space picker, shown two prices and a folded
--     "Got a code?" box. Most people do not have a code. The box is the only
--     mention of a free month on the page, and it is addressed to somebody
--     else.
--   - An owner on the paused-space wall (`app/t/[slug]/deactivated.tsx`), which
--     offers two buttons and nothing else, one of them dead while `xp_sales` is
--     off. For most people who reach it the whole screen is a single €5
--     decision taken cold, weeks after they last opened the space.
--
-- So: one free month of xo per account, ever, claimable with no code and no
-- card, from wherever they are standing. The codes keep doing the job they are
-- good at - attribution - and stop being the only door.
--
-- ----------------------------------------------------------------------------
-- Why the existing voucher path cannot do this
-- ----------------------------------------------------------------------------
-- It refuses these people on purpose. `account_has_had_tier` (20260923000000)
-- counts *cancelled and lapsed* subscriptions, and its comment says why:
--
--     subscribe to xp, cancel, redeem an xp voucher, repeat - and a free month
--     becomes a permanent discount for anybody willing to click twice a month.
--
-- That reasoning is right about vouchers and wrong about this door, because it
-- is answering a question this door does not ask. The loop it fears needs the
-- free month to be *repeatable*; what actually bounds repetition is
-- `promo_redemptions_user_tier_key`, the unique index on (user_id,
-- granted_tier), which that same migration calls the eligibility rule rather
-- than a backstop for it. Under that index the cancel-and-redeem loop pays out
-- exactly once per account per tier, ever. A permanent discount it is not.
--
-- So this function keeps every rule in `redeem_promo_code` except that one, and
-- drops it deliberately rather than by omission. Someone who paid for xo, let
-- it lapse, and has never had a free month of xo gets one. The second time they
-- lapse they get the two buttons, forever.
--
-- ----------------------------------------------------------------------------
-- Why it is still a promo code underneath
-- ----------------------------------------------------------------------------
-- The grant could have been an insert with a NULL `code_id` and a nullable
-- column to allow it. Hanging it off a real row instead buys three things that
-- are worth more than the column:
--
--   - A kill switch. Revoking the code in the backoffice turns the offer off
--     everywhere, in one click, with no deploy - and `revokePromoCode` already
--     documents that revoking cannot reach backwards into months it has
--     already promised.
--   - The measurement. `/ovaloffice/promos` counts uses and lists redemptions
--     by source and campaign; a win-back that wrote nowhere would be the one
--     campaign nobody could see the numbers for.
--   - `granted_days` and `granted_tier` keep meaning what they mean everywhere
--     else, so `readEntitlement`, `tenant_is_entitled` and the billing panel
--     need to know nothing about any of this.
--
-- The code string is typeable, and that is harmless: typed into the redeem box
-- it goes through `redeem_promo_code`, which applies the strict rule and hands
-- a month only to accounts that have never had xo - who could redeem any of our
-- codes anyway. The relaxation lives in this function, which no text field
-- reaches.
-- ============================================================================

-- ============================================================================
-- 1. The offer
-- ----------------------------------------------------------------------------
-- `max_uses` NULL because a ceiling here would fail closed in the worst place:
-- the last person to reach the offer would be shown a month that had quietly
-- run out. Bound it by revoking, which is visible in the backoffice, rather
-- than by a number that expires in silence.
-- ============================================================================

insert into public.promo_codes (code, label, campaign, tier, free_days, max_uses)
values (
  'FIRST-MONTH',
  'The first month of xo, on us — claimed without a code',
  'first-month',
  'xo',
  30,
  null
)
on conflict (code) do nothing;

-- ============================================================================
-- 2. Claiming it
-- ----------------------------------------------------------------------------
-- Byte for byte the shape of `redeem_promo_code`, minus the code argument and
-- minus the `account_has_had_tier` refusal.
--
-- The refusals, and why there are only four:
--
--   ok        - granted; `granted_until` says how long for
--   already   - this account has had its free month of xo
--   inactive  - the offer has been revoked or has expired
--   refused   - a space was named and this account does not own it
--
-- ----------------------------------------------------------------------------
-- What `p_tenant_id` is, and what it deliberately is not
-- ----------------------------------------------------------------------------
-- Provenance. "Claimed from the wall of a space that had gone read-only" is a
-- different story from "claimed on the way in", and only one of them is a
-- returning customer - which is the whole reason `promo_redemptions.tenant_id`
-- exists. It is NOT what the month applies to: a grant is a seat, and a seat is
-- a fact about a person, exactly as it is for every code ever redeemed.
--
-- Which is why the space it names is only checked for ownership, and not for
-- whether it is paused. An earlier draft of this function required a paused
-- space, on the reasoning that granting a month to an owner whose space is paid
-- up costs money for nothing. That reasoning does not survive the offer also
-- being on the picker: the same person could claim there, with no space named
-- at all, and the check would have bought nothing but a confusing refusal on
-- one of the two screens. One rule, asked the same way everywhere - one free
-- month of xo per account, ever - is worth more than a guard that only holds on
-- whichever door remembers to ask.
--
-- The ownership check stays because it is about honesty of the record rather
-- than about eligibility: a redemption row pointing at a space the claimant has
-- nothing to do with would corrupt the very measurement the column is for.
-- ============================================================================

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
  -- Only if a space was named. Membership alone is not enough: the row is meant
  -- to say "this is where they were standing", and a member naming a space they
  -- happen to be in would file their claim under somebody else's space.
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

  -- A missing row reads as withdrawn rather than as an error. This function
  -- outliving its seed row is a deployment accident, and the safe reading of an
  -- accident here is "no free month", not a 500 on the one screen somebody is
  -- trying to pay us from.
  if not found
     or v_code.revoked_at is not null
     or (v_code.starts_at  is not null and v_code.starts_at  > now())
     or (v_code.expires_at is not null and v_code.expires_at <= now())
     or (v_code.max_uses   is not null and v_code.uses >= v_code.max_uses)
  then
    return query select 'inactive'::text, null::timestamptz, null::text;
    return;
  end if;

  -- One free month of this tier per account, ever - the rule this whole feature
  -- rests on, asked the same way `redeem_promo_code` asks it. The unique index
  -- says the same thing underneath, which is what makes two of these racing
  -- resolve to one grant rather than two.
  if exists (
    select 1
      from public.promo_redemptions r
     where r.user_id      = p_user_id
       and r.granted_tier = v_code.tier
  ) then
    return query select 'already'::text, null::timestamptz, null::text;
    return;
  end if;

  v_until := now() + make_interval(days => v_code.free_days);

  insert into public.promo_redemptions
    (code_id, user_id, tenant_id, granted_days, granted_until, granted_tier,
     source, campaign)
  values
    (v_code.id, p_user_id, p_tenant_id, v_code.free_days, v_until, v_code.tier,
     -- Constrained to the same four doors every redemption is, and defaulted
     -- rather than trusted: a source we do not recognise would fail the check
     -- constraint and lose the grant over a label.
     case when p_source in ('signup', 'link', 'picker', 'space')
          then p_source else 'picker' end,
     v_code.campaign);

  update public.promo_codes
     set uses = uses + 1
   where id = v_code.id;

  return query select 'ok'::text, v_until, v_code.tier;
end;
$$;

-- Callable by a signed-in account claiming for itself. The guard against
-- claiming on somebody else's behalf is that the Server Action passes the id
-- off the verified session and never off the request - the same posture, and
-- the same comment, as `redeem_promo_code`.
grant execute on function public.claim_free_month(uuid, text, uuid)
  to authenticated, service_role;
