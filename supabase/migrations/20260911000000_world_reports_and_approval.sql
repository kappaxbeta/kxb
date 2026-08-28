-- ============================================================================
-- Is this world any good?
-- ----------------------------------------------------------------------------
-- Two answers to one question, from opposite directions.
--
-- The first is people saying what is wrong: a finish line you cannot reach, a
-- goal walled in, a spawn inside a rock. These are not moderation problems -
-- nobody is being harmed by a badly laid arena - they are *quality* problems,
-- and the honest thing to do with them is put them on the card so the next
-- space knows before it copies the world in rather than after.
--
-- The second is the product noticing for itself: a match that ran to its end on
-- a copy of a world is proof the world works. It cannot be argued with, nobody
-- has to remember to give it, and it is exactly the fact a space is looking for
-- when it picks an arena. See `approve_world_from_match` below.
--
-- Deliberately not the same thing as `world_reports`, which is the takedown
-- queue for a *space's* battlefield and ends with an admin banning it. This
-- ends with a label. Anything that actually needs taking down is that table's
-- job, and the reason list here has one arm pointing at it.
-- ============================================================================

alter table public.published_worlds
  /** When a match last finished on a copy of this world. Null until one has. */
  add column if not exists approved_at timestamptz,
  /**
   * What people have said is wrong with it, as {reason: count}.
   *
   * Maintained by a trigger rather than counted on read, because it is
   * displayed on a listing page that anonymous visitors load - and the
   * alternative would be either a join into a table of who-said-what (which
   * nobody but the reporter should see) or a `security definer` aggregate on
   * every card. A jsonb of counts leaks nothing and costs one column.
   */
  add column if not exists report_counts jsonb not null default '{}'::jsonb;

create index if not exists published_worlds_approved_idx
  on public.published_worlds (approved_at desc)
  where visibility = 'public' and approved_at is not null;

-- ---------------------------------------------------------------------------
-- What people report
-- ---------------------------------------------------------------------------
create table if not exists public.published_world_reports (
  world_id    uuid        not null references public.published_worlds (id) on delete cascade,
  reported_by uuid        not null references auth.users (id) on delete cascade,

  /**
   * A fixed vocabulary, matching src/domain/worlds/reports.ts.
   *
   * Free text would be a support queue. These are the things that make a world
   * unusable rather than merely not to your taste, and each one is actionable
   * by whoever built it - which is the test a reason has to pass to be on the
   * list at all.
   */
  reason      text        not null check (reason in (
    'blocked-finish',
    'unreachable-goal',
    'bad-spawn',
    'impossible-jump',
    'empty',
    'not-as-described',
    'offensive'
  )),
  /** Optional sentence. Read by the world's owner, never shown on a card. */
  note        text        check (note is null or length(note) <= 500),
  created_at  timestamptz not null default now(),

  -- One person, one report per world. Somebody who finds a second problem is
  -- changing their answer, not adding to a tally.
  primary key (world_id, reported_by)
);

create index if not exists published_world_reports_world_idx
  on public.published_world_reports (world_id);

alter table public.published_world_reports enable row level security;

-- Anybody signed in may report a world they can see. No role check: needing to
-- be an admin to say "the finish line is walled off" would mean it never gets
-- said. The `with check` pins the reporter to the caller.
create policy "published_world_reports_insert"
  on public.published_world_reports for insert
  to authenticated
  with check (reported_by = (select auth.uid()));

-- Read: your own, plus everything about a world you own. The owner needs the
-- notes to fix anything; nobody else needs to know who said what.
create policy "published_world_reports_select"
  on public.published_world_reports for select
  to authenticated
  using (
    reported_by = (select auth.uid())
    or public.is_backoffice_admin()
    or exists (
      select 1
        from public.published_worlds w
       where w.id = world_id
         and (
           w.author_id = (select auth.uid())
           or (w.tenant_id is not null and public.tenant_role(w.tenant_id) in ('owner', 'admin'))
         )
    )
  );

