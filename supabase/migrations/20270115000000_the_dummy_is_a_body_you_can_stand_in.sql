-- ============================================================================
-- The dummy is a body you can stand in
-- ----------------------------------------------------------------------------
-- A room could draw three bodies and offer two. The lounge already knows how to
-- draw the dummy - a guest with no account arrives in it, and `GUEST_LOOK` has
-- been that since skins shipped - but the wardrobe inside the room only ever
-- offered the animals and whatever skins you had bought. Anybody who put a fox
-- on could not take it off again, and somebody who owns no skin at all could
-- not choose the body every player already is in the games.
--
-- A flag on `profile_avatars` rather than on `profile_skins`, because the dummy
-- is not a skin and cannot be made into one: `profile_skins.model` carries a
-- foreign key into the shelf and a row policy that refuses anything you do not
-- own, so "I am the dummy" has nowhere to live there - least of all for the
-- people who need it, who own nothing at all. It belongs beside the animal
-- instead: this is the same question that table already answers - which body do
-- I stand in - and the answer is now one of three rather than one of
-- twenty-four.
--
-- Precedence lives in `readLoungeLook`: a skin worn in the lounge outranks this,
-- this outranks the animal. So taking a skin off puts back whichever of the two
-- you were before it, rather than asking you to pick again.
--
-- Default false, so nobody's body changes under them on deploy. Turning it on
-- is a thing you do at the mirror.
-- ============================================================================

do $$ begin
  alter table public.profile_avatars
    add column if not exists as_dummy boolean not null default false;
exception when undefined_table then null; end $$;

comment on column public.profile_avatars.as_dummy is
  'Stand in the plain dummy in the lounge and the rooms, instead of the animal. The animal in `model` is kept either way, so taking the dummy off gives it back.';
