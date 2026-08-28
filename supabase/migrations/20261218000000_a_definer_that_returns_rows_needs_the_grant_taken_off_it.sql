-- ============================================================================
-- A definer that returns rows needs the grant taken off it, by name
-- ============================================================================
-- `tenant_guests_present` went out with
--
--     revoke execute on function public.tenant_guests_present(uuid) from public;
--
-- which is not the same thing as taking the grant away. Supabase ships
-- `alter default privileges ... grant execute on functions to anon,
-- authenticated, service_role`, so a new function in `public` is granted to
-- those three roles *by name* the moment it is created. Revoking from `PUBLIC`
-- revokes the pseudo-role and leaves all three named grants exactly where they
-- were - which `\df+` will happily show you afterwards:
--
--     {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--
-- On a `security definer` function that returns `setof tenant_guests` and takes
-- the tenant id as an argument, that is every guest row in the installation -
-- display name, avatar, which link they came in on - readable by anybody with
-- an anon key. RLS does not apply inside a definer, which is the entire reason
-- the function is one.
--
-- Nothing read it in the twelve minutes it stood: the only caller is
-- `listGuests`, which was not deployed yet.
--
-- The house pattern is `from public, anon, authenticated` - see
-- `claim_render_job`, `reap_stale_occupancy`, `funnel_report` and the rest.
-- This is that, said late.
-- ============================================================================

revoke execute on function public.tenant_guests_present(uuid)
  from public, anon, authenticated;

-- Restated rather than assumed, so this file is the whole story of who may call
-- it: the service role, and `tenant_guest_count`, which reaches it as its own
-- definer and needs no grant of its own.
grant execute on function public.tenant_guests_present(uuid) to service_role;
