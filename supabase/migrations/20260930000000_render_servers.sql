-- ============================================================================
-- Burst render servers: the record exists before the machine does
-- ----------------------------------------------------------------------------
-- One worker on the app box is the normal way renders get drawn, and for a
-- queue of tens it is the right one - see the header of scripts/render-worker.
-- This table is for the other case: a few hundred jobs at once, which on two
-- shared cores is hours, and on a dedicated box rented for the afternoon is not.
--
-- What it is actually protecting against is not capacity, it is leaking money.
-- A ccx23 is about €0.164 an hour, which is nothing for an afternoon and €120 a
-- month for one nobody remembered. The failure mode is specific and it has
-- happened to everyone: a script creates a server, dies before it records
-- anything, and the only evidence is a line item four weeks later.
--
-- So the row is written *first*, with a deadline on it, and only then is the
-- API asked for a machine. Ordering the two that way means the worst case is an
-- orphan record with no server - which costs nothing and is obvious - instead
-- of an orphan server with no record, which costs €120 and is invisible.
--
-- ---------------------------------------------------------------------------
-- Why a deadline column and not a "please remember to destroy it" habit
-- ---------------------------------------------------------------------------
-- Because the habit is the thing that fails. `deadline_at` is not advisory and
-- has no default of "never": every row carries the time after which the reaper
-- will destroy the server whether or not anything has finished. A burst that
-- needs longer extends its own deadline while it works, which means a burst
-- whose process died stops extending it and gets cleaned up - the liveness
-- check and the billing protection are the same mechanism.
--
-- The reaper reconciles in both directions, which is the part worth stating:
-- rows past their deadline whose server still exists get destroyed, and servers
-- labelled `role=render` with no live row get destroyed too. The second half is
-- what catches the gap this table cannot close on its own - a create that
-- succeeded while the response was being lost.
-- ============================================================================

create table if not exists public.render_servers (
  id           uuid        primary key default gen_random_uuid(),

  /**
   * Free text, for whoever reads this later. 'backfill', 'launch', 'catalogue'.
   * Nothing branches on it, like `render_jobs.source` and for the same reason.
   */
  purpose      text        not null check (length(purpose) between 1 and 80),

  server_type  text        not null,
  location     text        not null,

  /**
   * requested -> creating -> up -> destroying -> destroyed, or failed.
   *
   * `requested` is the state this row is written in, before the API has been
   * called at all. It is the one that makes the ordering visible: a row stuck
   * in `requested` means a launcher died between the record and the create, and
   * a reaper should check whether a machine exists under this id's label rather
   * than assume it does not.
   */
  status       text        not null default 'requested'
               check (status in ('requested', 'creating', 'up', 'destroying', 'destroyed', 'failed')),

  /** Null until the API has answered. The label on the server carries `id`. */
  hcloud_id    bigint,
  ip           text,

  /**
   * When this stops being allowed to exist. Not nullable, and no "forever".
   *
   * Extended by the burst while it is working, so it doubles as a heartbeat -
   * see the note at the top. A row whose owner has died simply stops moving
   * this forward.
   */
  deadline_at  timestamptz not null,

  created_at   timestamptz not null default now(),
  destroyed_at timestamptz,
  error        text,

  /** Null for a scheduled or scripted burst; nobody is behind those. */
  requested_by uuid        references auth.users(id) on delete set null,

  constraint render_servers_destroyed_has_a_time
    check (status <> 'destroyed' or destroyed_at is not null),
  constraint render_servers_failed_has_a_reason
    check (status <> 'failed' or error is not null)
);

/**
 * What the reaper asks for: everything not yet known to be gone.
 *
 * Partial, because the settled rows are the half that grows forever and the
 * reaper never looks at them.
 */
create index if not exists render_servers_live_idx
  on public.render_servers (deadline_at)
  where status not in ('destroyed', 'failed');

comment on table public.render_servers is
  'A rented machine for draining the render queue. The row is written before '
  'the server is created, and carries the deadline after which the reaper '
  'destroys it whether or not anything finished.';

-- ============================================================================
-- Row level security
-- ============================================================================

alter table public.render_servers enable row level security;

-- Operators only, and read only. Renting hardware is not something a session
-- cookie should be able to do, so there is no insert policy at all: the burst
-- script holds the service role, which RLS does not apply to. That is a
-- deliberate asymmetry with `render_jobs`, where the insert *is* the request
-- and any member may make one.
create policy "render_servers_select"
  on public.render_servers for select
  to authenticated
  using (public.is_backoffice_admin());
