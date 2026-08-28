-- ============================================================================
-- What a guest looks like
-- ----------------------------------------------------------------------------
-- A guest picks a body at the door alongside their name, and it has to be
-- stored beside the name for exactly the same reason: `profile_avatars` is
-- keyed on a user who signed up, and a guest never did. Asked there, they came
-- back as the default penguin - so a room of guests was a room of identical
-- penguins with the same fallback, which is not a cosmetic problem when the
-- whole point is telling each other apart.
--
-- Nullable, and read through a fallback rather than defaulted here. The set of
-- legal avatars lives in src/domain/lounge/avatars.ts and changes when models
-- are added; a default in SQL would be a second copy of that decision, and a
-- check constraint would be a third that has to be migrated every time an
-- animal is added. The column stores what was chosen; the code decides what is
-- valid, once.
-- ============================================================================

alter table public.tenant_guests
  add column if not exists avatar text;

comment on column public.tenant_guests.avatar is
  'The model this guest chose at the door. NULL means they did not choose; the app falls back. Validated in TypeScript against AVATARS, deliberately not by a constraint here.';
