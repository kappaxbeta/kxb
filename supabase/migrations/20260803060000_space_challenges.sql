-- ============================================================================
-- Challenges between spaces
-- ----------------------------------------------------------------------------
-- One space asks another for a match. Deliberately *not* event-sourced, and the
-- reason is the same one the slug reservation gives in domain/tenants/actions.ts:
-- a challenge is a fact about two tenants, and every stream in this system
-- belongs to exactly one. Putting it on the challenger's stream would make it
-- invisible to the space being challenged; duplicating it onto both would be
-- two records of one fact, free to disagree.
--
-- So it is a plain table, and the honest description of it is coordination
-- rather than history. What comes *out* of an accepted challenge - the match
-- itself - is event-sourced like everything else.
-- ============================================================================

create table if not exists public.space_challenges (
  id                    uuid        primary key default gen_random_uuid(),
  challenger_tenant_id  uuid        not null references public.tenants_read_model (id) on delete cascade,
  challenged_tenant_id  uuid        not null references public.tenants_read_model (id) on delete cascade,
  mode                  text        not null check (mode in ('ffa', 'team', 'one_vs_all')),
  /** The ground. NULL means the challenger's lounge. */
  world_id              uuid,
  status                text        not null default 'pending'
                          check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  /** Set when accepted. The match this turned into. */
  battle_id             uuid        references public.battles_read_model (id) on delete set null,
  message               text,
  created_by            uuid        references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  responded_at          timestamptz,

  -- Challenging yourself is not a match, it is the lounge.
  constraint space_challenges_not_self check (challenger_tenant_id <> challenged_tenant_id)
);

create index if not exists space_challenges_challenged_idx
  on public.space_challenges (challenged_tenant_id, status, created_at desc);

create index if not exists space_challenges_challenger_idx
  on public.space_challenges (challenger_tenant_id, status, created_at desc);

-- At most one open challenge between the same two spaces in the same direction.
-- Without it, a double-clicked button is two challenges and declining one still
-- leaves the other sitting there.
create unique index if not exists space_challenges_one_pending_idx
  on public.space_challenges (challenger_tenant_id, challenged_tenant_id)
  where status = 'pending';

alter table public.space_challenges enable row level security;

-- Either side may read it. Only the challenger may raise one, and the row must
-- name their space as the challenger - otherwise anybody could post a challenge
-- "from" a space they have nothing to do with.
create policy "space_challenges_select"
  on public.space_challenges for select
  to authenticated
  using (
    public.tenant_role(challenger_tenant_id) is not null
    or public.tenant_role(challenged_tenant_id) is not null
  );

create policy "space_challenges_insert"
  on public.space_challenges for insert
  to authenticated
  with check (public.tenant_role(challenger_tenant_id) is not null);

-- Both sides can update: the challenged accepts or declines, the challenger
-- withdraws. Which of those a given caller may actually do is enforced in
-- src/domain/challenges/actions.ts, where the current status is also known.
create policy "space_challenges_update"
  on public.space_challenges for update
  to authenticated
  using (
    public.tenant_role(challenger_tenant_id) is not null
    or public.tenant_role(challenged_tenant_id) is not null
  )
  with check (
    public.tenant_role(challenger_tenant_id) is not null
    or public.tenant_role(challenged_tenant_id) is not null
  );

-- ----------------------------------------------------------------------------
-- Letting a visiting fighter act in a match
-- ----------------------------------------------------------------------------
-- This is the part that makes cross-space battles possible at all, and it is
-- worth reading slowly.
--
-- `events_insert_tenant` says you may append to a stream only in a space you
-- belong to. That is exactly right for every aggregate this app had until now -
-- and it makes a cross-space match impossible, because a battle stream belongs
-- to whichever space hosts it, and half the fighters are not in that space.
-- They could not join, could not report going down, could not forfeit.
--
-- The policy already carries a precedent for the shape of the answer: it lets
-- somebody who is *not* a member append to a tenant stream when they hold an
-- invitation to it (`has_tenant_invitation`). Accepting an invitation is how
-- you become a member, so the rule cannot require membership first.
--
-- This is the same move for battles. A person may append to a battle stream if
-- their space was invited to that match by an accepted challenge, or if they
-- are already on its roster - the second clause being what lets somebody who
-- has joined go on to report their own defeat.
--
-- Note what it does *not* grant: reading or writing anything else in the
-- hosting space. It is scoped to `stream_type = 'battle'` and to that one
-- stream id.
-- ----------------------------------------------------------------------------

create or replace function public.can_act_in_battle(p_battle_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Already fighting here.
    exists (
      select 1 from public.battle_participants
      where battle_id = p_battle_id and user_id = p_user_id
    )
    -- Or a member of a space that an accepted challenge brought to this match.
    or exists (
      select 1
      from public.space_challenges c
      join public.tenant_members m
        on m.tenant_id in (c.challenger_tenant_id, c.challenged_tenant_id)
      where c.battle_id = p_battle_id
        and c.status = 'accepted'
        and m.user_id = p_user_id
    );
$$;

comment on function public.can_act_in_battle(uuid, uuid) is
  'Whether a user may append to a battle stream: already on its roster, or brought to it by an accepted challenge.';

-- Replaced rather than added to, because Postgres OR-s multiple permissive
-- policies for one command and the existing one is the thing being widened.
-- Every clause it had is preserved verbatim below; the battle clause is new.
drop policy if exists "events_insert_tenant" on public.events;
create policy "events_insert_tenant"
  on public.events for insert
  with check (
    actor_id = (select auth.uid())
    and (
      public.tenant_role(tenant_id) is not null
      or public.tenant_is_unclaimed(tenant_id)
      or (stream_type = 'tenant' and public.has_tenant_invitation(tenant_id))
      or (stream_type = 'battle' and public.can_act_in_battle(stream_id, (select auth.uid())))
    )
  );

-- Reading has to be widened in step. executeCommand takes its expected version
-- from the last event it loaded, so a fighter who could append but not read
-- would always compute version 0 and lose every optimistic-concurrency check.
drop policy if exists "events_select_tenant" on public.events;
create policy "events_select_tenant"
  on public.events for select
  using (
    public.tenant_role(tenant_id) is not null
    or public.tenant_is_unclaimed(tenant_id)
    or (stream_type = 'tenant' and public.has_tenant_invitation(tenant_id))
    or (stream_type = 'battle' and public.can_act_in_battle(stream_id, (select auth.uid())))
  );
