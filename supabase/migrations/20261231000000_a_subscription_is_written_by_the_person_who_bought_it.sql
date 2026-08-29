-- ============================================================================
-- A subscription is written by the person who bought it
-- ----------------------------------------------------------------------------
-- The second door onto the state 20261230000000 closed, found while walking
-- §2 of the same review: the tenant stream is now authorized by role, and a
-- read model that holds the same answer is not.
--
-- `subscriptions_read_model` was writable by `is_tenant_member(tenant_id)`.
-- `tenant_tier()` reads it *first* - before the promo grants, before the
-- grandfathered entitlement - and `tenant_is_entitled()` reads it too. So one
-- row, over PostgREST, with the anon key and an ordinary member's cookie:
--
--   insert into subscriptions_read_model (tenant_id, status, tier, version,
--                                         created_at, updated_at)
--   values (:space, 'active', 'xp', 1, now(), now());
--
-- Measured: `tenant_tier()` before `(none)`, after `xp`;
-- `tenant_is_entitled()` before false, after true. The whole space is on the
-- paid tier, for everybody standing in it, granted by somebody who is not its
-- owner.
--
-- ---------------------------------------------------------------------------
-- Why this one is a policy change and not a design decision
-- ---------------------------------------------------------------------------
-- The reason these read models are member-writable at all is that projections
-- run in the caller's session, and 20261025000000 describes what happens when
-- a session cannot write one: the checkpoint advances past the event anyway,
-- so the row is silently wrong rather than loudly refused. Narrowing a write
-- policy is therefore only safe when no legitimate writer is being narrowed
-- out.
--
-- Here none is. Every writer of this table is already an owner or the platform:
--
--   src/app/api/stripe/webhook/route.ts   service role, tenant id recovered
--                                         from signed Stripe metadata
--   src/domain/projections.ts (the sweep) service role
--   src/domain/billing/actions.ts         `record()`, reached only through
--                                         startCheckout / openBillingPortal /
--                                         scheduleTierChange / cancelTierChange
--                                         / cancelSubscription / resume -
--                                         every one of them `hasRole(['owner'])`
--
-- So `owner` is not a new rule; it is the rule the six actions already enforce,
-- written down where PostgREST can see it. A member's session never projects
-- this stream, because a member can never cause one of its events.
--
-- ---------------------------------------------------------------------------
-- What this does not fix
-- ---------------------------------------------------------------------------
-- `tenants_read_model` is the same shape and is *not* fixed here, because it
-- cannot be fixed the same way: a member's session does legitimately write it -
-- accepting an invitation projects the tenant stream as the brand-new member -
-- so narrowing the policy would silently stop that row being maintained. It
-- needs the fields moving under the trigger that already maintains
-- `tenant_members`, which is a design change and is written up as the open
-- finding in docs/operations/space-security-audit-2026-08-28.md §2.
--
-- Note also what stays true and is the reason this is a commercial control
-- rather than a boundary: forging it gets you a free workspace, not somebody
-- else's data. `subscriptions_read_model` is keyed on the tenant and the policy
-- was already `is_tenant_member`, so the blast radius was always one space -
-- the caller's own. The billing projection's own header says this, and says
-- what would change it. It has not changed; the writer just got narrower.
-- ============================================================================

drop policy if exists "subscriptions_insert_member" on public.subscriptions_read_model;
create policy "subscriptions_insert_owner"
  on public.subscriptions_read_model
  for insert
  with check (public.tenant_role(tenant_id) = 'owner');

drop policy if exists "subscriptions_update_member" on public.subscriptions_read_model;
create policy "subscriptions_update_owner"
  on public.subscriptions_read_model
  for update
  using (public.tenant_role(tenant_id) = 'owner')
  with check (public.tenant_role(tenant_id) = 'owner');

-- Reading stays as it was: everybody in the space, guests included, may see
-- that the space is paid up. That is what draws the upgrade banner, and it is
-- one boolean about the room they are standing in rather than anything about
-- the owner's card.

comment on table public.subscriptions_read_model is
  'One row per space, folded from the subscription stream. Written by the Stripe webhook, the sweep, or an owner''s own session - never by a member, because tenant_tier() reads this first.';

do $$
begin
  if exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename  = 'subscriptions_read_model'
       and cmd in ('INSERT', 'UPDATE', 'ALL')
       and coalesce(with_check, qual) like '%is_tenant_member%'
  ) then
    raise exception 'subscriptions_read_model must not be member-writable: tenant_tier() reads it before anything else';
  end if;
end;
$$;
