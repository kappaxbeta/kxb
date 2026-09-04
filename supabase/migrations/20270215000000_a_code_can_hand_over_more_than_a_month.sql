-- ============================================================================
-- A code can hand over more than a month
-- ----------------------------------------------------------------------------
-- A promo code has only ever granted one thing: time on a tier. That is the
-- right offer for somebody deciding whether to pay for a space, and a weak one
-- for a campaign aimed at people who have not decided anything yet - a free
-- month of a plan is only worth something once you have a reason to open the
-- app tomorrow.
--
-- So a code may now also carry things somebody can use today: bucks, the one
-- currency a skin is bought with (`src/domain/skins/bucks.ts`); voucher codes
-- to pass on; and coins for the economy. "A month free plus five bucks to spend
-- on skins" is a sentence somebody reads to the end, and the second half of it
-- is the half that arrives in the first five minutes.
--
-- ----------------------------------------------------------------------------
-- Two numbers, because they are two different presents
-- ----------------------------------------------------------------------------
-- `bucks` land in the redeemer's own pocket - owned, redeemed, spendable in the
-- shop the second the page reloads. That is the one to reach for, and it is why
-- it is the first field on the form.
--
-- `vouchers` are bearer codes: minted in flight, nobody's until somebody types
-- them, handed back to whoever redeemed the promo so they can pass them on. A
-- campaign that wants "bring two friends" needs codes, and a buck in a pocket
-- cannot be posted to anybody.
--
-- Both are `skin_vouchers` rows and the difference is one column: `owner_id`
-- set or null. Nothing here invents a second ledger for the same object - see
-- `bucks.ts`, where the row *is* the buck.
--
-- One consequence worth writing down: pocket bucks are not codes, so they do
-- not belong in the backoffice's voucher log, which exists to answer "was this
-- code ever real". `listVouchersAdmin` leaves them out and counts them instead;
-- without that, a thousand-redemption campaign buries every code an operator
-- ever minted by hand under five thousand rows nobody will ever type.
--
-- ----------------------------------------------------------------------------
-- Copied onto the redemption, like every other promise
-- ----------------------------------------------------------------------------
-- `granted_bucks` and `granted_vouchers` sit beside `granted_days`,
-- `granted_tier` and `granted_spaces` for exactly the reason those three do: the code says what is
-- on offer *now*, and the redemption says what somebody was actually given. An
-- operator lowering a code from five bucks to two next week must not be able to
-- make last week's five look like two.
--
-- ----------------------------------------------------------------------------
-- Granted inside the redemption's transaction, which is why there is a minter
-- here
-- ----------------------------------------------------------------------------
-- Every other buck in this system is minted in TypeScript - the table's own
-- comment says so, and `mintPromoCode` owns the alphabet. This one cannot be,
-- and the reason is worth stating because it is the only thing in this file
-- that looks like duplication.
--
-- The month and the bucks are one promise. Written from TypeScript after the
-- RPC returned, they would be two: a crash, a dropped connection or a
-- redeploy between them leaves somebody holding a month and no bucks, on a
-- code they cannot redeem again - the "one per account per tier" index is a
-- unique index and it has already fired. There is no retry that fixes that
-- without a reconciliation job nobody would write.
--
-- Inside `redeem_promo_code` both land together or neither does, and the cost
-- is a second copy of a thirty-one character alphabet that has not changed
-- since it was written and would break loudly if it did (a code with an O in
-- it is a code somebody mistypes, not a code that fails).
-- ============================================================================

-- ============================================================================
-- 1. What a code offers, and what a redemption was given
-- ============================================================================

alter table public.promo_codes
  add column if not exists bucks integer not null default 0
    -- Fifty is not a business rule, it is a typo guard: a code minted with 500
    -- in the box would hand out a shop's worth of skins to everybody who read
    -- a poster, and no campaign has ever needed more than a handful.
    check (bucks between 0 and 50);

alter table public.promo_codes
  add column if not exists vouchers integer not null default 0
    check (vouchers between 0 and 50);

-- Coins, into the wallet. See section 2b for why this one needed the ledger to
-- learn a new shape, and why the ceiling is a hundred times the others'.
alter table public.promo_codes
  add column if not exists coins integer not null default 0
    check (coins between 0 and 100000);

