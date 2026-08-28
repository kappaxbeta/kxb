-- ============================================================================
-- Tiers become rows
-- ----------------------------------------------------------------------------
-- docs/product/pricing.md §10, revising it.
--
-- That section argued the tier table had to stay in code, and one of its two
-- reasons was simply false: it claimed the marketing page was a Client
-- Component that names every number, so database-backed limits would have to be
-- threaded through it. `landing.tsx` is a Server Component and already queries
-- this database for the seat ceiling. The three components that *are* client
-- ones - the billing panel, the subscribe prompt, the deactivated screen - all
-- take props from server pages.
--
-- The other reason stands and is why `tiers.ts` does not go away: a tier table
-- that cannot be read must degrade to the last known-good numbers rather than
-- to zero, or one bad query clamps every space in the product at once. The
-- constants stay as the compiled fallback. See `tier-table.ts`.
--
-- ----------------------------------------------------------------------------
-- Free is the base, and the other rows are sparse
-- ----------------------------------------------------------------------------
-- `free` states all nine limits. Every other tier states only what differs, and
-- is merged over free when read.
--
-- This is the same rule §10 already argues for per-space overrides, for the
-- same reason: a full snapshot freezes a row in the shape the product had on
-- the day somebody wrote it. With sparse rows, adding a tenth limit touches the
-- free row alone and every tier above it inherits - where full rows would mean
-- nine edits and one forgotten.
--
-- `null` inside `limits` means *unlimited*, and an absent key means *inherit*.
-- Those are different, and the merge depends on the difference: xp's
-- `{"projects": null}` is "as many as you like", where omitting the key would
-- have meant "three, the same as xo".
--
-- ----------------------------------------------------------------------------
-- The price id moves here too
-- ----------------------------------------------------------------------------
-- It lived in the environment (STRIPE_PRICE_XO, STRIPE_PRICE_XP), with the
-- retired EUR 20 price hardcoded as a branch in `prices.ts`. As a column it
-- makes grandfathering data rather than code: an old price maps to a tier that
-- carries its own limits, and `sold = false` says "honour this, do not offer
-- it" where `isSoldPrice()` used to.
--
-- Seeded NULL rather than from the environment, because a migration cannot see
-- the app's env and guessing would write the wrong id into production. The
-- reader falls back to the env vars until somebody fills these in, so this
-- migration changes no behaviour on the day it runs.
-- ============================================================================

create table if not exists public.tiers (
  /** Matches the `Tier` union in billing/tiers.ts. */
  id              text        primary key,
  /** Ordering, and what `tierAtLeast` compares. Free is 0. */
  rank            integer     not null,
  /** Per month, in minor units. Never a float - see the billing migration. */
  cents           integer     not null check (cents >= 0),
  /**
   * Who takes the money, and what they call this price.
   *
   * Two columns because the id is only meaningful beside the provider that
   * issued it - a Stripe price id and a PayPal plan id are both opaque strings
   * and nothing about either says which is which.
   *
   * `provider` is constrained to what the code can actually charge with, and
   * that check is deliberate rather than timid. A tier is *configuration* now,
   * but a payment provider is an integration: typing 'paypal' into a row would
   * be a checkout nothing knows how to build, and failing at the constraint is
   * a better place to find that out than at the till. Adding one is a code
   * change plus one line here, in that order.
   *
   * NULL price for free, which has nothing to sell.
   */
  provider        text        not null default 'stripe'
                    check (provider in ('stripe')),
  price_id        text,
  /**
   * May somebody buy this today?
   *
   * False is the grandfathering state: honoured for whoever is on it, never
   * offered to anybody new. Free is false too, and for a different reason -
   * there is nothing to buy, and a "choose free" button would be a checkout
   * that cannot be built.
   */
  sold            boolean     not null default true,
  /** Sparse except on free. NULL inside means unlimited; absent means inherit. */
  limits          jsonb       not null default '{}'::jsonb,
  label           text        not null,
  tagline         text        not null,
  /**
   * Does this tier get a card on the public pricing table?
   *
   * Separate from `sold`, and the pair is the point. `sold = false` is a tier
   * somebody may still be *on* - a grandfathered price - which must keep
   * resolving limits for them and must never be offered to anybody new.
   * `shown_on_landing = false` is only about the shop window: a tier can be
   * perfectly buyable by anybody who has the link and still not belong on the
   * page, which is how a price is tested on part of the traffic without being
   * announced to all of it.
   */
  shown_on_landing boolean    not null default true,
  updated_at      timestamptz not null default now()
);

