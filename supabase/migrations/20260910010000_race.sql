-- ============================================================================
-- Race: a start, a finish, and a match decided by who gets there first
-- ----------------------------------------------------------------------------
-- Two halves, and they are two halves of the same feature:
--
--   1. the marks in a world widen from "red goal / blue goal" to "red, blue,
--      start, finish", so a course can be laid out with the same buttons that
--      stand a pitch;
--   2. a battle gains `race` as a mode, and its roster gains a place and a time,
--      because a race is the first mode whose result is an *order* rather than a
--      survivor or a scoreline.
--
-- See src/domain/lounge/goal-events.ts and src/domain/battle/events.ts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- What a mark is
-- ----------------------------------------------------------------------------
-- `team` said whose goal it was, which was the only question a mark could
-- answer while football was the only thing marks were for. A start line belongs
-- to nobody, so the question becomes "what is this rectangle" and the column
-- becomes `kind`.
--
-- Backfilled rather than defaulted: every row written up to now is a football
-- goal and its team is exactly its kind. `team` is left in place, nullable and
-- no longer written - dropping a column whose data is now duplicated elsewhere
-- is a thing to do when nothing has referred to it for a while, not in the same
-- migration that stops writing it.
-- ----------------------------------------------------------------------------
alter table public.lounge_goals_read_model
  add column if not exists kind text;

update public.lounge_goals_read_model
  set kind = team
  where kind is null;

alter table public.lounge_goals_read_model
  alter column kind set default 'red';

alter table public.lounge_goals_read_model
  alter column kind set not null;

alter table public.lounge_goals_read_model
  alter column team drop not null;

alter table public.lounge_goals_read_model
  drop constraint if exists lounge_goals_read_model_team_check;

-- Dropped before it is added, so this file can be run twice - which it can be,
-- since `add constraint` is the one statement above with no `if not exists`.
alter table public.lounge_goals_read_model
  drop constraint if exists lounge_goals_read_model_kind_check;

alter table public.lounge_goals_read_model
  add constraint lounge_goals_read_model_kind_check
  check (kind in ('red', 'blue', 'start', 'finish'));

-- ----------------------------------------------------------------------------
-- Race matches
-- ----------------------------------------------------------------------------
-- A race is a battle, so it is the same aggregate, the same read model and the
-- same roster - the argument the football migration makes for widening rather
-- than adding a table holds here word for word.
--
-- It needs no settings columns of its own: a race has a time limit and an
-- opinion about whether a dash hurts, which are `duration_minutes` and
-- `damage_on`, already here and already meaning exactly that. `score_limit` and
-- `respawn_on` stay null - a race has no target to reach, and coming back at the
-- start line is the mode rather than a setting.
-- ----------------------------------------------------------------------------
alter table public.battles_read_model
  drop constraint if exists battles_read_model_mode_check;

alter table public.battles_read_model
  add constraint battles_read_model_mode_check
  check (mode in ('ffa', 'team', 'one_vs_all', 'football', 'race'));

/**
 * Where each racer came, and how long they took.
 *
 * On the roster rather than in a table of finishes, because unlike a goal - which
 * a match can have twenty of and which belongs to a side rather than a person - a
 * racer finishes exactly once. One row per person already exists and this is a
 * fact about that person in that match.
 *
 * `finish_place` is 1-based and assigned by the decider from the order the log
 * accepted the reports, which is the only ordering everybody can agree on: the
 * server's. Null means they never finished, which after the flag has fallen is
 * how a DNF is recorded - there is no separate flag for it, because "did not
 * finish" is exactly "has no place".
 *
 * `finish_seconds` is stamped from the server's clock against the recorded
 * kickoff, so a browser with a fast clock cannot post a fast time. It decides
 * what is printed beside a name and never who won - that is `finish_place`.
 */
alter table public.battle_participants
  add column if not exists finish_place integer;

alter table public.battle_participants
  add column if not exists finish_seconds integer;
