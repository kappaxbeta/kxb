-- ----------------------------------------------------------------------------
-- The mobile API becomes a door a space unlocks
-- ----------------------------------------------------------------------------
-- One row, and it is the whole migration: the `mobile_api` flag the registry
-- (src/domain/flags/keys.ts) now names. Off globally, because the app is being
-- tried with particular spaces rather than launched - the way to let one in is
-- a tenant override in the backoffice, which is the mechanism every other flag
-- already has.
--
-- What it gates is asked in exactly one place, `requireBearerTenant` in
-- src/lib/mobile/auth.ts: every space-scoped `/api/m` route resolves its
-- tenant there, so the flag holds without any route having to remember it.
-- The account routes - /me, the space list - are not behind it; they have no
-- tenant to read a flag from.
insert into public.feature_flags (key, enabled, label, description) values
  ('mobile_api', false, 'Mobile API',
   'Whether this space may be used through the native app''s API (/api/m). Off, every space-scoped route answers "blocked" before it reads anything; the account''s own routes - profile, the list of spaces - keep working, so the app can still say who you are and show the shelf. Switch a space on with a tenant override.')
on conflict (key) do nothing;
