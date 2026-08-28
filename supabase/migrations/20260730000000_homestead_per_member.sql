-- ============================================================================
-- Homesteads become personal
-- ----------------------------------------------------------------------------
-- 20260729000000 gave each *workspace* one café, one house, one garden and one
-- purse. This gives each *member* their own set within the workspace.
--
-- The reasoning that put them on one shared stream still holds for the purse -
-- a balance spent from two places at once has to be a single-stream invariant -
-- so the change is not to the aggregate at all. It is to the stream id, which
-- goes from uuidv5(tenant) to uuidv5(tenant:user). Everything the decider
-- guards keeps guarding it, one homestead further down.
--
-- ---------------------------------------------------------------------------
-- This deletes the shared homesteads
-- ---------------------------------------------------------------------------
-- The rows below belong to the per-workspace streams, and nothing will ever
-- read them again: the app now derives a different stream id, so those events
-- are unreachable and their projection rows are orphans. Attributing them to a
-- member is not possible in general either - a shared house furnished by three
-- people has no single owner to inherit it.
--
-- So every existing homestead is dropped and everyone starts fresh, which for a
-- prototype a few hours old is the honest trade. The *events* are left in the
-- log untouched, as events always are - they simply describe a world nothing
-- points at any more, and they are what a migration back would be rebuilt from.
--
-- If that data is worth keeping, stop: this is the migration to rewrite, not to
-- run and regret.
-- ============================================================================

delete from public.homestead_props_read_model;
delete from public.homestead_ground_read_model;
delete from public.homestead_read_model;

-- ----------------------------------------------------------------------------
-- The purse
-- ----------------------------------------------------------------------------
alter table public.homestead_read_model
  add column if not exists user_id uuid not null references auth.users (id) on delete cascade;

alter table public.homestead_read_model
  drop constraint if exists homestead_read_model_pkey;

alter table public.homestead_read_model
  add primary key (tenant_id, user_id);

-- Listing every homestead in a workspace - a leaderboard, or a visitor's list
-- of doors to knock on - is the one query that does not know the user id.
create index if not exists homestead_tenant_idx
  on public.homestead_read_model (tenant_id);

-- ----------------------------------------------------------------------------
-- Furniture and ground
-- ----------------------------------------------------------------------------
-- `user_id` goes *before* place and tile in both keys. The lookup that matters
-- is "everything in one person's café", so the leading columns should be the
-- ones every read filters on - which is also why neither table needs a separate
-- index for it.
-- ----------------------------------------------------------------------------
alter table public.homestead_props_read_model
  add column if not exists user_id uuid not null references auth.users (id) on delete cascade;

alter table public.homestead_props_read_model
  drop constraint if exists homestead_props_read_model_pkey;

alter table public.homestead_props_read_model
  add primary key (tenant_id, user_id, place, tile);

drop index if exists homestead_props_place_idx;

alter table public.homestead_ground_read_model
  add column if not exists user_id uuid not null references auth.users (id) on delete cascade;

alter table public.homestead_ground_read_model
  drop constraint if exists homestead_ground_read_model_pkey;

alter table public.homestead_ground_read_model
  add primary key (tenant_id, user_id, place, tile);

-- ----------------------------------------------------------------------------
-- Row level security stays membership-scoped
-- ----------------------------------------------------------------------------
-- Reads deliberately are not narrowed to `user_id = auth.uid()`. Being able to
-- see a colleague's café is the feature this change makes possible, and hiding
-- it now would have to be undone to build it.
--
-- Writes stay membership-scoped too, and that is not laziness. A projection run
-- catches the workspace up on *every* pending event under whichever session
-- happened to trigger it, so the member who opens their own café may be the one
-- that first writes the row for a sofa a colleague bought last night. A
-- self-only policy would make that run fail, and the failure would land on
-- whoever unluckily went second.
--
-- What actually stops you redecorating somebody else's house is upstream and
-- much stronger than a policy: the stream id is derived from the session's own
-- user id, so there is no argument any caller can pass to reach another
-- member's homestead. It is not that the write is refused - it is that the
-- command cannot be addressed.
-- ----------------------------------------------------------------------------
-- The policies from 20260729000000 already read `tenant_role(tenant_id)` and
-- are unaffected by the new column, so there is nothing to redefine here.
