-- ============================================================================
-- A log that outlives the people who wrote it
-- ============================================================================
-- *A head that outran its log* named the suspect and left it alone on purpose,
-- because the change wanted to be made against a sweep that could already say
-- how much of it had happened. This is the change. (That migration is referred
-- to by title rather than by version throughout this file: it went out as
-- 20261222000000, which `develop` had already spent on *A door remembers how
-- high it was*, so its number has to move before it can be deployed.)
--
--     events.actor_id uuid references auth.users (id) on delete cascade
--
-- That line has been in the schema since 20260725090000, when the column was
-- called `owner_id` and cascade was the obviously right answer to a question
-- nobody was asking any more by the time 20260725130000 renamed it. `owner_id`
-- meant "this row belongs to this person, and when they go it goes with them".
-- `actor_id` means "this person wrote this row". The rename said so - "the
-- column never meant 'who owns this data' as well as it meant 'who wrote this
-- row'" - and changed the name without changing the delete rule underneath it.
-- The constraint is still called `events_owner_id_fkey`, which is the fossil.
--
-- ----------------------------------------------------------------------------
-- What it has been doing
-- ----------------------------------------------------------------------------
-- `/api/cron/reap-guests` runs hourly and deletes anonymous accounts through
-- `admin.auth.admin.deleteUser`. That job is housekeeping, its own route says
-- so, and it is right to exist: a guest link that has a good week leaves one
-- permanent `auth.users` row per visitor.
--
-- Every one of those deletions took the visitor's events out of the log.
--
-- That is where the holes come from. `alpha` had 54 of them on production, all
-- between `battle` events, and battle is the one stream type a guest may write.
-- On this database when this was written, three tenants carried the mark:
-- `1ead3467` had 9 events left of 518 handed out, `9e745b41` was missing 5, and
-- `748b8a07`'s head stood 3 numbers past the end of its log. 416 anonymous
-- accounts were still holding 3 more events between them, waiting for the next
-- hourly run to take them.
--
-- The consequences are already written down twice, in the two migrations that
-- met this from the reader's side: a hole inside the log parks every projection
-- behind it (20261216000000), and a hole at the end of it parks them for ever
-- because there is no row after it to be old enough to step over
-- (*A head that outran its log*). `magazine_read_model` reading empty for a
-- week was this.
--
-- The log is append-only. There is no UPDATE policy and no DELETE policy on
-- `public.events`, and the absence of those policies is documented in three
-- places as the thing that enforces it. A foreign key does not consult a
-- policy. It has been the one writer in the system allowed to delete history,
-- and it has been using that permission every hour.
--
-- ----------------------------------------------------------------------------
-- Three ways to stop it, and why this is the one
-- ----------------------------------------------------------------------------
-- **`on delete restrict` / `no action`.** Refuse to delete an account that has
-- ever written an event. This is the strictest reading of "the log is
-- immutable", and it is unworkable in exactly the place it matters: a guest who
-- plays one match has written a `battle` event, so the reaper would fail on the
-- common case rather than the rare one, and the accounts it exists to collect
-- would accumulate for ever. It also moves the failure to the wrong moment -
-- deleting an account would start throwing, and the thing that must not happen
-- is not the deletion, it is the deletion taking the log with it.
--
-- **A tombstone account.** Re-point departed actors at one "deleted user" row
-- so the column stays non-null and every join keeps working. 20260725150000 has
-- already ruled on this shape, in the same table, for the same reason: a Stripe
-- webhook has no session, and "borrowing some user's id to satisfy a NOT NULL
-- would put a false fact in an immutable log". A tombstone is that, with an
-- extra `auth.users` row to look after. And it buys nothing here, because -
--
-- **`on delete set null`**, which is what this migration does, is a state the
-- column has been in since that same migration. `actor_id` is already nullable
-- and NULL already has a meaning: nobody. Every reader was made to tolerate it
-- then, and the ones written since were written against a nullable column.
-- What changes is only the second way a NULL can arise: the person is gone
-- rather than there never having been one.
--
-- It is also what the rest of the schema already does. Of the sixty foreign
-- keys into `auth.users`, every column that means "who did this" -
-- `battles_read_model.created_by`, `lounge_blocks_read_model.placed_by`,
-- `backoffice_audit.actor_id`, `published_worlds.author_id`, and thirty more -
-- is `on delete set null`. `events.actor_id` was the only one that meant "who
-- did this" and cascaded.
--
-- ----------------------------------------------------------------------------
-- What a member actually sees change, which is nothing
-- ----------------------------------------------------------------------------
-- Worth stating precisely, because it is the strongest argument for this shape
-- over the other two. Take the case that happens: a guest creates a battle,
-- plays it, and is reaped an hour later.
--
--   * Today: the `BattleCreated` event is deleted, and `battles_read_model`
--     keeps its row with `created_by` set to NULL by its own foreign key. The
--     match still renders. The event is gone.
--   * After this: the event stays, its `actor_id` goes to NULL, and
--     `battles_read_model.created_by` goes to NULL by the same foreign key as
--     before. The match renders identically.
--
-- Same read models, same screen, and the difference is entirely in what
-- survives to be replayed. The events guests write carry the player inside
-- `data` - `PlayerJoined` has `data.userId`, `GoalScored` has `data.by` - so a
-- rebuild reconstructs the roster and the score exactly as before. The only
-- fact that thins is authorship of the row, which was already thinning.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The foreign key
-- ----------------------------------------------------------------------------
-- Dropped and recreated under its real name. Nothing in the codebase names the
-- constraint, so the rename costs nothing and stops the schema claiming there
-- is a column called `owner_id`.
--
-- No table rewrite: the column is unchanged and already nullable, so this is a
-- catalogue edit plus one validating scan of `events`.

