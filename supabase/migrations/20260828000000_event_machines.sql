-- ============================================================================
-- Event machines: asking for a box, and watching one appear
-- ----------------------------------------------------------------------------
-- Standing an event on its own hardware takes about ten minutes and needs two
-- credentials the app deliberately does not have: a Hetzner API token and an
-- SSH key. Giving them to the app would mean that anything which compromised a
-- web container could create servers on the account and log into them - a much
-- larger blast radius than the app has today, bought for a convenience.
--
-- So the work is split, and this table is the seam:
--
--   the console  writes a row saying "this event wants a box"
--   the agent    holds the credentials, does the work, writes progress back
--   the console  reads the progress and shows it
--
-- The app never touches Hetzner. The agent never serves a request. Neither can
-- do the other's job, which is the property worth having.
--
-- ----------------------------------------------------------------------------
-- Why a table rather than a queue
-- ----------------------------------------------------------------------------
-- One box per event, ever, and the whole point is that an operator can see what
-- is happening. A queue would model this as a stream of jobs and then need a
-- second table to answer "does this event have a machine, and is it up" - which
-- is the only question anybody actually asks. So the row *is* the machine, and
-- its status is where in its life it has got to.
--
-- That also makes double-provisioning impossible by construction: `tenant_id`
-- is the primary key, so a second request for the same event is a conflict
-- rather than a second server nobody knows about.
-- ============================================================================

create table if not exists public.event_machines (
  tenant_id   uuid        primary key
                          references public.tenants_read_model (id) on delete cascade,
  /**
   * Where this machine has got to.
   *
   *   requested    - the console asked. Nothing exists yet.
   *   provisioning - an agent has claimed it and is working.
   *   ready        - it is serving. `ip` and `guest_url` are set.
   *   failed       - something broke. `error` says what; the row stays so the
   *                  operator can read it and retry.
   *   retiring     - `event-down` has been asked for: import, then destroy.
   *   gone         - the box is destroyed and the event is home.
   *
   * Text with a check rather than an enum, matching every other status column
   * in this schema - adding a state to an enum needs a migration and a lock on
   * a type, which is a lot of ceremony for a word.
   */
  status      text        not null default 'requested'
                          check (status in ('requested','provisioning','ready',
                                            'failed','retiring','gone')),
  /** What to build. Defaulted to dedicated vCPU - see event-up.ts on why. */
  server_type text        not null default 'ccx23',
  /** Hetzner's id, once there is one. Null until the server exists. */
  server_id   bigint,
  ip          text,
  /** The link that goes in the calendar invite, minted on the box. */
  guest_url   text,
  /**
   * Progress, appended a line at a time.
   *
   * A text column rather than a child table, because it is read exactly once -
   * by an operator watching a box come up - and never queried. The rows it
   * would otherwise become would outnumber every other row this feature has.
   */
  log         text        not null default '',
  error       text,
  /**
   * Which agent holds this row, and since when.
   *
   * Two agents polling the same table is not the expected deployment, but it is
   * the one that ruins an afternoon: both claim the same request, both create a
   * server, and one of them is billed for forever because nothing knows it
   * exists. The claim is what makes that impossible - see `claim_event_machine`.
   */
  claimed_by  text,
  claimed_at  timestamptz,
  requested_by uuid       references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.event_machines is
  'A request for an event to get its own hardware, and the progress of it. Written by the console (request) and by the provisioning agent (everything else).';

create index if not exists event_machines_status_idx
  on public.event_machines (status, created_at);

alter table public.event_machines enable row level security;

-- Backoffice only, both ways. The agent does not use a session at all - it
-- connects with the service role, which bypasses this - so there is no policy
-- here for it and deliberately none that would let a space's own members see
-- an IP address or a server id.
drop policy if exists "event_machines_admin_all" on public.event_machines;

create policy "event_machines_admin_all"
  on public.event_machines for all
  using (public.is_backoffice_admin())
  with check (public.is_backoffice_admin());

-- ============================================================================
-- Claiming
-- ----------------------------------------------------------------------------
-- One agent, one row, atomically. `for update skip locked` is the standard
-- shape and it is the right one here for the reason the column comment gives:
-- the failure mode of two agents claiming the same request is a server nobody
-- has a record of, billing quietly until somebody opens the Hetzner console.
--
-- Returns the whole row so the agent needs no second read, and returns nothing
-- when there is no work - which is the common case, several times a minute,
-- forever.
--
-- A claim older than the timeout is stolen rather than respected: an agent that
-- was killed mid-provision would otherwise hold its row until somebody noticed
-- by hand, and "the box never appeared and nothing says why" is precisely the
-- failure this whole table exists to prevent. Fifteen minutes is comfortably
-- longer than a provision, which measured about ten.
-- ============================================================================

create or replace function public.claim_event_machine(
  p_agent text,
  p_wanted text[] default array['requested','retiring'],
  p_stale interval default '15 minutes'
)
returns public.event_machines
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.event_machines;
begin
  select * into claimed
    from public.event_machines m
   where m.status = any (p_wanted)
      or (m.status = 'provisioning' and m.claimed_at < now() - p_stale)
   order by m.created_at
   for update skip locked
   limit 1;

  if not found then
    return null;
  end if;

  update public.event_machines
     set status     = case when status = 'retiring' then 'retiring' else 'provisioning' end,
         claimed_by = p_agent,
         claimed_at = now(),
         updated_at = now()
   where tenant_id = claimed.tenant_id
   returning * into claimed;

  return claimed;
end;
$$;

revoke execute on function public.claim_event_machine(text, text[], interval)
  from public, authenticated, anon;

-- ============================================================================
-- Progress
-- ----------------------------------------------------------------------------
-- Appending rather than replacing, so an operator watching sees the whole story
-- rather than only the current step - and so a failure keeps everything that
-- led to it. Trimmed from the front past a limit, because a stuck agent looping
-- on an error would otherwise grow one row without bound.
-- ============================================================================

create or replace function public.log_event_machine(p_tenant_id uuid, p_line text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.event_machines
     set log = right(log || to_char(now(), 'HH24:MI:SS ') || p_line || E'\n', 20000),
         updated_at = now()
   where tenant_id = p_tenant_id;
$$;

revoke execute on function public.log_event_machine(uuid, text)
  from public, authenticated, anon;
