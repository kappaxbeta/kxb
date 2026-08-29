-- ============================================================================
-- The space itself moves under the trigger
-- ----------------------------------------------------------------------------
-- The open finding from the review of 2026-08-28, closed. It is worth starting
-- with the sentence the projection this migration retires already carried,
-- because it describes its own end:
--
--   "Membership and invitations are *not* projected here. They are maintained
--    by a SECURITY DEFINER trigger [...] because RLS policies consult them and
--    a table the user can write cannot be the thing that decides what the user
--    may write. This projection handles the part nothing depends on for
--    security: the workspace's name, its slug, and whether it is archived."
--
-- That last clause stopped being true. `requireTenant()` reads `archived`,
-- `capabilities`, `lounge_mode` and `chat_enabled` out of `tenants_read_model`
-- and gates on all four - archived closes the space, capabilities decide which
-- surfaces exist, lounge_mode decides whether a room is buildable. Meanwhile
-- the table's UPDATE policy was `is_tenant_member(id)`, and every one of those
-- fields is `requireRole(['owner', 'admin'])` in the decider.
--
-- Measured before the fix: a plain member set the space's name, cleared
-- `archived`, switched `lounge_mode` to creative, turned chat off and rewrote
-- `capabilities` in one statement, and the read `requireTenant` makes returned
-- every forged value. 20261230000000 had closed the event log an hour earlier;
-- this was the same state through the other door.
--
-- ---------------------------------------------------------------------------
-- Why the trigger and not a narrower policy
-- ---------------------------------------------------------------------------
-- Because a member's session legitimately wrote this table. Accepting an
-- invitation projects the tenant stream as the brand-new member, and
-- `lib/tenant.ts` projected it whenever the row was missing. Narrowing the
-- policy to owner/admin would not have refused those writes loudly: per
-- 20261025000000 a projection whose write is refused still advances its
-- checkpoint, so the row would quietly stop being maintained - the worst of
-- the three outcomes, because it looks like nothing happened.
--
-- So the fields move to where membership already lives.
-- `events_sync_tenant_authorization` is an AFTER INSERT trigger on `events`,
-- already fires on exactly these events, already runs SECURITY DEFINER, and
-- already maintains `tenant_members` from the same stream. Adding six more
-- cases to it costs one function and removes a whole projection.
--
-- Three things get better beyond the hole closing:
--
--   * The row is written in the same transaction as the event, so a rename is
--     visible on the next read rather than after a projection pass. Every
--     `runProjection(tenantsProjection, …)` in the app was there to buy exactly
--     that, and they all go.
--   * `SpaceCapabilitySet` stops being a read-modify-write. The projection had
--     to select the JSONB, merge in TypeScript and write it back, with a
--     comment explaining why the race was survivable; `capabilities || jsonb_build_object(…)`
--     is one statement and cannot lose a concurrent key.
--   * The tenant read model no longer needs write policies at all, so the
--     answer to "who may write the space's own row" becomes: nobody, the same
--     as `tenant_members`.
--
-- No backfill. Every existing row was maintained by the projection up to the
-- last event, and the trigger takes over from the next one - there is no gap
-- between the two, because this migration and the code that stops calling the
-- projection ship together.
-- ============================================================================

/**
 * Membership, invitations, and now the space's own row.
 *
 * One function rather than two triggers on the same table, because the two
 * halves fold the *same* events and splitting them would mean two `case`
 * statements that have to be kept in step - which is the shape of bug this
 * whole migration exists to remove.
 */
