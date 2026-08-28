-- ============================================================================
-- A write that only touches its own key
-- ----------------------------------------------------------------------------
-- docs/xp/server-authority.md §4.3's last hole, and it turns out to be about the
-- store rather than about the raid.
--
-- `put(key, value)` addresses a field *within* a scope, and every layer above
-- believes that: `changed()` in `level-data.ts` answers with the names that
-- moved precisely so a client writes only those, and its own comment says a
-- `player:coins` write that also re-wrote `space:town` would be one player's
-- frame overwriting a value everybody shares.
--
-- **The write underneath was never per key.** It merges the field into a
-- client-side cache and `upsert`s the whole row, so writing *any* field in a
-- scope restores *every* field in that scope to whatever this client last saw.
-- Between two clients that is last-write-wins across data neither of them
-- touched; against `xp_visit` it is a raided plant coming home the moment the
-- person who lost it saves anything at all.
--
-- ---------------------------------------------------------------------------
-- `security invoker`, deliberately
-- ---------------------------------------------------------------------------
-- This grants nobody anything. `xp_store`'s policies already say who may write
-- which scope, and they are good rules - a `player` row is yours, a `shared` row
-- is yours to write and the space's to read, a `space` row is any member's. A
-- `security definer` here would move that decision into a function and quietly
-- become the second place it is made.
--
-- So this is an atomic merge and nothing else: `insert ... on conflict do update
-- set value = xp_store.value || <one key>`, which the row's own policy checks
-- exactly as it checks the upsert it replaces.
--
-- ---------------------------------------------------------------------------
-- What it still does not fix, said plainly
-- ---------------------------------------------------------------------------
-- **Two writers of the same key still race**, and the last one wins. A victim
-- who shelves a plant computes `mine + 1` from the number they were holding, so
-- a raid that happened in between is overwritten by arithmetic done on a stale
-- value - a merge cannot help, because both writes are about that one key.
--
-- Fixing *that* means the store knowing the difference between **set to four**
-- and **add one**, which `put` cannot express and `addProp` vs `setProp`
-- already distinguishes one layer up. It is a change to §3.3's last-write-wins
-- rather than a bug in this function, and it is worth doing when a game needs
-- two people changing one counter at once - which the raid does not: it takes
-- from somebody who is usually not there.
-- ============================================================================

create or replace function public.xp_store_put(
  p_xp    uuid,
  p_scope text,
  p_key   text,
  p_value jsonb
)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.xp_store (xp_id, scope, account_id, value)
  values (
    p_xp,
    p_scope,
    case when p_scope = 'space' then null else auth.uid() end,
    jsonb_build_object(p_key, p_value)
  )
  on conflict (xp_id, scope, account_id)
  do update set value = public.xp_store.value || jsonb_build_object(p_key, p_value);
$$;

comment on function public.xp_store_put(uuid, text, text, jsonb) is
  'Write one field of one scope, merging server-side rather than sending a row '
  'built from a client cache. security invoker: xp_store s own policies decide '
  'who may write what, and this adds no authority to them.';

revoke all on function public.xp_store_put(uuid, text, text, jsonb) from public;
grant execute on function public.xp_store_put(uuid, text, text, jsonb) to authenticated;
