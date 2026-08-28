-- ============================================================================
-- Bulgarian, as a language the account may be saved in
-- ----------------------------------------------------------------------------
-- `profile_locales` carries a check constraint listing the locales this build
-- speaks, and 20261213000000 explains why: it is the second lock on the door
-- that `isLocale` guards in the app. A locale that is storable but has no
-- dictionary is a row that hands its reader an English app forever with no way
-- to notice, so the database refuses to hold one.
--
-- That lock is exactly what makes adding a language a migration. Bulgarian is
-- now in LOCALES in src/domain/i18n/locale.ts and has a dictionary behind the
-- login, so the constraint has to be told about it - otherwise the picker
-- offers a language that the save silently rejects, and the cookie and the row
-- disagree from the first switch.
--
-- Unlike German it has no public route: there is no /bg landing page and no
-- hreflang entry pointing at one. That is an app-side fact and nothing here
-- depends on it, but it is why this migration is one line rather than a set of
-- them - the URL-shaped half of a locale does not live in the database.
-- ============================================================================

alter table public.profile_locales
  drop constraint if exists profile_locales_known;

alter table public.profile_locales
  add constraint profile_locales_known check (locale in ('en', 'de', 'bg'));
