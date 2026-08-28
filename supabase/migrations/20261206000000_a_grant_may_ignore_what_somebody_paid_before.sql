-- ============================================================================
-- An operator grant that is not stopped by an old receipt
-- ----------------------------------------------------------------------------
-- `account_has_had_tier` is why a grant can be refused with `not_new`, and for
-- an ordinary redemption that is exactly right: a voucher is for somebody who
-- has not bought this plan, and a customer redeeming one is asking for a refund
-- by another name.
--
-- It is the wrong rule for the backoffice. "Put this account on xp so they can
-- see the editor" is a sentence about a tester, a partner or somebody being
-- made good after an outage, and every one of those is more likely to have paid
-- us before than less. The operator was left minting a code, watching it be
-- refused, and having no way to say *yes, I know, do it anyway*.
--
-- ----------------------------------------------------------------------------
-- A parameter on the grant, not a switch on the installation
-- ----------------------------------------------------------------------------
-- The other shape this could take is a feature flag - one row, flipped in
-- /ovaloffice/feature-flags, read here. It was rejected because the setting
-- would be *silent and durable*: left on, every later redemption stops checking
-- the receipt, including the marketing codes this rule exists for. The thing
-- being decided is not a property of the installation, it is a property of one
-- grant somebody is making deliberately with a reason typed beside it.
--
-- So it is an argument, defaulted false, and only the backoffice's own grant
-- passes true. Every other caller is unchanged and unchanged in meaning: the
-- rule still refuses, exactly as it did.
--
-- The one-per-account-per-tier rule is deliberately *not* bypassed. That one is
-- a unique index rather than a check, so "do it anyway" would mean deleting
-- somebody's existing grant as a side effect of ticking a box - and Clear
-- already exists, says what it does, and asks first.
--
-- Dropped and recreated rather than replaced: adding a parameter with a default
-- beside the old signature leaves two candidates for a five-argument call, and
-- Postgres refuses the ambiguity at the call site rather than here.
-- ============================================================================

drop function if exists public.redeem_promo_code(text, uuid, text, uuid, text);

create or replace function public.redeem_promo_code(
  p_code           text,
  p_user_id        uuid,
  p_source         text    default 'link',
  p_tenant_id      uuid    default null,
  p_campaign       text    default null,
  /**
   * Skip the "never paid for this tier" check.
   *
   * Only ever true for a grant made by an operator in the backoffice, where the
   * whole point is to override the rule knowingly. Defaulted false so every
   * existing call - the link, the sign-up, the picker, the space - keeps the
   * behaviour it has always had without naming this at all.
   */
  p_ignore_history boolean default false
)
returns table (outcome text, granted_until timestamptz, code_id uuid, granted_tier text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code   public.promo_codes%rowtype;
  v_until  timestamptz;
begin
  select * into v_code
    from public.promo_codes
   where code = upper(btrim(p_code))
   for update;

  if not found then
    return query select 'unknown'::text, null::timestamptz, null::uuid, null::text;
    return;
  end if;

  if v_code.revoked_at is not null
     or (v_code.starts_at  is not null and v_code.starts_at  > now())
     or (v_code.expires_at is not null and v_code.expires_at <= now())
     or (v_code.max_uses   is not null and v_code.uses >= v_code.max_uses)
  then
    return query select 'inactive'::text, null::timestamptz, v_code.id, null::text;
    return;
  end if;

  -- Not bypassable. See the note above: this one is a unique index, and Clear
  -- is the control that means "take the old grant away".
  if exists (
    select 1
      from public.promo_redemptions r
     where r.user_id = p_user_id
       and r.granted_tier = v_code.tier
  ) then
    return query select 'already'::text, null::timestamptz, v_code.id, null::text;
    return;
  end if;

  if not p_ignore_history and public.account_has_had_tier(p_user_id, v_code.tier) then
    return query select 'not_new'::text, null::timestamptz, v_code.id, null::text;
    return;
  end if;

  v_until := case
               when v_code.free_days is null then null
               else now() + make_interval(days => v_code.free_days)
             end;

  insert into public.promo_redemptions
    (code_id, user_id, tenant_id, granted_days, granted_until, granted_tier,
     granted_spaces, source, campaign)
  values
    (v_code.id, p_user_id, p_tenant_id, v_code.free_days, v_until, v_code.tier,
     v_code.spaces, coalesce(p_source, 'link'), p_campaign);

  update public.promo_codes
     set uses = uses + 1
   where id = v_code.id;

  return query select 'ok'::text, v_until, v_code.id, v_code.tier;
end;
$$;

-- `service_role` is what the backoffice grant runs as, and the only caller that
-- ever passes the last argument. `authenticated` keeps the grant it has always
-- had: somebody redeeming a code for themselves reaches this too, and cannot
-- reach the override without also being able to write the row it protects.
grant execute on function
  public.redeem_promo_code(text, uuid, text, uuid, text, boolean)
  to authenticated, service_role;
