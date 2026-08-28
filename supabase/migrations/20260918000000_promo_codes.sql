-- ============================================================================
-- Promo codes: a month on us, and the record of who that reached
-- ----------------------------------------------------------------------------
-- Two tables that answer two different questions, and it is worth being clear
-- which is which before reading either:
--
--   `promo_codes`       - what we printed on the flyer. A capability.
--   `promo_redemptions` - who actually used it. A measurement, and a grant.
--
-- Keeping them apart is what makes the codes a *tracking* mechanism rather than
-- just a discount. A single `uses` counter on the code would tell you that
-- forty people redeemed CAFE24; the redemption rows tell you when, from which
-- door, and against which `?src=` tag they had arrived on - which is the
-- question somebody deciding where to put next month's flyers is asking.
--
-- ----------------------------------------------------------------------------
-- Why this does not go through Stripe
-- ----------------------------------------------------------------------------
-- The free month is deliberately not a Stripe coupon on a Checkout session,
-- because Checkout wants a payment method and the whole promise here is "no
-- card". A Stripe subscription with a trial and no mandate is possible, but it
-- makes every redemption a Stripe API call - one that fails on a self-hosted
-- deployment with no keys, and that creates a customer record for somebody who
-- may never pay us anything.
--
-- So a grant is a local fact, and `user_entitlements` stays what its own
-- migration promised: a pure mirror of Stripe, never written by us for any
-- reason other than "this is what Stripe says". Seats are read as the sum of
-- the two - see readEntitlement() and tenant_is_entitled() below - which means
-- the nightly Stripe sync can overwrite that mirror as hard as it likes and a
-- granted month survives it, because it was never in there.
-- ============================================================================

-- ============================================================================
-- 1. The codes
-- ----------------------------------------------------------------------------
-- Stored in the clear and stored uppercase, both on purpose.
--
-- In the clear because unlike an invite token this is not a secret - it is
-- printed on something, said out loud at an event, put in a video description.
-- Hashing a value that is by design public buys nothing and costs the
-- backoffice the ability to show an admin the code they just made.
--
-- Uppercase because a code that is read off a poster gets typed however the
-- person felt at the time. Normalising on the way in (see `normaliseCode`) and
-- constraining the column to match means there is exactly one row per code and
-- no way to create a lowercase twin by hand in the SQL editor.
-- ============================================================================

