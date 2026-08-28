-- ============================================================================
-- Creatures that decide for themselves
-- ----------------------------------------------------------------------------
-- One row per animal living in somebody's room. What is here is the roster -
-- that it exists, what it is called, which model it wears, which room it is in.
--
-- What is deliberately NOT here is anything it is *doing*: no position, no
-- posture, no "is asleep" column, no last-seen timestamp. The entire schedule -
-- walk to a corner, potter about, sit, doze - is derived from `agent_id` and
-- the wall clock by src/domain/world/autonomy.ts, on whichever client happens
-- to be looking. Two people in the same room see the same animal in the same
-- place because they are running the same arithmetic on the same two numbers,
-- not because anything was written down or broadcast.
--
-- That is why this table is as small as it is, and it is worth resisting the
-- first request to add `last_x`/`last_z` to it: the moment a position is
-- stored, it is authoritative, and then it has to be written at some rate, and
-- then that rate is a load-bearing number. There is nothing to store because
-- there is nothing that is not already implied.
-- ============================================================================

create table if not exists public.agents_read_model (
  tenant_id  uuid        not null,
  /**
   * Whose creature it is. Also whose rooms it may live in - the stream id the
   * write side derives is keyed on this, so it cannot be set to anybody else.
   */
  owner_id   uuid        not null,
  /**
   * The uuid the client minted, and the seed for the whole routine.
   *
   * Never reused: releasing appends a fact and deletes the row, and adopting
   * again mints a fresh id. That is what makes a replacement animal behave like
   * a different one rather than resurrecting the old one's habits.
   */
  agent_id   uuid        not null,
  name       text        not null,
  /** One of the model pack's animals. Checked at the write, not here - the
      pack is code, and a constraint listing them would need a migration every
      time somebody added a hedgehog. */
  avatar     text        not null,
  /** Which room it lives in. The lounge is allowed: the commons has animals too. */
  place      text        not null check (place in ('cafe', 'home', 'outdoor', 'lounge')),
  adopted_at timestamptz not null,

  primary key (tenant_id, agent_id)
);

-- The query every scene makes: "the creatures in this room, in adoption order".
create index if not exists agents_read_model_room_idx
  on public.agents_read_model (tenant_id, owner_id, place, adopted_at);

-- And the lounge's, which asks the same question without an owner - the commons
-- shows everybody's animals at once.
create index if not exists agents_read_model_place_idx
  on public.agents_read_model (tenant_id, place, adopted_at);

comment on table public.agents_read_model is
  'Roster of self-directed creatures. Folded from the `agents` stream. Holds no position: behaviour is derived from agent_id plus the clock, see src/domain/world/autonomy.ts.';

-- ----------------------------------------------------------------------------
-- Row level security
-- ----------------------------------------------------------------------------
-- Membership-scoped, matching the homestead read model exactly - and readable
-- by the whole workspace rather than only the owner, on purpose. Visiting a
-- colleague's house is supposed to show you their cat, and the projection is
-- run by whichever member's request happens to be catching up, so a self-only
-- write policy would fail for whoever unluckily went second.
--
-- What stops you putting a badger in somebody else's kitchen is upstream and
-- much stronger than a policy: the stream id is derived from the session's own
-- user id, so there is no argument any caller can pass to address another
-- member's roster.
-- ----------------------------------------------------------------------------
alter table public.agents_read_model enable row level security;

drop policy if exists "agents_read_model_select" on public.agents_read_model;
create policy "agents_read_model_select"
  on public.agents_read_model for select
  using (public.tenant_role(tenant_id) is not null);

drop policy if exists "agents_read_model_write" on public.agents_read_model;
create policy "agents_read_model_write"
  on public.agents_read_model for insert
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "agents_read_model_update" on public.agents_read_model;
create policy "agents_read_model_update"
  on public.agents_read_model for update
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "agents_read_model_delete" on public.agents_read_model;
create policy "agents_read_model_delete"
  on public.agents_read_model for delete
  using (public.tenant_role(tenant_id) is not null);

-- ----------------------------------------------------------------------------
-- The switch
-- ----------------------------------------------------------------------------
-- Off by default, unlike the other four. Those were shipped features being
-- described; this one is new, and an empty room is a better first impression
-- than a room somebody has to work out how to empty.
-- ----------------------------------------------------------------------------
insert into public.feature_flags (key, enabled, label, description) values
  ('agents', false, 'Creatures',
   'Self-directed animals that live in the café, house, garden and lounge, and decide for themselves whether to wander, sit or sleep.')
on conflict (key) do nothing;
