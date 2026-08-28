-- ============================================================================
-- One key the client can name in an upsert
-- ----------------------------------------------------------------------------
-- 20261006000000 gave `xp_store` two partial unique indexes, which describe the
-- table exactly: a `player` row is one per (xp, account) and a `space` row is
-- one per xp, because an XP belongs to exactly one space.
--
-- They are correct and they are unusable from the client. `ON CONFLICT` infers a
-- partial index only when the statement repeats its `WHERE` predicate, and
-- PostgREST's `upsert` cannot express one - so the port's `put` would have had
-- to read, decide, then insert or update, which is two round trips that can
-- interleave and a lost write when they do. That is precisely the failure the
-- row-per-scope design exists to avoid.
--
-- So: one constraint over all three columns, with `nulls not distinct` doing the
-- work. `account_id` is null for exactly the `space` rows, and the default
-- treatment of nulls - every null distinct from every other - would let a table
-- hold ten space rows for one XP without complaint. Postgres 15 added the
-- opposite, and it is the whole reason this can be one constraint rather than
-- two indexes plus a trigger.
--
-- The partial indexes are dropped rather than kept beside it: they would be a
-- second statement of the same rule, and the two would be maintained by nobody.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Written to survive being run twice
-- ---------------------------------------------------------------------------
-- The drops already were. `add constraint` is not, and the first run of this
-- file recorded its version while its statements did not land - which left a
-- database whose schema said one thing and whose migration table said another,
-- and a rerun that failed on the *bookkeeping* row rather than on anything real.
--
-- A migration that is safe to replay costs one `if not exists` and removes a
-- whole class of afternoon. It matters most for exactly this table, because the
-- constraint below is what the client's `upsert` names: a database missing it
-- does not fail loudly, it fails on the first save somebody tries.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'xp_store_scope_key'
  ) then
    execute 'alter table public.xp_store
      add constraint xp_store_scope_key
      unique nulls not distinct (xp_id, scope, account_id)';
  end if;
end
$$;

drop index if exists public.xp_store_player_key;
drop index if exists public.xp_store_space_key;
