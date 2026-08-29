-- ============================================================================
-- A project belongs to whoever the log says
-- ----------------------------------------------------------------------------
-- The third instance of the pattern 20261230000000 and 20270102000000 closed,
-- and the one with the widest blast radius. It was §2's second open item -
-- "the rest of the member-writable read models have not been walked" - and
-- walking `xp_grants` led straight to the table underneath it.
--
-- ---------------------------------------------------------------------------
-- What was measured
-- ---------------------------------------------------------------------------
-- `xps_read_model`'s write policy is `is_tenant_member(tenant_id)`, and
-- `xp_is_mine()` - the predicate the entire XP permission model rests on -
-- reads `owner_id` out of it. So, as a plain member of the space who owns
-- nothing, over PostgREST:
--
--   update xps_read_model set owner_id = <me> where id = <somebody's project>;
--     -> 1 row. xp_is_mine() then answers YES.
--   update xps_read_model set state = 'published' where id = <the same>;
--     -> 1 row. `may_read_xp()`'s first branch is `x.state = 'published'`,
--        so the project is now readable by everybody on the platform.
--
-- And `xp_grants`, whose policy is `xp_in_my_space_as_member(xp_id)`:
--
--   insert into xp_grants (xp_id, account_id, "right", …)
--   values (<somebody's project>, <an account with no role in this space>, 'edit', …);
--     -> 1 row. That account then passes `may_read_xp()` while
--        `tenant_role()` still says they are nobody here.
--
-- The application refuses all three. `assertOwner(state, actorId, 'share')`
-- gates sharing on owning the project, and `shareXp()` additionally refuses an
-- account that is not in the space - *"That person is not in this space yet.
-- Invite them first."* Neither rule was written anywhere the database could
-- see it.
--
-- The second one is the reason this is HIGH rather than another within-space
-- integrity finding: publishing is world-readable, and a grant is durable -
-- grants outlive leaving the space, by design.
--
-- ---------------------------------------------------------------------------
-- The same three moves as the tenant stream
-- ---------------------------------------------------------------------------
--   1. A trigger folds the *authorization* columns from the xp stream, so they
--      have a writer that is not a session. For `xps_read_model` that is
--      `tenant_id`, `owner_id` and `state` - which space it is in, whose it is,
--      and whether the world can see it. Everything else on that row (name,
--      blurb, cover, versions, bytes) stays with the projection: it is
--      description, nothing gates on it, and moving it would mean rewriting a
--      fold in SQL for no security gain.
--   2. Guard triggers discard what a browser sends. On `xps_read_model` that is
--      column-level - a session's UPDATE keeps the row and loses its opinion
--      about those three columns - because the projection legitimately writes
--      the rest of it in a member's session. On `xp_grants` it is the whole
--      row, because the trigger now owns that table outright.
--   3. A RESTRICTIVE policy on the xp stream, mirroring `assertOwner`, so the
--      answer is not "append the event instead". Without it the first two moves
--      would only change which door the same member walks through.
--
-- The review path is unaffected and needs no branch: `publishXp`, `rejectXp`
-- and `unpublishXp` in `domain/xps/backoffice-actions.ts` run with the service
-- role, which does not consult policies at all.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The fold
-- ---------------------------------------------------------------------------

/**
 * The authorization half of the xps projection, in the database.
 *
 * Deliberately *not* the whole projection. The TypeScript one keeps running and
 * keeps owning everything this does not touch; the two do not fight, because
 * the guard below makes the projection's opinion about these columns a no-op
 * and its opinion about the rest authoritative.
 *
 * Every value comes from the event, which is the same rule the projection's own
 * header states for `owner_id`: written from the event and never from the
 * session.
 */
create or replace function public.xp_stream_fold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  case new.type
    when 'XpCreated' then
      insert into public.xps_read_model
        (id, tenant_id, owner_id, name, state, created_at, updated_at, version)
      values (
        new.stream_id,
        new.tenant_id,
        (new.data ->> 'owner')::uuid,
        coalesce(new.data ->> 'name', 'Untitled'),
        'draft',
        new.created_at,
        new.created_at,
        new.version
      )
      on conflict (id) do update
        -- Only the three. A replay must not clobber a name the projection has
        -- since folded from a later `XpRenamed`.
        set tenant_id = excluded.tenant_id,
            owner_id  = excluded.owner_id,
            state     = excluded.state;

    when 'XpTransferred' then
      update public.xps_read_model
         set owner_id = (new.data ->> 'to')::uuid
       where id = new.stream_id;

    when 'XpSubmitted' then
      update public.xps_read_model set state = 'submitted' where id = new.stream_id;

    when 'XpWithdrawn', 'XpRejected' then
      update public.xps_read_model set state = 'draft' where id = new.stream_id;

    when 'XpPublished', 'XpRolledBack' then
      update public.xps_read_model set state = 'published' where id = new.stream_id;

    when 'XpUnpublished' then
      update public.xps_read_model set state = 'unlisted' where id = new.stream_id;

    when 'XpRemoved' then
      update public.xps_read_model set state = 'removed' where id = new.stream_id;

    when 'XpMovedOut', 'XpArchived' then
      update public.xps_read_model set state = 'archived' where id = new.stream_id;

    /**
     * A grant is a fact with a beginning and an end, and both are events.
     *
     * The delete on `XpUnshared` is not a deviation from "the log is the truth"
     * - it is what the log says, and the projection this replaces carried the
     * same note.
     */
    when 'XpShared' then
      insert into public.xp_grants (xp_id, account_id, "right", granted_by, created_at)
      values (
        new.stream_id,
        (new.data ->> 'account')::uuid,
        new.data ->> 'right',
        new.actor_id,
        new.created_at
      )
      on conflict (xp_id, account_id) do update
        set "right" = excluded."right",
            granted_by = excluded.granted_by;

    when 'XpUnshared' then
      delete from public.xp_grants
       where xp_id = new.stream_id
         and account_id = (new.data ->> 'account')::uuid;

    else
      null;
  end case;

  return null;
end;
$$;

comment on function public.xp_stream_fold() is
  'Folds the xp stream into the columns anything gates on: xps_read_model.{tenant_id, owner_id, state} and xp_grants. The projection owns the rest.';

drop trigger if exists events_xp_stream_fold on public.events;
create trigger events_xp_stream_fold
  after insert on public.events
  for each row when (new.stream_type = 'xp')
  execute function public.xp_stream_fold();

-- ---------------------------------------------------------------------------
-- 2. The guards
-- ---------------------------------------------------------------------------

/**
 * A session may describe a project. It may not decide whose it is.
 *
 * Column-level rather than whole-row, unlike the tenant table's guard, because
 * the projection still owns most of this row and still runs in a member's
 * session - the shelf at `/t/[slug]/browse` projects on load. Pinning the three
 * columns to their previous values lets that keep working while making the
 * three questions anything asks about a project unanswerable from a browser.
 *
 * SECURITY INVOKER, like the tenant guard, and for the same reason: the whole
 * discriminator is `current_user`, and a definer would pin it to the owner and
 * wave everybody through.
 */
create or replace function public.xps_read_model_authority_is_the_triggers()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Every project that legitimately exists got its row from `XpCreated` in
    -- the transaction that appended it, so a session's INSERT is either a
    -- replay of that - which has nothing to add - or an invention. Dropped
    -- silently, so an older deployment's upsert still succeeds.
    return null;
  end if;

  new.tenant_id := old.tenant_id;
  new.owner_id  := old.owner_id;
  new.state     := old.state;
  return new;
end;
$$;

comment on function public.xps_read_model_authority_is_the_triggers() is
  'Keeps tenant_id, owner_id and state as the log left them when the writer is a browser session.';

drop trigger if exists xps_read_model_authority_is_the_triggers on public.xps_read_model;
create trigger xps_read_model_authority_is_the_triggers
  before insert or update on public.xps_read_model
  for each row execute function public.xps_read_model_authority_is_the_triggers();

/**
 * A grant comes from the log or it does not exist.
 *
 * Whole-row, because `xp_grants` has no descriptive half - every column on it
 * is part of the answer to "who may open this", which is why `may_read_xp()`
 * and `has_xp_grant()` both read it.
 */
create or replace function public.xp_grants_is_the_triggers()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    /**
     * OLD on a delete, NEW on everything else, and the distinction is not
     * pedantry.
     *
     * `NEW` is NULL in a BEFORE DELETE trigger, and returning NULL from a
     * BEFORE trigger cancels the row - so `return new` here cancelled every
     * delete, including the fold's own. It got caught by the probe for
     * `XpUnshared`: the owner unshared, the event landed, and the grant was
     * still there. A guard that silently keeps a permission somebody has just
     * revoked is worse than the hole it was written to close.
     */
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  return null;
end;
$$;

comment on function public.xp_grants_is_the_triggers() is
  'Discards writes to xp_grants that did not come from the xp stream fold, a migration, or the service role.';

drop trigger if exists xp_grants_is_the_triggers on public.xp_grants;
create trigger xp_grants_is_the_triggers
  before insert or update or delete on public.xp_grants
  for each row execute function public.xp_grants_is_the_triggers();

/**
 * The same correction, applied to the tenant guard 20270103000000 shipped.
 *
 * That one is `before insert or update or delete` and returns `new`, so a
 * delete by the trigger, a migration or the service role would be cancelled
 * rather than performed. Nothing deletes a space's row today - archiving is an
 * event and the only mechanism - so this has never fired, which is precisely
 * why it is worth fixing now rather than when something starts to.
 */
create or replace function public.tenants_read_model_is_the_triggers()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The stream
-- ---------------------------------------------------------------------------

/**
 * May the caller have caused this xp event?
 *
 * The same shape as `tenant_event_permitted`, mirroring the guards in
 * `decide()` in `domain/xps/aggregate.ts`, and the same `else false` at the
 * end for the same reason: an xp event type added next year is refused until
 * somebody writes its rule down.
 *
 * `xp_is_mine()` is trustworthy here *because of the guard above*. It reads
 * `owner_id`, which until this migration a member could set to themselves -
 * so this policy would have been circular a statement earlier in the file.
 */
create or replace function public.xp_event_permitted(
  p_tenant_id uuid,
  p_stream_id uuid,
  p_type      text,
  p_data      jsonb
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_backoffice_admin() then true

    -- Creating: the stream is fresh, so there is no owner to check yet. The
    -- decider mints the id and refuses a second `XpCreated`; what this adds is
    -- that you cannot create a project owned by somebody else.
    when p_type = 'XpCreated' then
      public.is_tenant_member(p_tenant_id)
      and (p_data ->> 'owner')::uuid = (select auth.uid())

    -- Saving is the one thing a grant buys, so it is the one place the grant
    -- is consulted. `mayEdit()` in the aggregate says exactly this.
    when p_type = 'XpVersionSaved' then
      public.xp_is_mine(p_stream_id)
      or exists (
        select 1 from public.xp_grants g
         where g.xp_id = p_stream_id
           and g.account_id = (select auth.uid())
           and g."right" = 'edit'
      )

    -- Taking a project out of the space is an admin's, not an owner's: it is
    -- the space's shelf, and `RemoveXp` in the decider deliberately has no
    -- owner check.
    when p_type = 'XpRemoved' then
      public.is_tenant_member(p_tenant_id)

    -- Everything `assertOwner` guards.
    when p_type in (
      'XpRenamed',
      'XpAccessSet',
      'XpShared',
      'XpUnshared',
      'XpTransferred',
      'XpMovedOut',
      'XpSubmitted',
      'XpWithdrawn',
      'XpRolledBack',
      'XpArchived'
    ) then
      public.xp_is_mine(p_stream_id)

    -- The review verdicts. Reached only through the backoffice, which runs as
    -- the service role and never gets here; spelled out so that a future path
    -- holding a session cannot issue one quietly.
    when p_type in ('XpPublished', 'XpRejected', 'XpUnpublished') then
      false

    else false
  end;
$$;

comment on function public.xp_event_permitted(uuid, uuid, text, jsonb) is
  'May the caller have caused this xp-stream event? Mirrors assertOwner in the xp aggregate.';

grant execute on function public.xp_event_permitted(uuid, uuid, text, jsonb) to authenticated, anon;

drop policy if exists "events_xp_owner_required" on public.events;
create policy "events_xp_owner_required"
  on public.events
  as restrictive
  for insert
  with check (
    stream_type <> 'xp'
    or public.xp_event_permitted(tenant_id, stream_id, type, data)
  );

-- ---------------------------------------------------------------------------
-- The guard
-- ---------------------------------------------------------------------------
do $$
declare
  v_orphans integer;
begin
  if not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'xps_read_model'
       and t.tgname = 'xps_read_model_authority_is_the_triggers'
       and not t.tgisinternal
  ) or not exists (
    select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
     where c.relname = 'xp_grants'
       and t.tgname = 'xp_grants_is_the_triggers'
       and not t.tgisinternal
  ) then
    raise exception 'both guard triggers must exist - xp_is_mine() reads owner_id, so without them the policy above is circular';
  end if;

  -- Every project that exists should already have its row; the fold only
  -- covers events appended from here on. Reported rather than repaired,
  -- because a hole here means something older is wrong and should be looked at
  -- rather than papered over.
  select count(*) into v_orphans
    from (select distinct stream_id, tenant_id from public.events where stream_type = 'xp') s
   where not exists (select 1 from public.xps_read_model x where x.id = s.stream_id);

  if v_orphans > 0 then
    raise warning 'xp streams with no read-model row: % - the fold will not create them retroactively', v_orphans;
  end if;
end;
$$;
