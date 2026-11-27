-- ============================================================================
-- Xoin: a market a space can install, and the one rule that makes it safe
-- ----------------------------------------------------------------------------
-- docs/product/xoin.md is the argument in full. The short version, because
-- everything below is downstream of it:
--
--   A xoin is not money. It is a *thing you buy with money*, priced in the one
--   coin this product has, and the pool that prices it can never create a coin.
--   `packages/xoin` holds the arithmetic that makes that last clause true - a
--   constant product, so a sale computes ceil(k/float) and always leaves a coin
--   behind - and the two tables here are only ever a projection of it.
--
-- The market has a *mode*, per space, and it defaults to `demo`. That is what
-- keeps economy.md §1 ("there is one coin") true everywhere except where an
-- owner has deliberately made it untrue. A space that installs nothing plays a
-- game; a space in `asset` puts real coins at stake; a space in `currency` has
-- chosen a second balance and the exchange-rate question that comes with it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The flag
-- ----------------------------------------------------------------------------
-- Off, like every flag guarding new surface, and here the direction carries
-- more than usual because of what the feature is shaped like: a market that
-- appeared in a space because a resolver blipped would be a market somebody
-- traded in, and the position they took would still be there when it blipped
-- back.
--
-- It gates the *feature* and deliberately not whether coins are at stake - that
-- is the mode. So switching this on for a space that wants to look costs
-- nobody anything: they get the cartridge in demo until an owner says
-- otherwise, and `asset`/`currency` need `economy` on as well.
-- ----------------------------------------------------------------------------
insert into public.feature_flags (key, enabled, label, description) values
  ('xoin', false, 'Xoin market',
   'A market with one thing in it: the cartridge, and the space''s own book behind it. What a trade costs depends on the mode the space chose - play money by default.')
on conflict (key) do nothing;

-- ============================================================================
-- Read model: the book
-- ----------------------------------------------------------------------------
-- One row per space, overwritten, projected from the `xoin` stream. The same
-- spirit as the radio's row: the log still holds every trade anybody ever made,
-- and this is only the answer to the question a screen asks on load.
--
-- `coins` and `specks` are *not* the price. They are the two sides of the pool,
-- and the price is their ratio adjusted for what the clock has mined since -
-- see `floatAt`. Storing a price here would be storing a number that is stale
-- the minute after it is written.
-- ============================================================================

create table if not exists public.xoin_markets (
  tenant_id  uuid        primary key references public.tenants_read_model (id) on delete cascade,

  /**
   * demo | asset | currency. Text rather than an enum, matching how every
   * other mode-ish column in this schema is stored, and read through
   * `readMode` in @kxb/xoin - which resolves anything it does not recognise to
   * `demo`. That is the fail-safe direction: a row written by a version that
   * knew a fourth mode must never be read as permission to take coins off
   * somebody.
   */
  mode       text        not null default 'demo'
                         check (mode in ('demo', 'asset', 'currency')),

  /** The pool's own coin balance. Only a trade changes it - never the clock. */
  coins      integer     not null check (coins >= 0),

  /**
   * The traded part of the xoin side, in specks (a thousandth of a xoin).
   *
   * Not the float. The float is this plus what has been mined since the market
   * opened, moved by the mood, and all of that is a pure function of the clock
   * which is why none of it is written down. bigint because specks are three
   * decimal places and an inflating supply outgrows an integer sooner than is
   * comfortable.
   */
  specks     bigint      not null,

  /**
   * The market's birthday, by the database's clock.
   *
   * Copied from the *event's* created_at, never from whoever opened it. Every
   * client subtracts from this to find which epoch it is in, so it has to be
   * one clock they all agree on - exactly the argument `space_radio.started_at`
   * makes, and the failure is the same: a laptop that is ninety seconds fast
   * would price the market ninety seconds into the future, confidently.
   */
  opened_at  timestamptz not null,

  updated_at timestamptz not null,
  version    integer     not null
);

alter table public.xoin_markets enable row level security;

-- Anybody in the space. A market is a thing the room is doing, like the radio.
create policy "xoin_markets_select_tenant"
  on public.xoin_markets for select
  to authenticated
  using (public.tenant_role(tenant_id) is not null);

