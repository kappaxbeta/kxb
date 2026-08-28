-- ============================================================================
-- How often a world is looked at, and how often it is used
-- ----------------------------------------------------------------------------
-- A catalogue with no order but "newest" is a catalogue where the good worlds
-- sink. These two numbers are what "show me the best ones" can honestly mean
-- without asking anybody to rate anything: how many people opened it, and how
-- many spaces thought enough of it to stand it up.
--
-- The second is the one that matters. A view is a click, and clicks follow
-- whatever is at the top - so a list sorted by views is mostly a list sorted by
-- what was at the top yesterday. A *use* costs the person something: they
-- picked a space, they got a battlefield out of it. Which is why the ordering
-- below leads with uses and only breaks ties with views.
--
-- ---------------------------------------------------------------------------
-- Why these are functions and not an update policy
-- ---------------------------------------------------------------------------
-- Counting a view means writing to a row the reader does not own - usually
-- while signed out entirely. The alternatives were both worse than a definer
-- function: an update policy admitting `anon` would let anybody rewrite the
-- name, the tags and the document of every public world, and a separate
-- `world_views` table would be a row per page load to answer a question that
-- needs one integer.
--
-- So: two `security definer` functions that can each do exactly one thing -
-- add one to a counter on a world the caller is allowed to see. They take no
-- other input, they return nothing, and `search_path` is pinned so nothing they
-- touch can be shadowed.
-- ============================================================================

alter table public.published_worlds
  add column if not exists views integer not null default 0,
  add column if not exists uses  integer not null default 0;

-- The index behind "most used". Partial, because only the public list is ever
-- sorted this way - a space's own worlds are listed by when they were touched.
create index if not exists published_worlds_popular_idx
  on public.published_worlds (uses desc, views desc, updated_at desc)
  where visibility = 'public';

/**
 * Count one look at a world.
 *
 * Public worlds only. A private world's counter would be a way for a stranger
 * to learn that an id they guessed is real - and there is nothing to rank among
 * worlds nobody else can see.
 *
 * Deliberately not deduplicated. Doing it properly means identifying the
 * reader, which for a signed-out visitor means a cookie or an address - a
 * tracking decision, taken to sort a list better. What this counts is page
 * loads, the sort says "most used" first, and that is the honest version.
 */
create or replace function public.record_world_view(p_world_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.published_worlds
     set views = views + 1
   where id = p_world_id
     and visibility = 'public';
$$;

/**
 * Count one world standing up in a space.
 *
 * Called by `addWorldToSpace` after the blocks have actually landed, so the
 * number counts arrivals rather than attempts. Not restricted to public worlds:
 * a space using its own unpublished world is a use, and if it publishes later
 * that history should not have been thrown away.
 */
create or replace function public.record_world_use(p_world_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.published_worlds
     set uses = uses + 1
   where id = p_world_id;
$$;

revoke all on function public.record_world_view(uuid) from public;
revoke all on function public.record_world_use(uuid)  from public;

-- A signed-out visitor is who most views come from, which is the whole reason
-- these are functions rather than a policy.
grant execute on function public.record_world_view(uuid) to anon, authenticated;
-- Using one requires a space, so there is no anonymous caller to admit.
grant execute on function public.record_world_use(uuid) to authenticated;
