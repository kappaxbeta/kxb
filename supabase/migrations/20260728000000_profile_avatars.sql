-- ============================================================================
-- Profile avatars: which animal you are, everywhere
-- ----------------------------------------------------------------------------
-- Supersedes lounge_avatars_read_model, which held one animal per (workspace,
-- member). That was a deliberate choice at the time - "a team gets to theme
-- itself" - and it is being reversed on purpose: the avatar now follows the
-- person, so the same creature stands in every lounge you are a member of and
-- also runs the café and lives in the house.
--
-- Not a projection, and that is the interesting part. Everything else derived
-- in this codebase folds our own event log, and this deliberately does not:
--
--   * events.tenant_id is `not null`, so an account-level aggregate cannot
--     exist in that store without making the tenant optional on every event and
--     revisiting the RLS on every read model. That is a large change to the
--     spine of the app in service of a costume.
--
--   * More to the point, an avatar has no history worth replaying. It is a
--     current preference, like a theme setting - "was a crab in March" is not a
--     fact anybody will ever query, and the log was accumulating one event per
--     change to answer a question nobody asks.
--
-- So this is a plain table with a last-write-wins row, in the same spirit as
-- user_entitlements: per person, small, and honest about not being derived.
--
-- `model` is a roster id like 'penguin', validated against the allow-list in
-- src/domain/lounge/avatars.ts before it is written. It is never a path: the
-- renderer builds the URL, so a stale id degrades to the default rather than to
-- an arbitrary fetch.
-- ============================================================================

create table if not exists public.profile_avatars (
  user_id    uuid        primary key references auth.users (id) on delete cascade,
  /** Roster id from src/domain/lounge/avatars.ts. Never a URL or a path. */
  model      text        not null,
  updated_at timestamptz not null default now()
);

alter table public.profile_avatars enable row level security;

-- ----------------------------------------------------------------------------
-- Reading
-- ----------------------------------------------------------------------------
-- Your own row, always. Other people's only where you already share a
-- workspace with them, which is the same boundary the old per-tenant policy
-- drew - it just has to be stated explicitly now that the row itself no longer
-- carries a tenant to check against.
--
-- In practice the lounge learns its peers' animals over the presence channel
-- rather than from here, so this policy is about what is *possible* rather than
-- what is currently done. Being able to see a stranger's avatar is harmless;
-- being able to enumerate every account on the instance is not.
-- ----------------------------------------------------------------------------
drop policy if exists "profile_avatars_select_self_or_shared" on public.profile_avatars;
create policy "profile_avatars_select_self_or_shared"
  on public.profile_avatars for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.tenant_members mine
      join public.tenant_members theirs
        on theirs.tenant_id = mine.tenant_id
      where mine.user_id = auth.uid()
        and theirs.user_id = public.profile_avatars.user_id
    )
  );

-- ----------------------------------------------------------------------------
-- Writing
-- ----------------------------------------------------------------------------
-- Strictly your own row, unlike the projection this replaces.
--
-- That old policy was membership-scoped rather than self-scoped, and for a good
-- reason: a projection run catches the tenant up on everyone's pending events
-- under whichever session happened to trigger it, so Alice's run could be the
-- one that first writes Bob's row. None of that applies to a direct write from
-- a server action on behalf of the session that owns the row, so the check goes
-- back to being the tight one it always wanted to be.
-- ----------------------------------------------------------------------------
drop policy if exists "profile_avatars_write_self" on public.profile_avatars;
create policy "profile_avatars_write_self"
  on public.profile_avatars for insert
  with check (user_id = auth.uid());

drop policy if exists "profile_avatars_update_self" on public.profile_avatars;
create policy "profile_avatars_update_self"
  on public.profile_avatars for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Backfill
-- ----------------------------------------------------------------------------
-- Carry every existing choice across, so nobody logs in tomorrow as a penguin
-- they did not pick.
--
-- Somebody who chose a different animal in two workspaces now has to be one
-- creature, and the most recently chosen wins - `distinct on` ordered by
-- updated_at. It is the only tie-break that can be defended: whatever they
-- picked last is the closest thing on record to what they currently want.
--
-- The old table is deliberately left in place rather than dropped. It still
-- holds the per-workspace history, this migration is the first thing that would
-- be reverted if the idea turns out to be wrong, and an empty prototype is not
-- worth the one-way door. Nothing reads it any more.
-- ----------------------------------------------------------------------------
insert into public.profile_avatars (user_id, model, updated_at)
select distinct on (user_id) user_id, model, updated_at
from public.lounge_avatars_read_model
order by user_id, updated_at desc
on conflict (user_id) do nothing;