-- On the projector's behalf. Nobody reaches this table except by replaying
-- events the decider already agreed to.
create policy "xoin_markets_insert_member"
  on public.xoin_markets for insert
  to authenticated
  with check (public.is_tenant_member(tenant_id));

create policy "xoin_markets_update_member"
  on public.xoin_markets for update
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- ============================================================================
-- Read model: who holds what
-- ----------------------------------------------------------------------------
-- One row per member per space. `spent` and `returned` are running totals
-- rather than a balance, for the reason economy.md §5 gives about reasons: a
-- number that only goes up and down explains nothing, and "am I winning" cannot
-- be reconstructed after the fact from a holding alone.
--
-- The *authority* on a position is the event stream, not this table - the
-- decider folds every trade to refuse a sale of xoin nobody holds. This is what
-- a screen reads so it does not have to.
-- ============================================================================

create table if not exists public.xoin_holdings (
  tenant_id  uuid        not null references public.tenants_read_model (id) on delete cascade,
  user_id    uuid        not null references auth.users (id) on delete cascade,

  specks     bigint      not null default 0 check (specks >= 0),
  spent      integer     not null default 0,
  returned   integer     not null default 0,

  updated_at timestamptz not null,

  /**
   * This row's own cursor, and it is deliberately not the market's.
   *
   * A trade writes two rows, both additively, and a projector that died between
   * them would leave the book advanced and the position behind. Guarding both
   * on the book's version would make the retry decide it had already applied
   * the event and skip the position forever. See the note in projection.ts.
   */
  version    integer     not null,

  primary key (tenant_id, user_id)
);

alter table public.xoin_holdings enable row level security;

/**
 * Your own position, and nobody else's.
 *
 * Narrower than the market row above, which the whole space may read, and the
 * asymmetry is the point: what the book is doing is public to the room -
 * everybody is trading against it - and what any one person is holding is
 * theirs. A market where members can read each other's positions is a market
 * where the biggest holder is a target.
 */
create policy "xoin_holdings_select_own"
  on public.xoin_holdings for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "xoin_holdings_insert_member"
  on public.xoin_holdings for insert
  to authenticated
  with check (public.is_tenant_member(tenant_id));

create policy "xoin_holdings_update_member"
  on public.xoin_holdings for update
  to authenticated
  using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- ============================================================================
-- Nobody writes their own trade
-- ----------------------------------------------------------------------------
-- This is the boundary, and it is the most important thing in this file.
--
-- economy.md §7 states the rule for battle: prices come from the server, and no
-- browser-facing schema accepts an amount. The xoin decider keeps that promise
-- - every coin figure on a `Traded` event is computed there from reserves it
-- folded itself, and the caller only supplies a side and a size.
--
-- But a decider is a polite layer. `events` admits an ordinary member's insert
-- on any stream that is not `tenant`, so without this a modified client could
-- POST its own `Traded` event carrying whatever numbers it liked, straight past
-- every line of TypeScript in the feature. That is not a theoretical hole; it
-- is the first thing anybody would try.
--
-- So the xoin stream is written by the *service role only*, from the server
-- action, and this policy says so. RESTRICTIVE because permissive policies for
-- the same command are OR-ed and would widen rather than narrow - the same
-- shape and the same reasoning as the radio's admin check.
--
-- The service role bypasses RLS entirely, so it is unaffected by this; what it
-- subtracts is exactly the client's ability to reach the stream directly. The
-- consequence worth stating: `Traded` events carry `by` in their data rather
-- than relying on `actor_id`, because a service-role append has no auth.uid()
-- to be stamped with.
-- ----------------------------------------------------------------------------
drop policy if exists "events_xoin_is_server_written" on public.events;
create policy "events_xoin_is_server_written"
  on public.events
  as restrictive
  for insert
  with check (stream_type <> 'xoin');

comment on table public.xoin_markets is
  'One market per space: the pool''s two sides, the mode, and when it opened. Projected from the xoin stream; the price is derived, never stored.';
comment on table public.xoin_holdings is
  'One position per member per space. The stream is the authority on it; this is what a screen reads.';
