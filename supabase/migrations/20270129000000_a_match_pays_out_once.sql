-- ============================================================================
-- A match pays out once
-- ----------------------------------------------------------------------------
-- docs/product/economy.md §6. The exactly-once gate in front of every coin a
-- battle moves.
--
-- ----------------------------------------------------------------------------
-- The bug this exists to make impossible
-- ----------------------------------------------------------------------------
-- Battle payouts follow `creditWorld`'s shape, and that shape is right: "did
-- that end the match" is a question about the projection rather than about
-- which button was pressed, so it is asked once after *every* command instead
-- of in each of the four actions that can end one. The note beside that
-- function argues it well - it is the only version that cannot be forgotten
-- when a fifth way to end a match is added.
--
-- It also means the check runs again on the next command, and on the one after
-- that. Crediting a world twice sets a flag that was already set. Paying a
-- winner twice creates ten coins out of somebody clicking "rematch".
--
-- So the payout is claimed before it is made. The first caller to insert the
-- row does the paying; everybody after it sees a conflict and does nothing.
--
-- ----------------------------------------------------------------------------
-- Why it is not RLS-writable, unlike almost every table here
-- ----------------------------------------------------------------------------
-- Because a row here *suppresses* a payment, and a table anybody may insert
-- into is a table where anybody can quietly decide that a match they are losing
-- will never pay its winner. Inserting the claim early is a complete griefing
-- attack, needs no special access, and leaves nothing behind that looks wrong.
--
-- So there is no insert policy at all and `battle_payout_claim` is the only
-- writer. Same posture as `wallets` next door, for the same reason: the
-- interesting thing about the table is what it stops, and RLS cannot express
-- "only in the course of actually paying".
-- ============================================================================

create table if not exists public.battle_payouts (
  battle_id uuid        not null,
  -- Two moments a match moves money, claimed separately because they happen at
  -- different times and either can fail on its own. `entry` is the door,
  -- charged at kickoff; `victory` is the purse at the end.
  phase     text        not null check (phase in ('entry', 'victory')),
  -- The space the match was hosted in, so the backoffice can total a space's
  -- battle spending without walking the event log.
  tenant_id uuid        not null,
  paid_at   timestamptz not null default now(),

  primary key (battle_id, phase)
);

create index if not exists battle_payouts_tenant_idx
  on public.battle_payouts (tenant_id, paid_at desc);

-- ----------------------------------------------------------------------------
-- Read by anyone in the space; written by the function below and nothing else.
--
-- Readable because a page may reasonably want to say "this match has paid out",
-- and because a row here is not sensitive - it records that money moved, not
-- how much or to whom. Those are in the log.
-- ----------------------------------------------------------------------------

alter table public.battle_payouts enable row level security;

create policy "battle_payouts_select"
  on public.battle_payouts for select
  to authenticated
  using (public.tenant_role(tenant_id) is not null);

-- ============================================================================
-- Claiming the right to pay
-- ----------------------------------------------------------------------------
-- True means "you got it, go and pay". False means somebody already has.
--
-- `on conflict do nothing` with a `returning` is the whole mechanism: exactly
-- one caller sees a row come back, however many arrive at once, because the
-- primary key is decided by the database rather than by a read this function
-- did a moment earlier. A `select` followed by an `insert` would be two
-- statements with a race between them, and the race pays twice.
--
-- ----------------------------------------------------------------------------
-- Membership is checked, and it is the only check
-- ----------------------------------------------------------------------------
-- `security definer`, so RLS is not standing behind this - the membership test
-- has to be written out. It is deliberately no stricter than that: any member
-- of the host space may claim, because any of them may be the one whose client
-- reported the defeat that ended the match. Narrowing it to the host would mean
-- a match whose host closed their tab never pays anybody.
--
-- A claim by somebody who then fails to pay burns the payout, and that is the
-- accepted cost. The alternative - releasing the claim on failure - is a lock
-- with a timeout, and a lock with a timeout on a money path is two payouts
-- whenever the timeout is wrong.
-- ============================================================================

create or replace function public.battle_payout_claim(
  p_battle_id uuid,
  p_phase     text,
  p_tenant    uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_claimed uuid;
begin
  if public.tenant_role(p_tenant) is null then
    return false;
  end if;

  insert into public.battle_payouts (battle_id, phase, tenant_id)
  values (p_battle_id, p_phase, p_tenant)
  on conflict (battle_id, phase) do nothing
  returning battle_id into v_claimed;

  return v_claimed is not null;
end $$;

revoke all on function public.battle_payout_claim(uuid, text, uuid) from public;
grant execute on function public.battle_payout_claim(uuid, text, uuid) to authenticated;
