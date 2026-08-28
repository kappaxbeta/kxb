-- ============================================================================
-- has_password()
-- ----------------------------------------------------------------------------
-- Whether the caller's own account can be signed into with a password.
--
-- The settings panel needs this to ask the right question. An account that has
-- never had one must not be shown a "current password" field it cannot fill -
-- that is a dead end with no way out inside the app - and an account that has
-- one must not be able to change it without proving it knows it.
--
-- Why a function and not a column read: `encrypted_password` lives in
-- `auth.users`, which is not exposed to PostgREST at all. No policy can grant
-- it, so SECURITY DEFINER is the only route, and that makes the shape of this
-- function the whole security argument - it takes no argument, reads
-- `auth.uid()`, and returns one boolean. There is no input to point it at
-- somebody else's row, and the answer it gives away about the caller is one
-- the caller already knows.
--
-- An invited account is the case that makes this necessary: the invite mail
-- creates the user before its recipient has typed anything, so they exist,
-- signed in, with no password at all.
-- ============================================================================

create or replace function public.has_password()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from auth.users u
     where u.id = (select auth.uid())
       -- Supabase leaves this empty rather than null in some flows, so both
       -- are checked; either way it means "no password was ever set".
       and u.encrypted_password is not null
       and u.encrypted_password <> ''
  );
$$;

revoke all on function public.has_password() from public;
grant execute on function public.has_password() to authenticated;
