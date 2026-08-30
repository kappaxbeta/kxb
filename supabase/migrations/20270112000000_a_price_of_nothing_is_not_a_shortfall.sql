-- ============================================================================
-- A price of nothing is not a shortfall
-- ----------------------------------------------------------------------------
-- `spend_skin_vouchers` answered "not enough vouchers" for a free skin, which
-- is the wrong end of the sentence: it took the cost from the catalogue,
-- asked for that many rows with `limit 0`, got none back - because none were
-- asked for - and read the empty set as an empty wallet.
--
-- The check was `array_length(v_ids, 1) < cost`, and it is right for every
-- cost but the one that was unsayable when it was written. Zero became
-- sayable one migration ago; this is the arithmetic catching up.
--
-- Fixed here rather than in the button that hit it, because the button is not
-- the only way in. A free skin has two doors now - `claim_free_skin` and this
-- one - and the shelf gets to decide a price without every caller having to
-- know which door that price implies. Asking to buy something free should
-- hand it over, from whichever direction the asking came.
--
-- Still not a way to get a super skin for nothing: the cost is read from the
-- row inside the transaction, exactly as before, so this grants for free only
-- what the catalogue says is free.
-- ============================================================================

create or replace function public.spend_skin_vouchers(
  p_skin_id text,
  p_user_id uuid
)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_skin public.skins%rowtype;
  v_ids  uuid[];
begin
  select * into v_skin from public.skins where id = p_skin_id;

  if not found then
    return 'unknown_skin';
  end if;

  if not v_skin.active then
    return 'inactive';
  end if;

  if exists (
    select 1 from public.skin_ownership o
    where o.user_id = p_user_id and o.skin_id = p_skin_id
  ) then
    return 'owned';
  end if;

  -- Nothing to take, so nothing is taken. `via` is 'purchase' rather than
  -- 'voucher' for the plain reason that no voucher was spent - the same word
  -- `claim_free_skin` writes, so the two doors leave one kind of record.
  if v_skin.voucher_cost <= 0 then
    insert into public.skin_ownership (user_id, skin_id, via)
    values (p_user_id, p_skin_id, 'purchase')
    on conflict do nothing;
    return 'ok';
  end if;

  select array_agg(id) into v_ids from (
    select id
      from public.skin_vouchers
     where owner_id = p_user_id and spent_at is null
     order by created_at
     limit v_skin.voucher_cost
       for update
  ) picked;

  if v_ids is null or array_length(v_ids, 1) < v_skin.voucher_cost then
    return 'short';
  end if;

  update public.skin_vouchers
     set spent_at = now(), spent_on = p_skin_id
   where id = any (v_ids);

  insert into public.skin_ownership (user_id, skin_id, via)
  values (p_user_id, p_skin_id, 'voucher')
  on conflict do nothing;

  return 'ok';
end $$;

revoke all on function public.spend_skin_vouchers(text, uuid) from public;
grant execute on function public.spend_skin_vouchers(text, uuid) to authenticated, service_role;
