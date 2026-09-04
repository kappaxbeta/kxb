-- ============================================================================
-- A voucher, and the switch that decides whether they exist
-- ----------------------------------------------------------------------------
-- docs/product/economy.md §7.3. The way out for a player with an empty purse.
--
-- ----------------------------------------------------------------------------
-- Off, and the amount is the operator's
-- ----------------------------------------------------------------------------
-- `voucher` is a *valued* flag rather than a boolean, and that is the whole
-- design of it. The brief named 10,000 coins, which is a hundred times the
-- opening balance - a player holding one has no reason to care what anything
-- costs for a very long time, and every price in the product flattens while
-- they spend it.
--
-- That may be exactly right for a space running an event, and badly wrong for
-- one running an economy. It is not a decision a constant should make, so the
-- number lives on the flag: off means vouchers do not exist, on means they are
-- worth whatever an operator set. The parked value is the brief's 10,000 so
-- nobody has to guess what was originally meant.
--
-- ----------------------------------------------------------------------------
-- Once per space, and only with nothing left
-- ----------------------------------------------------------------------------
-- The row *is* the claim - its presence is what makes a second one impossible,
-- the same way `battle_payouts` works. Both conditions are checked in
-- `claimVoucher`: a voucher is for somebody who cannot play, not a bonus for
-- somebody who can.
--
-- `coins` records what it was worth on the day rather than what the flag says
-- now, for the reason `PropPlaced` gives about `price`: an operator lowering
-- the number next month must not change what somebody was given last month.
-- ============================================================================

create table if not exists public.voucher_claims (
  tenant_id  uuid        not null references public.tenants_read_model (id) on delete cascade,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  -- What it was worth when it was claimed. See above.
  coins      integer     not null check (coins > 0),
  created_at timestamptz not null default now(),

  primary key (tenant_id, user_id)
);

-- ----------------------------------------------------------------------------
-- Read your own, so a surface can stop offering what you have already taken.
--
-- No insert policy: a row here is worth coins, and anybody who could write one
-- could write it repeatedly. `claimVoucher` writes with the service role after
-- it has checked the flag and the empty purse.
-- ----------------------------------------------------------------------------

alter table public.voucher_claims enable row level security;

create policy "voucher_claims_select_own"
  on public.voucher_claims for select
  to authenticated
  using (user_id = (select auth.uid()));

insert into public.feature_flags (key, enabled, value_int, label, description) values
  ('voucher', false, 10000, 'Vouchers',
   'Off, there are no vouchers and a player with an empty purse earns their way back through the cafe. On, somebody with nothing left may claim one, once per space, worth whatever this value says. The number matters more than the switch: 10000 is a hundred times the opening balance, so a voucher that size flattens every price in the product for as long as it lasts. Lower it for a space running an economy; leave it for a space running an event.')
on conflict (key) do nothing;
