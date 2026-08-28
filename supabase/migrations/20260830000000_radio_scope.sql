-- ============================================================================
-- The radio gets a reach: the whole space, or just the room it went on in
-- ----------------------------------------------------------------------------
-- The radio shipped playing everywhere in a space at once, which is the right
-- default and the wrong only option. A space has four places in it, and the
-- music somebody wants in the lounge during a party is not the music the person
-- working in the café wants piped at them - "everybody hears it" and "everybody
-- who is *here* hears it" are two different intentions and the feature could
-- only express one.
--
-- Two columns rather than one, because the pair is what carries the meaning:
-- `scope` says whether the reach is narrow, and `place` says narrow to *what*.
-- A scope with no place would be a rule with no subject.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- How far it reaches
-- ----------------------------------------------------------------------------
-- Defaults to 'space', which is what every row written before this migration
-- meant. That is the whole reason the default is not 'room': a backfill that
-- silently narrowed existing radios would turn "playing" into "playing
-- somewhere you are not", and the only symptom would be silence that nobody
-- could explain.
--
-- A CHECK rather than an enum type. The set is two values that the application
-- already validates with a zod schema, and an enum would make adding a third -
-- per-user, say - a migration that rewrites a type other tables might come to
-- depend on, in exchange for a constraint this expresses in one line.
-- ----------------------------------------------------------------------------
alter table public.space_radio
  add column if not exists scope text not null default 'space'
    check (scope in ('space', 'room'));

-- ----------------------------------------------------------------------------
-- Which room, when the reach is narrow
-- ----------------------------------------------------------------------------
-- One of the ids in src/domain/world/places.ts - 'lounge', 'cafe', 'home',
-- 'outdoor'. Nullable, and meaningfully so: it is null exactly when `scope` is
-- 'space', where naming a room would be recording a fact that does not apply.
--
-- Deliberately *not* a foreign key, and not constrained to the four names. The
-- places are a TypeScript union rather than a table - there is no row anywhere
-- to point at - and a CHECK listing them here would be a second copy of that
-- union in a language that cannot see the first. It would then be the copy that
-- silently forbade a fifth place on the day somebody adds one. An unrecognised
-- name fails safe on the client, which treats it as "not where I am".
-- ----------------------------------------------------------------------------
alter table public.space_radio
  add column if not exists place text;
