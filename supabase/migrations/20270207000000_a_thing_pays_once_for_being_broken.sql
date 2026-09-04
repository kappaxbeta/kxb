-- ============================================================================
-- A thing pays once for being broken
-- ----------------------------------------------------------------------------
-- docs/product/economy.md §7. A thing with health, knocked over in battle mode,
-- pays a coin to whoever knocked it over.
--
-- ----------------------------------------------------------------------------
-- The coin printer this is arranged to avoid
-- ----------------------------------------------------------------------------
-- A blueprint's price may be **zero**. So the obvious version of this feature -
-- pay a coin for every thing that breaks - is the loop *summon a free crate,
-- smash it, take a coin*, with no cost, no second player, and no match length
-- to slow it down. That is strictly worse than anything else in this economy:
-- the win/loss pair at least needs somebody else in the room.
--
-- The rule that fixes it is arithmetic rather than policing:
--
--     pays  ⟺  the thing cost more to summon than the kill pays
--
-- Summoning a 2-coin crate to earn 1 is a coin lost, every time. Free scenery
-- pays nothing, which is also the right answer for a room of decorative
-- barrels. Nothing has to detect a farm or rate-limit anybody.
--
-- ----------------------------------------------------------------------------
-- Why the row is keyed on the thing
-- ----------------------------------------------------------------------------
-- A thing reaches zero once, so its id is the natural claim. Re-summoning makes
-- a *new* thing with a new id - and costs its price again, which is exactly the
-- loop above and exactly why it does not pay.
--
-- `paid` records what it was worth on the day rather than what the constant
-- says now, for the reason `PropPlaced` gives about `price`.
-- ============================================================================

create table if not exists public.thing_kills (
  -- The thing that broke. One row per thing, ever.
  thing_id   uuid        not null primary key,
  tenant_id  uuid        not null,
  -- Who broke it, and was paid for it.
  user_id    uuid        not null references auth.users (id) on delete cascade,
  paid       integer     not null check (paid > 0),
  created_at timestamptz not null default now()
);

create index if not exists thing_kills_tenant_idx
  on public.thing_kills (tenant_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Read your own; written by the function below and nothing else.
--
-- No insert policy: a row here means "already paid for", so anybody who could
-- write one could suppress somebody else's coin, and anybody who could write
-- one *and* be paid could write both halves.
-- ----------------------------------------------------------------------------

alter table public.thing_kills enable row level security;

create policy "thing_kills_select_own"
  on public.thing_kills for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================================
-- Claiming the coin for a break
-- ----------------------------------------------------------------------------
-- True means "you got it, go and pay". False means this thing has already paid,
-- or the caller is not in the space.
--
-- The claim is written **before** the coins move, like a door toll and for the
-- same reason: what is being protected is not a purchase but *not paying
-- twice*. A crash between the two costs one player one coin.
-- ============================================================================

create or replace function public.thing_kill_claim(
  p_thing  uuid,
  p_tenant uuid,
  p_paid   integer
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
  if (select auth.uid()) is null then
    return false;
  end if;

  if public.tenant_role(p_tenant) is null then
    return false;
  end if;

  if p_paid is null or p_paid <= 0 then
    return false;
  end if;

  insert into public.thing_kills (thing_id, tenant_id, user_id, paid)
  values (p_thing, p_tenant, (select auth.uid()), p_paid)
  on conflict (thing_id) do nothing
  returning thing_id into v_claimed;

  return v_claimed is not null;
end $$;

revoke all on function public.thing_kill_claim(uuid, uuid, integer) from public;
grant execute on function public.thing_kill_claim(uuid, uuid, integer) to authenticated;