create table if not exists public.promo_codes (
  id         uuid        primary key default gen_random_uuid(),
  /** What somebody types. Unique, so a collision is a failed insert rather
   *  than a second code quietly sharing the name of the first. */
  code       text        not null unique
               check (code = upper(code) and length(code) between 3 and 40),
  /** What an admin calls it. For the list, never shown to a visitor. */
  label      text,
  /**
   * The channel this code was minted for - 'poster-hbf', 'tiktok-launch'.
   *
   * Distinct from the `campaign` on a redemption, which records where the
   * person actually came from. Both are worth having: the difference between
   * them is a code leaking out of the channel it was printed for, which is
   * something you want to be able to see rather than infer.
   */
  campaign   text,
  /** How long the free run lasts. A month, unless somebody says otherwise. */
  free_days  integer     not null default 30 check (free_days between 1 and 365),
  /** How many accounts this code may cover. NULL means no ceiling. */
  max_uses   integer     check (max_uses > 0),
  uses       integer     not null default 0 check (uses >= 0),
  /** Not live yet. NULL means live from the moment it exists. */
  starts_at  timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid        references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- The backoffice list reads newest-first; lookup by code is served by the
-- unique constraint above.
create index if not exists promo_codes_created_idx
  on public.promo_codes (created_at desc);

alter table public.promo_codes enable row level security;

-- Admin-only, same posture as `account_invites`. Redemption runs through the
-- service role, because the caller redeeming at sign-up has no session yet and
-- the caller redeeming later has no business reading every code in the system -
-- a member who could list this table could try each one until something stuck.
drop policy if exists "promo_codes_admin_all" on public.promo_codes;

create policy "promo_codes_admin_all"
  on public.promo_codes for all
  to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

-- ============================================================================
-- 2. The redemptions
-- ----------------------------------------------------------------------------
-- One row per account, forever. That unique index is the rule the product
-- promised - a code is for a new account, and an account is new exactly once -
-- expressed where it cannot be talked around.
--
-- It matters that it lives here rather than in the action. There are three
-- doors onto redemption (sign-up, the space picker, a space's billing page)
-- and a check written at each of them is three chances to write it slightly
-- differently. Here, the second redemption is a failed insert whichever door it
-- came through, including two arriving in the same millisecond.
-- ============================================================================

create table if not exists public.promo_redemptions (
  id            uuid        primary key default gen_random_uuid(),
  code_id       uuid        not null references public.promo_codes (id) on delete cascade,
  user_id       uuid        not null references auth.users (id) on delete cascade,
  /**
   * The space they were standing in when they redeemed, if any.
   *
   * Not what the grant applies to - a grant is a fact about a person, like
   * every other seat in this system. This is provenance: "redeemed from inside
   * the billing page of that space" is a different story from "redeemed on the
   * way in", and only one of them is a new customer.
   */
  tenant_id     uuid        references public.tenants_read_model (id) on delete set null,
  /** Copied from the code at redemption time, so shortening a code's free_days
   *  later cannot retroactively shorten a month somebody was already promised. */
  granted_days  integer     not null check (granted_days > 0),
  granted_until timestamptz not null,
  /** Which door. The whole point of collecting it is that the doors convert
   *  differently, and that is not visible from a `uses` counter. */
  source        text        not null default 'link'
                  check (source in ('signup', 'link', 'picker', 'space')),
  /** The `?src=` tag in force when they redeemed, if there was one. Stored in
   *  the same prefixed form `page_views.referrer_host` uses, so the two can be
   *  read side by side. */
  campaign      text,
  created_at    timestamptz not null default now()
);

-- One free month per account, ever. See the note above - this index *is* the
-- eligibility rule, not a backstop for it.
create unique index if not exists promo_redemptions_user_key
  on public.promo_redemptions (user_id);

-- "How did CAFE24 do", newest first.
create index if not exists promo_redemptions_code_idx
  on public.promo_redemptions (code_id, created_at desc);

-- The entitlement read runs on page loads, and asks only about live grants.
create index if not exists promo_redemptions_until_idx
  on public.promo_redemptions (granted_until desc);

alter table public.promo_redemptions enable row level security;

-- Readable by the person it describes, so the billing page can say when their
-- free month runs out without going through an admin function. There is no
-- insert or update policy: a user who could write this row could grant
-- themselves a year.
drop policy if exists "promo_redemptions_select_own" on public.promo_redemptions;

create policy "promo_redemptions_select_own"
  on public.promo_redemptions for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "promo_redemptions_admin_all" on public.promo_redemptions;

create policy "promo_redemptions_admin_all"
  on public.promo_redemptions for all
  to authenticated
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

-- ============================================================================
-- 3. Redeeming, atomically
-- ----------------------------------------------------------------------------
-- The counter increment and the redemption row have to happen together or the
-- rationing is decorative: two people racing for the last use of a 100-use code
-- would both read `uses = 99`, both write a row, and the code would have been
-- spent 101 times. Doing it in one function under one transaction, with the
-- `uses` update conditional on the value it read, makes the loser of that race
-- get nothing rather than get a free month.
--
-- Every refusal comes back as a code rather than a sentence. The sentences live
-- in TypeScript with the rest of the copy, and this way the German landing page
-- and the English billing panel can say the same refusal differently without a
-- second version of this function.
--
--   ok            - granted; `granted_until` says how long for
--   unknown       - no such code
--   inactive      - revoked, expired, not started yet, or fully spent
--   already       - this account has had its free month
--   not_new       - this account has a Stripe subscription history
--
-- `not_new` is checked here as well as in the caller because it is the rule
-- most likely to be got wrong at a call site: it is the only one that reads a
-- *different* table, and the door that forgets it is a door that hands paying
-- customers a free month.
-- ============================================================================

create or replace function public.redeem_promo_code(
  p_code      text,
  p_user_id   uuid,
  p_source    text default 'link',
  p_tenant_id uuid  default null,
  p_campaign  text  default null
)
returns table (outcome text, granted_until timestamptz, code_id uuid)
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
    return query select 'unknown'::text, null::timestamptz, null::uuid;
    return;
  end if;

  if v_code.revoked_at is not null
     or (v_code.starts_at  is not null and v_code.starts_at  > now())
     or (v_code.expires_at is not null and v_code.expires_at <= now())
     or (v_code.max_uses   is not null and v_code.uses >= v_code.max_uses)
  then
    return query select 'inactive'::text, null::timestamptz, v_code.id;
    return;
  end if;

  if exists (select 1 from public.promo_redemptions r where r.user_id = p_user_id) then
    return query select 'already'::text, null::timestamptz, v_code.id;
    return;
  end if;

  -- Never subscribed. A row with a customer id, or any status other than
  -- 'none', means this account has been through Stripe at some point - which is
  -- precisely what "new account" excludes. Absent row = never subscribed.
  if exists (
    select 1
      from public.user_entitlements e
     where e.user_id = p_user_id
       and (e.stripe_customer_id is not null or e.status <> 'none')
  ) then
    return query select 'not_new'::text, null::timestamptz, v_code.id;
    return;
  end if;

  v_until := now() + make_interval(days => v_code.free_days);

  insert into public.promo_redemptions
    (code_id, user_id, tenant_id, granted_days, granted_until, source, campaign)
  values
    (v_code.id, p_user_id, p_tenant_id, v_code.free_days, v_until,
     coalesce(p_source, 'link'), p_campaign);

  update public.promo_codes
     set uses = uses + 1
   where id = v_code.id;

  return query select 'ok'::text, v_until, v_code.id;
end;
$$;

-- Callable by a signed-in user redeeming for themselves, and by the service
-- role on the sign-up path. It is SECURITY DEFINER and takes a user id, so the
-- guard against redeeming *on somebody else's behalf* lives in the server
-- action, which passes the id off the verified session and never off the form.
grant execute on function public.redeem_promo_code(text, uuid, text, uuid, text)
  to authenticated, service_role;

-- ============================================================================
-- 4. Is this space paid for?
-- ----------------------------------------------------------------------------
-- Replaces the version in 20260726000000_user_entitlements.sql, which asked
-- only about Stripe. Same question, same signature, one more way to answer yes:
-- an owner inside a granted month.
--
-- Left as two branches of an OR rather than folded into a seats calculation
-- because this function answers "may this space be written to", which is a
-- yes/no. How many spaces the grant is worth is a different question, asked in
-- readEntitlement() where the seat arithmetic already lives.
-- ============================================================================

create or replace function public.tenant_is_entitled(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
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
