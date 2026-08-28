-- ============================================================================
-- Put the cursors back, and keep them there
-- ============================================================================
-- The second half of 20261122000000, and it must be applied **after** the
-- deploy that ships the fixed `runProjection` - not before, and not with it.
--
-- Both statements below are wrong to run against code that still advances by
-- `global_seq`:
--
--   * the repair would be undone within the minute, by the next projection
--   * the guard rejects precisely the write that code makes, so every command
--     that appends events would fail - a silent stall turned into an outage
--
-- Run order, once:
--
--     bun run db:push-prod     # 20261122000000 - reader returns tenant_seq
--     bun run deploy           # runProjection advances by tenant_seq
--     bun run db:push-prod     # this file - repair, then forbid
--
-- ----------------------------------------------------------------------------
-- What actually happened, 2026-08-13
-- ----------------------------------------------------------------------------
-- The ordering above was not achieved, and the reason is worth recording
-- because the mistake was in the *method*, not the plan.
--
-- `supabase db push` has no way to stop at a version - it applies everything
-- pending - so the plan was carried out by holding this file outside
-- `supabase/migrations/` until the deploy had landed. Two things went wrong
-- with that:
--
--   1. It was moved out *after* the push had already run, so production applied
--      it anyway. The trigger went live against code that still advanced by
--      `global_seq`, which is precisely the window this split existed to avoid.
--   2. Once moved, `db push` refused every subsequent run with "Remote migration
--      versions not found in local migrations directory" - because a migration
--      applied remotely and absent locally is, correctly, treated as history
--      that has gone missing.
--
-- Nobody wrote in the window, so it cost nothing. The lesson stands anyway:
-- **a migration that must not be applied yet does not belong in the repository
-- as a file you remember to move.** The honest tools for it are a migration that
-- is safe in either order, or a deliberate two-stage release where the second
-- stage is a normal commit made after the first has shipped. Hiding a file is
-- neither, and it breaks the CLI's own consistency check as a side effect.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Translate every cursor back into tenant_seq
-- ----------------------------------------------------------------------------
-- The same arithmetic 20261120000000 used the first time: the highest
-- `tenant_seq` whose `global_seq` is at or below the stored value.
--
-- Applied to every checkpoint rather than only the impossible ones, because the
-- two ways of being wrong are not symmetric. A value that was already a correct
-- `tenant_seq` translates to something smaller and replays events already
-- applied - and `handle` has always been required to be idempotent, so that
-- costs a few queries and changes nothing. A value left too high skips events
-- permanently and silently.
--
-- Given those two, over-replaying is not a close call. The log is small enough
-- that replaying all of it would be seconds.
update public.projection_checkpoints c
   set last_seq = coalesce((
         select max(e.tenant_seq)
           from public.events e
          where e.tenant_id = c.tenant_id
            and e.global_seq <= c.last_seq
       ), 0),
       updated_at = now();

-- ----------------------------------------------------------------------------
-- 2. Make the impossible state impossible
-- ----------------------------------------------------------------------------
-- A checkpoint ahead of its tenant's head is not a value anybody can defend,
-- and it is exactly what a units mix-up produces. A trigger rather than a check
-- constraint, because the bound lives in another table.
--
-- It raises rather than clamps. Silently correcting a nonsense write would turn
-- this incident into a projection that mysteriously replayed for ever, which is
-- harder to find than an error naming both numbers - and the whole reason this
-- cost an afternoon is that the original failure said nothing at all.
create or replace function public.projection_checkpoint_within_log()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_head bigint;
begin
  select last_seq into v_head
    from public.tenant_event_sequences
   where tenant_id = new.tenant_id;

  -- No row means no events yet, so any cursor above zero is already wrong.
  v_head := coalesce(v_head, 0);

  if new.last_seq > v_head then
    raise exception
      'projection_checkpoints: % for tenant % would be at %, past the log head of % - a tenant_seq cursor cannot exceed the tenant''s last event',
      new.projection, new.tenant_id, new.last_seq, v_head
      using errcode = '22003';
  end if;

  return new;
end;
$$;

drop trigger if exists projection_checkpoint_within_log on public.projection_checkpoints;
create trigger projection_checkpoint_within_log
  before insert or update on public.projection_checkpoints
  for each row
  execute function public.projection_checkpoint_within_log();
