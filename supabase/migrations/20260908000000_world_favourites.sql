-- ============================================================================
-- Worlds somebody kept
-- ----------------------------------------------------------------------------
-- A catalogue you can only sort is a catalogue you have to re-find things in.
-- This is the other half: a world you liked is one press away from being in a
-- short list that is yours.
--
-- Belongs to the *person*, not to the space they were in when they pressed it.
-- Somebody who is in three workspaces has one taste in arenas, and a favourite
-- that vanished when they switched spaces would be a favourite they stop using.
-- That is why the key is `user_id` and there is no tenant column here at all.
--
-- Deliberately not a count on `published_worlds`. "How many people liked this"
-- is a different feature with a different failure mode - it wants to be shown,
-- gamed, and moderated - and the sort that already exists is by *uses*, which
-- is the honest signal. If a public count is ever wanted it can be a view over
-- this table rather than a number that has to be kept in step.
-- ============================================================================

create table if not exists public.world_favourites (
  user_id    uuid        not null references auth.users (id) on delete cascade,
  world_id   uuid        not null references public.published_worlds (id) on delete cascade,
  created_at timestamptz not null default now(),

  -- One person keeps one world once. The pair is the whole row's identity, so
  -- pressing the heart twice is an insert and a delete rather than two rows.
  primary key (user_id, world_id)
);

-- The list page's query: everything this person kept, newest first.
create index if not exists world_favourites_user_idx
  on public.world_favourites (user_id, created_at desc);

alter table public.world_favourites enable row level security;

-- Yours, and only yours, in all four directions. There is no policy admitting
-- anybody to read somebody else's list: what a person has kept is a list of
-- what they like, and nothing in the product needs to show it to anybody but
-- them.
create policy "world_favourites_select_own"
  on public.world_favourites for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "world_favourites_insert_own"
  on public.world_favourites for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy "world_favourites_delete_own"
  on public.world_favourites for delete
  to authenticated
  using (user_id = (select auth.uid()));
