-- ============================================================================
-- Goals scored, one row each
-- ----------------------------------------------------------------------------
-- The score columns added in the previous migration are a *cache*, and this is
-- what they are derived from. The distinction matters because of the one rule
-- every projection here obeys: applying it twice has to land on the same answer.
--
-- `score_red = score_red + 1` breaks that rule. A rebuild re-delivers every
-- GoalScored, and an incrementing projection would double the score each time the
-- read model was rebuilt - the exact bug the friendly counts avoid by recomputing
-- through `recount_battle_scores` instead of adding one. See the note on
-- BattleEnded in src/domain/battle/projection.ts.
--
-- So a goal is a row, keyed by the id its reporter minted. Writing it is an
-- upsert, which is idempotent; the score is then a count over these rows, which
-- is idempotent too. The cached columns stay because the battle list wants a
-- scoreline without an aggregate per row.
--
-- It also gives the match a timeline for free - who scored, for which side, and
-- when - which is what a result screen wants to show and what "who got the
-- winner" is answered from.
-- ============================================================================

create table if not exists public.battle_goals (
  battle_id uuid        not null references public.battles_read_model (id) on delete cascade,
  /** Minted by whichever client reported it, so a redelivery cannot count twice. */
  goal_id   uuid        not null,
  /** The side awarded the point, already resolved - not the goal it went through. */
  side      text        not null check (side in ('red', 'blue')),
  /** Who put it in. Claimed by the reporter, so worth recording and not trusting. */
  scored_by uuid        references auth.users (id) on delete set null,
  own_goal  boolean     not null default false,
  scored_at timestamptz not null,
  primary key (battle_id, goal_id)
);

create index if not exists battle_goals_battle_idx
  on public.battle_goals (battle_id, scored_at);

alter table public.battle_goals enable row level security;

/**
 * Who may see the goals.
 *
 * Exactly who may see the match: members of the hosting space, and anybody on the
 * roster. The second clause is what lets a visiting space read the score of a
 * cross-space fixture they are playing in - the same pair of conditions
 * `battles_select` uses, through the same SECURITY DEFINER helper.
 */
create policy "battle_goals_select"
  on public.battle_goals for select
  to authenticated
  using (
    exists (
      select 1 from public.battles_read_model b
      where b.id = battle_goals.battle_id
        and (
          public.tenant_role(b.tenant_id) is not null
          or public.is_battle_participant(b.id, auth.uid())
        )
    )
  );

-- The projection runs as the signed-in member. A visiting player reports the goals
-- when they are the one stepping the ball, so insert cannot be scoped to the host
-- space alone - it is scoped to being in the match, which is the same test as
-- reading it. No update or delete: a goal that went in stays in.
create policy "battle_goals_insert"
  on public.battle_goals for insert
  to authenticated
  with check (
    exists (
      select 1 from public.battles_read_model b
      where b.id = battle_goals.battle_id
        and (
          public.tenant_role(b.tenant_id) is not null
          or public.is_battle_participant(b.id, auth.uid())
        )
    )
  );
