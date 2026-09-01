-- ============================================================================
-- Read model: the clips a space animated for itself
-- ----------------------------------------------------------------------------
-- The animator has existed for a while and had nowhere to put anything. It
-- posed the prototype dummy, baked the keys into samples, and handed back a
-- `.glb` you kept wherever you keep files - so every animation a blueprint
-- could name came out of a pack we ship, and a thing doing anything specific
-- was a thing somebody had to be talked out of.
--
-- `@kxb/xp/clips` already made this argument for levels and the answer is the
-- same here: a clip is *numbers*. Times and quaternions. An event log has
-- carried numbers since it existed, so there was never anything to wait for.
--
-- ----------------------------------------------------------------------------
-- Two columns of JSON, and they are not the same thing twice
-- ----------------------------------------------------------------------------
--   `clip` is what *plays*: one dense sample a frame, with the easing already
--   in the samples, which is exactly the shape three.js binds. Nothing has to
--   agree about what `smooth` means.
--
--   `doc` is what it was *authored from*: a handful of keys, each a whole pose,
--   with an easing between them. Kept only so the clip can be opened in the
--   animator again - reopening the baked version would hand somebody a hundred
--   keys they cannot move. The runtime never reads it.
--
-- Neither is checked by Postgres. `assertClip` in the decider is the check, and
-- it is the one that matters: a bone track one number short binds happily and
-- then plays garbage from the first frame that reads past its end.
--
-- ----------------------------------------------------------------------------
-- Why the skeleton is a column
-- ----------------------------------------------------------------------------
-- A clip binds to bones *by name*, so it only means anything on the rig it was
-- authored against. The lounge's animals are a different rig with four clips of
-- their own; a wave keyed on the dummy is not one of them. Recording which rig
-- lets a picker offer a clip on the bodies it will actually play on and stay
-- quiet on the ones it will not.
-- ============================================================================

create table if not exists public.thingiverse_clips_read_model (
  -- Same id as the aggregate's stream_id.
  id          uuid        primary key,
  tenant_id   uuid        not null,
  /** What the strip calls it. Not unique: two people may each have a "wave". */
  name        text        not null,
  /** The rig it was authored against. See above. */
  skeleton    text        not null,
  /** What plays: dense samples. See `BakedClip`. */
  clip        jsonb       not null,
  /** What it was keyed from, so it can be opened again. Never read at runtime. */
  doc         jsonb,
  /** Whose it is. A permission, exactly as a blueprint's owner is. */
  owner_id    uuid        not null,
  /** 'private' or 'public', and the reader falls back to the value that shares least. */
  visibility  text        not null default 'private',
  /**
   * Taken off the shelf. Soft, and blueprints naming it are not chased down: a
   * clip name is resolved when it is played, and a name that finds nothing
   * plays nothing - so a retired clip leaves things standing still rather than
   * breaking them.
   */
  retired     boolean     not null default false,
  created_at  timestamptz not null,
  updated_at  timestamptz not null,
  version     integer     not null
);

create index if not exists thingiverse_clips_shelf_idx
  on public.thingiverse_clips_read_model (tenant_id, retired, created_at);

alter table public.thingiverse_clips_read_model enable row level security;

drop policy if exists "thingiverse_clips_select_tenant" on public.thingiverse_clips_read_model;
create policy "thingiverse_clips_select_tenant"
  on public.thingiverse_clips_read_model for select
  using (public.tenant_role(tenant_id) is not null);

drop policy if exists "thingiverse_clips_insert_tenant" on public.thingiverse_clips_read_model;
create policy "thingiverse_clips_insert_tenant"
  on public.thingiverse_clips_read_model for insert
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "thingiverse_clips_update_tenant" on public.thingiverse_clips_read_model;
create policy "thingiverse_clips_update_tenant"
  on public.thingiverse_clips_read_model for update
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "thingiverse_clips_delete_tenant" on public.thingiverse_clips_read_model;
create policy "thingiverse_clips_delete_tenant"
  on public.thingiverse_clips_read_model for delete
  using (public.tenant_role(tenant_id) is not null);
