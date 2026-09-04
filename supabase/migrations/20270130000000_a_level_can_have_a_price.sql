-- ============================================================================
-- What a level costs, and who has already paid it
-- ----------------------------------------------------------------------------
-- docs/product/economy.md §8. Two prices an owner may put on their own level,
-- and the record of who has settled the one that is only paid once.
--
-- ----------------------------------------------------------------------------
-- Two prices, and why they are not alternatives
-- ----------------------------------------------------------------------------
-- `price_once` is what it costs to **play**, paid a single time. `price_remix`
-- is what it costs to **take a copy and change it**. An owner can charge for
-- one and not the other in either direction, and both are `0` - free - until
-- somebody says otherwise. Nothing about these columns existing changes what an
-- untouched level costs.
--
-- `price_once` replaces the per-play stake rather than adding to it. A level
-- with a one-time price is bought rather than rented, and being charged a toll
-- on something you have already bought is how people stop trusting a price.
--
-- ----------------------------------------------------------------------------
-- Projected, not written by a form
-- ----------------------------------------------------------------------------
-- These are read-model columns like every other one on this table: folded from
-- `XpPriced` on the project's own stream by src/domain/xps/projection.ts. The
-- decider is what bounds them and what refuses shares totalling more than the
-- whole - a split that paid out more than arrived would be minting, dressed up
-- as a collaboration.
-- ============================================================================

alter table public.xps_read_model
  add column if not exists price_once  integer not null default 0,
  add column if not exists price_remix integer not null default 0,
  -- Account id to whole percentage. What is *not* named here stays with the
  -- owner, which is why an unshared level carries no key at all rather than a
  -- row saying the owner gets everything.
  add column if not exists price_split jsonb;

-- Both are coins, and neither is ever negative. A cheap assertion that catches
-- a projection writing something the decider would have refused.
alter table public.xps_read_model
  drop constraint if exists xps_prices_not_negative;
alter table public.xps_read_model
  add constraint xps_prices_not_negative
  check (price_once >= 0 and price_remix >= 0);

-- ============================================================================
-- Who has bought which level
-- ----------------------------------------------------------------------------
-- One row per (account, level). Its presence is the whole meaning: you have
-- paid, so you are not charged again - not the stake, and not the price.
--
-- ----------------------------------------------------------------------------
-- Why it is per account rather than per (account, space)
-- ----------------------------------------------------------------------------
-- Because what was bought is *the level*, and a level is not a space's. The
-- same published level can be played in a dozen spaces, and somebody who paid
-- for it once should not be asked again because they walked into a different
-- room. That is the difference between buying a thing and paying a door charge,
-- and this table is the buying one.
--
-- `paid` records what was actually charged rather than what the level costs
-- now, for the reason `PropPlaced` gives about `price`: re-pricing next month
-- must not change what somebody paid last month, and a receipt that reads back
-- the current price is not a receipt.
-- ============================================================================

create table if not exists public.xp_purchases (
  account_id uuid        not null references auth.users (id) on delete cascade,
  xp_id      uuid        not null references public.xps_read_model (id) on delete cascade,
  -- What it cost on the day. See above.
  paid       integer     not null check (paid >= 0),
  -- The space they were standing in when they bought it. Kept for the money
  -- view, which reports per space; it is not part of what was bought.
  tenant_id  uuid        not null,
  created_at timestamptz not null default now(),

  primary key (account_id, xp_id)
);

create index if not exists xp_purchases_xp_idx
  on public.xp_purchases (xp_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Row level security
-- ----------------------------------------------------------------------------
-- Read your own. A level's owner would reasonably like to see who has bought
-- it, and does not get that here - "how many people bought this" is a question
-- for the money view, which reads through the service role, and answering it
-- from a row-level policy would hand every owner a list of named accounts they
-- have no other way to see.
--
-- No insert policy: rows appear only through `chargeEntry`, which writes with
-- the service role after the coins have actually moved. A client that could
-- insert here could grant itself a level for nothing.
-- ----------------------------------------------------------------------------

alter table public.xp_purchases enable row level security;

create policy "xp_purchases_select_own"
  on public.xp_purchases for select
  to authenticated
  using (account_id = (select auth.uid()));
