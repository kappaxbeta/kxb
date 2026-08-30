-- ============================================================================
-- Which half of you stands in the lounge
-- ----------------------------------------------------------------------------
-- The peep is who you are in the lounge and the skin is who you are in the
-- games. That split was the whole design and it is now one line too strict:
-- somebody who bought a Knight wants to be the Knight in the café as well, and
-- had no way to say so.
--
-- A flag on `profile_skins` rather than a third table, because it is a fact
-- about the skin you are wearing - it has no meaning for somebody who owns
-- none, and it should disappear with the row when you take the skin off. The
-- animal stays exactly where it was: taking the flag off puts you back in the
-- peep you already had, rather than asking you to pick one again.
--
-- Default false, so nobody's lounge changes under them on deploy. Turning it
-- on is a thing you do at the mirror.
-- ============================================================================

do $$ begin
  alter table public.profile_skins
    add column if not exists in_lounge boolean not null default false;
exception when undefined_table then null; end $$;

comment on column public.profile_skins.in_lounge is
  'Wear this skin in the lounge and the cafe too, instead of the peep. The animal in profile_avatars is kept either way.';
