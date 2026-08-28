-- ============================================================================
-- Finished play, written down
-- ----------------------------------------------------------------------------
-- docs/xp/creator.md §18.6 and docs/xp/scenes.md §3.3. The creator fund is an
-- idea with no code behind it and no urgency, and exactly one part of it cannot
-- wait: **a session nobody logged cannot be reconstructed**. Everything else in
-- §18 - the split rule, the cap, the floor, the balance, the payout - is a
-- query over this table, decided later, changed by rewriting the query. This is
-- the part that has to exist first or the rest of it can only ever start from
-- the day somebody remembers.
--
-- So: one row per finished session, nothing reads it yet, and that is the whole
-- of it. §18.6 calls the cost honestly - one table, one write at teardown, and a
-- projection nobody has written.
--
-- ---------------------------------------------------------------------------
-- Why this is not the event log, which is what §18.6 sketched
-- ---------------------------------------------------------------------------
-- §18.6 wrote the record as `XpSessionEnded` on the event log, and that was
-- written before anybody tried it. Two facts refuse it:
--
--   - **`events_insert_tenant` requires membership.** A person playing a world
--     published by a space they are not in has no standing to write to that
--     space's log, and the whole point of the fund is worlds played by people
--     who are not the author. The write would fail for precisely the sessions
--     worth counting.
--   - **The log is versioned per stream.** `append_events` takes an expected
--     version, so every session ending would contend with every other and with
--     the author saving. A session ending is not a decision anybody made about
--     an aggregate; it is a fact that arrived.
--
-- 20261006000000 already made the same argument in the other direction, and it
-- holds here: the event log is the record of what the *platform* did. This is
-- usage. The split rules stay projections either way, which is the only property
-- §18.6 actually needed from the log.
--
-- ---------------------------------------------------------------------------
-- A reference, not a project id
-- ---------------------------------------------------------------------------
-- §18.6's shape has `xpId` and `xpVersion` as two fields. `domain/xps/ref.ts`
-- already spells both as one string - `p-<uuid>-v3` - and insists it is the only
-- module that knows how one is written. Storing the reference keeps that true,
-- and it means a builtin under `public/xp/xps/` is loggable as `sidestep`
-- rather than being unrepresentable: ours earns nobody anything and is still
-- play that happened.
--
-- The consequence is deliberate: **no foreign key, so nothing cascades**. A
-- world that is deleted keeps its history, which is what a takings record has to
-- do and what `xp_store` - a save, which should go when the game goes - must
-- not. §18.7 is the day that matters, and it is not today.
-- ============================================================================

create table if not exists public.xp_sessions (
  id uuid primary key default gen_random_uuid(),

  /**
   * Which world, at which version, as `domain/xps/ref.ts` spells it.
   *
   * The pattern is a copy of `battles_read_model.xp_id`'s own constraint, the
   * same way `ref.test.ts` keeps a copy of it: a reference that outgrows the
   * column a place stores it in is a reference that cannot be joined back to
   * the match it was played in.
   */
  xp_ref text not null check (xp_ref ~ '^[a-z0-9][a-z0-9-]{0,63}$'),

  /**
   * Who played, or null once they are gone.
   *
   * `on delete set null` rather than `on delete cascade`, and the two halves of
   * that are both wanted:
   *
   *   - **The person goes.** A row saying account X played world Y at 21:40 is
   *     personal data inside content somebody else owns - scenes.md §3.4's
   *     whole argument - and deleting an account has to reach it.
   *   - **The play stays.** Usage is not personal data once nobody is attached
   *     to it, and a payout recomputed after a deletion should not quietly
   *     change everybody else's share because one row vanished.
   *
   * It is also what makes guests work with no column for them. A guest is an
   * anonymous account that `cron/reap-guests` eventually deletes, so a guest's
   * session ends up attributed to nobody on its own - which is exactly §18.3's
   * rule that guests generate usage and no money, arriving without anybody
   * having to write it down.
   */
  account_id uuid references auth.users (id) on delete set null,

  /**
   * The instance this was played in - a room id, a battle id - or null for one
   * person alone in a level.
   *
   * Kept because it is the only thread back to *where* the session happened,
   * and a user-centric split (§18.2) needs that: a member of two spaces playing
   * in one of them is €3 belonging to that space. The room row knows its
   * tenant; this row knows its room; nothing has to be denormalised now and
   * nothing is unrecoverable later.
   */
  instance text check (instance is null or char_length(instance) <= 128),

  started_at timestamptz not null,
  ended_at   timestamptz not null default now(),

  /**
   * How long it lasted, from the client's own clock.
   *
   * Sent rather than computed as `ended_at - started_at` because those two are
   * stamped by different clocks - the browser's and the database's - and a
   * session played across a laptop suspend or a clock correction would come out
   * as a week. The ceiling is a day: past that the number is not a session, and
   * a script in a loop should not be able to write a year of takings.
   */
  seconds integer not null check (seconds >= 0 and seconds <= 86400),

  /** finished | left | disconnected - §18.6's three, and no others. */
  outcome text not null check (outcome in ('finished', 'left', 'disconnected'))
);

/** "What did this world take" - the question every payout starts from. */
create index if not exists xp_sessions_ref_idx
  on public.xp_sessions (xp_ref, ended_at desc);

/** "Where did this member's €3 go" - §18.2's user-centric split. */
create index if not exists xp_sessions_account_idx
  on public.xp_sessions (account_id, ended_at desc)
  where account_id is not null;

alter table public.xp_sessions enable row level security;

-- ---------------------------------------------------------------------------
-- Readable by the backoffice, writable by nobody with a session
-- ---------------------------------------------------------------------------
-- The same arrangement as `page_views` (20260803000000) and for the same
-- reason: a client that could insert here could invent takings, and a fund
-- computed from a table anybody may write is a fund with a hole in it. Inserts
-- come from `/api/xp/sessions` through the service role, where the identity is
-- read from the cookie rather than believed from the body.
--
-- No select policy for the author either, which is the harder half and is
-- scenes.md §3.4 again: "how much was my world played" is a number, and this
-- table holds *who played it and when*. The owner-facing view is an aggregate
-- somebody writes on the day there is a balance to show, not a grant on rows.
create policy "xp_sessions_select_admin"
  on public.xp_sessions for select
  to authenticated
  using (public.is_backoffice_admin());

comment on table public.xp_sessions is
  'One row per finished XP session. docs/xp/creator.md §18.6: the only part of '
  'the creator fund that cannot be back-dated. Written by /api/xp/sessions '
  'through the service role; the split rules are projections over it.';
