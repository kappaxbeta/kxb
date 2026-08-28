-- ============================================================================
-- Read model: tasks
-- ----------------------------------------------------------------------------
-- This table is derived data. It is written *only* by the TypeScript projector
-- in src/domain/tasks/projection.ts, never by application code directly, and it
-- can be dropped and rebuilt from the event log at any time.
--
-- Because it is derived, it is shaped for reading: flat columns, no joins, and
-- whatever indexes the query side wants.
-- ============================================================================

create table if not exists public.tasks_read_model (
  -- Same id as the aggregate's stream_id. That correspondence is what lets the
  -- UI jump from a read-model row to its event stream.
  id         uuid        primary key,
  owner_id   uuid        not null references auth.users (id) on delete cascade,
  title      text        not null,
  completed  boolean     not null default false,
  deleted    boolean     not null default false,
  created_at timestamptz not null,
  updated_at timestamptz not null,

  -- Version of the aggregate this row reflects. Useful for debugging drift
  -- between the log and the projection.
  version    integer     not null
);

create index if not exists tasks_read_model_owner_idx
  on public.tasks_read_model (owner_id, deleted, created_at desc);

-- ----------------------------------------------------------------------------
-- Row level security
-- ----------------------------------------------------------------------------
-- Reads are scoped to the owner. Writes are allowed for the owner too, since
-- the projector runs as the signed-in user rather than as a service role -
-- keeping it inside RLS means a bug in the projector still cannot touch another
-- user's rows.
-- ----------------------------------------------------------------------------

alter table public.tasks_read_model enable row level security;

create policy "tasks_read_model_select_own"
  on public.tasks_read_model for select
  using (owner_id = (select auth.uid()));

create policy "tasks_read_model_insert_own"
  on public.tasks_read_model for insert
  with check (owner_id = (select auth.uid()));

create policy "tasks_read_model_update_own"
  on public.tasks_read_model for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "tasks_read_model_delete_own"
  on public.tasks_read_model for delete
  using (owner_id = (select auth.uid()));
