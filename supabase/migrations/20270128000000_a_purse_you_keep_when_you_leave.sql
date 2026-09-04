-- ============================================================================
-- The wallet, and the ledger that explains it
-- ----------------------------------------------------------------------------
-- docs/product/economy.md §3. The third account: a purse belongs to one member
-- in one space, a bank belongs to a space, and a wallet belongs to a *person* -
-- it is what they still have after leaving every space they ever earned in.
--
-- ----------------------------------------------------------------------------
-- Why this is not event-sourced, when every other balance here is
-- ----------------------------------------------------------------------------
-- Because it cannot be. Every stream in this app is tenant-scoped: `events`
-- has a `tenant_id`, RLS is written against it, and `runProjection` catches one
-- tenant up at a time. A wallet has no tenant by definition - that is the whole
-- point of it - so there is no stream it could live on and no projection sweep
-- that would ever fold it.
--
-- The alternatives were both worse. Putting the wallet on a stream in whichever
-- space the withdrawal happened in spreads one balance across many streams, and
-- "you cannot spend what you do not have" stops being a single-stream invariant
-- - which is the one property that makes the purse trustworthy. Inventing a
-- tenant-less stream means a table `runProjection` cannot reach.
--
-- So it is a row and a function, which is the call `xp_store` already made and
-- documented in src/domain/xps/store-actions.ts: a coin count has no audit
-- value *as a fold*, and the thing it actually needs - "where did this come
-- from" - is answered better by a ledger than by a replay.
--
-- It is worth saying plainly that this is stronger, not weaker, on the one rule
-- that matters most. `docs/product/economy.md` §11 says a replay must not mint;
-- a guarded `update ... where coins >= n` inside one transaction cannot double
-- on a rebuild, because there is no rebuild.
--
-- ----------------------------------------------------------------------------
-- Two tables, because a balance and its history are different questions
-- ----------------------------------------------------------------------------
-- `wallets` is the number. `wallet_ledger` is every movement that produced it,
-- append-only, and it is what §12's backoffice transaction reader reads. The
-- balance could be derived from the ledger with a sum, and is not, for the
-- reason the bank's read model gives: the ledger grows forever and the balance
-- is read on every page that shows it.
--
-- They are written together in one function so they cannot disagree. Nothing
-- else may write either.
-- ============================================================================