alter table public.events
  drop constraint if exists events_owner_id_fkey;

alter table public.events
  drop constraint if exists events_actor_id_fkey;

alter table public.events
  add constraint events_actor_id_fkey
  foreign key (actor_id) references auth.users (id) on delete set null;

comment on column public.events.actor_id is
  'The person who appended this event, or NULL for nobody. NULL has two causes and they are not distinguishable here, deliberately: a system write with no session behind it (a Stripe webhook - see 20260725150000), or an account that has since been deleted. Not an owner: the tenant owns the data, and the event outlives the account either way. ON DELETE SET NULL, never cascade - see 20261223000000 for the hour-by-hour damage cascade was doing.';

-- ----------------------------------------------------------------------------
-- 2. A NULL actor must not read as "nobody has claimed this space"
-- ----------------------------------------------------------------------------
-- The one policy consequence, and it is a real one.
--
-- `tenant_is_unclaimed()` is the bootstrap hole in the events insert policy:
-- creating a space means appending `TenantCreated` before any membership
-- exists, so the policy cannot demand membership, and it settles for "nobody
-- else has touched this id". It asks that as `e.actor_id <> auth.uid()`, and
-- against a NULL that comparison is NULL, which is not true, which means the
-- row does not count as somebody else's.
--
-- So a space whose every remaining event was written by since-deleted accounts
-- would answer "unclaimed" and let any signed-in user append into it. Reading
-- it still needs membership, so this is a write hole rather than a disclosure,
-- and it needs a space with no surviving member-written event - which is not
-- reachable today and becomes reachable the moment actors start going NULL in
-- place rather than taking their rows with them.
--
-- `is distinct from` closes it by treating NULL as somebody else, which is the
-- honest reading: an event with no actor is not an event *I* wrote. The
-- bootstrap case is untouched - the founder's own first event carries their own
-- id and still compares equal.

create or replace function public.tenant_is_unclaimed(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
      from public.events e
     where e.tenant_id = p_tenant_id
       and e.actor_id is distinct from (select auth.uid())
  );
$$;

comment on function public.tenant_is_unclaimed(uuid) is
  'True when no event in this space was written by anybody but the caller. The bootstrap hole in events_insert_tenant: TenantCreated is appended before any membership exists. `is distinct from` rather than `<>` so an event with no actor - a system write, or a deleted account - counts as somebody else rather than as nobody.';

