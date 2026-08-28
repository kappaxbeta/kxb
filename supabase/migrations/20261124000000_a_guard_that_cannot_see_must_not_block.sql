-- ============================================================================
-- A guard that cannot see must not block
-- ============================================================================
-- The trigger added by 20261123000000 took production down for four minutes,
-- and both reasons are worth keeping.
--
-- ----------------------------------------------------------------------------
-- 1. It was not SECURITY DEFINER
-- ----------------------------------------------------------------------------
-- It reads `tenant_event_sequences`, which has RLS enabled and **no policies** -
-- deliberately, because only the trigger on `events` was ever meant to touch it,
-- and that one *is* definer. This one was not, so it ran as the caller, RLS
-- returned it zero rows, and it concluded every tenant's log head was 0.
--
-- Then it did the most damaging thing available: it rejected every checkpoint
-- write above zero. `/t/alpha` and `/t/alpha/battle` returned 500 to real people
-- for as long as it took to notice.
--
-- **Why local testing did not catch it:** every check was run as `postgres`,
-- which bypasses RLS. The function worked perfectly for the one role that was
-- never going to execute it in production. A trigger that reads an RLS-protected
-- table has to be exercised as a role that RLS applies to, or it is not being
-- tested at all.
--
-- ----------------------------------------------------------------------------
-- 2. It failed closed, and a guard should fail open
-- ----------------------------------------------------------------------------
-- This is the more important half, and it would have reduced the outage to
-- nothing on its own.
--
-- `coalesce(v_head, 0)` treats "I cannot see a head" as "the head is zero", so
-- an unreadable table became an assertion that every cursor is too large. The
-- guard could not evaluate its own invariant and blocked the write anyway.
--
-- The correct posture for a *consistency check* is the opposite of the correct
-- posture for an *authorization check*. Authorization that cannot decide must
-- refuse. A sanity check that cannot decide must get out of the way: the thing
-- it protects against is rare, the thing it prevents by misfiring is every write
-- in the product, and those are not close in cost.
--
-- So: no row means no opinion. Only a head we actually read is allowed to
-- reject anything.
-- ============================================================================

create or replace function public.projection_checkpoint_within_log()
returns trigger
language plpgsql
-- The fix for (1). Owned by the migration runner, which is not subject to the
-- RLS on `tenant_event_sequences`, exactly like `events_assign_tenant_seq`
-- beside it.
security definer
set search_path = public
as $$
declare
  v_head bigint;
begin
  select last_seq into v_head
    from public.tenant_event_sequences
   where tenant_id = new.tenant_id;

  -- The fix for (2), and note what is deliberately NOT here: no `coalesce` to
  -- zero. A tenant with no sequence row has no head to compare against - it is
  -- brand new, or something upstream is wrong - and in neither case is this
  -- trigger the right place to find out. Let the write through.
  if v_head is null then
    return new;
  end if;

  if new.last_seq > v_head then
    raise exception
      'projection_checkpoints: % for tenant % would be at %, past the log head of % - a tenant_seq cursor cannot exceed the tenant''s last event',
      new.projection, new.tenant_id, new.last_seq, v_head
      using errcode = '22003';
  end if;

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Assert what the comment claims
-- ----------------------------------------------------------------------------
-- The whole incident is one missing keyword, and a keyword is exactly the kind
-- of thing a later edit drops while rewriting the body around it. This costs
-- nothing and fails the migration rather than production.
do $$
begin
  if not exists (
    select 1 from pg_proc
     where proname = 'projection_checkpoint_within_log'
       and prosecdef
  ) then
    raise exception
      'projection_checkpoint_within_log must be SECURITY DEFINER - it reads tenant_event_sequences, which has RLS and no policies';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- And prove it fails open rather than closed
-- ----------------------------------------------------------------------------
-- A tenant with no sequence row must be able to write a checkpoint. This is the
-- exact shape of the outage - a head that could not be read - and asserting it
-- here means the next person to touch this function has to keep it true.
do $$
declare
  v_tenant uuid := gen_random_uuid();
begin
  insert into public.projection_checkpoints (projection, tenant_id, last_seq, updated_at)
  values ('__migration_probe__', v_tenant, 42, now());

  delete from public.projection_checkpoints
   where projection = '__migration_probe__' and tenant_id = v_tenant;
exception when others then
  raise exception
    'projection_checkpoint_within_log blocks a tenant with no sequence row (%). A guard that cannot evaluate its invariant must let the write through.',
    sqlerrm;
end;
$$;
