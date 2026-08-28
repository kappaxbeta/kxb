-- ============================================================================
-- An event is paid for by being an event
-- ----------------------------------------------------------------------------
-- `tenant_is_entitled()` asks whether an *owner* of the space has a live
-- subscription. Until now every event space had one, by accident: the operator
-- who created it became its owner, and the operator has a subscription. So
-- every hackathon we have ever run has been riding on a staff member's personal
-- Stripe row, and the moment 20260903000000 stopped making operators owners,
-- every event space would have rendered "this workspace is deactivated" to the
-- people running it.
--
-- The rule that was always meant is one line, and `createEvent` has said it in
-- prose since the day it was written: "An event is sold per event, from
-- /events, and has nothing to do with the per-workspace subscription."
--
-- So an event space is entitled because it is an event. Note what that is not:
-- it is not "any space an operator touched", and it is not permanent. Retiring
-- the event deletes the row, the space becomes an ordinary workspace, and the
-- ordinary rule applies again - which is exactly right for the customer who
-- keeps the room afterwards and now has a workspace like anybody else's.
--
-- An *ended* event keeps its row and stays entitled, deliberately. /events
-- promises "afterwards it stays up and stays readable", and a deactivation
-- banner over a room somebody paid for last month would make that false.
-- ============================================================================

create or replace function public.tenant_is_entitled(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tenant_is_event(p_tenant_id)
      or exists (
    select 1
      from public.tenant_members m
      join public.user_entitlements e on e.user_id = m.user_id
     where m.tenant_id = p_tenant_id
       and m.role = 'owner'
       and e.status in ('active', 'trialing')
       and e.seats > 0
  );
$$;
