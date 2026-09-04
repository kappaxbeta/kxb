-- ============================================================================
-- A price on a door, and the record of who has paid it today
-- ----------------------------------------------------------------------------
-- docs/product/economy.md §11. The second thing that feeds a space's bank, and
-- the first that can stop somebody getting in at all.
--
-- ----------------------------------------------------------------------------
-- A toll is not a need, and they are kept apart on purpose
-- ----------------------------------------------------------------------------
-- A need is a *consequence*: you got hungry, and food costs something. A toll
-- is paid before anything has happened to you. Owners tune them for different
-- reasons and a space that has quietly priced every door is a thing an operator
-- should be able to see, so the two carry different reasons on the movement
-- rather than sharing one.
--
-- ----------------------------------------------------------------------------
-- Once a day, and why a day
-- ----------------------------------------------------------------------------
-- **This interval is inferred, not specified.** A toll was asked for without
-- saying how often it recurs, and the two obvious readings are both wrong:
--
--   - *Once ever*, like a ticket, makes it a purchase rather than a toll and
--     stops feeding the bank after the first week.
--   - *Every entry* makes a page refresh cost coins, which is indefensible -
--     a reconnect after a dropped websocket would charge somebody for it.
--
-- So it is once per UTC calendar day, per person, per room. Refresh-safe,
-- genuinely recurring, and it reuses the day boundary this codebase already
-- argues for in `src/domain/streaks/days.ts` rather than inventing a second
-- idea of when a day turns over.
--
-- The primary key is what enforces it: the first insert of the day wins and
-- every later one conflicts, exactly like `battle_payouts`. No read-then-write,
-- because a read followed by a write is a race and this one charges money.
-- ============================================================================

alter table public.rooms_read_model
  add column if not exists door_price integer not null default 0;

alter table public.rooms_read_model
  drop constraint if exists rooms_door_price_not_negative;
alter table public.rooms_read_model
  add constraint rooms_door_price_not_negative check (door_price >= 0);

create table if not exists public.room_door_charges (
  tenant_id  uuid        not null,
  room_id    uuid        not null,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  -- The UTC calendar day, matching `dayNumber` in src/domain/streaks/days.ts.
  day        date        not null,
  -- What it cost on the day. Recorded rather than read back off the room, for
  -- the reason `PropPlaced` gives about `price`: re-pricing the door tomorrow
  -- must not change what somebody paid today.
  paid       integer     not null check (paid >= 0),
  created_at timestamptz not null default now(),

  primary key (room_id, user_id, day)
);

create index if not exists room_door_charges_tenant_idx
  on public.room_door_charges (tenant_id, created_at desc);

-- ----------------------------------------------------------------------------
-- Read your own; written by the function below and nothing else.
--
-- No insert policy, and here the reason is unusually sharp: a row in this table
-- means "already paid today". Anybody who could write one could walk through
-- every priced door in the space for nothing.
-- ----------------------------------------------------------------------------

alter table public.room_door_charges enable row level security;

create policy "room_door_charges_select_own"
  on public.room_door_charges for select
  to authenticated
  using (user_id = (select auth.uid()));

-- ============================================================================
-- Claiming today's toll
-- ----------------------------------------------------------------------------
-- True means "you owe it, go and charge them". False means they have already
-- paid today, or somebody else's request got there first.
--
-- ----------------------------------------------------------------------------
-- The claim is written *before* the coins move, which is the opposite of
-- everything else in this economy - and it is the right way round here
-- ----------------------------------------------------------------------------
-- Everywhere else the record follows the payment, so a crash loses a movement
-- rather than handing something over free. This is the mirror image: the thing
-- being protected is not a purchase, it is *not charging somebody twice*, and
-- the way to fail safely is to mark the door before opening the purse.
--
-- So a crash between the claim and the charge lets one person through one door
-- free for one day. That is the cheapest failure available here, and the
-- alternative - charge first, record second - fails by taking the toll twice
-- from somebody whose connection dropped, which is the exact thing that makes
-- people stop trusting a price.
--
-- The caller releases nothing on failure. A lock with a timeout on a money path
-- is two charges whenever the timeout is wrong.
-- ============================================================================

create or replace function public.room_door_claim(
  p_room   uuid,
  p_tenant uuid,
  p_price  integer,
  p_day    date
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

  insert into public.room_door_charges (tenant_id, room_id, user_id, day, paid)
  values (p_tenant, p_room, (select auth.uid()), p_day, greatest(p_price, 0))
  on conflict (room_id, user_id, day) do nothing
  returning room_id into v_claimed;

  return v_claimed is not null;
end $$;

revoke all on function public.room_door_claim(uuid, uuid, integer, date) from public;
grant execute on function public.room_door_claim(uuid, uuid, integer, date) to authenticated;
