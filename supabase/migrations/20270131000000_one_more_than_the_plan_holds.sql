-- ============================================================================
-- What a space bought with coins
-- ----------------------------------------------------------------------------
-- docs/product/economy.md §8. The fourth rung of `resolveLimit`: the tier says
-- what you get, an operator override says what the cap is, this says how many
-- *more* than that somebody paid for, and the platform ceiling clamps the lot.
--
-- ----------------------------------------------------------------------------
-- Added, not maxed - and that is why it is a count rather than a limit
-- ----------------------------------------------------------------------------
-- The override next door is somebody saying what the cap *is*. This is somebody
-- buying one *more*. If it were maxed like an override, the second blueprint a
-- member paid for would do nothing at all on a tier that already included
-- three, and they would have been charged for nothing.
--
-- It is a plain non-negative integer for the same reason: **you cannot buy
-- unlimited.** There is no price for it and there should not be - a single
-- purchase that lifts a cap forever is a thing somebody clicks by accident.
--
-- ----------------------------------------------------------------------------
-- One row per space, never per buyer
-- ----------------------------------------------------------------------------
-- A purchase is permanent and belongs to the **space**. Somebody who buys an
-- eleventh blueprint and then leaves does not take the slot with them, and a
-- space that downgrades keeps what it paid for.
--
-- The alternative - slots that evaporate when their buyer leaves or when a plan
-- changes - turns every departure and every downgrade into a deletion, which
-- `docs/product/pricing.md` §6 already refused for exactly this reason. Who
-- paid is a question for the log, which has the `CoinsSpent` with the reason on
-- it; it is not a thing this table has to carry in order to be correct.
--
-- ----------------------------------------------------------------------------
-- `key` is not a foreign key, and could not usefully be one
-- ----------------------------------------------------------------------------
-- It holds a `LimitKey` - 'blueprints', 'privateXps' - which lives in
-- TypeScript, in `src/domain/billing/tiers.ts`, because those numbers move the
-- public pricing table and want a commit rather than a row. A check constraint
-- listing them here would be a second copy of that list, in a place a migration
-- has to be written to change, and the two would drift.
--
-- What guards it instead is that nothing else can write here: `space_extra_add`
-- is the only writer, and it is called from server code that already has a
-- typed `Purchasable`. An unknown key in this table would resolve to no rung at
-- all rather than to a wrong one, which is the safe way for that to fail.
-- ============================================================================

create table if not exists public.space_extras (
  tenant_id  uuid        not null references public.tenants_read_model (id) on delete cascade,
  -- A `LimitKey`. See above for why this is not constrained here.
  key        text        not null,
  -- How many extra, beyond whatever the tier and any override allow.
  bought     integer     not null default 0 check (bought >= 0),
  updated_at timestamptz not null default now(),

  primary key (tenant_id, key)
);

-- ----------------------------------------------------------------------------
-- Read by anyone in the space; written by the function below and nothing else.
--
-- Read is space-wide because the number is part of "what this space may have",
-- which every member can already see on the settings page. There is nothing
-- sensitive in it - it says a space holds two extra blueprints, not who paid.
--
-- **No insert or update policy**, which is the enforcement rather than an
-- omission: a member who could write here directly could raise their space's
-- limits without spending anything, and the coins are the entire point.
-- ----------------------------------------------------------------------------

alter table public.space_extras enable row level security;

create policy "space_extras_select"
  on public.space_extras for select
  to authenticated
  using (public.tenant_role(tenant_id) is not null);

-- ============================================================================
-- Buying one more
-- ----------------------------------------------------------------------------
-- Returns the new count, or `null` when the caller is not in the space.
--
-- **Called only after the coins have actually moved.** The purse is debited
-- first and this runs second, so a crash between them costs somebody the price
-- of a blueprint rather than handing out a free one. That is the same ordering
-- every payment in this economy uses and the argument is at `CoinsSent`: losing
-- a movement is a support conversation, printing one is a broken economy.
--
-- No idempotency key, and it needs none - unlike a battle payout. Calling this
-- twice means somebody bought two, which is exactly what a double charge
-- produced. There is no way for a repeat to create a slot that was not paid
-- for, because the charge is upstream of it.
-- ============================================================================

create or replace function public.space_extra_add(
  p_tenant uuid,
  p_key    text
)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_bought integer;
begin
  -- `security definer`, so RLS is not standing behind this and the membership
  -- test has to be written out. Any member may buy: they are spending their own
  -- coins on a thing the space keeps, and narrowing it to owners would mean the
  -- person who hit the wall has to go and ask somebody else to fix it.
  if public.tenant_role(p_tenant) is null then
    return null;
  end if;

  insert into public.space_extras (tenant_id, key, bought, updated_at)
  values (p_tenant, p_key, 1, now())
  on conflict (tenant_id, key) do update
     set bought = public.space_extras.bought + 1,
         updated_at = now()
  returning bought into v_bought;

  return v_bought;
end $$;

revoke all on function public.space_extra_add(uuid, text) from public;
grant execute on function public.space_extra_add(uuid, text) to authenticated;
