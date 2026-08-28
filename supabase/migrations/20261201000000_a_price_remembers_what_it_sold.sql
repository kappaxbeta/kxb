-- ============================================================================
-- A price remembers what it sold
-- ----------------------------------------------------------------------------
-- docs/product/pricing.md §9, which has been a plan rather than a mechanism.
--
-- The `tiers` table one migration ago is keyed one row per tier, and that shape
-- cannot say the thing grandfathering has to say: *several prices map to one
-- tier, and each sold something different*. Today's xo price sells six seats;
-- the xo price people bought on was advertised with "unlimited members and
-- guests". Both are tier `xo`, and one row cannot hold both answers.
--
-- So the mapping moves out. `tiers` keeps saying what a tier *is* - its limits,
-- its label, what it costs today. This table says what each price *sold*, which
-- is a different fact with a different lifetime: a tier changes, a price is
-- frozen the moment somebody buys on it.
--
-- ----------------------------------------------------------------------------
-- Additive on purpose
-- ----------------------------------------------------------------------------
-- `tiers` is already deployed. This adds a table beside it and drops the two
-- columns that would otherwise be a second place to look for the same answer -
-- `provider` and `price_id` were seeded NULL and nothing reads them in anger
-- yet, so removing them now costs nothing and leaves one source of truth.
--
-- ----------------------------------------------------------------------------
-- `sold` here means something narrower than it does on `tiers`
-- ----------------------------------------------------------------------------
-- On a tier it means "may somebody choose this plan". On a price it means "may
-- a new checkout be built against this id". Exactly one price per tier should
-- carry it. The others are honoured forever and offered to nobody, which is the
-- whole of grandfathering: `isSoldPrice` used to be a function and is now a
-- column.
-- ============================================================================

create table if not exists public.tier_prices (
  /** Constrained to what the code can charge with. See the note on `tiers`. */
  provider text    not null default 'stripe' check (provider in ('stripe')),
  /** That provider's id. Opaque to us, and the join key from a webhook. */
  price_id text    not null,
  /** Which tier this price grants. */
  tier     text    not null references public.tiers (id) on delete restrict,
  /**
   * May a new checkout be built against it?
   *
   * False is grandfathering, and false is the *default* on purpose: a price id
   * typed into this table by hand is far more likely to be an old one somebody
   * is reconciling than a new one being launched. Selling by accident is the
   * expensive direction.
   */
  sold     boolean not null default false,
  /**
   * What this price sold, over and above its tier.
   *
   * Sparse and merged over the tier's own limits, exactly as a tier row is
   * merged over free. `{"seats": null, "guests": null}` is the whole of the xo
   * grandfather clause: unlimited members and guests, everything else as xo has
   * it today - so a customer on the old price keeps what they were promised and
   * still receives every limit added since.
   *
   * That inheritance is the reason this is an override rather than a snapshot.
   * A frozen copy would mean the day we add a tenth limit, every grandfathered
   * customer silently gets whatever `mergeLimits` defaults it to instead of
   * what their tier says.
   */
  limits   jsonb   not null default '{}'::jsonb,
  /** Why this row exists. The column that makes a grandfather clause explicable. */
  note     text,
  created_at timestamptz not null default now(),
  primary key (provider, price_id)
);

comment on table public.tier_prices is
  'Which tier each provider price grants, and what it sold. Several prices may map to one tier; at most one of them should be `sold`. Limits here are sparse and merged over the tier''s own - see docs/product/pricing.md §9.';

create index if not exists tier_prices_tier_idx on public.tier_prices (tier);

-- One sellable price per tier. A second would make "which price does xo sell"
-- ambiguous at the exact moment somebody is trying to pay us.
create unique index if not exists tier_prices_one_sold_idx
  on public.tier_prices (tier)
  where sold;

-- ----------------------------------------------------------------------------
-- The mapping leaves `tiers`
-- ----------------------------------------------------------------------------
-- Both were seeded NULL and nothing reads them, so this is free today and would
-- not be in a month. Two places holding "which price sells xo" is the sort of
-- disagreement that surfaces as a customer on the wrong plan.
-- ----------------------------------------------------------------------------
drop index if exists public.tiers_price_idx;

alter table public.tiers drop column if exists price_id;
alter table public.tiers drop column if exists provider;

alter table public.tier_prices enable row level security;

drop policy if exists "tier_prices_select" on public.tier_prices;

-- Readable by anybody, like `tiers`, and for the same reason: the landing page
-- renders for anon and needs to know what is on sale. A price id is not a
-- secret - it is sent to Stripe's own client-side SDK in every checkout.
create policy "tier_prices_select" on public.tier_prices for select using (true);

grant select on public.tier_prices to anon, authenticated;
