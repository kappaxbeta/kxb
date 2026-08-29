-- ============================================================================
-- The row ignores whoever is not the trigger
-- ----------------------------------------------------------------------------
-- 20270102000000 moved `tenants_read_model` under the trigger and dropped every
-- write policy, which is correct and which broke creating a space on any
-- deployment whose *application* had not caught up yet.
--
-- That is not a hypothetical. Migrations are pushed with `db:push-prod` and the
-- app ships from `main`, so there is always a window - minutes or days - where
-- the database is ahead of the code. In that window production was running the
-- projection this repository has deleted:
--
--   createTenant()
--     executeCommand(...)                  -- appends, trigger writes the row
--     await runProjection(supabase, tenantsProjection, tenant.id)
--                                          -- upsert -> no INSERT policy -> throws
--
-- and that `await` is outside the try/catch, so the space was created correctly
-- and the person creating it got an error page. Measured against the local
-- database with the deployed statement: `new row violates row-level security
-- policy for table "tenants_read_model"`. Renames were unaffected - an UPDATE
-- with no policy touches zero rows and does not raise - so this was creation
-- only, and the data was right the whole time.
--
-- ---------------------------------------------------------------------------
-- Closing a door and refusing a knock are different things
-- ---------------------------------------------------------------------------
-- The instinct is to re-add the policies until the deploy lands and drop them
-- again afterwards. That reopens the hole for the length of a deploy, and
-- "temporarily" is how the hole got there in the first place.
--
-- The better shape: let the write in and make it do nothing. The policies come
-- back, so nothing errors; a BEFORE trigger discards any payload that did not
-- come from the trigger that owns the row, so nothing lands. The old code
-- succeeds at a write that changes nothing, which is exactly what it *means* -
-- it is replaying a fold the database has already done.
--
-- `current_user` is the discriminator, and it is the only one that works here.
-- Not `auth.uid()` and not `auth.role()`: `sync_tenant_authorization()` is
-- SECURITY DEFINER, so inside it those two still report the signed-in person who
-- caused the event, and a guard built on them would refuse the very writes it
-- exists to allow. SECURITY DEFINER *does* change `current_user` to the owner,
-- so:
--
--   postgres / supabase_admin   the trigger, a migration, a psql repair -> write
--   service_role                the webhook, the sweep, the seed script  -> write
--   authenticated / anon        a browser, through PostgREST             -> ignored
--
-- The property this buys is worth more than the deploy it unblocks: the row is
-- now correct *regardless* of which version of the application is talking to
-- this database. Version skew stops being a correctness question.
-- ============================================================================

/**
 * SECURITY INVOKER - and that is load-bearing, not an omission.
 *
 * This function's whole discriminator is `current_user`, and SECURITY DEFINER
 * would pin that to the owner for every caller, so the guard would wave
 * everybody through. Written as a definer first, which let a member rewrite the
 * row again with the policies back in place - caught by re-running the probe
 * rather than by reading it, which is the argument for keeping the probe.
 *
 * Invoker is also what makes the good case work: `sync_tenant_authorization()`
 * is a definer, so statements inside it already run as its owner, and this
 * trigger inherits that. The trigger writes as postgres; a browser writes as
 * authenticated; this function can tell them apart precisely because it does
 * not set the user itself.
 */
create or replace function public.tenants_read_model_is_the_triggers()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  /**
   * Anybody who is not a browser session writes for real.
   *
   * `sync_tenant_authorization()` reaches here as its owner, which is the whole
   * mechanism - see the header. The seed script and the Stripe webhook arrive as
   * `postgres` and `service_role` respectively and are equally trusted; both
   * write facts they got from somewhere this table cannot check.
   */
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  /**
   * A session's write is dropped rather than refused.
   *
   * NULL from a BEFORE trigger skips the row and reports success, which is the
   * point: the caller is a projection replaying a fold that has already
   * happened, and the honest answer to "please set this row to what it already
   * is" is yes.
   *
   * It is also the answer to somebody setting it to what it is *not*. That is
   * the finding this whole sequence closes, and it stays closed - the write is
   * accepted, ignored, and the row still says what the log says.
   */
  return null;
end;
$$;

comment on function public.tenants_read_model_is_the_triggers() is
  'Discards writes to tenants_read_model that did not come from the trigger, a migration, or the service role. Lets an older deployment''s projection succeed without letting it change anything.';

drop trigger if exists tenants_read_model_is_the_triggers on public.tenants_read_model;
create trigger tenants_read_model_is_the_triggers
  before insert or update or delete on public.tenants_read_model
  for each row execute function public.tenants_read_model_is_the_triggers();

-- The policies come back, and they are now decoration rather than a boundary:
-- the trigger above is the boundary. They exist so that an older application
-- gets a success instead of a 42501, and they are deliberately no wider than
-- what that application already had.
drop policy if exists "tenants_read_model_insert_member" on public.tenants_read_model;
create policy "tenants_read_model_insert_member"
  on public.tenants_read_model
  for insert
  with check (is_tenant_member(id) or tenant_is_unclaimed(id));

drop policy if exists "tenants_read_model_update_member" on public.tenants_read_model;
create policy "tenants_read_model_update_member"
  on public.tenants_read_model
  for update
  using (is_tenant_member(id))
  with check (is_tenant_member(id));

comment on table public.tenants_read_model is
  'One row per space, maintained by sync_tenant_authorization(). Writes from a browser session are accepted and discarded by tenants_read_model_is_the_triggers() - requireTenant() gates on archived, capabilities, lounge_mode and chat_enabled, so this is authorization state.';

-- ---------------------------------------------------------------------------
-- The guard, restated
-- ---------------------------------------------------------------------------
-- 20270102000000's guard said "this table must have no write policy". That is
-- no longer the rule, and the rule that replaced it is stronger, because it
-- does not depend on somebody remembering which policies are safe: whatever the
-- policies say, the trigger has to be on the table.
do $$
begin
  if not exists (
    select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
     where c.relname = 'tenants_read_model'
       and t.tgname  = 'tenants_read_model_is_the_triggers'
       and not t.tgisinternal
  ) then
    raise exception 'tenants_read_model_is_the_triggers must be on tenants_read_model - without it the write policies below are a hole, not decoration';
  end if;
end;
$$;