create table if not exists public.wallets (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  -- Never negative. The guard is in `wallet_move` and this is the backstop -
  -- if it ever fires, something bypassed the function.
  coins      bigint      not null default 0 check (coins >= 0),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- The ledger
-- ----------------------------------------------------------------------------
-- One row per movement, signed: positive is coins arriving in the wallet
-- (withdrawn from a space purse), negative is coins leaving it (deposited into
-- one). A single signed column rather than a pair of accounts because a wallet
-- is always one end of the movement - the other end is always a purse, named by
-- `tenant_id`.
--
-- `transfer` is the same id the purse-side event carries in its data, which is
-- what lets the two halves of one movement be found from either end. Not a
-- foreign key: the other half is a row in `events` addressed by stream and
-- version, not by this id, and a constraint that cannot be expressed is better
-- left as a documented convention than as a column that lies.
-- ----------------------------------------------------------------------------

create table if not exists public.wallet_ledger (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  -- The space at the other end. Not null: a wallet movement always has a purse
  -- on the other side, and one that did not would be minting.
  --
  -- Deliberately no `on delete cascade`. A deleted space must not take the
  -- history of what it paid out with it - that is exactly the hole
  -- `20261223000000` had to be written to close, where guest deletes cascaded
  -- events out of the log and parked projections silently.
  tenant_id  uuid        not null,
  -- Signed. Positive into the wallet, negative out of it.
  amount     bigint      not null check (amount <> 0),
  -- The purse-side transfer id. See above.
  transfer   uuid        not null,
  -- The balance after this movement, so the reader never has to re-sum.
  balance    bigint      not null check (balance >= 0),
  created_at timestamptz not null default now()
);

-- The reader's query: one person's movements, newest first.
create index if not exists wallet_ledger_user_idx
  on public.wallet_ledger (user_id, created_at desc);

-- The backoffice's: everything one space paid out or took in.
create index if not exists wallet_ledger_tenant_idx
  on public.wallet_ledger (tenant_id, created_at desc);

-- A movement is written exactly once. If a retry arrives with the same transfer
-- id, the unique index is what stops the wallet being credited twice - which is
-- the only way this table could mint, and so the only constraint here that is
-- load-bearing rather than tidy.
create unique index if not exists wallet_ledger_transfer_idx
  on public.wallet_ledger (transfer);

-- ----------------------------------------------------------------------------
-- Row level security
-- ----------------------------------------------------------------------------
-- Read your own, and nothing else. Narrower than every other read model in this
-- app, and it has to be: those are scoped to a space and readable by the people
-- standing in it, because a leaderboard that hid your neighbours would not be
-- one. A wallet is not in a space. There is no group it belongs to and nobody
-- who has a claim on seeing it.
--
-- **No insert or update policy at all, for either table.** That is not an
-- omission - it is the enforcement. `wallet_move` is `security definer` and is
-- the only thing that may write, so a client holding a session cannot alter a
-- balance directly however it addresses the table. The backoffice reads through
-- the service role, which bypasses this.
-- ----------------------------------------------------------------------------

alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;

create policy "wallets_select_own"
  on public.wallets for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "wallet_ledger_select_own"
  on public.wallet_ledger for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================================
-- Moving money in and out of a wallet
-- ----------------------------------------------------------------------------
-- One function for both directions, because they are one operation with a sign
-- and splitting them would be two places for the balance guard to be right.
--
-- Returns a status word rather than throwing, matching `claim_free_skin` and
-- the other definers here: the caller has to tell somebody what happened, and
-- an exception is a worse thing to render than a word.
--
--   'ok'          - moved, and the new balance is in the second column
--   'not_you'     - the session is not the person named. Should be unreachable.
--   'short'       - a withdrawal larger than the balance
--   'duplicate'   - this transfer id has already been written
--
-- ----------------------------------------------------------------------------
-- Why the caller passes the transfer id
-- ----------------------------------------------------------------------------
-- Because the purse side is written first and already has one. A wallet
-- movement is the *second* half of something that has already happened to an
-- event stream, and the id is what ties them together - see `CoinsSent`, whose
-- note argues why the two halves cannot be atomic and why the debit goes first.
--
-- The same ordering applies here and for the same reason. Withdrawing debits
-- the purse first and credits the wallet second; depositing debits the wallet
-- first. Either way a crash in the middle loses coins rather than creating
-- them, and `wallet_ledger_transfer_idx` means a retry cannot double the half
-- that did land.
-- ============================================================================

create or replace function public.wallet_move(
  p_user     uuid,
  p_tenant   uuid,
  p_amount   bigint,
  p_transfer uuid
)
returns table (status text, balance bigint)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_balance bigint;
begin
  -- The whole of the authorisation. A wallet is one person's, and there is no
  -- role, membership or grant that lets anybody else move it - so the check is
  -- an identity comparison and not a lookup. `security definer` is what makes
  -- stating this explicitly necessary: the function runs as its owner, so RLS
  -- is not standing behind it.
  if p_user is null or p_user <> (select auth.uid()) then
    return query select 'not_you'::text, 0::bigint;
    return;
  end if;

  if p_amount = 0 then
    return query select 'short'::text, 0::bigint;
    return;
  end if;

  -- Already written. Checked before the update rather than caught afterwards,
  -- so a retry is a clean answer rather than a rolled-back transaction, and so
  -- the balance reported back is the one that actually stands.
  if exists (select 1 from public.wallet_ledger where transfer = p_transfer) then
    select w.coins into v_balance from public.wallets w where w.user_id = p_user;
    return query select 'duplicate'::text, coalesce(v_balance, 0::bigint);
    return;
  end if;

  -- The two directions are written separately, and they have to be. An
  -- insert-or-update with `greatest(p_amount, 0)` reads as one tidy statement
  -- and is wrong in exactly one case: somebody depositing out of a wallet they
  -- have never had a row for. The insert half would create the row at zero, the
  -- guard would never see a shortfall, and the ledger would record coins
  -- leaving an account that never held any.
  if p_amount < 0 then
    -- Out of the wallet. No row means no coins, so `update` matching nothing is
    -- the right answer rather than a case to handle - a wallet that does not
    -- exist is empty, and empty cannot be spent.
    --
    -- The `where` is the balance guard and it is the only thing enforcing it: a
    -- read followed by a write is two statements with a race between them, and
    -- this is money.
    update public.wallets
       set coins = coins + p_amount,
           updated_at = now()
     where user_id = p_user
       and coins + p_amount >= 0
    returning coins into v_balance;
  else
    -- Into the wallet. Always allowed, and creates the row on first arrival -
    -- there is no "open a wallet" step and there should not be one.
    insert into public.wallets (user_id, coins, updated_at)
    values (p_user, p_amount, now())
    on conflict (user_id) do update
       set coins = public.wallets.coins + p_amount,
           updated_at = now()
    returning coins into v_balance;
  end if;

  -- Nothing came back, so the guard refused it. The only way to reach this on
  -- the positive branch would be a constraint violation, which raises instead.
  if v_balance is null then
    return query select 'short'::text, 0::bigint;
    return;
  end if;

  insert into public.wallet_ledger (user_id, tenant_id, amount, transfer, balance)
  values (p_user, p_tenant, p_amount, p_transfer, v_balance);

  return query select 'ok'::text, v_balance;
end $$;

-- `authenticated` and nothing else. The function checks `auth.uid()` itself, so
-- an anonymous caller has nothing to be; the grant is narrowed anyway because a
-- definer that anybody may execute is one lapse in that check away from being a
-- way to move somebody else's money.
revoke all on function public.wallet_move(uuid, uuid, bigint, uuid) from public;
grant execute on function public.wallet_move(uuid, uuid, bigint, uuid) to authenticated;