-- Withdrawing is the reporter's own call, and an owner's too: a report about a
-- problem that has since been fixed should not outlive the fix.
create policy "published_world_reports_delete"
  on public.published_world_reports for delete
  to authenticated
  using (
    reported_by = (select auth.uid())
    or public.is_backoffice_admin()
    or exists (
      select 1
        from public.published_worlds w
       where w.id = world_id
         and (
           w.author_id = (select auth.uid())
           or (w.tenant_id is not null and public.tenant_role(w.tenant_id) in ('owner', 'admin'))
         )
    )
  );

/**
 * Keep `report_counts` in step with the rows.
 *
 * Recomputed for the one world rather than incremented, which costs a grouped
 * count over a handful of rows and cannot drift - an increment that missed a
 * rollback would leave a label nobody can clear.
 */
create or replace function public.sync_world_report_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := coalesce(new.world_id, old.world_id);
begin
  update public.published_worlds
     set report_counts = coalesce(
       (
         select jsonb_object_agg(reason, tally)
           from (
             select reason, count(*) as tally
               from public.published_world_reports
              where world_id = target
              group by reason
           ) as counted
       ),
       '{}'::jsonb
     )
   where id = target;

  return null;
end;
$$;

drop trigger if exists published_world_reports_sync on public.published_world_reports;
create trigger published_world_reports_sync
  after insert or update or delete on public.published_world_reports
  for each row execute function public.sync_world_report_counts();

-- ---------------------------------------------------------------------------
-- Which catalogue world a space's copy came from
-- ---------------------------------------------------------------------------
-- Written when a world is copied into a space. Without it a match played on the
-- copy has no way back to the original, and the approval below could not exist.
create table if not exists public.world_copies (
  /** The battlefield's world id, in the space that took the copy. */
  world_id        uuid        primary key,
  source_world_id uuid        not null references public.published_worlds (id) on delete cascade,
  tenant_id       uuid        not null references public.tenants_read_model (id) on delete cascade,
  created_at      timestamptz not null default now()
);

create index if not exists world_copies_source_idx on public.world_copies (source_world_id);

alter table public.world_copies enable row level security;

create policy "world_copies_select"
  on public.world_copies for select
  to authenticated
  using (public.tenant_role(tenant_id) is not null);

create policy "world_copies_insert"
  on public.world_copies for insert
  to authenticated
  with check (public.tenant_role(tenant_id) in ('owner', 'admin'));

/**
 * Mark a catalogue world as one a match has actually been played on.
 *
 * `security definer`, because the caller is an ordinary member finishing a
 * match and must not have `update` on `published_worlds` - if they did, they
 * could rename and unpublish other people's worlds.
 *
 * Which is exactly why this function proves the claim rather than trusting it.
 * Two conditions, both checked here in SQL:
 *
 *   1. The world it was played on is a *copy* of the world being approved.
 *   2. There is a battle on that copy whose status is 'ended'.
 *
 * So the most an invented call achieves is re-stamping a world that has already
 * earned it. Note what is deliberately not required: that the caller was in the
 * match. A spectator's client is as good a witness as a fighter's, and demanding
 * participation would mean the approval depends on which browser closed last.
 */
create or replace function public.approve_world_from_match(p_world_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  source uuid;
begin
  select c.source_world_id
    into source
    from public.world_copies c
   where c.world_id = p_world_id
     and public.tenant_role(c.tenant_id) is not null;

  if source is null then
    return false;
  end if;

  if not exists (
    select 1
      from public.battles_read_model b
     where b.world_id = p_world_id
       and b.status = 'ended'
  ) then
    return false;
  end if;

  update public.published_worlds
     set approved_at = now()
   where id = source;

  return true;
end;
$$;

revoke all on function public.approve_world_from_match(uuid) from public;
grant execute on function public.approve_world_from_match(uuid) to authenticated;
