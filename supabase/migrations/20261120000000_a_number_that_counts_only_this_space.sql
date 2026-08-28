-- ============================================================================
-- A number that counts only this space
-- ============================================================================
-- `global_seq` is `generated always as identity` - one counter shared by every
-- tenant. So a space's own events read 128, 1060, 2051, and that is exactly why
-- the skip documented in `src/es/projection.ts` cannot be defended against:
--
--   **You cannot tell "gap because another space wrote" from "gap because a
--   write in my space has not committed yet."**
--
-- Identity values are handed out at INSERT and the row appears at COMMIT. Two
-- members of one space writing at once can therefore be seen out of order: the
-- projection reads the later one, moves the checkpoint past both, and the
-- earlier event is never projected. No error, no gap anybody can see, and the
-- read model is short one fact until somebody replays it.
--
-- ----------------------------------------------------------------------------
-- The fix is a counter per tenant, and it works for two separate reasons
-- ----------------------------------------------------------------------------
-- `tenant_seq` is contiguous within a tenant: 1, 2, 3. That buys two things,
-- and it is worth being clear that they are different things.
--
-- **1. It cannot happen.** The counter lives in a *table row*, not a sequence,
-- and that is the whole trick. `nextval()` is deliberately non-transactional -
-- it does not roll back, which is why identity columns leave permanent holes.
-- A row does roll back. So the row lock taken to allocate a number is held
-- until commit, which means allocation order *is* commit order, which means the
-- out-of-order window does not exist. A rolled-back append returns its number
-- to the pool rather than burning it.
--
-- **2. If it somehow happened anyway, you could see it.** A contiguous sequence
-- makes a hole unambiguous - cursor at 41 and the next row saying 43 means 42
-- exists and is not committed yet, full stop. So the reader can stop at the gap
-- instead of stepping over it. That check should never fire. It is in
-- `events_since_checkpoint` anyway, because an invariant you can verify is
-- worth more than one you have to trust, and this one used to be trusted.
--
-- ----------------------------------------------------------------------------
-- What it costs
-- ----------------------------------------------------------------------------
-- Appends to one space serialize. Not appends globally - the lock is one row,
-- keyed by tenant - so busy spaces do not slow each other down at all.
--
-- Within a space it is a real cost and worth naming: two people placing blocks
-- at the same instant now queue, for the length of an insert. Block placement
-- is batched into one event carrying an array, and everything else here happens
-- at human speed, so this is microseconds against actions that arrive seconds
-- apart. The trade is a lock nobody will notice against a class of silent data
-- loss, on a product whose entire premise is several people writing to one
-- space at once.
--
-- ----------------------------------------------------------------------------
-- Cross-tenant features are unaffected, and here is why
-- ----------------------------------------------------------------------------
-- Raiding a shelf, stealing from a homestead, moving an xp between spaces - all
-- of them touch two tenants, and none of them are a problem here, because **no
-- event ever belongs to two tenants.** `events.tenant_id` is one column. A raid
-- appends separate events to each side, so each side's sequence stays
-- independently contiguous and neither knows about the other.
--
-- One rule to keep, and it is a trap rather than a difficulty: `move.ts` today
-- makes its appends in *separate transactions*, so it holds one tenant's
-- counter at a time and cannot deadlock. If those are ever merged into one
-- transaction, the locks must be taken in sorted tenant_id order - otherwise A
-- raiding B, concurrent with B raiding A, is a textbook deadlock.
--
-- (Note that the separate transactions are their own pre-existing problem: if
-- the third append fails, the first two are already committed and an xp exists
-- in both spaces or neither. That is untouched by this migration and wants its
-- own fix.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The counter
-- ----------------------------------------------------------------------------
-- One row per tenant, holding the last number handed out. A table rather than a
-- sequence for the transactional rollback described above - this is the load-
-- bearing choice in the whole file.
create table if not exists public.tenant_event_sequences (
  tenant_id uuid   primary key,
  last_seq  bigint not null
);

comment on table public.tenant_event_sequences is
  'Last tenant_seq handed out per tenant. A table, not a sequence, because sequences do not roll back and this must: allocation order has to equal commit order. Written only by the trigger on public.events.';

-- No RLS policies and RLS enabled: nothing outside the trigger has any business
-- reading or writing this, and the trigger runs as the table owner.
alter table public.tenant_event_sequences enable row level security;

-- ----------------------------------------------------------------------------
-- 2. The column, backfilled from the order that already exists
-- ----------------------------------------------------------------------------
alter table public.events add column if not exists tenant_seq bigint;

-- `global_seq` order is the best available reconstruction of history for events
-- already written. It is not necessarily commit order - that is the bug - but
-- it is what every existing checkpoint was computed against, so numbering by it
-- keeps every read model exactly where it is.
update public.events e
   set tenant_seq = s.rn
  from (
    select global_seq,
           row_number() over (partition by tenant_id order by global_seq) as rn
      from public.events
  ) s
 where s.global_seq = e.global_seq
   and e.tenant_seq is null;

insert into public.tenant_event_sequences (tenant_id, last_seq)
select tenant_id, max(tenant_seq)
  from public.events
 group by tenant_id
    on conflict (tenant_id) do update set last_seq = excluded.last_seq;

-- ----------------------------------------------------------------------------
-- 3. Allocation
-- ----------------------------------------------------------------------------
-- A trigger rather than a change to `append_events`, deliberately. The insert
-- policy on `events` permits direct INSERTs and `append_events` is security
-- invoker, so the function is not the only door - and a numbering scheme with a
-- door that skips it is a numbering scheme with holes in it. This way every
-- path is numbered, including any added later by somebody who never read this
-- file.
create or replace function public.events_assign_tenant_seq()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tenant_seq is not null then
    return new;
  end if;

  -- The upsert *is* the lock. Whoever gets here second waits on the row until
  -- the first transaction ends, which is what makes allocation order equal
  -- commit order.
  insert into public.tenant_event_sequences (tenant_id, last_seq)
  values (new.tenant_id, 1)
      on conflict (tenant_id)
      do update set last_seq = public.tenant_event_sequences.last_seq + 1
   returning last_seq into new.tenant_seq;

  return new;
end;
$$;

drop trigger if exists events_assign_tenant_seq on public.events;
create trigger events_assign_tenant_seq
  before insert on public.events
  for each row
  execute function public.events_assign_tenant_seq();

alter table public.events alter column tenant_seq set not null;

-- The invariant, enforced rather than hoped for. If anything ever hands out a
-- duplicate, this is an error at the moment it happens instead of a read model
-- that quietly disagrees with the log months later.
create unique index if not exists events_tenant_seq_unique
  on public.events (tenant_id, tenant_seq);

-- ----------------------------------------------------------------------------
-- 4. Move the checkpoints onto the new number
-- ----------------------------------------------------------------------------
-- Every `projection_checkpoints.last_seq` currently holds a global_seq. Rewrite
-- each to the tenant_seq of the last event it had actually consumed - the same
-- position, expressed in the new counter. Getting this wrong in either
-- direction is loud and bad: too low replays history into read models whose
-- handlers are not all idempotent, too high skips events permanently.
update public.projection_checkpoints c
   set last_seq = coalesce((
         select max(e.tenant_seq)
           from public.events e
          where e.tenant_id = c.tenant_id
            and e.global_seq <= c.last_seq
       ), 0);

-- ----------------------------------------------------------------------------
-- 5. Read by the new number, and stop at a hole
-- ----------------------------------------------------------------------------
create or replace function public.events_since_checkpoint(
  p_tenant_id  uuid,
  p_projection text,
  p_limit      int default 500
)
returns table (
  last_seq     bigint,
  global_seq   bigint,
  tenant_id    uuid,
  stream_id    uuid,
  stream_type  text,
  version      int,
  type         text,
  data         jsonb,
  metadata     jsonb,
  actor_id     uuid,
  created_at   timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  -- Still SECURITY INVOKER. RLS on `events` is the authorization; a definer
  -- function here would read the log with the owner's rights and hand any
  -- caller any tenant's history.
  with checkpoint as (
    select coalesce(
      (select c.last_seq
         from projection_checkpoints c
        where c.projection = p_projection
          and c.tenant_id  = p_tenant_id),
      0
    )::bigint as last_seq
  ),
  candidate as (
    select e.*, row_number() over (order by e.tenant_seq) as rn, c.last_seq as cursor
      from checkpoint c
      left join lateral (
        select *
          from events ev
         where ev.tenant_id = p_tenant_id
           and ev.tenant_seq > c.last_seq
         order by ev.tenant_seq
         limit greatest(1, least(p_limit, 1000))
      ) e on true
  )
  select
    candidate.cursor as last_seq,
    candidate.global_seq,
    candidate.tenant_id,
    candidate.stream_id,
    candidate.stream_type,
    candidate.version,
    candidate.type,
    candidate.data,
    candidate.metadata,
    candidate.actor_id,
    candidate.created_at
  from candidate
  -- The safety net. `tenant_seq = cursor + rn` keeps only the run that is
  -- contiguous from the cursor: at cursor 41, rows 42,43,45 keep 42 and 43 and
  -- drop 45, because 44 exists and has not committed. Stepping over 44 is
  -- precisely the bug this file exists to end, and after the counter above it
  -- should be unreachable - which is the point of leaving it in.
  --
  -- The null row (a caught-up projection) survives because rn is null and the
  -- comparison is null, so `is not false` keeps it. `= ` alone would drop it
  -- and every caught-up projection would read its cursor as 0 and replay
  -- everything.
  where (candidate.tenant_seq = candidate.cursor + candidate.rn) is not false
  order by candidate.tenant_seq;
$$;

comment on function public.events_since_checkpoint(uuid, text, int) is
  'One projection''s cursor and the contiguous run of events after it, in a single call. Stops at the first hole in tenant_seq rather than stepping over an uncommitted write. Security invoker - RLS on public.events is the authorization.';

grant execute on function public.events_since_checkpoint(uuid, text, int)
  to authenticated, service_role;
