-- ============================================================================
-- Free skins: the monsters, and the door that costs nothing
-- ----------------------------------------------------------------------------
-- The kappa pack's two monsters join the shelf at a price of zero. A free
-- skin is still an *ownership* - it lands in skin_ownership like a bought
-- one, follows the account the same way, and survives being retired the same
-- way - because "free" is a fact about the price, not about the binding.
--
-- What zero cannot ride is the till. Stripe refuses a session for nothing -
-- rightly, a payment provider asked to process the absence of a payment - and
-- a wallet asked to spend nothing is the same refusal one currency along. So
-- a free skin gets its own definer function, the same shape as the spend,
-- whose whole rule is "the row really is free". The price check lives in the
-- function rather than in the action for the reason the ownership check lives
-- in the profile_skins policy: it is the rule a future call site is most
-- likely to forget, and forgetting it here would hand out the paid shelf.
--
-- Free means free in *every* currency the shelf quotes. The shop prices in
-- bucks off `voucher_cost` and Checkout prices in cents off `price_cents`, so
-- a row with one of them at zero and the other at one is not a free skin, it
-- is a skin that is free only where you happen to be standing. Both, or it is
-- not free.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Zero becomes sayable
-- ----------------------------------------------------------------------------
-- `voucher_cost >= 1` was right when a voucher was the only way to hold a
-- skin that money could not buy: a cost of nothing meant a row that could be
-- claimed forever for free by accident. Free is now a thing we say on
-- purpose, so the floor drops to zero and `claim_free_skin` is what keeps it
-- deliberate - nothing else may hand out a row, whatever its price.
-- ----------------------------------------------------------------------------
do $$ begin
  alter table public.skins drop constraint if exists skins_voucher_cost_check;
  alter table public.skins add constraint skins_voucher_cost_check check (voucher_cost >= 0);
exception when duplicate_object then null; end $$;

--   ok           - granted
--   unknown_skin - not on the shelf
--   inactive     - retired from sale
--   owned        - already yours; nothing happened
--   not_free     - it has a price, so it goes through the till or the wallet

create or replace function public.claim_free_skin(
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

  -- Free in every currency the shelf quotes, and never a super: a super at
  -- price 0 still costs two of whatever the wallet holds, and a skin at zero
  -- cents that still wants a buck is free only where you are standing.
  if v_skin.tier <> 'skin' or v_skin.price_cents <> 0 or v_skin.voucher_cost <> 0 then
    return 'not_free';
  end if;

  insert into public.skin_ownership (user_id, skin_id, via)
  values (p_user_id, p_skin_id, 'purchase')
  on conflict do nothing;

  return 'ok';
end $$;

revoke all on function public.claim_free_skin(text, uuid) from public;
grant execute on function public.claim_free_skin(text, uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- The monsters
-- ----------------------------------------------------------------------------
-- Same `do nothing` as the first nine: after this insert the backoffice owns
-- the words and the price - raising a free skin to €3 later is one edit
-- there, not a migration.
-- ----------------------------------------------------------------------------
insert into public.skins (id, name, tier, price_cents, voucher_cost, backstory, active) values
  ('kappa/Monster', 'Gnash', 'skin', 0, 0,
   'Gnash lives under the arcade and comes up for the noise. Has never won a game and never stopped grinning about it; the teeth are for smiling, mostly. Free to wear, because Gnash believes doors, tickets and prices are things that happen to other people.',
   true),
  ('kappa/MonsterCostume', 'Definitely Gnash', 'skin', 0, 0,
   'Absolutely, certainly the real monster and not somebody in a zip-up suit who heard the real one gets free lemonade. The tail drags a little. The roar needs work. The confidence is one hundred percent genuine, and that is what counts.',
   true)
on conflict (id) do nothing;

-- The monsters were briefly free of money and still a buck each, which is the
-- half-free state the header argues against. Corrected in place rather than
-- by re-inserting, because `do nothing` above will not touch a row that
-- exists - and narrowed to exactly that state, so an operator who has since
-- decided to charge for a monster keeps their price.
update public.skins
   set voucher_cost = 0
 where id in ('kappa/Monster', 'kappa/MonsterCostume')
   and price_cents = 0
   and voucher_cost = 1;
