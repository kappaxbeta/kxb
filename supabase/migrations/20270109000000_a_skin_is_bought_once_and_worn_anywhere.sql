-- ============================================================================
-- Skins: a look for the XP character, bought once and bound to the person
-- ----------------------------------------------------------------------------
-- The adventurers pack (nine dressed characters on the dummy's rig) is the
-- first thing this platform sells that is not a tier: a *skin*. The art ships
-- with the client like every other pack; what is sold is the entitlement to
-- wear it. So the catalogue rows here carry no geometry - `id` is the model id
-- the XP catalogue already knows (`adventurers/Knight`), and everything else
-- is shop copy: a name, a backstory, a tier, a price.
--
-- Two tiers, two currencies, on purpose:
--
--   * a `skin` costs money (price_cents, charged through Stripe Checkout);
--   * a `super` skin costs two vouchers and cannot be bought with money.
--
-- A voucher is a bearer code, and that is the whole design: the subscription's
-- monthly freebie, the backoffice's promo mint and "here, have this one" from
-- a friend are all the same row in a different state. `owner_id null` means
-- the code is in flight; redeeming claims it; spending consumes it and records
-- what it bought. Gifting sets the owner back to null under a fresh code, so a
-- screenshotted old code cannot race the recipient.
--
-- Like profile_avatars, none of this is event-sourced: ownership is a platform
-- fact with audit value, not a game's memory - plain tables, in the spirit of
-- promo_codes, with the money-adjacent transitions serialised in definer
-- functions the way redeem_promo_code already is.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The catalogue
-- ----------------------------------------------------------------------------
create table if not exists public.skins (
  -- The XP catalogue's model id, e.g. 'adventurers/Knight'. Never a URL: the
  -- renderer builds those, so a stale id degrades to the dummy, not a fetch.
  id           text        primary key,
  name         text        not null,
  tier         text        not null default 'skin' check (tier in ('skin', 'super')),
  -- What Checkout charges for a `skin`. Ignored for a `super`, which money
  -- cannot buy.
  price_cents  integer     not null default 300 check (price_cents >= 0),
  -- What a `super` costs in vouchers. 1 for a regular skin, so the monthly
  -- freebie is genuinely "a skin free every month", not a coupon toward one.
  voucher_cost integer     not null default 1 check (voucher_cost >= 1),
  backstory    text        not null default '',
  -- Per-skin availability. The shop as a whole opens on the `skin_shop`
  -- feature flag; this is the narrower switch for retiring one look without
  -- pulling the shelf. An owned skin stays wearable when this goes off.
  active       boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.skins enable row level security;

-- The shelf is public - guests browse before they have an account, and a
-- price list is not a secret. Writing it is backoffice work.
drop policy if exists skins_select_all on public.skins;
create policy skins_select_all
  on public.skins for select
  using (true);

drop policy if exists skins_admin_all on public.skins;
create policy skins_admin_all
  on public.skins for all
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

-- ----------------------------------------------------------------------------
-- Ownership
-- ----------------------------------------------------------------------------
-- Bound to the person, like profile_avatars: the same skin follows you into
-- every space and every level. Rows are written only by the definer functions
-- below and by the platform (webhook / backoffice) through the service role -
-- there is deliberately no self-serve insert policy, because every way to gain
-- a skin is either a payment or a voucher, and both have their own door.
-- ----------------------------------------------------------------------------
create table if not exists public.skin_ownership (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  skin_id    text        not null references public.skins (id),
  via        text        not null check (via in ('purchase', 'voucher', 'backoffice')),
  created_at timestamptz not null default now(),
  primary key (user_id, skin_id)
);

alter table public.skin_ownership enable row level security;

drop policy if exists skin_ownership_select_own on public.skin_ownership;
create policy skin_ownership_select_own
  on public.skin_ownership for select
  using (user_id = auth.uid() or public.is_backoffice_admin());

drop policy if exists skin_ownership_admin_all on public.skin_ownership;
create policy skin_ownership_admin_all
  on public.skin_ownership for all
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

-- ----------------------------------------------------------------------------
-- Vouchers
-- ----------------------------------------------------------------------------
create table if not exists public.skin_vouchers (
  id                uuid        primary key default gen_random_uuid(),
  -- Minted in TypeScript with the promo alphabet (no O/I/L/0/1), stored
  -- upper-case so a code read aloud survives the trip.
  code              text        not null unique check (code = upper(code)),
  -- Null while the code is in flight: freshly minted in the backoffice, or
  -- gifted away and not yet redeemed.
  owner_id          uuid        references auth.users (id) on delete set null,
  created_by        uuid        references auth.users (id) on delete set null,
  source            text        not null check (source in ('backoffice', 'subscription', 'gift')),
  -- The invoice that granted a subscription voucher. Unique, which is the
  -- idempotency for the webhook: Stripe may deliver invoice.paid twice, the
  -- second insert conflicts, and one month stays one voucher.
  stripe_invoice_id text        unique,
  redeemed_at       timestamptz,
  spent_at          timestamptz,
  spent_on          text        references public.skins (id),
  created_at        timestamptz not null default now()
);

create index if not exists skin_vouchers_owner_idx on public.skin_vouchers (owner_id);

alter table public.skin_vouchers enable row level security;

-- You can see what you hold and what you minted; the backoffice sees the lot.
-- Nobody can *list* codes in flight - that would be a till anyone could read.
drop policy if exists skin_vouchers_select_own on public.skin_vouchers;
create policy skin_vouchers_select_own
  on public.skin_vouchers for select
  using (owner_id = auth.uid() or created_by = auth.uid() or public.is_backoffice_admin());

drop policy if exists skin_vouchers_admin_all on public.skin_vouchers;
create policy skin_vouchers_admin_all
  on public.skin_vouchers for all
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

-- ----------------------------------------------------------------------------
-- The chosen skin
-- ----------------------------------------------------------------------------
-- profile_avatars' sibling, not its replacement: the animal is who you are in
-- the lounge, the skin is what your XP body wears. Kept apart because the two
-- rosters validate differently (an animal is a bare name on the lounge
-- allow-list, a skin is a qualified catalogue id you must own) and because
-- clearing one should never cost you the other.
-- ----------------------------------------------------------------------------
create table if not exists public.profile_skins (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  -- A qualified XP catalogue id, e.g. 'adventurers/Knight'. Never a URL.
  model      text        not null references public.skins (id),
  updated_at timestamptz not null default now()
);

alter table public.profile_skins enable row level security;

-- Same reading boundary as profile_avatars: yourself always, strangers never,
-- people you share a space with - because that is who draws your body.
drop policy if exists profile_skins_select_self_or_shared on public.profile_skins;
create policy profile_skins_select_self_or_shared
  on public.profile_skins for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.tenant_members mine
      join public.tenant_members theirs
        on theirs.tenant_id = mine.tenant_id
      where mine.user_id = auth.uid()
        and theirs.user_id = public.profile_skins.user_id
    )
  );

