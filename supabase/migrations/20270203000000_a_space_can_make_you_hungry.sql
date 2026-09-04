-- ============================================================================
-- A space can say that people get hungry here
-- ----------------------------------------------------------------------------
-- docs/product/economy.md §11. The other half of the loop: §6 says a battle
-- mints coins, and this is where they drain.
--
-- ----------------------------------------------------------------------------
-- Off, and staying off
-- ----------------------------------------------------------------------------
-- `needs` defaults to both switches off, so this migration changes nothing for
-- anybody. A space that has never thought about hunger is one where nothing
-- starves and nothing costs anything, and it stays that way until an owner
-- decides otherwise. Same posture as every other switch this economy has
-- shipped, and for the reason `20261127000000` argued at length: a migration
-- that starts enforcing something on the day it runs breaks a customer who was
-- doing nothing wrong.
--
-- ----------------------------------------------------------------------------
-- Two switches, not one
-- ----------------------------------------------------------------------------
-- `hunger` is whether the mechanic exists. `charged` is whether the things that
-- answer it cost coins. They come apart deliberately: a space can run hunger as
-- a pure survival mechanic with free food - a pressure on attention rather than
-- on a purse - which is a real thing to want, and especially for a space whose
-- players have no coins yet.
--
-- The reverse is not expressible and should not be. Charging for food in a
-- space where nobody gets hungry is a shop selling nothing.
--
-- ----------------------------------------------------------------------------
-- Why the trigger is replaced whole
-- ----------------------------------------------------------------------------
-- `tenants_read_model` is maintained by `sync_tenant_authorization()`, a
-- trigger rather than a TypeScript projection - because `requireTenant()` gates
-- on these columns, which makes them authorization state and puts them where
-- membership is (see 20270102000000).
--
-- So a new event needs a new `when` arm, and the function is recreated in full
-- rather than edited in place in the migration that first defined it. Editing
-- an applied migration leaves the file and the database saying different things
-- with nothing to notice the difference; a fresh `create or replace` is a
-- change with a date on it.
--
-- The body below was taken from the live definition and extended by one arm.
-- Everything else in it is byte-for-byte what was already running.
-- ============================================================================

alter table public.tenants_read_model
  add column if not exists needs jsonb not null
  default '{"hunger": false, "charged": false}'::jsonb;

comment on column public.tenants_read_model.needs is
  'The space rules about needing things: {"hunger": bool, "charged": bool}. Both off by default. Written only by sync_tenant_authorization() from SpaceNeedsSet.';

CREATE OR REPLACE FUNCTION public.sync_tenant_authorization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
     * The space's rules about needing things. docs/product/economy.md 11.
     *
     * Two booleans in one column rather than two columns, because they are one
     * decision with two parts and reading half of it is never useful: "does
     * anybody get hungry here" and "does the food cost anything" are always
     * asked together, by the same caller, at the same moment.
     *
     * Written whole rather than merged, unlike `capabilities` above. That one
     * merges because it is an open-ended map a host edits one key at a time;
     * this is a closed pair the decider always emits together, and merging
     * would let a partial event leave a space half-configured.
     */
    when 'SpaceNeedsSet' then
      update public.tenants_read_model
         set needs = jsonb_build_object(
                       'hunger',  (new.data ->> 'hunger')::boolean,
                       'charged', (new.data ->> 'charged')::boolean
                     ),
             updated_at = new.created_at,
             version    = new.version
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
$function$

;
