-- ============================================================================
-- Event store
-- ----------------------------------------------------------------------------
-- A single append-only table holds every event for every aggregate. Rows are
-- never updated or deleted; the current state of an aggregate is derived by
-- folding its events in `version` order.
--
-- Two orderings matter:
--   * `version`    - per-stream sequence, starting at 1. Enforces ordering and
--                    optimistic concurrency within one aggregate.
--   * `global_seq` - store-wide sequence. Projections use it as a cursor so
--                    they can resume where they left off.
-- ============================================================================

create table if not exists public.events (
  global_seq  bigint generated always as identity primary key,
  stream_id   uuid        not null,
  stream_type text        not null,
  version     integer     not null check (version > 0),
  type        text        not null,
  data        jsonb       not null default '{}'::jsonb,
  metadata    jsonb       not null default '{}'::jsonb,
  owner_id    uuid        not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),

  -- The optimistic concurrency guarantee. Two concurrent writers that both
  -- read version N will both try to write version N+1; exactly one wins and
  -- the loser gets a unique violation, which the app maps to a retry.
  constraint events_stream_version_unique unique (stream_id, version)
);

create index if not exists events_stream_id_version_idx
  on public.events (stream_id, version);

create index if not exists events_owner_seq_idx
  on public.events (owner_id, global_seq);

-- ----------------------------------------------------------------------------
-- Row level security
-- ----------------------------------------------------------------------------
-- Users may read and append their own events. There is deliberately no UPDATE
-- or DELETE policy: the log is append-only, enforced by the absence of any
-- policy permitting those commands.
-- ----------------------------------------------------------------------------

alter table public.events enable row level security;

create policy "events_select_own"
  on public.events for select
  using (owner_id = (select auth.uid()));

create policy "events_insert_own"
  on public.events for insert
  with check (owner_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- append_events()
-- ----------------------------------------------------------------------------
-- The one piece of write logic that lives in the database, because appending a
-- batch of events and checking the expected version must happen in a single
-- transaction. Everything else (deciding *which* events to append, and
-- projecting them into read models) stays in TypeScript.
--
-- `security invoker` means the RLS policies above still apply, so this function
-- cannot be used to write events on another user's behalf.
--
-- p_expected_version is the version the caller believes the stream is at:
--   0 = "this stream must not exist yet"
--   N = "I read the stream at version N and my decision is based on that"
-- ----------------------------------------------------------------------------

create or replace function public.append_events(
  p_stream_id        uuid,
  p_stream_type      text,
  p_expected_version integer,
  p_events           jsonb
)
returns setof public.events
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actual_version integer;
  v_event          jsonb;
  v_version        integer;
begin
  if (select auth.uid()) is null then
    raise exception 'append_events: not authenticated'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'append_events: p_events must be a JSON array, got %',
      coalesce(jsonb_typeof(p_events), 'null')
      using errcode = '22023';
  end if;

  -- Nothing to do. A decider that returns no events is a valid no-op.
  if jsonb_array_length(p_events) = 0 then
    return;
  end if;

  select coalesce(max(version), 0)
    into v_actual_version
    from public.events
   where stream_id = p_stream_id;

  if v_actual_version <> p_expected_version then
    raise exception
      'append_events: concurrency conflict on stream % (expected version %, actual %)',
      p_stream_id, p_expected_version, v_actual_version
      using errcode = '40001';
  end if;

  v_version := v_actual_version;

  for v_event in select * from jsonb_array_elements(p_events)
  loop
    v_version := v_version + 1;

    return query
      insert into public.events (
        stream_id, stream_type, version, type, data, metadata, owner_id
      )
      values (
        p_stream_id,
        p_stream_type,
        v_version,
        v_event ->> 'type',
        coalesce(v_event -> 'data', '{}'::jsonb),
        coalesce(v_event -> 'metadata', '{}'::jsonb),
        (select auth.uid())
      )
      returning *;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- Projection checkpoints
-- ----------------------------------------------------------------------------
-- Each projection records the last global_seq it has processed, so it can be
-- resumed, rebuilt (reset last_seq to 0), or run lazily on read.
--
-- The cursor is per (projection, owner) because RLS scopes every read to a
-- single user anyway - each user effectively has their own slice of the log.
-- ----------------------------------------------------------------------------

create table if not exists public.projection_checkpoints (
  projection text        not null,
  owner_id   uuid        not null references auth.users (id) on delete cascade,
  last_seq   bigint      not null default 0,
  updated_at timestamptz not null default now(),

  primary key (projection, owner_id)
);

alter table public.projection_checkpoints enable row level security;

create policy "checkpoints_select_own"
  on public.projection_checkpoints for select
  using (owner_id = (select auth.uid()));

create policy "checkpoints_insert_own"
  on public.projection_checkpoints for insert
  with check (owner_id = (select auth.uid()));

create policy "checkpoints_update_own"
  on public.projection_checkpoints for update
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