comment on column public.promo_codes.bucks is
  'Bucks dropped straight into the redeemer''s pocket, on top of the free month.';

comment on column public.promo_codes.vouchers is
  'Bearer voucher codes handed to the redeemer to pass on. Unclaimed until typed.';

comment on column public.promo_codes.coins is
  'Coins minted into the redeemer''s wallet. Spendable only in a space whose economy flag is on.';

alter table public.promo_redemptions
  add column if not exists granted_bucks integer not null default 0
    check (granted_bucks >= 0);

alter table public.promo_redemptions
  add column if not exists granted_vouchers integer not null default 0
    check (granted_vouchers >= 0);

alter table public.promo_redemptions
  add column if not exists granted_coins integer not null default 0
    check (granted_coins >= 0);

comment on column public.promo_redemptions.granted_bucks is
  'How many bucks this redemption actually put in a pocket. Copied from the code '
  'at redemption time, so changing the code later cannot rewrite what was promised.';

-- ============================================================================
-- 2. A buck that came from a code
-- ----------------------------------------------------------------------------
-- `source` gains 'promo', which is the fifth way a buck comes into being and
-- the first that is neither bought, paid for monthly, gifted, nor minted by
-- hand. It matters for the same reason `RedeemSource` distinguishes a grant
-- from a link: a report that counts campaign bucks as backoffice bucks makes
-- the marketing look like an operator being generous.
--
-- The redemption id is the idempotency, paired with a position in the batch -
-- the same shape `stripe_session_id` + `stripe_session_seq` uses for a bundle,
-- and for the same reason: the codes are freshly minted every time, so the
-- codes cannot be what collides. The numbering is.
-- ============================================================================

alter table public.skin_vouchers
  drop constraint if exists skin_vouchers_source_check;

alter table public.skin_vouchers
  add constraint skin_vouchers_source_check
    check (source in ('backoffice', 'subscription', 'gift', 'purchase', 'promo'));

alter table public.skin_vouchers
  add column if not exists promo_redemption_id uuid
    references public.promo_redemptions (id) on delete set null;

alter table public.skin_vouchers
  add column if not exists promo_seq integer;

comment on column public.skin_vouchers.promo_redemption_id is
  'The redemption that minted this buck, for source = promo. Nulled rather than '
  'cascaded if the redemption is cleared: a buck already spent on a skin is not '
  'unspendable because an operator undid a grant.';

-- Idempotent per redemption. A second attempt at the same batch collides here
-- rather than doubling somebody's bucks.
create unique index if not exists skin_vouchers_promo_key
  on public.skin_vouchers (promo_redemption_id, promo_seq)
  where promo_redemption_id is not null;

