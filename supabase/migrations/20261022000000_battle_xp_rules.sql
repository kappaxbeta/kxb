-- The rules a match settled on, and the ready sign that gates its kickoff.
--
-- Two columns, from one report: a match inside an XP could not be set up any
-- differently from the level's own document, and it kicked off with one person
-- in it while the other was still loading.
--
-- ============================================================================
-- Why the override is one jsonb column and not four
-- ============================================================================
-- The house style here is a column per field - `duration_minutes`,
-- `score_limit`, `damage_on`, `respawn_on` are four of them for football - and
-- this is the case where that is wrong.
--
-- Nothing queries a match by its score limit, orders by its clock, or joins on
-- how many players it is for. The block is read as a whole by exactly one
-- caller (`applyMatchRules`), which puts it back on the document before the
-- level is handed to the runtime. Split into columns it would be four nullable
-- fields whose absent halves each mean something slightly different - "the
-- level said nothing" against "the host removed it" - and the *block* is what
-- carries that distinction: absent inside a present block is "no limit", and an
-- absent block is "whatever the level says".
--
-- The event payload is the shape of record, as always. This column is a cache
-- of it, and `readXpRules` coerces on the way out for the reason every jsonb
-- read in this repo does: a column holds whatever was written to it.
--
-- No check constraint on the shape, deliberately. A constraint here would be a
-- third place the bounds live - the zod schema, `assertXpRules`, and this - and
-- the two that already exist run before anything is written, on a payload that
-- is then immutable. What a constraint would actually buy is a projection that
-- fails loudly on a malformed block, which is worse than a read that falls back
-- to the level's own rules.

alter table public.battles_read_model
  add column if not exists xp_rules jsonb;

comment on column public.battles_read_model.xp_rules is
  'What this match settled the level''s rules to be, or NULL for the level''s own. See XpMatchRules.';

-- ============================================================================
-- The ready sign
-- ============================================================================
-- Beside `defeated` and `wants_rematch`, which are the same kind of thing: one
-- bit a fighter said about themselves, projected onto the row a Realtime policy
-- and a lobby can both read as a plain column.
--
-- Not null with a default, because "we do not know" is not a state anybody
-- means: a fighter who has joined and said nothing is not ready, and every
-- match ever played had nobody at the line by that definition. A leaver's row
-- is deleted rather than cleared, so there is no stale tick to worry about.

alter table public.battle_participants
  add column if not exists ready boolean not null default false;

comment on column public.battle_participants.ready is
  'TRUE once this fighter said they are at the line. Only meaningful while the match is open.';
