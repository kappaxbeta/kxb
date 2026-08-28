-- ============================================================================
-- Read model: daily login streaks
-- ----------------------------------------------------------------------------
-- One row per (space, member): how many days in a row they have shown up, the
-- best run they have ever had, and the last day they were seen. Derived data,
-- written *only* by the projector in src/domain/streaks/projection.ts, and
-- droppable and rebuildable from the event log like every other read model.
--
-- Keyed by (tenant_id, user_id) rather than by the aggregate's stream id, the
-- same shape `battle_scores` uses and for the same reason: this is read as a
-- table of people, and every query starts from "who, in this space". The stream
-- id is carried as a column so a row can still jump to its own history.
--
-- Why a streak is per space at all: every stream in this app is tenant-scoped,
-- and the two places a streak is read - the space's dashboard and the space's
-- leaderboard - are both about one room. "Your streak here" and "this space's
-- leaderboard" are one idea; a single global streak would answer neither page.
--
-- ----------------------------------------------------------------------------
-- What is a "day", and where the streak math lives
-- ----------------------------------------------------------------------------
-- A day is a UTC calendar day. The consecutive-day arithmetic is *not* in SQL:
-- it lives in the decider (src/domain/streaks/aggregate.ts), which records the
-- streak it reached in each `DayVisited` event. So this table only ever assigns
-- the values off the latest event - no `+ 1`, nothing that would inflate on a
-- replay. That is the same idempotency `recount_battle_scores` buys with a
-- recompute; a snapshot-carrying event buys it here without a function, because
-- a streak is a fold over an ordered history and not a set-based count.
--
-- `current_streak` is the run *as of `last_day`*. A run that has since gone cold
-- is not zeroed here - "is this streak still alive today" is a question about
-- now, not about the row, so it is answered at read time against today's date
-- (see src/domain/streaks/days.ts). Zeroing cold rows would need a daily write
-- for every member who stopped, which is a lot of writing to record nothing
-- happening.
-- ============================================================================

create table if not exists public.login_streaks_read_model (
  tenant_id      uuid        not null references public.tenants_read_model (id) on delete cascade,
  user_id        uuid        not null references auth.users (id) on delete cascade,
  -- The aggregate's stream id, so a row can be traced back to its events. Same
  -- correspondence tasks_read_model.id keeps with its stream.
  stream_id      uuid        not null,
  -- The run as of `last_day`. Alive-ness is a read-time question - see above.
  current_streak integer     not null default 0,
  longest_streak integer     not null default 0,
  -- Distinct days ever seen. Not the same as longest - a member who shows up
  -- every Monday has a total that climbs and a streak that never leaves 1.
  total_days     integer     not null default 0,
  -- The last UTC day this member was seen in this space.
  last_day       date        not null,
  updated_at     timestamptz not null default now(),

  primary key (tenant_id, user_id)
);

-- The leaderboard reads a space's rows ordered by streak. Alive-ness and the
-- final ordering are applied in TypeScript over this set, so the index only has
-- to gather one space's rows cheaply.
create index if not exists login_streaks_tenant_idx
  on public.login_streaks_read_model (tenant_id, current_streak desc);

-- ----------------------------------------------------------------------------
-- Row level security
-- ----------------------------------------------------------------------------
-- Readable and writable by anyone in the space, exactly like `battle_scores`.
--
-- Read is space-wide because a leaderboard that only showed you your own row
-- would not be one. Write is space-wide because the projector is tenant-wide:
-- `runProjection` catches a space's whole log up from wherever the checkpoint
-- sits, so whoever's page load triggers it projects *everybody's* `DayVisited`
-- since then, not only their own. Owner-scoped write RLS would make one
-- member's navigation fail on another member's event. The service-role sweep in
-- /api/cron/project bypasses RLS and is the backstop.
-- ----------------------------------------------------------------------------

alter table public.login_streaks_read_model enable row level security;

create policy "login_streaks_select"
  on public.login_streaks_read_model for select
  to authenticated
  using (public.tenant_role(tenant_id) is not null);

create policy "login_streaks_insert"
  on public.login_streaks_read_model for insert
  to authenticated
  with check (public.tenant_role(tenant_id) is not null);

create policy "login_streaks_update"
  on public.login_streaks_read_model for update
  to authenticated
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);