-- Added separately as well, so a database that already has the table from an
-- earlier run of this migration picks the column up. `create table if not
-- exists` above does nothing to an existing table, which is exactly the case
-- that would otherwise be missed.
alter table public.tiers
  add column if not exists shown_on_landing boolean not null default true;

alter table public.tiers
  add column if not exists provider text not null default 'stripe';

alter table public.tiers
  add column if not exists price_id text;

-- The check has to be added separately too, or a database that got `provider`
-- from the ALTER above would be missing the one thing that column is for. Named
-- so the guard can find it: `add constraint if not exists` is not a thing in
-- Postgres, so this is the idempotent spelling.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tiers_provider_known'
  ) then
    alter table public.tiers
      add constraint tiers_provider_known check (provider in ('stripe'));
  end if;
end $$;

comment on table public.tiers is
  'What each tier costs and holds. Free is the base and states every limit; the rest are sparse and merged over it. The compiled fallback is TIER_LIMITS in billing/tiers.ts - see tier-table.ts for which wins when.';

-- Only one tier may sell a given Stripe price, or `tierForPrice` has no answer.
-- Partial, because NULL price ids are the normal state of the free row and of
-- any tier whose price has not been created yet.
create unique index if not exists tiers_price_idx
  on public.tiers (provider, price_id)
  where price_id is not null;

-- ----------------------------------------------------------------------------
-- The rows
-- ----------------------------------------------------------------------------
-- `on conflict do nothing`, so re-running this never overwrites a number an
-- operator has since changed. That is the whole point of the table, and a
-- migration that reset it on every deploy would take it straight back.
-- ----------------------------------------------------------------------------

insert into public.tiers (id, rank, cents, sold, limits, label, tagline) values
  (
    'free', 0, 0, false,
    '{"seats":2,"guests":1,"xoPlaces":0,"xpPlaces":0,"magazine":null,"projects":0,"matches":5,"pages":1,"pictures":0}'::jsonb,
    'free', 'Your own space, for you and one other.'
  ),
  (
    'xo', 1, 500, true,
    '{"seats":6,"guests":3,"xoPlaces":20,"xpPlaces":4,"projects":3,"matches":15,"pages":null,"pictures":10}'::jsonb,
    'xo', 'Room for the group, and a shelf to build from.'
  ),
  (
    'xp', 2, 1000, true,
    '{"seats":12,"guests":8,"xoPlaces":30,"xpPlaces":10,"projects":null,"matches":30,"pages":null,"pictures":100}'::jsonb,
    'xp', 'Everything in xo, and room to build without counting.'
  )
on conflict (id) do nothing;

-- Note xp is seeded at 1000, not 1200. The agreed price is EUR 12 and the
-- number moves on the day a EUR 12 Stripe price exists - together, in one
-- change, so the page never quotes a price checkout will not take. That it is
-- now a row rather than a constant is exactly what makes that a one-field edit
-- instead of a deploy.

alter table public.tiers enable row level security;

drop policy if exists "tiers_select" on public.tiers;

-- ----------------------------------------------------------------------------
-- Anybody may read it, including a signed-out stranger.
--
-- The landing page is the reason and it is a good one: it quotes these numbers
-- to somebody deciding whether to trust us, and it renders for anon. There is
-- nothing here that is not already printed on a public pricing table - what a
-- plan costs and what it includes are the terms being advertised.
--
-- Nobody writes it through the API. The backoffice writes as the service role,
-- which bypasses RLS, so there is no insert or update policy at all rather than
-- a narrow one that would have to be got exactly right.
-- ----------------------------------------------------------------------------
create policy "tiers_select" on public.tiers for select using (true);

grant select on public.tiers to anon, authenticated;