-- Writing is your own row, and only a skin you own. The ownership check lives
-- in the policy rather than only in the action, for the same reason
-- redeem_promo_code re-checks not_new: it is the rule a future call site is
-- most likely to forget, and forgetting it here would dress people in skins
-- they never bought.
drop policy if exists profile_skins_write_self on public.profile_skins;
create policy profile_skins_write_self
  on public.profile_skins for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.skin_ownership o
      where o.user_id = auth.uid() and o.skin_id = model
    )
  );

drop policy if exists profile_skins_update_self on public.profile_skins;
create policy profile_skins_update_self
  on public.profile_skins for update
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.skin_ownership o
      where o.user_id = auth.uid() and o.skin_id = model
    )
  );

drop policy if exists profile_skins_delete_self on public.profile_skins;
create policy profile_skins_delete_self
  on public.profile_skins for delete
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Redeeming a voucher code
-- ----------------------------------------------------------------------------
-- One function under one transaction, like redeem_promo_code, and for the same
-- race: two browsers pasting the same gift code must produce one owner and one
-- refusal, not two owners. Refusals are codes; the sentences live in
-- TypeScript with the rest of the copy.
--
--   ok       - the code is now yours
--   unknown  - no such code
--   taken    - somebody holds it already (possibly you)
--   spent    - it bought something before you got here
-- ============================================================================

