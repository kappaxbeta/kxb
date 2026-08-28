-- ============================================================================
-- Space avatars: the one place you are somebody else
-- ----------------------------------------------------------------------------
-- This reopens a door 20260728000000_profile_avatars.sql deliberately closed,
-- so it owes that migration an argument rather than a shrug.
--
-- What that one removed was `lounge_avatars_read_model`: one animal per
-- (workspace, member), and **no account-level answer at all**. Its complaint
-- was that the same person was a different creature in every space and there
-- was nowhere to say "this is who I am". It fixed that by making the choice
-- follow the person, and named the price it accepted: "somebody who chose a
-- different animal in two workspaces now has to be one creature".
--
-- This is not that table coming back. `profile_avatars` stays exactly as it is
-- and stays the answer to "who am I" - what this adds is an **override**, per
-- space, opt-in, for the person who wants to be the bee in the bee team and
-- themselves everywhere else. Absent is the overwhelmingly common case and it
-- costs a null read.
--
-- So the two migrations disagree about nothing. One says there must be an
-- account-level answer; this says the account-level answer may be overruled in
-- one place by the person it belongs to.
--
-- Same shape and same reasoning as the table it hangs off: not a projection,
-- because an avatar has no history worth replaying and `events.tenant_id`
-- being `not null` is beside the point for a preference. Last write wins.
--
-- `model` is a roster id like 'penguin', validated against the allow-list in
-- src/domain/lounge/avatars.ts before it is written. Never a path.
-- ============================================================================

create table if not exists public.space_avatars (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  tenant_id  uuid        not null references public.tenants_read_model (id) on delete cascade,
  /** Roster id from src/domain/lounge/avatars.ts. Never a URL or a path. */
  model      text        not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, tenant_id)
);

alter table public.space_avatars enable row level security;

-- ----------------------------------------------------------------------------
-- Reading
-- ----------------------------------------------------------------------------
-- Your own row, and anybody's row in a space you are in.
--
-- Tighter than `profile_avatars`, and it can afford to be: that table has no
-- tenant on the row, so "do we share a workspace" had to be worked out by
-- joining two memberships. This row carries the tenant it is about, so the
-- boundary is the row itself - you can see the animals of the space you are
-- standing in, which is exactly who you will be drawn next to.
-- ----------------------------------------------------------------------------
drop policy if exists "space_avatars_select_self_or_shared" on public.space_avatars;
create policy "space_avatars_select_self_or_shared"
  on public.space_avatars for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.tenant_members mine
      where mine.user_id = auth.uid()
        and mine.tenant_id = public.space_avatars.tenant_id
    )
  );

-- ----------------------------------------------------------------------------
-- Writing
-- ----------------------------------------------------------------------------
-- Strictly your own row, exactly as the profile's is. Nothing here lets one
-- person dress another up, which is the property the action relies on: it takes
-- the actor from the session and nothing that names a user from the input.
--
-- Deliberately **not** gated on membership. A guest is somebody standing in the
-- space who will be drawn beside everybody else, and being one of four
-- identical penguins is not a thing that should check whether you were invited
-- - the same line the rail's picker and the unstick buttons already draw.
-- ----------------------------------------------------------------------------
drop policy if exists "space_avatars_write_self" on public.space_avatars;
create policy "space_avatars_write_self"
  on public.space_avatars for insert
  with check (user_id = auth.uid());

drop policy if exists "space_avatars_update_self" on public.space_avatars;
create policy "space_avatars_update_self"
  on public.space_avatars for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "space_avatars_delete_self" on public.space_avatars;
create policy "space_avatars_delete_self"
  on public.space_avatars for delete
  using (user_id = auth.uid());