-- ============================================================================
-- 2b. A wallet movement with nothing on the other side
-- ----------------------------------------------------------------------------
-- `wallet_ledger.tenant_id` was NOT NULL, and its own comment said why: "a
-- wallet movement always has a purse on the other side, and one that did not
-- would be minting". That was true of every movement that existed when it was
-- written - a withdrawal and a deposit are the same coins changing hands, and
-- a nullable column there would have been a hole in the one table that must
-- not be able to invent money.
--
-- A promo code is the exception the sentence was describing rather than a
-- violation of it. It *is* minting, deliberately, by an operator, from the
-- platform - the same act as `voucher_claims` in the economy spec, and the
-- reason that one is a valued flag rather than a constant. So rather than
-- inventing a fake tenant to satisfy a constraint (which would put coins in a
-- space's books that the space never paid), the column is relaxed and null is
-- given one meaning: **minted, by us, on purpose.**
--
-- The guard that replaces NOT NULL is narrower than it was and says more: a
-- movement with no space at the other end may only be *into* the wallet. Coins
-- can be minted from nowhere; they cannot be burnt into nowhere, because a
-- disappearance with no destination is the shape of a bug rather than of a
-- campaign.
--
-- What has not changed is who may write here. There is still no insert policy
-- on either table; the only additional writer is `redeem_promo_code`, which is
-- SECURITY DEFINER, is the same function that already decides whether somebody
-- may have a free month at all, and writes both rows in the transaction that
-- writes the redemption.
-- ============================================================================

alter table public.wallet_ledger
  alter column tenant_id drop not null;

alter table public.wallet_ledger
  drop constraint if exists wallet_ledger_mint_is_inbound;

alter table public.wallet_ledger
  add constraint wallet_ledger_mint_is_inbound
    check (tenant_id is not null or amount > 0);

comment on column public.wallet_ledger.tenant_id is
  'The space at the other end, or NULL for coins minted by the platform - today '
  'only a promo code. Never null on a movement that leaves the wallet.';

-- ============================================================================
-- 3. A code for a buck, minted where the grant happens
-- ----------------------------------------------------------------------------
-- The alphabet is `mintPromoCode`'s, minus the characters people get wrong: no
-- O, I, L, 0 or 1. Eight characters from thirty-one symbols is about forty
-- bits, which is far more than this needs - a buck granted straight into a
-- pocket has `redeemed_at` set at birth and is never in flight, so nobody can
-- guess their way into one. The length is for the codes that *are* handed out,
-- and keeping one shape for all of them is what lets support read any code
-- aloud without asking which kind it is.
--
-- The loop is for the unique index, not for the odds. Five tries and then let
-- the insert fail honestly.
-- ============================================================================

create or replace function public.mint_buck_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_body     text;
  v_code     text;
  v_try      integer;
begin
  for v_try in 1..5 loop
    v_body := '';
    for i in 1..8 loop
      v_body := v_body || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;

    v_code := 'SKIN-' || v_body;

    if not exists (select 1 from public.skin_vouchers s where s.code = v_code) then
      return v_code;
    end if;
  end loop;

  -- Five collisions in a row is not bad luck, it is something wrong with
  -- `random()`. Returning the last one lets the unique index say so.
  return v_code;
end;
$$;

-- ============================================================================
-- 4. Redeeming, with everything in the same transaction
-- ----------------------------------------------------------------------------
-- Everything above the grant is unchanged from the version this replaces. What
-- is new is at the bottom: the redemption row is captured (`returning ... into`)
-- so the bucks can point at it, and `generate_series` writes one row per buck
-- in one statement - so a batch is all or nothing rather than three bucks and
-- an error.
--
-- The extra return column is appended rather than inserted, because callers
-- read this by name but the migration that adds a column in the middle of a
-- `returns table` is the migration that breaks a deploy halfway through.
-- ============================================================================

drop function if exists public.redeem_promo_code(text, uuid, text, uuid, text, boolean);

create or replace function public.redeem_promo_code(
  p_code           text,
  p_user_id        uuid,
  p_source         text    default 'link',
  p_tenant_id      uuid    default null,
  p_campaign       text    default null,
  p_ignore_history boolean default false
)
returns table (
  outcome          text,
  granted_until    timestamptz,
  code_id          uuid,
  granted_tier     text,
  granted_bucks    integer,
  granted_vouchers integer,
  granted_coins    integer,
  /*
    The bearer codes, in the only moment they can be shown.

    They are nobody's until somebody types them, so they are not readable
    afterwards by the person who was given them - `skin_vouchers` lets you see
    what you own and what you minted, and an unclaimed row is neither. Handing
    them back here is what lets the confirmation print them; a caller that
    throws the array away has minted confetti, which is the same trade the
    backoffice mint makes and says so.
  */
  voucher_codes    text[]
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code       public.promo_codes%rowtype;
  v_until      timestamptz;
  v_redemption uuid;
  v_codes      text[] := '{}';
  v_balance    bigint;
begin
  select * into v_code
    from public.promo_codes
   where code = upper(btrim(p_code))
   for update;

  if not found then
    return query select 'unknown'::text, null::timestamptz, null::uuid, null::text, 0, 0, 0, '{}'::text[];
    return;
  end if;

  if v_code.revoked_at is not null
     or (v_code.starts_at  is not null and v_code.starts_at  > now())
     or (v_code.expires_at is not null and v_code.expires_at <= now())
     or (v_code.max_uses   is not null and v_code.uses >= v_code.max_uses)
  then
    return query select 'inactive'::text, null::timestamptz, v_code.id, null::text, 0, 0, 0, '{}'::text[];
    return;
  end if;

  -- Not bypassable. See the note above: this one is a unique index, and Clear
  -- is the control that means "take the old grant away".
  if exists (
    select 1
      from public.promo_redemptions r
     where r.user_id = p_user_id
       and r.granted_tier = v_code.tier
  ) then
    return query select 'already'::text, null::timestamptz, v_code.id, null::text, 0, 0, 0, '{}'::text[];
    return;
  end if;

  if not p_ignore_history and public.account_has_had_tier(p_user_id, v_code.tier) then
    return query select 'not_new'::text, null::timestamptz, v_code.id, null::text, 0, 0, 0, '{}'::text[];
    return;
  end if;

  v_until := case
               when v_code.free_days is null then null
               else now() + make_interval(days => v_code.free_days)
             end;

  insert into public.promo_redemptions
    (code_id, user_id, tenant_id, granted_days, granted_until, granted_tier,
     granted_spaces, granted_bucks, granted_vouchers, granted_coins,
     source, campaign)
  values
    (v_code.id, p_user_id, p_tenant_id, v_code.free_days, v_until, v_code.tier,
     v_code.spaces, coalesce(v_code.bucks, 0), coalesce(v_code.vouchers, 0),
     coalesce(v_code.coins, 0), coalesce(p_source, 'link'), p_campaign)
  returning id into v_redemption;

  /*
    The bucks, straight into the pocket.

    `redeemed_at` is set at birth: there is nobody to redeem them from, the
    account that just spent the code is the owner, and a code in flight that
    only its owner could ever type would be a second step for no reason. Same
    call `grantSubscriptionVoucher` makes for the monthly one.

    They still carry a code, because the column requires one and because a buck
    that is later gifted needs something to be gifted *as* - `gift_skin_voucher`
    overwrites it at that point. Nobody is ever shown these.
  */
  if coalesce(v_code.bucks, 0) > 0 then
    insert into public.skin_vouchers
      (code, owner_id, created_by, source, promo_redemption_id, promo_seq, redeemed_at)
    select
      public.mint_buck_code(), p_user_id, p_user_id, 'promo', v_redemption, seq, now()
      from generate_series(1, v_code.bucks) as seq;
  end if;

  /*
    The bearer codes, if the campaign asked for any.

    Owned by nobody and numbered *after* the pocket bucks, so the two batches
    share one sequence and the unique index above keeps counting. `created_by`
    is the redeemer rather than the operator: these are theirs to give away, and
    the select policy on `skin_vouchers` reads `created_by` - so the one person
    who should be able to look them up again can.
  */
  if coalesce(v_code.vouchers, 0) > 0 then
    with minted as (
      insert into public.skin_vouchers
        (code, owner_id, created_by, source, promo_redemption_id, promo_seq)
      select
        public.mint_buck_code(), null, p_user_id, 'promo', v_redemption,
        coalesce(v_code.bucks, 0) + seq
        from generate_series(1, v_code.vouchers) as seq
      returning code
    )
    select array_agg(code order by code) into v_codes from minted;
  end if;

  /*
    The coins, into the wallet rather than into a purse.

    A purse belongs to a space, and at the moment a code is redeemed there
    frequently is not one - the sign-up door runs before the account has joined
    anything at all. The wallet is the account's own, survives every space it
    ever leaves, and is exactly what §3 of the economy spec describes.

    Both rows are written here rather than through `wallet_move`, which moves
    coins between a purse and a wallet and has a purse on both sides of its
    reasoning. `on conflict` because most redeemers have never held a coin and
    so have no row yet.
  */
  if coalesce(v_code.coins, 0) > 0 then
    insert into public.wallets (user_id, coins, updated_at)
    values (p_user_id, v_code.coins, now())
    on conflict (user_id) do update
      set coins = public.wallets.coins + excluded.coins,
          updated_at = now()
    returning coins into v_balance;

    insert into public.wallet_ledger (user_id, tenant_id, amount, transfer, balance)
    values (p_user_id, null, v_code.coins, gen_random_uuid(), v_balance);
  end if;

  update public.promo_codes
     set uses = uses + 1
   where id = v_code.id;

  return query
    select 'ok'::text, v_until, v_code.id, v_code.tier,
           coalesce(v_code.bucks, 0), coalesce(v_code.vouchers, 0),
           coalesce(v_code.coins, 0), coalesce(v_codes, '{}'::text[]);
end;
$$;

grant execute on function public.redeem_promo_code(text, uuid, text, uuid, text, boolean)
  to authenticated, service_role;
