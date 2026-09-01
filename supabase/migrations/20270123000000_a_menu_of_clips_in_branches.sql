-- ============================================================================
-- Read model: a space's emote menu
-- ----------------------------------------------------------------------------
-- A space can animate sixty-four clips and had one way to reach them: a name,
-- typed. That works at three and is a wall at thirty. The emote grid solved the
-- same problem for ninety-one faces by being a *sheet you scan* - which works
-- for pictures and not for names, because a name has to be read.
--
-- So the clips get branches. `Dances > Robot`, `Greetings > Wave`, two presses
-- each. The reason every game with more than a handful of emotes ends up here
-- is that a *position* can be learned and a name cannot, so a menu somebody
-- arranged themselves becomes muscle memory in a way an alphabetical list never
-- does.
--
-- ----------------------------------------------------------------------------
-- One row per space, and the id is the tenant's
-- ----------------------------------------------------------------------------
-- Every other noun in this domain has identity: a blueprint is renamed, handed
-- over and retired, so it gets a stream and a row each. A menu has none of
-- that. There is exactly one per space, it is never handed to anybody, and the
-- only thing that happens to it is that somebody rearranged it.
--
-- So the stream id *is* the tenant id, and so is this primary key. Minting a
-- separate id would mean a lookup before every write to answer "which menu",
-- and a table whose single row has a key nobody can derive.
--
-- ----------------------------------------------------------------------------
-- The whole tree in one column
-- ----------------------------------------------------------------------------
-- Not a row per node, and the reason is the edit that would otherwise be two
-- writes: dragging a clip from one branch to another is *one decision* touching
-- two places, and as a delete-then-insert it has a window where the clip is in
-- neither branch or in both. A reader catching that draws a menu nobody has.
--
-- Nothing queries inside it either - the menu is read whole, by a world, once -
-- so there is no index to buy and no join to serve. `treeProblems` in the
-- decider is the check; Postgres will not look inside jsonb and is not asked to.
--
-- ----------------------------------------------------------------------------
-- Why any member may write it
-- ----------------------------------------------------------------------------
-- Deliberately wider than the blueprint policies next door, which admit the
-- owner and an admin. A blueprint is somebody's; the menu is the space's - it
-- is what everybody in the room reaches for, and owning it would mean the first
-- person to arrange it owns the only menu the space has. Two people editing at
-- once is a last-writer-wins fight, which the aggregate's version check already
-- turns into "someone else changed that, try again".
-- ============================================================================

create table if not exists public.thingiverse_emotes_read_model (
  -- The tenant's own id. See above.
  tenant_id  uuid        primary key,
  /** The whole menu: branches, labels, keys and the clip each row plays. */
  tree       jsonb       not null default '{"roots": []}'::jsonb,
  /** Who arranged it last, for a surface that wants to say so. */
  by_id      uuid,
  updated_at timestamptz not null,
  version    integer     not null
);

alter table public.thingiverse_emotes_read_model enable row level security;

drop policy if exists "thingiverse_emotes_select_tenant" on public.thingiverse_emotes_read_model;
create policy "thingiverse_emotes_select_tenant"
  on public.thingiverse_emotes_read_model for select
  using (public.tenant_role(tenant_id) is not null);

drop policy if exists "thingiverse_emotes_insert_tenant" on public.thingiverse_emotes_read_model;
create policy "thingiverse_emotes_insert_tenant"
  on public.thingiverse_emotes_read_model for insert
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "thingiverse_emotes_update_tenant" on public.thingiverse_emotes_read_model;
create policy "thingiverse_emotes_update_tenant"
  on public.thingiverse_emotes_read_model for update
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

drop policy if exists "thingiverse_emotes_delete_tenant" on public.thingiverse_emotes_read_model;
create policy "thingiverse_emotes_delete_tenant"
  on public.thingiverse_emotes_read_model for delete
  using (public.tenant_role(tenant_id) is not null);
