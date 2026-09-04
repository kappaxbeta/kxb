-- ============================================================================
-- The space's bank, and five limits a coin can lift
-- ----------------------------------------------------------------------------
-- docs/product/economy.md is the argument. Two unrelated-looking things ship
-- together here because they are the same feature seen from two ends: a space
-- now has an account, and the things a member can buy one more of are the
-- reason anybody would put anything in it.
--
-- ----------------------------------------------------------------------------
-- Why a space needs an account at all
-- ----------------------------------------------------------------------------
-- Before this, every coin a space's rules took went nowhere. An owner could
-- switch hunger on and price a sandwich, and those coins were destroyed - which
-- made every setting they tuned a tax rather than a trade, and made "the owner
-- can lend you some" a sentence with no mechanism behind it.
--
-- With a bank the arrangement closes: whoever set the prices holds the takings
-- and can hand them back. That is the difference between a space with settings
-- and a space with an economy.
--
-- ----------------------------------------------------------------------------
-- One row per space, written only by the projector
-- ----------------------------------------------------------------------------
-- Derived data, folded from the `bank` stream by
-- src/domain/bank/projection.ts, and droppable and rebuildable like every other
-- read model here. The authority is the log; this is the number a page draws.
--
-- Keyed on the tenant alone, because there is exactly one bank per space. The
-- stream id is carried as a column so a row can jump to its own history - the
-- same correspondence `login_streaks_read_model` keeps, and for the same
-- reason: "where did this balance come from" is the first question anybody
-- asks of it.
--
-- ----------------------------------------------------------------------------
-- Three totals, not one
-- ----------------------------------------------------------------------------
-- `coins` is the balance and is the only one anybody spends. `taken` and
-- `paid_out` are the running gross figures, and they are here rather than
-- computed at read time because the question they answer is a *trend* - "is
-- this space taking more than it gives back" - and answering it from the log
-- would mean scanning a stream that grows with every sandwich.
--
-- They are also what makes the backoffice money view cheap. A balance says
-- nothing about whether an economy is healthy; a space whose `taken` climbs
-- while `paid_out` stays flat is one whose owner has built a sink, and that is
-- visible in a single row rather than an aggregation.
-- ============================================================================

create table if not exists public.space_bank_read_model (
  tenant_id  uuid        not null references public.tenants_read_model (id) on delete cascade,
  -- The bank aggregate's stream id, so a balance can be traced to its events.
  stream_id  uuid        not null,
  -- What the space holds now. Never negative: the decider refuses a payout
  -- larger than the balance, and that is the invariant this column reflects
  -- rather than enforces. The check below is a backstop, not the rule.
  coins      bigint      not null default 0,
  -- Gross in and gross out, ever. See above.
  taken      bigint      not null default 0,
  paid_out   bigint      not null default 0,
  -- The stream version this row has folded, so a replay is a no-op rather than
  -- a doubling. The guard `homestead_read_model` already depends on, and the
  -- reason a running total can be written as `+ n` at all.
  version    integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (tenant_id),

  -- A negative balance would mean the decider was bypassed. Cheap to assert and
  -- it fails at the write rather than showing up as a page drawing "-40 coins".
  constraint space_bank_not_overdrawn check (coins >= 0)
);

-- ----------------------------------------------------------------------------
-- Row level security
-- ----------------------------------------------------------------------------
-- Read by anyone in the space; written by anyone in the space.
--
-- Both are wider than they look and both match `login_streaks_read_model`,
-- whose note argues this in full. Read is space-wide because the balance is on
-- the space's own settings page and a member who could not see it could not be
-- told why a house rule charged them. Write is space-wide because the projector
-- is: `runProjection` catches a space's whole log up from wherever the
-- checkpoint sits, so whichever member's page load triggers it folds
-- *everybody's* movements since then. Owner-scoped write RLS would make one
-- member's navigation fail on another member's sandwich.
--
-- Note what this does *not* grant: nobody writes this table from a form. There
-- is no path from a browser to these columns except through appending an event
-- and running the projection, and the decider is what stands in front of that.
-- Spending the bank is a separate question answered in the server action, which
-- checks that the person asking owns the space.
-- ----------------------------------------------------------------------------

