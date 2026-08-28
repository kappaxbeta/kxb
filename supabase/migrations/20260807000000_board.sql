-- ============================================================================
-- Read model: the pinboard (admin notices, and the faces people put on them)
-- ----------------------------------------------------------------------------
-- The dashboard is the first thing anyone sees when they open the space, and it
-- wants the whole board in one query: the notices, who wrote them, and every
-- reaction. So the reactions live in a `jsonb` column on the post rather than
-- in a table of their own.
--
-- That is a deliberate trade against the shape you would reach for by default.
-- A `board_reactions (post_id, user_id, emote)` table is the normalised answer
-- and it is the right one if reactions are ever queried on their own - "what
-- did Ada react to this month" is a join there and a full scan here. Nothing
-- asks that. Every read is "give me this board", and the column makes that one
-- round trip with no aggregation, no second index, and no second projection
-- handler to keep in step.
--
-- The shape is { "<emote index>": ["<user id>", ...] } - the same map the
-- aggregate folds, written out. Keys are emote indices into
-- public/xo/emotes48.png; see the note in src/domain/world/emotes.ts on why
-- those indices are now a persisted contract and the sheet may only be
-- appended to.
-- ============================================================================

create table if not exists public.board_posts_read_model (
  -- Same id as the aggregate's stream_id.
  id         uuid        primary key,
  tenant_id  uuid        not null,
  body       text        not null,
  /** Pinned notices sort above the rest, regardless of age. */
  pinned     boolean     not null default false,
  /** { emote index: [user id, ...] }. See the header. */
  reactions  jsonb       not null default '{}'::jsonb,
  /**
   * Was the body rewritten after it went up?
   *
   * Its own column rather than `updated_at > created_at`, because a reaction
   * touches `updated_at` too and "edited" would then mean "somebody laughed at
   * it". The projector sets this on PostEdited and nothing else does.
   */
  edited     boolean     not null default false,
  deleted    boolean     not null default false,
  created_by uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version    integer     not null
);

-- The dashboard query: one tenant's live board, pinned first then newest.
create index if not exists board_posts_read_model_board_idx
  on public.board_posts_read_model (tenant_id, pinned desc, created_at desc)
  where deleted = false;

alter table public.board_posts_read_model enable row level security;

-- ----------------------------------------------------------------------------
-- Policies
-- ----------------------------------------------------------------------------
-- Membership-wide, exactly like pages_read_model, and for the same reason: this
-- is a *projection*, not the authority. Nobody reaches it except through a
-- projector that is replaying events the deciders already agreed to, so a
-- narrower write policy here would restrict the projector rather than the user.
-- Who may put a notice up is decided in src/domain/board/actions.ts against the
-- caller's role, which is the check that actually gates the event log.
-- ----------------------------------------------------------------------------

create policy "board_posts_select_tenant"
  on public.board_posts_read_model for select
  using (public.tenant_role(tenant_id) is not null);

create policy "board_posts_insert_tenant"
  on public.board_posts_read_model for insert
  with check (public.tenant_role(tenant_id) is not null);

create policy "board_posts_update_tenant"
  on public.board_posts_read_model for update
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

create policy "board_posts_delete_tenant"
  on public.board_posts_read_model for delete
  using (public.tenant_role(tenant_id) is not null);
