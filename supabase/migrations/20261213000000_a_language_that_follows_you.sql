-- ============================================================================
-- The language you read the app in, on the account rather than in a browser
-- ----------------------------------------------------------------------------
-- The app behind the login has been bilingual since 20260820, and the answer to
-- "which language" has been a cookie: `unkown_locale`, defaulted from the
-- browser's `Accept-Language`. That was the right first shape and it stays the
-- fast path - it is the only one that works for people who have no account at
-- all, which is every guest in a demo lounge, every visitor on a link, and
-- everybody reading a public `/xp`.
--
-- What a cookie cannot do is follow you. Somebody who chooses German on their
-- laptop opens the app on their phone and is handed English, with no way to
-- tell that they had already answered the question. This table is that answer,
-- kept where the account is.
--
-- ----------------------------------------------------------------------------
-- Why a table rather than a column on `user_profiles`
-- ----------------------------------------------------------------------------
-- `user_profiles` is read by anybody who shares a workspace with you - that is
-- what `user_profiles_select_self_or_shared` is for, and it has to be, because
-- the members list draws everybody's handle. A locale is nobody's business but
-- yours, and adding it there would hand it to every co-member for no reason.
--
-- So: the same shape as `profile_avatars` next door, with the one policy
-- difference that matters. An animal is drawn over your head in a room and has
-- to be readable by the people in it; a language is only ever read by the
-- render that is about to print words *at you*.
--
-- ----------------------------------------------------------------------------
-- Which wins
-- ----------------------------------------------------------------------------
-- The cookie. It is the more specific statement - "this browser, right now" -
-- and it is what the picker writes first. This row is what fills the cookie in
-- on a browser that has never been told, and it is written by the same action,
-- so the two can only disagree while somebody is holding two devices.
--
-- `locale` is validated against LOCALES in src/domain/i18n/locale.ts before it
-- is written, and the check below is the second lock on the same door: a locale
-- this build does not speak must not be storable, because the reader on the
-- other end would be handed a dictionary that does not exist.
-- ============================================================================

create table if not exists public.profile_locales (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  /** A locale from src/domain/i18n/locale.ts. Two letters, lower case. */
  locale     text        not null,
  updated_at timestamptz not null default now(),

  constraint profile_locales_known check (locale in ('en', 'de'))
);

alter table public.profile_locales enable row level security;

-- ----------------------------------------------------------------------------
-- Reading, writing: yours and nobody else's
-- ----------------------------------------------------------------------------
-- Self-scoped in both directions, unlike the avatar table this is modelled on.
-- Nothing in the product ever needs to know what language somebody else reads
-- in - the app prints words at one person per request - so the narrower policy
-- costs nothing and is the honest one.
-- ----------------------------------------------------------------------------
drop policy if exists "profile_locales_select_self" on public.profile_locales;
create policy "profile_locales_select_self"
  on public.profile_locales for select
  using (user_id = (select auth.uid()));

drop policy if exists "profile_locales_insert_self" on public.profile_locales;
create policy "profile_locales_insert_self"
  on public.profile_locales for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "profile_locales_update_self" on public.profile_locales;
create policy "profile_locales_update_self"
  on public.profile_locales for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
