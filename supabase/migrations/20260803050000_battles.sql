-- ============================================================================
-- Battles
-- ----------------------------------------------------------------------------
-- A match with a roster, a start and a winner. See src/domain/battle/events.ts
-- for what is and is not event-sourced here - briefly: the *result* is, and
-- everything that happens moment to moment inside the fight is not, exactly as
-- the lounge already decided for its ambient sparring.
--
-- Two tables, and the second one is the interesting one.
--
-- `battles_read_model` is an ordinary projection: the list you browse, the row
-- a page reads to render one match.
--
-- `battle_participants` exists for a different reason. Realtime policies are
-- evaluated in Postgres against a topic string, and they cannot fold an event
-- stream to work out whether you are in a match. So the roster has to be
-- readable as a plain row, and this is it. It is projected from exactly the
-- same events - it is not a second source of truth, it is the same truth in a
-- shape a policy can consult.
-- ============================================================================

create table if not exists public.battles_read_model (
  /** The battle's stream id. */
  id           uuid        primary key,
  /**
   * The space hosting the match, which for a cross-space challenge is the
   * challenger's. A stream belongs to one tenant, so somebody has to host - see
   * the note in src/domain/battle/events.ts.
   */
  tenant_id    uuid        not null references public.tenants_read_model (id) on delete cascade,
  name         text        not null,
  mode         text        not null check (mode in ('ffa', 'team', 'one_vs_all')),
  /** The world it is fought in: a battlefield, or the host's own lounge. */
  world_id     uuid        not null,
  status       text        not null default 'open'
                 check (status in ('open', 'live', 'ended', 'cancelled')),
  /**
   * Who won. Null while it is unresolved *and* for a draw - the two are told
   * apart by `status`, which is 'ended' only in the second case.
   */
  winner_type  text        check (winner_type in ('player', 'side')),
  winner_id    text,
  created_by   uuid        references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  ended_at     timestamptz,
  updated_at   timestamptz not null default now(),
  version      integer     not null default 0
);

create index if not exists battles_tenant_status_idx
  on public.battles_read_model (tenant_id, status, created_at desc);

create table if not exists public.battle_participants (
  battle_id uuid        not null references public.battles_read_model (id) on delete cascade,
  user_id   uuid        not null references auth.users (id) on delete cascade,
  /** The player's own space, which need not be the host's. */
  tenant_id uuid        not null,
  /** NULL in a free-for-all, which has no sides. */
  side      text        check (side in ('red', 'blue', 'champion', 'challengers')),
  defeated  boolean     not null default false,
  joined_at timestamptz not null default now(),
  primary key (battle_id, user_id)
);

create index if not exists battle_participants_user_idx
  on public.battle_participants (user_id);

-- ----------------------------------------------------------------------------
-- Who may see a match
-- ----------------------------------------------------------------------------
-- Members of the hosting space, and anybody actually fighting in it. The second
-- clause is what makes a cross-space challenge work: a player from the
-- challenged space is not a member of the host, and still has to be able to
-- read the match they are standing in.
-- ----------------------------------------------------------------------------
alter table public.battles_read_model enable row level security;
alter table public.battle_participants enable row level security;

/**
 * Is this user fighting in this battle?
 *
 * SECURITY DEFINER so the policy on `battles_read_model` can consult
 * `battle_participants` without the caller needing to be able to read every row
 * of it, and so the two policies cannot recurse into each other.
 */
create or replace function public.is_battle_participant(p_battle_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.battle_participants
    where battle_id = p_battle_id and user_id = p_user_id
  );
$$;

comment on function public.is_battle_participant(uuid, uuid) is
  'Whether a user is on a battle''s roster. Used by RLS, including Realtime.';

create policy "battles_select"
  on public.battles_read_model for select
  to authenticated
  using (
    public.tenant_role(tenant_id) is not null
    or public.is_battle_participant(id, auth.uid())
  );

-- The projection runs as the signed-in member, so writing is scoped to the
-- hosting space. No delete policy: a battle is cancelled, never removed.
create policy "battles_insert"
  on public.battles_read_model for insert
  to authenticated
  with check (public.tenant_role(tenant_id) is not null);

create policy "battles_update"
  on public.battles_read_model for update
  to authenticated
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

create policy "battle_participants_select"
  on public.battle_participants for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_battle_participant(battle_id, auth.uid())
    or exists (
      select 1 from public.battles_read_model b
      where b.id = battle_participants.battle_id
        and public.tenant_role(b.tenant_id) is not null
    )
  );

create policy "battle_participants_write"
  on public.battle_participants for insert
  to authenticated
  with check (
    exists (
      select 1 from public.battles_read_model b
      where b.id = battle_participants.battle_id
        and public.tenant_role(b.tenant_id) is not null
    )
  );

create policy "battle_participants_update"
  on public.battle_participants for update
  to authenticated
  using (
    exists (
      select 1 from public.battles_read_model b
      where b.id = battle_participants.battle_id
        and public.tenant_role(b.tenant_id) is not null
    )
  )
  with check (
    exists (
      select 1 from public.battles_read_model b
      where b.id = battle_participants.battle_id
        and public.tenant_role(b.tenant_id) is not null
    )
  );

create policy "battle_participants_delete"
  on public.battle_participants for delete
  to authenticated
  using (
    exists (
      select 1 from public.battles_read_model b
      where b.id = battle_participants.battle_id
        and public.tenant_role(b.tenant_id) is not null
    )
  );

-- ----------------------------------------------------------------------------
-- Realtime authorization for a battle's channel
-- ----------------------------------------------------------------------------
-- Same shape as lounge presence in 20260727010000, and a different question.
-- The lounge asks "are you in this workspace"; a battle asks "are you on this
-- roster", because a match can span two spaces and membership of the host is
-- neither necessary nor sufficient.
--
-- A separate topic rather than reusing the lounge's, so that a match fought on
-- a battlefield does not broadcast into the room of everybody standing in the
-- lounge - who are in a different world and would see fighters walking through
-- their walls.
-- ----------------------------------------------------------------------------

/**
 * The battle a topic refers to, or NULL if the topic is not one.
 *
 * The cast is allowed to fail for the reason lounge_topic_tenant explains:
 * Postgres does not guarantee AND short-circuits, so a malformed topic must be
 * denied rather than raise.
 */
create or replace function public.battle_topic_id(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_topic is null or left(p_topic, 7) <> 'battle:' then
    return null;
  end if;
  return substring(p_topic from 8)::uuid;
exception
  when others then
    return null;
end;
$$;

comment on function public.battle_topic_id(text) is
  'Battle id embedded in a battle:<uuid> Realtime topic, or NULL.';

-- Note these are added alongside the lounge's policies rather than replacing
-- them. Policies for one command are OR-ed, so `lounge:` topics keep working
-- exactly as they did and `battle:` topics become reachable to a roster.
drop policy if exists "battle_presence_read" on realtime.messages;
create policy "battle_presence_read"
  on realtime.messages for select
  to authenticated
  using (
    public.battle_topic_id(realtime.topic()) is not null
    and public.is_battle_participant(
      public.battle_topic_id(realtime.topic()),
      auth.uid()
    )
  );

drop policy if exists "battle_presence_write" on realtime.messages;
create policy "battle_presence_write"
  on realtime.messages for insert
  to authenticated
  with check (
    public.battle_topic_id(realtime.topic()) is not null
    and public.is_battle_participant(
      public.battle_topic_id(realtime.topic()),
      auth.uid()
    )
  );
