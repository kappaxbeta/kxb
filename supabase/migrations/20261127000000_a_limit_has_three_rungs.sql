-- ============================================================================
-- A limit has three rungs
-- ----------------------------------------------------------------------------
-- docs/product/pricing.md §10.
--
-- `tenant_seat_limit()` shipped with two rungs: a global default, and a
-- per-space override. That was the whole model when a seat cap was something
-- the *installation* imposed. It is no longer, because a tier now says how many
-- seats a space holds, and what somebody bought has to sit between those two:
--
--     effective = min(max(tier, override), ceiling)
--
-- The tier is not here and must not be. It lives in `billing/tiers.ts` as
-- constants, because changing it moves the public pricing table and has to
-- agree with what Stripe is charging - that wants a commit and a review, not a
-- text field. What this migration supplies is the two rungs the database owns:
-- the operator's override for one subject, and the installation's ceiling.
--
-- ----------------------------------------------------------------------------
-- Why this returns three columns instead of one integer
-- ----------------------------------------------------------------------------
-- `tenant_seat_limit()` collapses the two rungs with coalesce() and hands back
-- one number. That is lossy in a way the old model never noticed and the new
-- one cannot survive:
--
--   * "no override for this space" and "an override that says *no cap for this
--     space*" both come back as NULL, and they mean opposite things. The first
--     leaves the tier alone. The second is an operator deliberately taking the
--     cap off one customer.
--   * A collapsed number cannot be raised-only. `max(tier, override)` is what
--     stops an override selling somebody €12 and handing them €5, and it needs
--     the override and the tier as separate values to compare.
--
-- So the caller gets both rungs and applies the rule. `resolveLimit()` in
-- `billing/limits.ts` is that rule, it is pure, and it is tested.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The flags
-- ----------------------------------------------------------------------------
-- All off. Nothing changes for anybody until an admin picks a number - the same
-- posture `seat_limit` took, and for the same reason: a migration that starts
-- enforcing a cap on the day it runs is a migration that breaks a customer who
-- was doing nothing wrong.
--
-- The parked `value_int` is what the backoffice shows when somebody first
-- switches one on, and each is set to *the top tier's own number* rather than
-- to something tidy. That is deliberate. These are ceilings, and a ceiling
-- clamps everybody including the comped - so an admin who flips one on to see
-- what it does must not thereby clamp a paying xp space below what it bought.
--
-- `free_space_limit` is the exception twice over: it is scoped to a *user*
-- rather than a tenant, and its parked value is well above the one free space
-- an account may own. FREE_SPACES_PER_ACCOUNT is the rule; this is the abuse
-- valve above it, and parking them at the same number would make the valve a
-- duplicate of the rule rather than a limit on it.
-- ----------------------------------------------------------------------------

insert into public.feature_flags (key, enabled, value_int, label, description) values
  ('xo_place_limit', false, 30, 'Rooms per space',
   'Off means a space may hold any number of rooms. On caps rooms that are not levels, for every space at once. The tier already sets this per space - use this only as a platform ceiling, and override one space to raise it.'),
  ('xp_place_limit', false, 10, 'XP places per space',
   'Off means no cap. On caps rooms that are levels, for every space at once. The tier already sets this per space; this is the ceiling above it.'),
  ('project_limit', false, 20, 'XP projects per space',
   'Off means no cap. On caps the XPs a space may edit. The tier already sets this per space; this is the ceiling above it.'),
  ('match_limit', false, 30, 'Matches at once per space',
   'Off means no cap. On caps how many battles a space may have open at the same time. Concurrency, never a monthly allowance.'),
  ('free_space_limit', false, 10, 'Free spaces one account may own',
   'Off means no cap. On caps how many spaces one account may own without paying for them. Owning paid spaces is never capped - a subscription is per space. Being a member of other people''s spaces is never capped either. Override it for one account to let somebody hold more.')
on conflict (key) do nothing;

