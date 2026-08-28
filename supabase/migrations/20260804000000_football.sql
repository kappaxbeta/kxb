-- ============================================================================
-- Read model: the goals a football match is played into
-- ----------------------------------------------------------------------------
-- The third kind of thing that stands in a world, after blocks and images, and
-- it lands where images did: a goal has identity. It is moved, resized, handed
-- to the other side and taken away, and each of those refers to the same object
-- over time - a lifecycle, so one stream per goal. The blocks migration makes
-- the opposite argument for cells, which have no identity at all.
--
-- One difference from images, and it is the important one: this table is keyed
-- by **world**, not just by tenant. Images only ever hang in a workspace's own
-- lounge. Goals have to survive the lounge being saved as a battlefield and then
-- fought on by a visiting space - an arena whose goals stayed behind when it was
-- saved is an arena you cannot play football on. So `world_id` sits beside
-- `tenant_id` exactly as it does on the blocks, and defaults the same way: a
-- world id equal to the tenant id means that space's own lounge.
--
-- See src/domain/lounge/goal-events.ts.
-- ============================================================================

create table if not exists public.lounge_goals_read_model (
  -- Same id as the aggregate's stream_id.
  id         uuid        primary key,
  /** The space that owns the world. Every write policy consults this. */
  tenant_id  uuid        not null,
  /** Which of that space's worlds. Equal to tenant_id for its own lounge. */
  world_id   uuid        not null,
  /** Whose goal it is - not who scores in it. See `scoringSide` in football.ts. */
  team       text        not null check (team in ('red', 'blue')),
  -- The cell its bottom centre sits in, on the same lattice as the blocks.
  x          integer     not null,
  y          integer     not null,
  z          integer     not null,
  /** Size of the mouth, in cells. */
  width      integer     not null default 5,
  height     integer     not null default 4,
  /** Quarter turns about Y: 0/2 put the plane across Z, 1/3 across X. */
  facing     integer     not null default 0,
  deleted    boolean     not null default false,
  placed_by  uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version    integer     not null
);

-- "Load this world's goals" is the only read there is, so this is the index it
-- goes through. Partial, because a removed goal is never wanted.
create index if not exists lounge_goals_world_idx
  on public.lounge_goals_read_model (tenant_id, world_id)
  where deleted = false;

alter table public.lounge_goals_read_model enable row level security;

-- Read: members of the space that owns the world.
drop policy if exists "lounge_goals_select_tenant" on public.lounge_goals_read_model;
create policy "lounge_goals_select_tenant"
  on public.lounge_goals_read_model for select
  to authenticated
  using (public.tenant_role(tenant_id) is not null);

-- ----------------------------------------------------------------------------
-- Reading another space's public arena
-- ----------------------------------------------------------------------------
-- A second select policy rather than a widening of the first, exactly as the
-- blocks table does it: policies for one command are OR-ed, so members keep the
-- access they had and outsiders gain read on public arenas only. No matching
-- insert or update - a visiting space can see where the goals are and never
-- move them, which is the same line drawn for the walls.
-- ----------------------------------------------------------------------------
drop policy if exists "lounge_goals_select_public_battlefield" on public.lounge_goals_read_model;
create policy "lounge_goals_select_public_battlefield"
  on public.lounge_goals_read_model for select
  to authenticated
  using (
    exists (
      select 1
      from public.battlefields_read_model b
      where b.world_id = lounge_goals_read_model.world_id
        and b.visibility = 'public'
        and b.archived = false
    )
  );

-- Write: the projection runs as the signed-in member, so the owning space's
-- members are who need insert and update. No delete policy - removing a goal
-- sets `deleted`, and the read model is rebuilt from the log rather than edited.
drop policy if exists "lounge_goals_insert_tenant" on public.lounge_goals_read_model;
create policy "lounge_goals_insert_tenant"
  on public.lounge_goals_read_model for insert
  to authenticated
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "lounge_goals_update_tenant" on public.lounge_goals_read_model;
create policy "lounge_goals_update_tenant"
  on public.lounge_goals_read_model for update
  to authenticated
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

-- ============================================================================
-- Football matches
-- ----------------------------------------------------------------------------
-- A football match is a battle, so it is the same aggregate and the same read
-- model - `battles_read_model` already holds the roster, the mode and the
-- outcome. What it does not hold is a score or a clock, because until now no
-- mode had either: the other three are decided by who is left standing.
--
-- So this widens the existing table rather than adding a second one. A battle
-- with `mode = 'football'` is still a battle, and every list, every join button
-- and every rematch keeps working without knowing football exists.
-- ============================================================================

alter table public.battles_read_model
  drop constraint if exists battles_read_model_mode_check;

alter table public.battles_read_model
  add constraint battles_read_model_mode_check
  check (mode in ('ffa', 'team', 'one_vs_all', 'football'));

-- How long the match runs, in minutes. Null for every mode that has no clock.
alter table public.battles_read_model
  add column if not exists duration_minutes integer;

-- First to this many goals wins, if the host set a target. Null means the clock
-- is the only way it ends.
alter table public.battles_read_model
  add column if not exists score_limit integer;

/**
 * The two settings that decide how rough it is.
 *
 * Null for every mode but football, which is the only one that has the question.
 * In the others being knocked out *is* the game, so there is nothing to set:
 * damage is always on and you never come back.
 *
 * In football a knockout is a setback rather than an elimination - the match is
 * decided by the score, so a player who cannot return would simply be a player
 * who stopped playing. Hence `respawn_on`, which the host may switch off if they
 * want knockouts to bite, and `damage_on`, which they may switch off entirely
 * for a friendly game where the dash only moves the ball.
 */
alter table public.battles_read_model
  add column if not exists damage_on boolean;

alter table public.battles_read_model
  add column if not exists respawn_on boolean;

/**
 * The score.
 *
 * Two counters on the match rather than a row per goal. The individual goals are
 * in the event log - who scored, against which side, and when - and that is
 * where "who got the winner" is answered from. What a *list* of matches needs is
 * the score line, and folding a stream per row to render "3-2" would make the
 * battle list cost one replay per football match in it.
 */
alter table public.battles_read_model
  add column if not exists score_red integer not null default 0;

alter table public.battles_read_model
  add column if not exists score_blue integer not null default 0;

/**
 * When the whistle went.
 *
 * The clock is derived, not stored: every client works out how long is left from
 * this plus `duration_minutes`, so nobody has to broadcast a countdown and a
 * player who joins late or reloads sees the same time as everybody else. It is
 * the same trick the starting ring uses - derive from a shared fact rather than
 * hand out an answer.
 */
alter table public.battles_read_model
  add column if not exists started_at timestamptz;

-- A side may be recorded as the winner of a football match, so 'side' already
-- covers it - see `winner_type`. Nothing to change there.
