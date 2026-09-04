-- ============================================================================
-- A note in the margin of a page
-- ----------------------------------------------------------------------------
-- Comments on a workspace page. The shape is the channel's, deliberately:
-- posted as an event on the thing's own stream, captured author name, and
-- resolve-hides-never-deletes. See `20270211000000_a_channel_somebody_else_
-- writes.sql` for the arguments those three make; they are not repeated here.
--
-- ---------------------------------------------------------------------------
-- Why this is not the channel's table with a nullable column
-- ---------------------------------------------------------------------------
-- Because of one policy in that file:
--
--     create policy "channel_comments_select_open"
--       on public.channel_comments_read_model for select to anon, authenticated
--       using (not resolved);
--
-- An episode comment is `anon`-readable on purpose - it hangs off a release a
-- stranger is reading, and a thread under a published chapter is the point of
-- it. A workspace page comment is the opposite: it is somebody's colleague
-- saying "this paragraph is wrong" inside a space you have to be a member of
-- to open, and there is no reading of it that should ever reach `anon`.
--
-- One table serving both audiences means one policy set holding both rules,
-- and the failure mode of getting that wrong is not a broken page - it is
-- internal notes served to the internet with no error anywhere. Two tables
-- with the same columns is the cheaper mistake to have made, so the shape is
-- shared and the rows are not.
--
-- The other half of the argument is that the channel's migration is somebody
-- else's in-flight work. Widening a table while it is still being written is
-- how two sessions produce one file neither of them can review.
-- ============================================================================

create table if not exists public.page_comments_read_model (
  /** The comment's own id, minted by the action and carried in the event. */
  id          uuid primary key,

  tenant_id   uuid not null references public.tenants_read_model (id) on delete cascade,

  /**
   * The page, which is also the stream the event was appended to.
   *
   * A comment has no life apart from the page it is about, so it is not a
   * stream of its own - that would be one stream per sentence somebody typed.
   */
  page_id     uuid not null references public.pages_read_model (id) on delete cascade,

  author_id   uuid references auth.users (id) on delete set null,

  /**
   * The name as it was when they wrote it.
   *
   * Captured rather than joined: a page read a year later must still say who
   * asked the question, and an author who has since closed their account would
   * otherwise turn a margin note into a row of nulls.
   */
  author_name text not null,

  body        text not null check (length(body) between 1 and 4000),

  /**
   * Dealt with, and therefore hidden - not deleted.
   *
   * There is no delete. The interesting comments are the ones somebody acted
   * on, and a thread you can empty stops being a record of what was raised.
   * The panel folds resolved notes away behind a count rather than dropping
   * them, which is what "hidden, not deleted" has to look like to be worth
   * anything to the person reading.
   */
  resolved    boolean not null default false,
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,

  created_at  timestamptz not null default now()
);

-- The panel's own read: what is open on this page, oldest first. Partial,
-- because a page that has been worked on for a year is mostly resolved notes
-- and opening it should not pay for them.
create index if not exists page_comments_open
  on public.page_comments_read_model (page_id, created_at)
  where not resolved;

-- The resolved half, for the disclosure under the open ones.
create index if not exists page_comments_all
  on public.page_comments_read_model (page_id, created_at);

alter table public.page_comments_read_model enable row level security;

-- ---------------------------------------------------------------------------
-- Members of the space, and nobody else
-- ---------------------------------------------------------------------------
-- No `anon` policy, and none is coming - see the header. `tenant_role` returns
-- null for a non-member, which is what turns every other role away including
-- a guest who was let into the lounge.
create policy "page_comments_select"
  on public.page_comments_read_model for select to authenticated
  using (public.tenant_role(tenant_id) is not null);

-- The projection runs under the caller's session, and the decider has already
-- decided whether the command was allowed - so this is the same narrow write
-- policy every other read model in the product uses.
create policy "page_comments_write"
  on public.page_comments_read_model for all to authenticated
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);
