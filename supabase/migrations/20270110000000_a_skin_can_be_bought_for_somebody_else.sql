-- ============================================================================
-- Buying a skin for somebody else
-- ----------------------------------------------------------------------------
-- The shelf could already be paid for in bucks and a buck could already be
-- handed on, so "here, have some money" was possible from the start. What was
-- not is *choosing the character*: picking the look you know somebody would
-- like, paying for that one, and sending them the thing rather than the means.
-- The whole appeal of a present is that somebody chose it.
--
-- So a gift is its own row, not a voucher with a note on it. It has to
-- remember what was chosen, who paid, and whether it has been opened - and a
-- voucher answers none of those without growing three nullable columns that
-- are meaningless on every row that is not a gift.
--
-- The bucks are spent at the moment the gift is made, not when it is claimed.
-- A present that quietly fails to arrive because the giver spent their balance
-- afterwards is worse than no present, and holding the money in escrow would
-- mean a wallet whose count is a lie.
--
-- The code is a bearer token like every other code here: whoever types it
-- first keeps it. That is deliberate and is the same trade the buck's own
-- gifting makes - a present you have to name a recipient for is a present you
-- cannot put in a card.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Two vocabularies that grew a word
-- ----------------------------------------------------------------------------
-- Money used to buy a skin directly and a voucher was the free half of the
-- shop. Bucks collapsed that: money buys bucks, bucks buy everything. So a
-- voucher row can now come from a purchase, and an ownership row can now come
-- from a present - two values neither check constraint was written to expect,
-- and a check constraint refusing a row is how a paid-for grant becomes a
-- support ticket.
--
-- Widened rather than replaced: every existing value stays legal, because rows
-- written under the old vocabulary are not wrong, they are just older.
-- ----------------------------------------------------------------------------
alter table public.skin_vouchers
  drop constraint if exists skin_vouchers_source_check;
alter table public.skin_vouchers
  add constraint skin_vouchers_source_check
  check (source in ('backoffice', 'subscription', 'gift', 'purchase'));

alter table public.skin_ownership
  drop constraint if exists skin_ownership_via_check;
alter table public.skin_ownership
  add constraint skin_ownership_via_check
  check (via in ('purchase', 'voucher', 'backoffice', 'gift'));

-- What a bought buck was paid for with, and which of the bundle it is.
--
-- The pair is the idempotency, and the second column is why it works: Stripe
-- may deliver one session twice, each delivery mints fresh codes, and a unique
-- index on the session and the *code* would happily accept both - five bucks
-- becoming ten that nobody paid for. Numbering them 1..n within the session
-- gives the retry something to collide with.
--
-- Partial, because every buck that was not bought has no session, and a plain
-- unique index would let exactly one of them exist.
alter table public.skin_vouchers
  add column if not exists stripe_session_id text;
alter table public.skin_vouchers
  add column if not exists stripe_session_seq integer;

create unique index if not exists skin_vouchers_session_seq_idx
  on public.skin_vouchers (stripe_session_id, stripe_session_seq)
  where stripe_session_id is not null;

