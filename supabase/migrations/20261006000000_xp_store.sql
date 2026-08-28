-- ============================================================================
-- The store: what a running game remembers
-- ----------------------------------------------------------------------------
-- docs/xp/scenes.md §3 and docs/xp/state.md §7. The `persistence` port has been
-- declared since §11 and implemented by nothing but the memory host; this is the
-- table behind `get` and `put` when the host is ours.
--
-- ---------------------------------------------------------------------------
-- A row, not a stream
-- ---------------------------------------------------------------------------
-- §3.3, and it is the opposite of this codebase's instinct. The event log is the
-- record of what the *platform* did - a project created, a version saved. A
-- player's coin count in somebody's arcade game is not that: it changes several
-- times a second, it has no audit value, and answering "how many coins" from a
-- stream means folding it from the beginning, which is the cost snapshotting
-- exists to avoid. A game that genuinely wants history calls `append`, which is
-- a different call on purpose.
--
-- ---------------------------------------------------------------------------
-- Two scopes here, and `global` deliberately absent
-- ---------------------------------------------------------------------------
-- §3's milestone S3 says `player` and `space`, and says why `global` does not
-- ride in on the same commit: it is not a save scope with a bigger audience, it
-- is user-generated content on our origin - a store any stranger writes and
-- every other player renders - and it needs a byte cap per XP, a rate limit per
-- player, moderation from the backoffice, and the rule that values are data and
-- never markup. Half of that is policy and none of it is this table.
--
-- The check constraint below is what keeps that honest: a `global` row cannot be
-- written by accident before the commit that thinks about all four.
--
-- ---------------------------------------------------------------------------
-- The word
-- ---------------------------------------------------------------------------
-- `xp_store`, not `xp_saves`. state.md §7.7: three different things were called
-- a save - the browser draft, the project version, and this - and the word is
-- retired rather than qualified. The port's calls were already `get` / `put` /
-- `append` with no `save` among them.
-- ============================================================================

create table if not exists public.xp_store (
  /**
   * A surrogate key, because the natural one is two different keys.
   *
   * A `player` row is one per (xp, account) and a `space` row is one per xp -
   * §3.1's `space` scope is "one space, in one XP", and an XP belongs to exactly
   * one space, so there is nothing left to key it by. Two partial unique indexes
   * below say that precisely; a composite primary key would have to invent a
   * value for the half of the key that does not apply.
   */
  id         uuid        primary key default gen_random_uuid(),
  xp_id      uuid        not null references public.xps_read_model (id) on delete cascade,
  scope      text        not null check (scope in ('player', 'space')),
  /**
   * Whose row this is, for `player`, and null for `space`.
   *
   * A real foreign key rather than a polymorphic owner column, and the cascade
   * is the reason: §3.4 requires that deleting an account sweeps its saves the
   * way `events` already cascades. An owner id that could be either an account
   * or a tenant could not carry that, and the sweep would be a scheduled job
   * somebody has to remember to write.
   */
  account_id uuid        references auth.users (id) on delete cascade,
  value      jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /** The two shapes, spelled out, so a row cannot be half of each. */
  constraint xp_store_owner_matches_scope check (
    (scope = 'player' and account_id is not null)
    or (scope = 'space' and account_id is null)
  ),

  /**
   * A ceiling per row, which is not §3.2's byte cap.
   *
   * §3.2's cap is per XP and belongs to `global`, where the writer is a
   * stranger. This is the smaller thing: a script in a loop appending to its
   * own player row is the ordinary failure mode long before anybody is
   * malicious, and a row nobody bounded is one that is discovered as a disk
   * alert. 256 KB is far above a coin count and far below a problem.
   */
  constraint xp_store_value_size check (pg_column_size(value) <= 262144)
);

/** One row per player per XP. */
create unique index if not exists xp_store_player_key
  on public.xp_store (xp_id, account_id)
  where scope = 'player';

/** One row per XP for the space's shared world. */
create unique index if not exists xp_store_space_key
  on public.xp_store (xp_id)
  where scope = 'space';

/** For §7.5 Reading A: a space owner asking what is stored under their space. */
create index if not exists xp_store_xp_idx on public.xp_store (xp_id);

alter table public.xp_store enable row level security;

-- ---------------------------------------------------------------------------
-- Who may read what
-- ---------------------------------------------------------------------------
-- The line that matters is the one that is *not* here: an XP's owner cannot read
-- a `player` row. §3.4 is explicit - they own the game, not the people playing
-- it - so `xp_is_mine` and `has_xp_grant` appear nowhere in this policy, and an
-- owner-facing overview of what is stored (§7.5 Reading A) shows sizes and keys
-- rather than contents for exactly that reason.
--
-- Through `xp_in_my_space` rather than a join, like every policy since
-- 20261003000000: no policy on these tables references another of them
-- directly, so there is no path from a policy back to the relation it governs.
create policy "xp_store_select"
  on public.xp_store for select
  to authenticated
  using (
    (scope = 'player' and account_id = (select auth.uid()))
    or (scope = 'space' and public.xp_in_my_space(xp_id))
  );

-- Named commands rather than `for all`, and not from superstition: `for all`
-- includes SELECT and is OR-ed with the policy above, so a write rule would
-- silently govern reads. That is what went wrong in 20261003000000.
create policy "xp_store_insert"
  on public.xp_store for insert
  to authenticated
  with check (
    (scope = 'player' and account_id = (select auth.uid()))
    or (scope = 'space' and public.xp_in_my_space(xp_id))
  );

-- `using` and `with check` both, and they differ in what they are for: the first
-- says which row you may touch, the second says what it may become. Without the
-- second, a member could move a space row onto another XP, or hand their player
-- row to somebody else's account.
create policy "xp_store_update"
  on public.xp_store for update
  to authenticated
  using (
    (scope = 'player' and account_id = (select auth.uid()))
    or (scope = 'space' and public.xp_in_my_space(xp_id))
  )
  with check (
    (scope = 'player' and account_id = (select auth.uid()))
    or (scope = 'space' and public.xp_in_my_space(xp_id))
  );

-- Clearing your own progress is a thing people do. Clearing the space's shared
-- world is a member action for now and an owner action the day somebody asks -
-- §7.5 Reading A is where that decision belongs, not here.
create policy "xp_store_delete"
  on public.xp_store for delete
  to authenticated
  using (
    (scope = 'player' and account_id = (select auth.uid()))
    or (scope = 'space' and public.xp_in_my_space(xp_id))
  );

/**
 * `updated_at` is the server's, not the writer's.
 *
 * §7.5 Reading A wants to show when something was last written and §3.3 is
 * last-write-wins, so the timestamp is the only record of which write won. A
 * column a client sets is one a script in a loop can set to last year.
 */
create or replace function public.xp_store_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists xp_store_touch on public.xp_store;
create trigger xp_store_touch
  before update on public.xp_store
  for each row execute function public.xp_store_touch();