create or replace function public.sync_tenant_authorization()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_key text;
begin
  case new.type
    -- -----------------------------------------------------------------------
    -- The space itself
    -- -----------------------------------------------------------------------
    when 'TenantCreated' then
      insert into public.tenants_read_model
        (id, slug, name, archived, created_at, updated_at, version)
      values (
        -- The tenant's stream id is the tenant id.
        new.stream_id,
        new.data ->> 'slug',
        new.data ->> 'name',
        false,
        new.created_at,
        new.created_at,
        new.version
      )
      on conflict (id) do update
        set slug       = excluded.slug,
            name       = excluded.name,
            updated_at = excluded.updated_at,
            version    = excluded.version;

    when 'TenantRenamed' then
      update public.tenants_read_model
         set name       = new.data ->> 'name',
             updated_at = new.created_at,
             version    = new.version
       where id = new.stream_id;

    when 'TenantArchived' then
      update public.tenants_read_model
         set archived   = true,
             updated_at = new.created_at,
             version    = new.version
       where id = new.stream_id;

    when 'LoungePublicitySet' then
      update public.tenants_read_model
         set is_public_lounge = (new.data ->> 'isPublic')::boolean,
             updated_at       = new.created_at,
             version          = new.version
       where id = new.stream_id;

    when 'LoungeModeSet' then
      update public.tenants_read_model
         set lounge_mode = new.data ->> 'mode',
             updated_at  = new.created_at,
             version     = new.version
       where id = new.stream_id;

    when 'ChatEnabledSet' then
      update public.tenants_read_model
         set chat_enabled = (new.data ->> 'enabled')::boolean,
             updated_at   = new.created_at,
             version      = new.version
       where id = new.stream_id;

    /**
     * One statement, where the projection needed three.
     *
     * `||` on jsonb merges at the top level, which is exactly the semantics the
     * TypeScript spread had, and it reads the current value inside the same
     * UPDATE - so two capabilities set in the same transaction cannot overwrite
     * each other the way a select-then-write pair could.
     */
    when 'SpaceCapabilitySet' then
      update public.tenants_read_model
         set capabilities = capabilities
                            || jsonb_build_object(
                                 new.data ->> 'capability',
                                 (new.data ->> 'enabled')::boolean
                               ),
             updated_at   = new.created_at,
             version      = new.version
       where id = new.stream_id;

    -- -----------------------------------------------------------------------
    -- Membership and invitations, unchanged from 20261230000000
    -- -----------------------------------------------------------------------
    when 'MemberJoined' then
      insert into public.tenant_members (tenant_id, user_id, role, joined_at)
      values (
        new.tenant_id,
        (new.data ->> 'userId')::uuid,
        new.data ->> 'role',
        new.created_at
      )
      on conflict (tenant_id, user_id) do update
        set role = excluded.role;

    when 'MemberInvited' then
      v_key := new.data ->> 'invitee';

      insert into public.tenant_invitations
        (tenant_id, invitee_key, invited_user_id, role, invited_by, invited_at)
      values (
        new.tenant_id,
        v_key,
        -- Only the `user:` shape names an account. The other two are addressed
        -- to somebody who may not have one.
        case
          when v_key like 'user:%' then substring(v_key from 6)::uuid
          else null
        end,
        new.data ->> 'role',
        new.actor_id,
        new.created_at
      )
      on conflict (tenant_id, invitee_key) do update
        set role       = excluded.role,
            invited_by = excluded.invited_by,
            invited_at = excluded.invited_at;

    when 'InvitationAccepted' then
      insert into public.tenant_members (tenant_id, user_id, role, joined_at)
      values (
        new.tenant_id,
        (new.data ->> 'userId')::uuid,
        new.data ->> 'role',
        new.created_at
      )
      on conflict (tenant_id, user_id) do update
        set role = excluded.role;

      -- Membership and the invitation resolve together, in one statement pair,
      -- for the reason the previous version of this function called out: split
      -- them and the invitee is stranded mid-batch with neither.
      perform public.forget_invitation(new.tenant_id, new.data ->> 'invitee');

    when 'InvitationRevoked', 'InvitationDeclined' then
      perform public.forget_invitation(new.tenant_id, new.data ->> 'invitee');

    when 'MemberRoleChanged' then
      update public.tenant_members
         set role = new.data ->> 'role'
       where tenant_id = new.tenant_id
         and user_id = (new.data ->> 'userId')::uuid;

    when 'MemberRemoved', 'MemberLeft' then
      delete from public.tenant_members
       where tenant_id = new.tenant_id
         and user_id = (new.data ->> 'userId')::uuid;

    else
      null;
  end case;

  return null;
end;
$function$;

comment on function public.sync_tenant_authorization() is
  'Maintains tenant_members, tenant_invitations and tenants_read_model from the tenant stream. The only writer of all three.';

-- ---------------------------------------------------------------------------
-- Nobody writes the space's own row any more
-- ---------------------------------------------------------------------------
-- The projection was the only writer in the application - one `upsert` and one
-- `update`, both in `domain/tenants/projection.ts`, which this change deletes.
-- `scripts/event-seed.ts` also writes it, as `postgres` over psql on the event
-- box, which is not subject to policies.
--
-- The DELETE policy goes too, and had no caller: nothing in the product hard
-- deletes a space. Archiving is the mechanism, it is an event, and it is on the
-- list above.
drop policy if exists "tenants_read_model_insert_member" on public.tenants_read_model;
drop policy if exists "tenants_read_model_update_member" on public.tenants_read_model;
drop policy if exists "tenants_read_model_delete_member" on public.tenants_read_model;

comment on table public.tenants_read_model is
  'One row per space, maintained by sync_tenant_authorization(). Read-only to everybody: requireTenant() gates on archived, capabilities, lounge_mode and chat_enabled, so this is authorization state and is written where membership is.';

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------
-- The same shape as 20260813000000's and 20261219000000's. A write policy
-- reappearing on this table is the whole defect coming back, and it would come
-- back the way it arrived the first time: as a reasonable-looking line saying
-- "members maintain the read model", which was true when it was written.
do $$
begin
  if exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename  = 'tenants_read_model'
       and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ) then
    raise exception 'tenants_read_model must have no write policy - requireTenant() gates on this row, so sync_tenant_authorization() is its only writer';
  end if;
end;
$$;