create table if not exists public.skin_gifts (
  id         uuid        primary key default gen_random_uuid(),
  -- Uppercase like every other code on the platform, off the same alphabet.
  code       text        not null unique,
  -- What was chosen. `restrict`, not `cascade`: a paid-for gift must not
  -- evaporate because the shelf was tidied.
  skin_id    text        not null references public.skins (id) on delete restrict,
  bought_by  uuid        not null references auth.users (id) on delete cascade,
  -- A short line from the giver, shown when it is opened. Optional, because
  -- making somebody write a card is how a present does not get sent.
  message    text        not null default '' check (length(message) <= 200),
  claimed_by uuid        references auth.users (id) on delete set null,
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists skin_gifts_bought_by_idx on public.skin_gifts (bought_by);

alter table public.skin_gifts enable row level security;

-- You can see what you sent and what you opened. Nobody may write these
-- directly: both transitions spend or grant something, so both are definer
-- functions below. An unclaimed gift is deliberately invisible to everyone but
-- its giver - the code is the only way in, which is what makes it bearer.
drop policy if exists skin_gifts_select_mine on public.skin_gifts;
create policy skin_gifts_select_mine
  on public.skin_gifts for select
  using (bought_by = (select auth.uid()) or claimed_by = (select auth.uid()));

drop policy if exists skin_gifts_admin_all on public.skin_gifts;
create policy skin_gifts_admin_all
  on public.skin_gifts for all
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

-- ----------------------------------------------------------------------------
-- Making one
-- ----------------------------------------------------------------------------
-- Spends the skin's price in bucks and writes the gift. The buck selection is
-- `for update` and mirrors spend_skin_vouchers exactly, because it is the same
-- race: two tabs, one wallet, and the second must find the bucks already gone
-- rather than spend them twice.
--
-- Unlike spending on yourself, owning the skin already is not a refusal: buying
-- a second copy for a friend is the normal case, not a mistake.
-- ----------------------------------------------------------------------------
create or replace function public.gift_skin(
  p_skin_id text,
  p_user_id uuid,
  p_code    text,
  p_message text default ''
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_skin  public.skins%rowtype;
  v_ids   uuid[];
begin
  if p_user_id is null or p_user_id <> (select auth.uid()) then
    return 'refused';
  end if;

  select * into v_skin from public.skins where id = p_skin_id;

  if not found then
    return 'unknown_skin';
  end if;

  if not v_skin.active then
    return 'inactive';
  end if;

  select array_agg(id) into v_ids
    from (
      select id
        from public.skin_vouchers
       where owner_id = p_user_id
         and spent_at is null
       order by created_at
       limit v_skin.voucher_cost
         for update
    ) as pick;

  if v_ids is null or array_length(v_ids, 1) < v_skin.voucher_cost then
    return 'short';
  end if;

  update public.skin_vouchers
     set spent_at = now(),
         spent_on = v_skin.id
   where id = any(v_ids);

  insert into public.skin_gifts (code, skin_id, bought_by, message)
  values (upper(p_code), v_skin.id, p_user_id, coalesce(left(p_message, 200), ''));

  return 'ok';
end;
$$;

revoke all on function public.gift_skin(text, uuid, text, text) from public;
grant execute on function public.gift_skin(text, uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Opening one
-- ----------------------------------------------------------------------------
-- Claims the gift and writes the ownership row in one transaction. Already
-- owning the skin is a distinct outcome rather than an error: the gift is
-- consumed either way, because a present that bounces back into a stranger's
-- pocket is a worse answer than a duplicate somebody can be told about.
-- ----------------------------------------------------------------------------
create or replace function public.claim_skin_gift(
  p_code    text,
  p_user_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_gift  public.skin_gifts%rowtype;
  v_owned boolean;
begin
  if p_user_id is null or p_user_id <> (select auth.uid()) then
    return 'refused';
  end if;

  select * into v_gift
    from public.skin_gifts
   where code = upper(trim(p_code))
     for update;

  if not found then
    return 'unknown';
  end if;

  if v_gift.claimed_by is not null then
    return 'taken';
  end if;

  -- Your own present, opened by you. Refused rather than silently working,
  -- because it is always a mistake: the code was meant for somebody else and
  -- claiming it here is how it stops being sendable.
  if v_gift.bought_by = p_user_id then
    return 'yours';
  end if;

  update public.skin_gifts
     set claimed_by = p_user_id,
         claimed_at = now()
   where id = v_gift.id;

  select exists (
    select 1 from public.skin_ownership
     where user_id = p_user_id and skin_id = v_gift.skin_id
  ) into v_owned;

  if v_owned then
    return 'owned';
  end if;

  insert into public.skin_ownership (user_id, skin_id, via)
  values (p_user_id, v_gift.skin_id, 'gift')
  on conflict do nothing;

  return 'ok';
end;
$$;

revoke all on function public.claim_skin_gift(text, uuid) from public;
grant execute on function public.claim_skin_gift(text, uuid) to authenticated;