create or replace function public.redeem_skin_voucher(
  p_code    text,
  p_user_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_voucher public.skin_vouchers%rowtype;
begin
  select * into v_voucher
    from public.skin_vouchers
   where code = upper(btrim(p_code))
   for update;

  if not found then
    return 'unknown';
  end if;

  if v_voucher.spent_at is not null then
    return 'spent';
  end if;

  if v_voucher.owner_id is not null then
    return 'taken';
  end if;

  update public.skin_vouchers
     set owner_id = p_user_id, redeemed_at = now()
   where id = v_voucher.id;

  return 'ok';
end $$;

revoke all on function public.redeem_skin_voucher(text, uuid) from public;
grant execute on function public.redeem_skin_voucher(text, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Spending vouchers on a skin
-- ----------------------------------------------------------------------------
-- The cost comes from the catalogue row inside the same transaction, never
-- from the caller - a client that could name its own price would name 0. The
-- oldest vouchers go first, which is the only spend order a holder would not
-- argue with.
--
--   ok           - granted; the vouchers are marked with what they bought
--   unknown_skin - not on the shelf
--   inactive     - retired from sale
--   owned        - already yours; nothing was spent
--   short        - not enough vouchers
-- ----------------------------------------------------------------------------

create or replace function public.spend_skin_vouchers(
  p_skin_id text,
  p_user_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_skin public.skins%rowtype;
  v_ids  uuid[];
begin
  select * into v_skin from public.skins where id = p_skin_id;

  if not found then
    return 'unknown_skin';
  end if;

  if not v_skin.active then
    return 'inactive';
  end if;

  if exists (
    select 1 from public.skin_ownership o
    where o.user_id = p_user_id and o.skin_id = p_skin_id
  ) then
    return 'owned';
  end if;

  select array_agg(id) into v_ids from (
    select id
      from public.skin_vouchers
     where owner_id = p_user_id and spent_at is null
     order by created_at
     limit v_skin.voucher_cost
       for update
  ) picked;

  if v_ids is null or array_length(v_ids, 1) < v_skin.voucher_cost then
    return 'short';
  end if;

  update public.skin_vouchers
     set spent_at = now(), spent_on = p_skin_id
   where id = any (v_ids);

  insert into public.skin_ownership (user_id, skin_id, via)
  values (p_user_id, p_skin_id, 'voucher')
  on conflict do nothing;

  return 'ok';
end $$;

revoke all on function public.spend_skin_vouchers(text, uuid) from public;
grant execute on function public.spend_skin_vouchers(text, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Gifting a voucher
-- ----------------------------------------------------------------------------
-- Releasing, really: your claimed voucher goes back into flight under a fresh
-- code (minted by the caller, same alphabet as the rest), and whoever you send
-- the code to claims it with redeem_skin_voucher. The re-code is the point -
-- the code that entered your account dies with the gift, so it cannot be
-- redeemed out from under the person you gave it to.
--
--   ok       - released; send them the code
--   unknown  - not yours to give, or already spent
-- ----------------------------------------------------------------------------

create or replace function public.gift_skin_voucher(
  p_voucher_id uuid,
  p_user_id    uuid,
  p_code       text
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.skin_vouchers
     set owner_id = null,
         redeemed_at = null,
         source = 'gift',
         code = upper(btrim(p_code))
   where id = p_voucher_id
     and owner_id = p_user_id
     and spent_at is null;

  if not found then
    return 'unknown';
  end if;

  return 'ok';
end $$;

revoke all on function public.gift_skin_voucher(uuid, uuid, text) from public;
grant execute on function public.gift_skin_voucher(uuid, uuid, text) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- The shelf itself
-- ----------------------------------------------------------------------------
-- Nine rows, one per adventurer. `do nothing` on conflict so re-running this
-- file never undoes a price change or a rewritten backstory - after this
-- insert, the backoffice owns these words.
-- ----------------------------------------------------------------------------
insert into public.skins (id, name, tier, price_cents, voucher_cost, backstory, active) values
  ('adventurers/Knight', 'Sir Percival', 'skin', 300, 1,
   'Percival treats every lobby as a castle and every guest as visiting royalty. Holds the door, holds the line, holds the high score on exactly one machine and will not say which. The armour has never once been off; the leaderboards suggest neither has he.',
   true),
  ('adventurers/Barbarian', 'Bram', 'skin', 300, 1,
   'Bram is the loud half of the arcade in one person. Celebrates wins by roaring, celebrates losses by roaring, orders a lemonade at the café by roaring, quietly. The axe is foam. The enthusiasm is not.',
   true),
  ('adventurers/Druid', 'Moss', 'skin', 300, 1,
   'Moss speaks for the potted plants, and claims they have opinions about the music. Turned the corner of the lounge into a small forest nobody remembers agreeing to and nobody would now give up. If you are lost, Moss is the one the birds ask.',
   true),
  ('adventurers/Engineer', 'Sprocket', 'skin', 300, 1,
   'Sprocket built half the cabinets in the arcade and fixed the other half after Bram. Carries a wrench the way other people carry opinions, and has never met a machine that stayed broken out of spite. The goggles are for welding. The grin is standard issue.',
   true),
  ('adventurers/Ranger', 'Fletch', 'skin', 300, 1,
   'Fletch has never missed. Not the target, not the last train, not a single word of gossip whispered across the lounge. Stands at the back of every photo and somehow ends up in focus. The quiver is full; nobody has ever seen an arrow leave it.',
   true),
  ('adventurers/Rogue', 'Sly', 'skin', 300, 1,
   'Sly wins card games nobody remembers agreeing to play. The coins on the table are yours, briefly. Utterly trustworthy in every matter except games of chance, directions, and the question of who ate the last slice.',
   true),
  ('adventurers/Mage', 'Vex', 'super', 0, 2,
   'Vex once beat a level by arguing with its physics until the physics apologised. The robes crackle faintly near vending machines, which now dispense for free and are afraid to say so. Do not ask about the hat. The hat is load-bearing.',
   true),
  ('adventurers/Rogue_Hooded', 'The Hood', 'super', 0, 2,
   'Nobody has seen the face under the hood, and the hood has seen everything. Appears on the leaderboard as three different names, all first. Leaves before the applause, tips the café generously, and is rumoured to be someone you know.',
   true),
  ('adventurers/Barbarian_Large', 'Big Bram', 'super', 0, 2,
   'Every legend gets taller with each telling; Big Bram is what happens when the telling goes on all night. Twice the Bram, twice the roar, ducks through doorways as a courtesy to the doorways. The ground does not shake - it applauds.',
   true)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- The flag that opens the shop
-- ----------------------------------------------------------------------------
-- Off by default, like every flag guarding unfinished surface - the registry's
-- fallback note applies verbatim. And the row must exist here or the flag is
-- unreachable: /ovaloffice/feature-flags lists what the table holds, not what
-- the TypeScript registry declares. `do nothing`, so re-running this does not
-- close a shop somebody opened.
-- ----------------------------------------------------------------------------
insert into public.feature_flags (key, enabled, label, description) values
  ('skin_shop', false, 'Skin shop',
   'The shelf of character skins for the XP body: regular skins for money, super skins for vouchers. Owned skins keep working when this is off; what closes is buying.')
on conflict (key) do nothing;