-- ----------------------------------------------------------------------------
-- 3. Read models that could no longer be rebuilt
-- ----------------------------------------------------------------------------
-- This is the part that makes the change actually work rather than merely look
-- right, and it was not obvious until every reader had been walked.
--
-- Keeping a guest's events means the log now holds user ids that `auth.users`
-- does not. Every projection that writes an id into a *nullable* column is
-- fine - it writes NULL, which is what that row's own `on delete set null` was
-- going to leave there anyway. Every projection that writes into a NOT NULL
-- column already guards: `homestead` skips an event with no actor outright,
-- `login_streaks` returns early on `!event.actorId`.
--
-- Three columns are neither. They are NOT NULL, they reference `auth.users`
-- with `on delete cascade`, and the id they hold comes out of the event's
-- `data` rather than its actor - so no null check can see it coming:
--
--   * `battle_participants.user_id`  <- `PlayerJoined.data.userId`
--   * `battle_scores.user_id`        <- derived from the roster by
--                                       `recount_battle_scores`, so it inherits
--                                       whatever the roster holds
--   * `xp_grants.account_id`         <- `XpShared.data.account`
--
-- Replay a `PlayerJoined` naming a reaped guest into that and the INSERT raises
-- a foreign key violation. The projection throws, the sweep reports `failed`
-- every minute, and the checkpoint never moves again. Not a hypothetical: the
-- reaper runs hourly and a projection parked behind a hole for a week replays
-- week-old events the moment 20261216000000's five-minute rule unparks it. It
-- would also break `resetProjection()` - "the read model is disposable, so you
-- can change its shape and rebuild it from history" - on every space that has
-- ever admitted a guest, which is the one promise this architecture makes that
-- nothing else can make good on.
--
-- 20260725150000 already stated the rule these three break, about a different
-- column, before there was a way to hit it: "a read model that cannot represent
-- what the log can hold is a projection waiting to crash on replay."
--
-- So the constraints go. A foreign key from a derived table to `auth.users` is
-- an assertion that the log cannot outlive the account, and that assertion is
-- precisely what is being removed. The rows are still disposable and still
-- rebuilt from the log; what they lose is the cascade that used to tidy them,
-- and losing it is the point - a finished match keeping its roster and its
-- score after a visitor's account is collected is better than the leaderboard
-- silently changing behind it, which is what happens today.

alter table public.battle_participants
  drop constraint if exists battle_participants_user_id_fkey;

alter table public.battle_scores
  drop constraint if exists battle_scores_user_id_fkey;

alter table public.xp_grants
  drop constraint if exists xp_grants_account_id_fkey;

comment on column public.battle_participants.user_id is
  'Who played. No foreign key to auth.users, deliberately: this row is derived from PlayerJoined.data.userId, the log outlives accounts, and a constraint here would make a replay fail rather than a row be missing. Nothing is granted on the strength of this column that a deleted account could still use - it cannot authenticate.';

comment on column public.battle_scores.user_id is
  'Whose record this is. No foreign key to auth.users, for the reason on battle_participants.user_id: recount_battle_scores derives these rows from the roster, so it can only hold what the roster holds.';

comment on column public.xp_grants.account_id is
  'Who the xp is shared with. No foreign key to auth.users: the row is derived from XpShared.data.account and must be re-creatable from the log after that account is gone. A grant to a deleted account grants nothing - there is nobody to sign in as.';

-- ============================================================================
-- 4. The spaces already damaged
-- ============================================================================
-- Stopping the deletions does nothing for the holes already punched, and one
-- shape of hole is permanent without help. `tenant_event_sequences.last_seq`
-- says 286; the highest event that exists says 283. `events_since_checkpoint`
-- is asked for everything above the cursor and correctly answers nothing, so a
-- projection at 283 applies nothing, writes no checkpoint, and is reported
-- behind on every sweep for ever. Two spaces here are in that state: 748b8a07
-- (head 286, log ends 283) and a699fa43 (head 23, not one event left).
--
-- Interior holes need nothing. 20261216000000 steps over those once the row
-- after them is five minutes old, which for every hole discussed here was true
-- long ago.
--
-- ----------------------------------------------------------------------------
-- Lowering the head means handing out a number twice. That is the question.
-- ----------------------------------------------------------------------------
-- 286 was allocated and committed. Setting the head back to 283 means the next
-- append is numbered 284 again, and 20261120000000 built this counter to make
-- exactly one promise - that the numbers are contiguous and unique - so reusing
-- one deserves an argument rather than a shrug. Three things have to hold.
--
-- **Nothing else remembers a tenant_seq.** Three columns in the database hold
-- one: `events.tenant_seq`, `projection_checkpoints.last_seq` and
-- `tenant_event_sequences.last_seq`. Nothing references `public.events` by
-- foreign key at all. So the blast radius is the checkpoints, below.
--
-- **A collision would be loud, not silent.** `events_tenant_seq_unique` on
-- `(tenant_id, tenant_seq)` is still there. If any row did survive at a number
-- being reissued, the append fails with 23505, which `errors.ts` already maps
-- to a retry. The failure mode of getting this wrong is a conflict, not a
-- duplicate.
--
-- **A checkpoint above the new head has to come down with it.** This is the
-- one that bites. On 748b8a07 the *inline* checkpoints sit at 286: they read
-- 284, 285 and 286 while those rows existed, then the rows were deleted under
-- them. Leave one at 286, hand 284 out again, and that projection never sees
-- the new event - the silent skip this entire line of work exists to abolish.
--
-- Clamping them down replays nothing. The new head *is* the highest surviving
-- number, so between it and the old checkpoint there is by definition no event
-- to re-apply. 20261120000000 warned that setting a checkpoint too low replays
-- history into handlers that are not all idempotent; this cannot, because there
-- is nothing there. It is bookkeeping, not a rewind.
--
-- ----------------------------------------------------------------------------
-- And the append that is in flight while this runs
-- ----------------------------------------------------------------------------
-- *A head that outran its log* argues it cannot exist: the counter row and the
-- event row commit together, so an append that has taken 287 has not published
-- 287 to anybody yet, and a reader still sees 286. `issued > present` is
-- therefore never a race.
--
-- The function takes the counter row `for update` anyway before it reads the
-- log. It is one row, held for two statements, and it turns "cannot happen by
-- this argument" into "cannot happen, and here is the lock". If an append is
-- mid-flight the repair waits for it, then reads a log that includes it and
-- finds nothing to do - which is the correct answer and not one that depends on
-- the argument being right.

