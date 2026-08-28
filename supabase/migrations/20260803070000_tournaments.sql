-- ============================================================================
-- Tournaments
-- ----------------------------------------------------------------------------
-- A run of matches with one winner. The bracket is *not* stored: every round
-- after the first is a pure function of the round before, so the aggregate
-- rebuilds it on each fold (see src/domain/tournament/bracket.ts). What is
-- stored here is the part a listing page needs without folding a stream.
-- ============================================================================

create table if not exists public.tournaments_read_model (
  id          uuid        primary key,
  tenant_id   uuid        not null references public.tenants_read_model (id) on delete cascade,
  name        text        not null,
  mode        text        not null check (mode in ('ffa', 'team', 'one_vs_all')),
  world_id    uuid        not null,
  status      text        not null default 'open'
                check (status in ('open', 'live', 'ended', 'cancelled')),
  entrants    integer     not null default 0,
  winner_id   uuid,
  created_by  uuid        references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  ended_at    timestamptz,
  updated_at  timestamptz not null default now(),
  version     integer     not null default 0
);

create index if not exists tournaments_tenant_status_idx
  on public.tournaments_read_model (tenant_id, status, created_at desc);

alter table public.tournaments_read_model enable row level security;

create policy "tournaments_select"
  on public.tournaments_read_model for select
  to authenticated
  using (public.tenant_role(tenant_id) is not null);

create policy "tournaments_insert"
  on public.tournaments_read_model for insert
  to authenticated
  with check (public.tenant_role(tenant_id) is not null);

create policy "tournaments_update"
  on public.tournaments_read_model for update
  to authenticated
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

-- ============================================================================
-- Friendly scoring
-- ----------------------------------------------------------------------------
-- Counts, and nothing that orders people by skill. No rating, no ladder, no
-- leaderboard - deliberately. The lounge is a team's play area and a space's
-- battlefields are for scrapping with people you work with; a number that goes
-- down when you lose changes what it feels like to accept a challenge from
-- somebody better than you, which is the opposite of what this is for.
--
-- So: how many you turned up to, how many you won. Both go up, neither ranks.
--
-- Maintained by the battles projection rather than computed on read, because
-- "played" is not derivable from the current roster once a battle's
-- participants have been read - it is a count over history, and history is
-- exactly what a projection is for.
-- ============================================================================

create table if not exists public.battle_scores (
  /** The space these counts are within. */
  tenant_id uuid        not null references public.tenants_read_model (id) on delete cascade,
  user_id   uuid        not null references auth.users (id) on delete cascade,
  played    integer     not null default 0,
  won       integer     not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

alter table public.battle_scores enable row level security;

-- Readable by anyone in the space. It is a friendly counter, not a private one.
create policy "battle_scores_select"
  on public.battle_scores for select
  to authenticated
  using (public.tenant_role(tenant_id) is not null);

create policy "battle_scores_insert"
  on public.battle_scores for insert
  to authenticated
  with check (public.tenant_role(tenant_id) is not null);

create policy "battle_scores_update"
  on public.battle_scores for update
  to authenticated
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

/**
 * Fold one finished battle into everyone's counts.
 *
 * A function rather than TypeScript in the projection because it has to be
 * **idempotent**: `runProjection` can be called from several actions and a
 * replay re-delivers every BattleEnded, so a naive `played = played + 1` would
 * inflate the numbers every time the read model was rebuilt.
 *
 * So the counts are recomputed from the roster instead of incremented. Running
 * this twice for the same battle lands on the same numbers, which is the same
 * property the block projection gets from upserting rather than appending.
 */
create or replace function public.recount_battle_scores(p_tenant_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.battle_scores (tenant_id, user_id, played, won, updated_at)
  select
    p.tenant_id,
    p.user_id,
    count(*) as played,
    count(*) filter (
      where (b.winner_type = 'player' and b.winner_id = p.user_id::text)
         or (b.winner_type = 'side'   and b.winner_id = p.side)
    ) as won,
    now()
  from public.battle_participants p
  join public.battles_read_model b on b.id = p.battle_id
  where b.status = 'ended'
    and p.tenant_id = p_tenant_id
  group by p.tenant_id, p.user_id
  on conflict (tenant_id, user_id) do update
    set played = excluded.played,
        won = excluded.won,
        updated_at = excluded.updated_at;
$$;

comment on function public.recount_battle_scores(uuid) is
  'Recompute a space''s friendly win/played counts from finished battles. Idempotent by construction.';
