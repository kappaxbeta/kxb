-- ============================================================================
-- Did they pick this name, or did we?
-- ----------------------------------------------------------------------------
-- Every account already gets a handle the instant it exists - the trigger in
-- the usernames migration derives one from the local part of the address, so
-- nobody hits a "choose a handle" wall before they can use the product. That
-- was the right call and it stays.
--
-- What it costs is that the app cannot tell the two cases apart afterwards.
-- `jane-doe` looks exactly like a name Jane chose and exactly like a name we
-- guessed for her, so there is no way to ask a new arrival "is this what you
-- want to be called?" exactly once. Asking everyone every time is nagging;
-- asking nobody is why half the members list is somebody's email local part.
--
-- One nullable timestamp settles it. Null means derived - nobody has confirmed
-- it - and the onboarding wizard runs. Set means a human said yes to this name,
-- and they are never asked again, however many times they change it later.
--
-- It is deliberately *not* a column the trigger writes. claim_username() only
-- ever inserts a derived name, so leaving chosen_at alone there is what makes
-- null mean what it says.
-- ============================================================================

alter table public.user_profiles
  add column if not exists chosen_at timestamptz;

comment on column public.user_profiles.chosen_at is
  'When the account confirmed this handle. Null means it was derived from their email and never confirmed - the welcome wizard is still owed.';

-- ----------------------------------------------------------------------------
-- Everybody who is already here has, in effect, chosen.
-- ----------------------------------------------------------------------------
-- Backfilled rather than left null, because the alternative is showing a
-- welcome wizard to every existing member the next time they sign in - people
-- who have been using the product for weeks, some of whom set their handle by
-- hand on the settings page. A first-run experience that fires on somebody's
-- fiftieth run is not a first-run experience.
--
-- `updated_at` rather than now() so the stamp stays roughly honest about when
-- the name last became true, rather than recording the deploy.
-- ----------------------------------------------------------------------------

update public.user_profiles
   set chosen_at = updated_at
 where chosen_at is null;
