-- ============================================================================
-- Rematches
-- ----------------------------------------------------------------------------
-- "Go again" without setting a match up from scratch. The people who opt in
-- become the roster of the next one; everybody else just leaves.
--
-- A *new* battle rather than the old one reopening. "Who won" is a fact about a
-- match, and a stream that ended twice would have two answers to it - and would
-- collapse two matches into one row for the friendly counts, so a best-of-five
-- would score as a single game. Each round is its own battle; `rematch_of` and
-- `rematch_battle_id` are the thread between them.
-- ============================================================================

alter table public.battles_read_model
  add column if not exists rematch_battle_id uuid;

comment on column public.battles_read_model.rematch_battle_id is
  'The match this one turned into, once somebody started a rematch.';

alter table public.battle_participants
  add column if not exists wants_rematch boolean not null default false;

-- ----------------------------------------------------------------------------
-- A rematch inherits its roster's rights
-- ----------------------------------------------------------------------------
-- `can_act_in_battle` currently answers yes for people already on a battle's
-- roster, and for people an accepted challenge brought to it. A rematch is
-- neither: it is a brand new battle id that nobody has joined yet, and no
-- challenge points at it.
--
-- Without this clause a cross-space rematch would be unjoinable by the visiting
-- side - they could opt in, watch the new match get created, and then be unable
-- to walk into it. So the chain is extended by one link: you may act in a
-- battle that is the rematch of one you fought in.
--
-- Deliberately one link, not transitive. A fourth round is the rematch of the
-- third, and whoever is still going has been on every roster along the way, so
-- each hop is covered by the hop before it.
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
    )
    -- Or this is the rematch of a match they were in.
    or exists (
      select 1
      from public.battles_read_model b
      join public.battle_participants p on p.battle_id = b.id
      where b.rematch_battle_id = p_battle_id
        and p.user_id = p_user_id
    );
$$;

comment on function public.can_act_in_battle(uuid, uuid) is
  'Whether a user may append to a battle stream: on its roster, brought by an accepted challenge, or carried over from the match it is a rematch of.';