-- ============================================================================
-- 2. tenant_feature_limit(key, tenant)
-- ----------------------------------------------------------------------------
-- Both database rungs for one capped quantity, for one space.
--
-- Generalises `tenant_seat_limit()` rather than replacing it. That function is
-- still called by the invitation path and by the landing page, still returns
-- the one collapsed number those two want, and deleting it would be churn for
-- no gain. New callers use this one.
--
-- ----------------------------------------------------------------------------
-- Who may call it, and what that discloses
-- ----------------------------------------------------------------------------
-- Anybody, about any space, exactly as `tenant_seat_limit()` already allows -
-- and the argument there carries over unchanged. The caller who most needs a
-- cap is somebody who is *not a member yet*: a pending invitee asking "is there
-- room for me", whom `resolve_features()` deliberately refuses to answer for.
-- A cap that silently does not apply to the exact people it exists to stop is
-- not a cap.
--
-- This does disclose one bit more than its predecessor: `has_override` says
-- whether a space has been given special treatment, where before you could only
-- infer it by comparing numbers. That is a real increase and a small one, over
-- a uuid the caller already had to know, about a quantity that is a capacity
-- rather than a secret. The alternative - collapsing the rungs to hide it -
-- costs the raise-only rule, which protects customers rather than us.
--
-- User-scope overrides are ignored here on purpose, and that is not an
-- oversight to fix later: a cap on a space is a property of the room, not of
-- whoever walks into it. Honouring a user override would mean the same space
-- held a different number of people depending on who asked.
--
-- Called with no tenant it answers for no particular space, which yields the
-- ceiling alone with `has_override` false. That is what an operator screen and
-- the marketing page ask, and the reason they can: `feature_flags` is
-- admin-only under RLS, so there is no other way for a signed-out visitor to
-- learn the terms being advertised to them.
-- ============================================================================

create or replace function public.tenant_feature_limit(
  p_key       text,
  p_tenant_id uuid default null
)
returns table (
  -- Is there an override row for this space at all? The column that keeps
  -- "nothing set" distinguishable from "set to no cap".
  has_override   boolean,
  -- The operator's number for this space. NULL means no cap *for this space* -
  -- meaningful only when has_override is true.
  override_value integer,
  -- The installation's own ceiling. NULL means it imposes none.
  ceiling_value  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.flag_key is not null                                   as has_override,
    case when o.enabled then o.value_int end                 as override_value,
    case when f.enabled and f.value_int > 0 then f.value_int end as ceiling_value
    from public.feature_flags f
    left join public.feature_flag_overrides o
      on  o.flag_key = f.key
      and o.scope    = 'tenant'
      and o.scope_id = p_tenant_id
   where f.key = p_key;
$$;

grant execute on function public.tenant_feature_limit(text, uuid) to authenticated, anon;

-- ============================================================================
-- 3. account_feature_limit(key)
-- ----------------------------------------------------------------------------
-- The same two rungs, for the caller's own account.
--
-- Takes no user id, and that is the security boundary rather than a
-- convenience. `tenant_feature_limit` answers about any space because a
-- stranger at the door legitimately needs to know whether there is room; there
-- is no equivalent caller here. Anybody who could pass an arbitrary user id
-- could walk the account table asking "is this one comped", which is exactly
-- what the RLS on `feature_flag_overrides` exists to prevent - a member who
-- could read that table could see every comped account in the system.
--
-- Returns nothing at all for an anonymous caller: auth.uid() is NULL, the join
-- finds no override, and the ceiling still comes back. That is correct - the
-- ceiling is a property of the installation and a signed-out visitor being
-- quoted the terms is entitled to it.
-- ============================================================================

create or replace function public.account_feature_limit(p_key text)
returns table (
  has_override   boolean,
  override_value integer,
  ceiling_value  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.flag_key is not null                                   as has_override,
    case when o.enabled then o.value_int end                 as override_value,
    case when f.enabled and f.value_int > 0 then f.value_int end as ceiling_value
    from public.feature_flags f
    left join public.feature_flag_overrides o
      on  o.flag_key = f.key
      and o.scope    = 'user'
      and o.scope_id = auth.uid()
   where f.key = p_key;
$$;

grant execute on function public.account_feature_limit(text) to authenticated, anon;

comment on function public.tenant_feature_limit(text, uuid) is
  'Both database rungs of a cap for one space: the operator override and the installation ceiling. The tier is the third rung and lives in billing/tiers.ts - see resolveLimit() in billing/limits.ts for how the three combine.';

comment on function public.account_feature_limit(text) is
  'Both database rungs of a cap for the calling account. Takes no user id on purpose: an arbitrary one would let anybody probe which accounts are comped.';
