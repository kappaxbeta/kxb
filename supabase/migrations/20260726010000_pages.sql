-- ============================================================================
-- Read model: pages (a Notion-like tree of rich-text documents)
-- ----------------------------------------------------------------------------
-- Two things live in this table and they are derived very differently.
--
-- The *structure* - title, parent, position - is projected from ordinary domain
-- events, exactly like every other read model here.
--
-- The *document* is a snapshot. Its stream holds ProseMirror steps: the deltas
-- a transaction produces when you type. Folding those steps is what defines the
-- document, and doing that on every read would mean replaying every keystroke a
-- page has ever received. So the projector folds them once, as they arrive, and
-- stores the result. That is the whole argument for CQRS in one column: the
-- write side records what changed, the read side keeps what it means.
--
-- `version` is the aggregate version, and it is load-bearing rather than
-- diagnostic. ProseMirror's collaboration protocol requires clients to submit
-- steps against the version they last saw, and the authority rejects anything
-- built on a stale one. That is precisely optimistic concurrency, so the stream
-- version *is* the collab version - no second counter to keep in sync.
-- ============================================================================

create table if not exists public.pages_read_model (
  -- Same id as the aggregate's stream_id.
  id         uuid        primary key,
  tenant_id  uuid        not null,
  /** NULL for a top-level page. Self-referencing, so the tree is arbitrary depth. */
  parent_id  uuid        references public.pages_read_model (id) on delete cascade,
  title      text        not null,
  /**
   * Sort key among siblings. A float, so inserting between two pages is a
   * midpoint calculation rather than renumbering everything after it.
   */
  position   double precision not null default 0,
  /** ProseMirror document JSON - the folded result of every step so far. */
  doc        jsonb       not null default '{"type":"doc","content":[]}'::jsonb,
  deleted    boolean     not null default false,
  created_by uuid,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  version    integer     not null
);

-- The sidebar query: one tenant's tree, ordered within each parent.
create index if not exists pages_read_model_tree_idx
  on public.pages_read_model (tenant_id, parent_id, position);

alter table public.pages_read_model enable row level security;

create policy "pages_select_tenant"
  on public.pages_read_model for select
  using (public.tenant_role(tenant_id) is not null);

create policy "pages_insert_tenant"
  on public.pages_read_model for insert
  with check (public.tenant_role(tenant_id) is not null);

create policy "pages_update_tenant"
  on public.pages_read_model for update
  using (public.tenant_role(tenant_id) is not null)
  with check (public.tenant_role(tenant_id) is not null);

create policy "pages_delete_tenant"
  on public.pages_read_model for delete
  using (public.tenant_role(tenant_id) is not null);

-- ============================================================================
-- Realtime: stream new steps to everyone with the page open
-- ----------------------------------------------------------------------------
-- Collaborative editing needs every client to learn about steps it did not
-- write, promptly. Adding `events` to the realtime publication means Postgres
-- pushes each new row to subscribers, and a client filtering on its page's
-- stream_id receives exactly the steps it needs to rebase against.
--
-- Note this publishes the *event log*, not a read model - which is the natural
-- thing to subscribe to in an event-sourced system, and the reason the earlier
-- "nothing pushes today" limitation was always a deployment gap rather than an
-- architectural one.
--
-- RLS still applies: Supabase Realtime evaluates the same policies per
-- subscriber, so a member of one tenant cannot subscribe to another's log.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;
end;
$$;
