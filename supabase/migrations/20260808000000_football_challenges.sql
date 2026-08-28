-- ============================================================================
-- Challenging another space to a game of football
-- ----------------------------------------------------------------------------
-- 20260804000000_football.sql widened `battles_read_model` to know the fourth
-- mode and stopped there, so football existed everywhere a space plays alone
-- and nowhere it plays somebody else: `space_challenges` still carried the
-- original three-mode check, and sending a football challenge failed on
-- `space_challenges_mode_check` before it reached any of the code that would
-- have handled it.
--
-- Widening the check is only half of it. A football match is the one mode that
-- cannot be described by its name alone - it needs a clock, and optionally a
-- score target and the two roughness switches - and the decider refuses to
-- create one without them (see `assertFootballSettings` in battle/aggregate.ts).
-- A challenge that carried only `mode = 'football'` would therefore have been
-- accepted by this table and then rejected when the accepting space tried to
-- host it, which is the worse failure of the two: it breaks for the person who
-- did not send it.
--
-- So the settings travel with the challenge. The challenger picks the match they
-- want, the accepting space sees it before answering, and hosting is a
-- transcription rather than a second decision.
-- ============================================================================

alter table public.space_challenges
  drop constraint if exists space_challenges_mode_check;

alter table public.space_challenges
  add constraint space_challenges_mode_check
  check (mode in ('ffa', 'team', 'one_vs_all', 'football'));

-- The clock, in minutes. Null for every mode that has no clock, which is all of
-- them but football - exactly as on `battles_read_model`.
alter table public.space_challenges
  add column if not exists duration_minutes integer;

-- First to this many goals, if the challenger set a target. Null means the
-- clock is the only way it ends.
alter table public.space_challenges
  add column if not exists score_limit integer;

-- Whether knockouts hurt, and whether they are recoverable. See the note on
-- these columns in the football migration for why only football has them.
alter table public.space_challenges
  add column if not exists damage_on boolean;

alter table public.space_challenges
  add column if not exists respawn_on boolean;

/**
 * The settings and the mode agree, in both directions.
 *
 * The same invariant the decider enforces, written where it cannot be bypassed:
 * a football challenge has a clock, and a challenge that is not football has no
 * football settings at all. Without the second half a stale duration left on a
 * mode switch would sit in the row, invisible, until somebody accepted it and
 * wondered where the clock came from.
 *
 * Existing rows all predate football and have nulls throughout, so they satisfy
 * this as written and the table validates without a rewrite.
 */
alter table public.space_challenges
  drop constraint if exists space_challenges_football_settings;

alter table public.space_challenges
  add constraint space_challenges_football_settings
  check (
    case
      when mode = 'football' then duration_minutes is not null
      else
        duration_minutes is null
        and score_limit is null
        and damage_on is null
        and respawn_on is null
    end
  );