create or replace function public.repair_tenant_event_sequence_heads()
returns table (
  tenant_id      uuid,
  /** What the counter said before. */
  was            bigint,
  /** What it says now: the highest tenant_seq that still exists, or 0. */
  now_at         bigint,
  /** How many cursors were sitting above the new head and were brought down. */
  cursors_moved  int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  uuid;
  v_was     bigint;
  v_present bigint;
  v_moved   int;
begin
  -- The candidates are picked without a lock first, so a healthy space is never
  -- blocked by a repair that was only ever going to skip it. The reading is
  -- re-taken under the lock below before anything is written, so a space that
  -- stops looking damaged in between is simply not repaired.
  for v_tenant in
    select s.tenant_id
      from public.tenant_event_sequences s
     where s.last_seq > coalesce(
             (select max(e.tenant_seq) from public.events e where e.tenant_id = s.tenant_id),
             0
           )
     order by s.tenant_id
  loop
    -- The lock, then a fresh read of the log. Separate statements on purpose:
    -- in read committed the second one takes its own snapshot, so it sees an
    -- append that was in flight and committed while we waited on its row.
    select s.last_seq
      into v_was
      from public.tenant_event_sequences s
     where s.tenant_id = v_tenant
       for update;

    select coalesce(max(e.tenant_seq), 0)
      into v_present
      from public.events e
     where e.tenant_id = v_tenant;

    continue when v_was <= v_present;

    update public.projection_checkpoints c
       set last_seq = v_present
     where c.tenant_id = v_tenant
       and c.last_seq > v_present;

    get diagnostics v_moved = row_count;

    update public.tenant_event_sequences s
       set last_seq = v_present
     where s.tenant_id = v_tenant;

    tenant_id     := v_tenant;
    was           := v_was;
    now_at        := v_present;
    cursors_moved := v_moved;
    return next;
  end loop;
end;
$$;

comment on function public.repair_tenant_event_sequence_heads() is
  'Bring each space''s counter back to the highest tenant_seq that still exists, and any cursor above it down with it. Only ever acts where committed rows were removed - `issued > present` - and replays nothing, because the new head is the last number that exists. Returns one row per space repaired, none when there is nothing to do. Safe to run again; it is a no-op the second time.';

revoke execute on function public.repair_tenant_event_sequence_heads() from public, authenticated, anon;
grant execute on function public.repair_tenant_event_sequence_heads() to service_role;

-- The repair itself, once, here. Deploying this migration is what fixes the
-- spaces that are already parked - including production's, whose 54 holes
-- started this - and the function stays behind for the next time somebody has
-- to ask whether any head has outrun its log.
do $$
declare
  repaired record;
begin
  for repaired in select * from public.repair_tenant_event_sequence_heads() loop
    raise notice 'repaired %: head % -> %, % cursors brought down',
      repaired.tenant_id, repaired.was, repaired.now_at, repaired.cursors_moved;
  end loop;
end;
$$;
