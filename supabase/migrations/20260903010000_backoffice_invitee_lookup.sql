-- ============================================================================
-- Looking somebody up in a space you operate but do not belong to
-- ----------------------------------------------------------------------------
-- The companion to 20260903000000. An operator may now append to a space's
-- stream, which means they may invite its staff - and inviting somebody starts
-- with turning what was typed into an account id. Both lookups refuse anybody
-- who is not an owner or admin *of that space*, so the operator gets `not
-- permitted` one step before the append they are now allowed to make.
--
-- The gate stays exactly as strict for everybody else. `is_backoffice_admin()`
-- is a row only the service role can write, and these two functions are the
-- same ones the space's own admins call - so this adds a caller, not a rule.
--
-- Why not have the backoffice read `user_profiles` and `auth.users` directly
-- with the service role: it could, and then the "is this an account" question
-- would be answered in two places with two different pieces of code, one of
-- which nobody would remember to update. The invite path is subtle enough
-- already - see the note about reusing a pending invitation's token in
-- `inviteMember` - and it is worth one clause here to keep it single.
-- ============================================================================

create or replace function public.lookup_invitee_by_username(
  p_tenant_id uuid,
  p_username  text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_backoffice_admin()
     and coalesce(public.tenant_role(p_tenant_id), '') not in ('owner', 'admin') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  return (
    select p.user_id
      from public.user_profiles p
     where p.username = lower(btrim(p_username))
  );
end;
$$;

create or replace function public.lookup_invitee_by_email(
  p_tenant_id uuid,
  p_email     text
)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_backoffice_admin()
     and coalesce(public.tenant_role(p_tenant_id), '') not in ('owner', 'admin') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  return (
    select u.id
      from auth.users u
     where lower(u.email) = lower(btrim(p_email))
     limit 1
  );
end;
$$;
