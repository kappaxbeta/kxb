-- ============================================================================
-- A shelf that belongs to the space
-- ----------------------------------------------------------------------------
-- docs/product/pricing.md §3.
--
-- The path from "an XP exists" to "we are playing it" ran straight from the
-- public catalogue through a wizard into a room. This is the shelf in the
-- middle: what a space has collected, which places load from and matches can be
-- started from.
--
-- It is also what makes the rest of the price list defensible. A shelved XP
-- costs storage and nothing else, so it is unlimited on every tier including
-- free - and free holds no xp places and no projects, so somebody on it can
-- collect everything there is and play none of it. The wall lands on *loading*
-- one, which is the moment they already want the thing.
--
-- ----------------------------------------------------------------------------
-- One stream, many rows
-- ----------------------------------------------------------------------------
-- The only projection here that fans a single stream out into a row per entry.
-- A magazine is a collection and its one invariant - not twice - is about the
-- collection rather than about any entry, so it cannot be decided by folding an
-- entry's own stream. The primary key below says the same thing the decider
-- does, deliberately: a projection that threw on an event the decider allowed
-- would wedge the checkpoint.
-- ============================================================================

create table if not exists public.magazine_read_model (
  tenant_id uuid        not null references public.tenants_read_model (id) on delete cascade,
  /** The shared `parseXpRef` format - a builtin id or a project reference. */
  xp_ref    text        not null,
  /** What it was called when it was taken in, so a list needs no join. */
  name      text        not null,
  /** Who put it there. NULL survives the account being deleted. */
  added_by  uuid        references auth.users (id) on delete set null,
  added_at  timestamptz not null default now(),
  primary key (tenant_id, xp_ref)
);

comment on table public.magazine_read_model is
  'A space''s own shelf of XPs. Unlimited on every tier - see docs/product/pricing.md §3. Projected from the magazine stream, one row per entry.';

-- Newest first is what the list asks for, and the only ordering it asks for.
create index if not exists magazine_read_model_recent_idx
  on public.magazine_read_model (tenant_id, added_at desc);

alter table public.magazine_read_model enable row level security;

-- Dropped first so the migration can be re-run - the same reason the feature
-- flag policies are, and the same failure it avoids: a migration idempotent
-- everywhere except its policies fails halfway through on the second run, by
-- which time it has already made changes.
drop policy if exists "magazine_select" on public.magazine_read_model;
drop policy if exists "magazine_write" on public.magazine_read_model;

-- ----------------------------------------------------------------------------
-- Who may see it, and who may change it
-- ----------------------------------------------------------------------------
-- Any member, including a guest, may *read* the shelf: it is the list of things
-- this space can play, and a guest who was sent a link is exactly somebody who
-- might be about to play one. It discloses nothing the catalogue does not
-- already publish - only that this space liked it.
--
-- Nobody writes it directly. The rows are projected, and the projection runs as
-- the service role, so there is no insert or update policy at all rather than a
-- narrow one. A member who could write here could put an XP on the shelf
-- without an event, and the log would stop being the story of the space.
-- ----------------------------------------------------------------------------
create policy "magazine_select" on public.magazine_read_model
  for select
  using (public.tenant_role(tenant_id) is not null);
