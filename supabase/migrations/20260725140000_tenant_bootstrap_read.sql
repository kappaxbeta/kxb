-- ============================================================================
-- Fix: a workspace's creator could not read back the event that created it
-- ----------------------------------------------------------------------------
-- The tenants migration gave `events` an INSERT policy with a bootstrap branch
-- (tenant_is_unclaimed) but a SELECT policy without one. That asymmetry is a
-- bug, and it fails in two places:
--
--   1. append_events() ends in `INSERT ... RETURNING *`, and Postgres applies
--      SELECT policies to rows produced by RETURNING. Creating a workspace
--      writes TenantCreated *before* any membership exists - the trigger only
--      records membership on the following MemberJoined - so the creator could
--      write the row and then be refused sight of it. That surfaced as
--      "new row violates row-level security policy for table events".
--
--   2. Less visibly, executeCommand()'s retry path re-reads the stream with
--      loadStream(). During bootstrap that read would come back empty, so a
--      retry would decide against version 0 and conflict forever.
--
-- The fix is to make the two policies agree: whatever lets you write into a
-- tenant nobody else has touched should also let you read it.
--
-- Why this does not widen access. tenant_is_unclaimed(t) is false as soon as
-- any event in t was written by someone else, and every route by which a second
-- person enters a workspace writes such an event: InvitationAccepted is written
-- by the joiner, MemberRemoved by the remover. So a tenant with more than one
-- participant can never be "unclaimed" for anybody, and the branch only ever
-- covers the few milliseconds between TenantCreated and MemberJoined - plus the
-- case of a workspace you alone have ever written to, where you are the owner
-- and tenant_role() already grants it.
-- ============================================================================

drop policy if exists "events_select_tenant" on public.events;

create policy "events_select_tenant"
  on public.events for select
  using (
    public.tenant_role(tenant_id) is not null
    or public.tenant_is_unclaimed(tenant_id)
    or (stream_type = 'tenant' and public.has_tenant_invitation(tenant_id))
  );