alter table public.space_bank_read_model enable row level security;

create policy "space_bank_select"
  on public.space_bank_read_model for select
  to authenticated
  using (public.tenant_role(tenant_id) is not null);

create policy "space_bank_insert"
  on public.space_bank_read_model for insert
  to authenticated
  with check (public.tenant_role(tenant_id) is not null);

create policy "space_bank_update"
  on public.space_bank_read_model for update
  to authenticated
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

-- ============================================================================
-- The five limits a coin can lift
-- ----------------------------------------------------------------------------
-- These mirror LIMIT_FLAGS in src/domain/billing/limits.ts, and a key without a
-- row here is a control that does not exist: the backoffice lists flags from
-- this table, so an unlisted key is invisible and un-overridable however
-- correct the TypeScript is.
--
-- All off, and the posture is the one 20261127000000 argued for at length: a
-- migration that starts enforcing a cap on the day it runs is a migration that
-- breaks a customer who was doing nothing wrong. Off leaves the tier's own
-- number standing, which is what `resolveLimit` does with an absent ceiling.
--
-- The parked `value_int` is what the backoffice shows when somebody first
-- switches one on, and each is set at or above the *top tier's* number for the
-- same reason as before - these are platform ceilings, a ceiling clamps
-- everybody including the comped, and an admin flipping one on to see what it
-- does must not thereby clamp a paying xp space below what it bought.
--
-- `vehicle_limit` is the odd one and the note in `limits.ts` says why: every
-- tier includes zero vehicles, so raising this is not "more of what you bought"
-- but a comp - a space getting vehicles without spending coins on them. It is
-- parked at 10 rather than at a tier's number because there is no tier number
-- to park it at.
-- ----------------------------------------------------------------------------

-- The master switch first. Everything below it is a *cap*; this is whether any
-- of it charges anybody at all, and it is off - so this migration changes what
-- a space *can* do and nothing about what it *does*.
insert into public.feature_flags (key, enabled, label, description) values
  ('economy', false, 'The coin economy',
   'Off, nothing charges anybody and nothing pays out: battles are free to enter and pay nothing, doors take no toll, needs cost nothing, and a quota is whatever the tier says with no way to buy past it. Coins already in a purse stay there and the cafe keeps paying them - that predates all of this and switching the economy off must not take somebody''s savings with it. On, the rules in docs/product/economy.md apply. Add a tenant override to switch one space on; that is the intended way in.')
on conflict (key) do nothing;

insert into public.feature_flags (key, enabled, value_int, label, description) values
  ('private_xp_limit', false, 100, 'Private XPs per space',
   'Off means no cap. On caps the XPs a space may keep private - visible only to their owner and whoever they named. The tier already sets this per space; this is the ceiling above it. Free holds none of these at all and no amount of coins buys one, so this flag cannot loosen free - only an override on the space can.'),
  ('public_xp_limit', false, 100, 'Published XPs per space',
   'Off means no cap. On caps the XPs a space may have published in the catalogue. The tier already sets this per space; this is the ceiling above it. Beyond the tier''s allowance a member may buy one more with coins, which is what this ceiling stands above.'),
  ('blueprint_limit', false, 100, 'Blueprints per space',
   'Off means no cap. On caps the blueprints in a space''s workshop. Vehicles are counted separately and are not affected. The tier already sets this per space; this is the ceiling above it.'),
  ('clip_limit', false, 100, 'Clips per space',
   'Off means no cap. On caps the animator clips a space has saved. The tier already sets this per space; this is the ceiling above it.'),
  ('vehicle_limit', false, 10, 'Vehicles per space',
   'Off means the tier decides, and every tier includes none - so off means every vehicle is bought with coins, at a price that differs by tier. Switching this on and setting a number is a comp: it hands a space vehicles it did not pay for. That is a legitimate thing to do for a partner, a demo or an event, and it is not the same gesture as the other limits here, which only lift what somebody already bought.')
on conflict (key) do nothing;
