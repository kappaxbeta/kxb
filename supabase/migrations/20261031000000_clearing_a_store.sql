-- ============================================================================
-- Clearing a store, which is two different things
-- ----------------------------------------------------------------------------
-- docs/xp/state.md §7.5 Reading A gave a space owner a *view* of what its games
-- have kept and stopped there, on purpose: the card says "nothing here erases
-- anything", and backlog §7a held the erasing back because the question is not
-- a UI one. What may an owner erase of somebody else's progress?
--
-- **Decided: two controls, not one.**
--
--   | | `space` — the world everyone built | `player` — private progress | `shared` — each person's own, others can read |
--   |---|---|---|---|
--   | Clear the shared world | erased | untouched | untouched |
--   | Clear everything       | erased | erased    | erased |
--
-- In a shared town the first resets the town and everybody keeps their coins and
-- their name on the board; the second takes those too.
--
-- **Two rather than one, because the safe one is what people actually want.** A
-- level whose save format changed needs the town reset, not the players wiped.
-- Offering only the destructive version means either nobody presses it - and the
-- broken world stays broken - or somebody presses it for the wrong reason and
-- takes a season of other people's play with it.
--
-- ---------------------------------------------------------------------------
-- Why this is a function when the delete policies already exist
-- ---------------------------------------------------------------------------
-- 20261006000000 gave `xp_store` a delete policy: your own `player` row, and
-- the `space` row if you are in the space. So *Clear the shared world* needs
-- nothing new. *Clear everything* is the one that cannot be done as the caller:
-- it deletes rows belonging to other accounts, which RLS refuses and should go
-- on refusing - the policy is what protects a player from a level, and widening
-- it to admit an owner would mean every future reader of that policy has to
-- work out whether an owner is in scope.
--
-- So the wider erase is a `security definer` function with the gate written
-- once, in it: **owner or admin of the space the level lives in**, the same
-- reach `xp_store_overview` already has, because seeing the figure and clearing
-- it are the same person's job.
--
-- ---------------------------------------------------------------------------
-- Irreversible, and it says so
-- ---------------------------------------------------------------------------
-- These rows are not the event log. There is nothing to replay them from, no
-- snapshot behind them, and last-write-wins means the previous value is already
-- gone. §3.3 chose that; the consequence lands here. The function returns how
-- many rows it removed so the screen can say what happened rather than "done".
-- ============================================================================

create or replace function public.xp_store_clear(
  p_xp_id      uuid,
  p_everything boolean
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  uuid;
  v_role    text;
  v_cleared bigint;
begin
  select x.tenant_id into v_tenant
    from public.xps_read_model x
   where x.id = p_xp_id;

  v_role := public.tenant_role(v_tenant)::text;

  /**
   * One sentence for "no such level" and for "not yours".
   *
   * Telling a stranger that a level exists but is not theirs answers a question
   * they had no standing to ask, and the two cases are the same to somebody
   * entitled to be here: their own levels are all they can name.
   *
   * ---------------------------------------------------------------------------
   * `v_role is null` is not belt and braces — it is the whole guard
   * ---------------------------------------------------------------------------
   * This was written as `tenant_role(v_tenant) not in ('owner', 'admin')` and
   * it let a stranger clear anybody's store. `tenant_role` returns null for
   * somebody with no standing in a space, `null not in (…)` is **null** rather
   * than true, `if null then` does not fire, and the function fell through to
   * the delete. A member was refused correctly the whole time, which is what
   * makes this the kind of hole a test finds and a reading does not: the case
   * that works is the one with a value in it.
   *
   * Caught by asking the database rather than by arguing about it — as a
   * stranger, with `p_everything`, against a seeded store. Every scope went.
   *
   * The neighbouring `xp_store_overview` spells the same rule as `tenant_role(…)
   * in ('owner','admin')` inside a `where`, where null is simply not true and
   * the row is dropped. That one is safe. Only a `not in` inside an `if` turns
   * the absence into a pass.
   */
  if v_tenant is null or v_role is null or v_role not in ('owner', 'admin') then
    raise exception 'no such level' using errcode = '42501';
  end if;

  if p_everything then
    delete from public.xp_store s where s.xp_id = p_xp_id;
  else
    -- Named rather than "everything except": a scope added later must be
    -- decided about, not swept in by a filter that was written before it
    -- existed. `global` is exactly the scope this protects against - it is
    -- deliberately absent from the table today (20261006000000) and is
    -- user-generated content on our origin when it arrives.
    delete from public.xp_store s where s.xp_id = p_xp_id and s.scope = 'space';
  end if;

  get diagnostics v_cleared = row_count;
  return v_cleared;
end;
$$;

revoke execute on function public.xp_store_clear(uuid, boolean) from public;
grant execute on function public.xp_store_clear(uuid, boolean) to authenticated;

comment on function public.xp_store_clear(uuid, boolean) is
  'Clears a level''s store: the space row alone, or every scope. Owner or admin '
  'of the space it lives in, the same reach as xp_store_overview. Irreversible '
  '— these rows are not the event log and nothing replays them.';
