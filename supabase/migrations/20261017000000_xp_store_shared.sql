-- ============================================================================
-- Mine, and everybody can see it
-- ----------------------------------------------------------------------------
-- docs/xp/state.md §7.1. Every scope the store has today reads and writes to the
-- same population: a `player` row is yours alone, a `space` row is the space's.
-- There is no scope for *state I own that others may see and not change* — my
-- score on a shared board, my house in a shared town, my ghost on a track, my
-- nameplate.
--
-- ---------------------------------------------------------------------------
-- A third scope, not a flag on the second
-- ---------------------------------------------------------------------------
-- The alternative was a boolean on a `player` row. It is worse for a reason
-- worth stating: a flag makes "who can read this" a property somebody can flip
-- on data that was written when the answer was different. A scope is chosen when
-- the value is first written and is visible in the key the author types
-- (`shared:score`, not `player:score`), so nothing is ever silently promoted
-- from private to visible.
--
-- ---------------------------------------------------------------------------
-- The audience is the space, and that is deliberate
-- ---------------------------------------------------------------------------
-- §7.1 warns that the first row read by somebody who is not its owner drags
-- §3.2's stranger-readable rules along with it — byte caps, rate limits, values
-- that are data and never markup, moderatable. Those are about `global`, where
-- the reader is *anybody*, and `global` is still deliberately not in this table.
--
-- Here the audience is the space's membership: the same population that can
-- already read the `space` row and can already read every other member's
-- messages. So the new thing is not the audience, it is **ownership within it** —
-- one row per player, written by that player, read by all of them. The byte
-- ceiling from 20261006000000 applies unchanged, and the moderation surface is
-- the same one §7.5's overview already provides.
--
-- What is *not* granted: an XP's owner still cannot read a `player` row. That
-- rule survives this exactly, because a `shared` row is a different row that the
-- author of the level chose to make visible.
-- ============================================================================

alter table public.xp_store drop constraint if exists xp_store_scope_check;
alter table public.xp_store
  add constraint xp_store_scope_check check (scope in ('player', 'space', 'shared'));

-- A shared row has an owner, like `player`, and unlike `space`.
alter table public.xp_store drop constraint if exists xp_store_owner_matches_scope;
alter table public.xp_store
  add constraint xp_store_owner_matches_scope check (
    (scope in ('player', 'shared') and account_id is not null)
    or (scope = 'space' and account_id is null)
  );

/**
 * Reading somebody else's, for the first time in this table.
 *
 * Dropped and recreated rather than added beside, because a second `for select`
 * policy is OR-ed with the first and the pair then has to be read together to
 * know what is visible. One policy, one place to look.
 */
drop policy if exists "xp_store_select" on public.xp_store;
create policy "xp_store_select"
  on public.xp_store for select
  to authenticated
  using (
    (scope = 'player' and account_id = (select auth.uid()))
    or (scope = 'space' and public.xp_in_my_space(xp_id))
    -- Mine to write, the space's to read. Both halves are needed: without the
    -- membership test this would be readable by anybody who learned an XP's id.
    or (scope = 'shared' and public.xp_in_my_space(xp_id))
  );

/**
 * Writing stays exactly where it was.
 *
 * `shared` is deliberately absent from the space branch of these: a member may
 * read every shared row and write only their own. That asymmetry *is* the
 * scope - if a member could write another member's row, this would be the
 * `space` scope with extra steps and a leaderboard anybody could edit.
 */
drop policy if exists "xp_store_insert" on public.xp_store;
create policy "xp_store_insert"
  on public.xp_store for insert
  to authenticated
  with check (
    (scope in ('player', 'shared') and account_id = (select auth.uid()))
    or (scope = 'space' and public.xp_in_my_space(xp_id))
  );

drop policy if exists "xp_store_update" on public.xp_store;
create policy "xp_store_update"
  on public.xp_store for update
  to authenticated
  using (
    (scope in ('player', 'shared') and account_id = (select auth.uid()))
    or (scope = 'space' and public.xp_in_my_space(xp_id))
  )
  with check (
    (scope in ('player', 'shared') and account_id = (select auth.uid()))
    or (scope = 'space' and public.xp_in_my_space(xp_id))
  );

drop policy if exists "xp_store_delete" on public.xp_store;
create policy "xp_store_delete"
  on public.xp_store for delete
  to authenticated
  using (
    (scope in ('player', 'shared') and account_id = (select auth.uid()))
    or (scope = 'space' and public.xp_in_my_space(xp_id))
  );

/**
 * And the overview learns the third scope.
 *
 * §7.5 Reading A shows sizes and keys and never contents, and the line it draws
 * is about what the *owner of the space* may see of a player's data. A `shared`
 * row's field names are already readable by every member, so listing them here
 * tells the operator nothing the space does not already know — and an operator
 * who cannot see what is on a shared board cannot moderate it, which §3.2 says
 * they must be able to do.
 */
create or replace function public.xp_store_overview(p_tenant uuid)
returns table (
  xp_id       uuid,
  xp_name     text,
  scope       text,
  rows        bigint,
  bytes       bigint,
  keys        text[],
  last_write  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.xp_id,
    r.xp_name,
    r.scope,
    count(*)                                        as rows,
    sum(r.bytes)                                    as bytes,
    (
      select array_agg(distinct k)
      from public.xp_store s2, jsonb_object_keys(s2.value) as k
      where s2.xp_id = r.xp_id
        and s2.scope = r.scope
        and r.scope in ('space', 'shared')
    )                                               as keys,
    max(r.updated_at)                               as last_write
  from (
    select
      s.xp_id,
      x.name                    as xp_name,
      s.scope,
      pg_column_size(s.value)   as bytes,
      s.updated_at
    from public.xp_store s
    join public.xps_read_model x on x.id = s.xp_id
    where x.tenant_id = p_tenant
      and public.tenant_role(p_tenant) in ('owner', 'admin')
  ) r
  group by r.xp_id, r.xp_name, r.scope
  order by r.xp_name, r.scope;
$$;
