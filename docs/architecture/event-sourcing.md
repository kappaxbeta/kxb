# Event sourcing and CQRS

How a command becomes events, how events become read models, and which of the
textbook rules this codebase deliberately breaks.

Read this before adding a domain module, before moving a rule between the
decider and SQL, and before any refactor of `src/es/`. It is written against
`src/es/{types,command,store,projection,errors}.ts`,
`supabase/migrations/20260725090000_event_store.sql` and
`supabase/migrations/20260725130000_tenants.sql`.

Accounts and RLS are next door in [accounts.md](../operations/accounts.md); known defects are
in [audit.md](../operations/audit.md).

---

## 1. The core, in five files

`src/es/` is about 500 lines and knows nothing about any domain. Everything in
it works for any aggregate.

| File | What it holds |
|---|---|
| `types.ts` | `DomainEvent`, `StoredEvent`, `EventMetadata`, the `Decider` interface, `fold()` |
| `command.ts` | `executeCommand()` — the entire write side |
| `store.ts` | `loadStream`, `readAllFrom`, `appendToStream` — the only Supabase-aware file |
| `projection.ts` | `Projection`, `runProjection`, `resetProjection` |
| `errors.ts` | `DomainError` vs `ConcurrencyError`, and which Postgres codes mean "retry" |

**The aggregate contract is the `Decider`** (`types.ts:80-92`): a `streamType`
tag, an `initialState`, a pure `evolve(state, event)` and a pure
`decide(state, command)`. `decide` returns the events to append, `[]` for a
legitimate no-op, or throws `DomainError`. No I/O appears anywhere in it, which
is what makes the domain unit-testable without a database
(`src/domain/tenants/aggregate.test.ts` is 898 lines of exactly that).

Event payloads are constrained to `JsonValue` (`types.ts:13-19`) so a `Date` or a
class instance is a compile error rather than a silently mangled jsonb value —
and since events are immutable, that mangling would be permanent.

---

## 2. The write path

`executeCommand()` (`command.ts:40-89`) is four steps and a retry loop:

```
1. load    loadStream(tenantId, streamId)            → full history, oldest first
2. fold    fold(decider, history)                    → current state
           expectedVersion = history.at(-1)?.version ?? 0
3. decide  decider.decide(state, command)            → events, [] or DomainError
4. append  appendToStream(… expectedVersion …)       → guarded by what we read
```

If step 4 loses the race, the loop **starts over from step 1** — reload,
re-fold, **re-decide**. It does not re-push the same events at a new version.
That is the entire point of optimistic concurrency: the second writer gets to
reconsider against what actually happened. Default `maxRetries` is 3.

### Optimistic concurrency is enforced twice

1. `append_events()` reads `coalesce(max(version), 0)` and raises `40001` when it
   does not match `p_expected_version` (`20260725130000_tenants.sql:506-516`).
2. The unique constraint `(stream_id, version)` (`20260725090000_event_store.sql:29`)
   is the **real** guarantee — it fires when two writers pass the version check
   simultaneously, raising `23505`.

Both codes map to `ConcurrencyError` (`errors.ts:39-50`), which is the only
error `executeCommand` retries. `DomainError` is never retried: the user has to
change something.

### Why the append is the one thing in SQL

`append_events()` is the only write that bypasses the query builder, because
checking the version and inserting the batch must share a transaction. It is
`security invoker`, so RLS still applies and it cannot be used to write on
somebody else's behalf. It also enforces that **a stream never changes tenants**
(`stream_tenant()`, `tenants.sql:498-504`) — without that, a member of tenant A
who learned a stream id in tenant B could append rows tagged A into B's stream
and corrupt B's version sequence invisibly, since RLS would hide the evidence.

Deciding *what* to append and projecting the result both stay in TypeScript.

---

## 3. The read path

A `Projection` (`projection.ts:17-23`) is a `name` (which **is** the checkpoint
key — renaming replays from zero), a `streamTypes` filter, and an idempotent
`handle`. `runProjection` pulls the cursor and the events after it in one call
(`events_since_checkpoint`), applies the matching ones, and upserts the cursor
after each batch.

### 3.1 Two projectors, one log

There are **two** cursors over every projection, and the difference between them
is the whole design:

| | runs | as | cursor | job |
|---|---|---|---|---|
| inline | after each command, in the request | the user | `<name>` | keep the UI instant |
| sweep | `/api/cron/project`, every minute | service role | `<name>@worker` | be correct |

The inline pass is why an action returns and `revalidatePath` re-renders showing
the new row. It is also **allowed to be wrong**, and it is wrong in two ways
that have nothing to do with each other:

- **It runs as the user.** A guest's RLS refuses writes to member-only read
  models — and *an UPDATE matching no row under RLS is zero rows, not an error*.
  The projection sees success, the checkpoint moves, the fact is gone. Measured
  on a real database in `20261025000000`, repaired there for three tables by
  widening policies, still live as a mechanism everywhere else.
- **There is one projector per in-flight request**, all racing on one cursor.

The sweep runs behind them as the service role on its own cursor and repairs
whatever was dropped. Separate cursors are what make that possible: sharing one
would let the inline pass move it past an event it silently failed to write,
hiding that event from the thing that exists to catch it.

Running both over the same events is safe by the rule below — `handle` was
always required to be idempotent, and this makes the requirement continuous
rather than occasional.

Adding a projection means adding it to `src/domain/projections.ts`, or the sweep
never sees it. A test walks `src/domain` and fails if one is missing, because
the symptom otherwise is a read model that is *nearly* right.

### 3.2 Why the cursor is per tenant

`events.tenant_seq` is contiguous **within a tenant** — 1, 2, 3 — while
`global_seq` is one counter shared by everybody. That distinction is the fix for
a bug this codebase carried for a long time: identity values are handed out at
INSERT and rows appear at COMMIT, so two members of one space writing at once
could be read out of order, and the projection would move its cursor past the
one that had not landed. With a global counter you cannot tell that gap from
another tenant's write; with a per-tenant one it is unambiguous.

The counter lives in a **table row** (`tenant_event_sequences`), not a sequence,
and that is the load-bearing choice: `nextval()` does not roll back, which is
exactly why identity columns leave holes. A row does. So the lock taken to
allocate is held to commit, allocation order *is* commit order, and the
out-of-order window does not exist.

`events_since_checkpoint` stops at the first hole anyway. That check should be
unreachable — it is there because an invariant you can verify beats one you have
to trust, and this one used to be trusted. `e2e/projections.e2e.ts` forces a hole
and asserts the reader refuses to cross it.

#### The hole was reachable, and a foreign key was making it

That check fired. It had been firing on production since 2026-08-13, and the
reason is worth the space because nothing in this file's model of the world
allowed for it: **the log is
not append-only if something can delete from it, and a foreign key is not
something the policies can see.**

    events.actor_id uuid references auth.users (id) on delete cascade

The column was called `owner_id` when that line was written, and cascade was the
right answer to *that* question. `20260725130000` renamed it to `actor_id`,
saying in as many words that the column "never meant 'who owns this data' as well
as it meant 'who wrote this row'", and left the delete rule underneath the new
name. Meanwhile `/api/cron/reap-guests` deletes anonymous accounts every hour,
which is its job and a good one. Every visitor it collected took their events
with them.

So `alpha` accumulated 54 holes, every one of them between two `battle` events —
battle being the one stream type a guest may write — and twelve projections sat
parked behind them. `magazine_read_model` had no rows at all on a space that had
been filling it for a week. Every command had succeeded; the events were written;
they were simply not there any more.

Three migrations, from three sides:

| | |
|---|---|
| `20261216000000` | the reader steps over a hole once the row after it is five minutes old — nothing that could still arrive is being skipped |
| *A head that outran its log* | a hole at the *end* has no row after it, so it can never age out; the sweep counts those pairs as `parked` instead of pretending to work. Written against version `20261222000000`, which `develop` had already spent — it needs renumbering before it can reach production, where it has never run |
| `20261223000000` | `on delete set null`, so the deletion stops happening |

`actor_id` has been nullable since `20260725150000`, when a Stripe webhook needed
to write an event with no session behind it, and NULL has meant "nobody" ever
since. What the third migration adds is a second way to arrive there: the person
is gone, rather than there never having been one. A tombstone account was the
alternative and is the same mistake that migration already refused — borrowing an
id to satisfy a column puts a false fact in an immutable log — and `restrict`
would have made the reaper fail on every guest who had ever played a match.

Two consequences worth carrying forward, because neither is where you would look:

- **`tenant_is_unclaimed()` compares `actor_id` to `auth.uid()`**, and `<>`
  against NULL is NULL, which is not true, which would have counted an actorless
  event as *nobody's*. A space whose every surviving actor had been deleted would
  have read as unclaimed and let any signed-in user append into it. It asks with
  `is distinct from` now.
- **Three read-model columns could no longer be rebuilt.**
  `battle_participants.user_id`, `battle_scores.user_id` and
  `xp_grants.account_id` are NOT NULL, reference `auth.users`, and take their id
  from the event's *data* rather than its actor — so no null check sees them
  coming, and replaying a `PlayerJoined` naming a reaped guest raises a foreign
  key violation that fails the projection for ever. Their constraints are gone.
  A foreign key from a derived table to an account asserts that the log cannot
  outlive the account, which is the assertion being removed. Keep the rule when
  adding a read model: **it must be able to represent everything the log can
  hold**, or §3's promise that you can drop it and replay is not true.

`repair_tenant_event_sequence_heads()` cleans up after the damage already done.
It brings a space's counter back to the highest `tenant_seq` that still exists
and any cursor above it down with it, which reissues numbers that were once
handed out — safe because nothing but `projection_checkpoints` remembers a
`tenant_seq`, because `events_tenant_seq_unique` turns a collision into a
retryable error rather than a duplicate, and because clamping a cursor to the
last number that exists replays nothing: there is no event between there and
where it was.

The cost: appends to *one* space serialize, for the length of an insert. Spaces
do not block each other. Cross-tenant features are unaffected — no event belongs
to two tenants, so each side of a raid keeps its own contiguous sequence.

`handle` **must be idempotent**, because the checkpoint is written after the
batch: a crash between applying an event and saving the cursor replays that
event. Assignments (`set title`) are naturally idempotent; counters and appends
are not. The battle projection is the model to copy — goal rows are inserted
with `ignoreDuplicates`, and the score is **recounted from rows, never
incremented** (`src/domain/battle/projection.ts:119-158, 271-297`).

`resetProjection()` zeroes the checkpoint. That is the party trick: the read
model is disposable, so you can change its shape and rebuild it from history
without migrating any data.

---

## 4. Trusted vs untrusted projections

This is the single most load-bearing decision in the codebase.

Ordinary read models are built in TypeScript, are allowed to lag, and are
**written by the signed-in user**. Membership cannot work that way, for two
reasons (`tenants.sql:96-121`):

1. **RLS depends on it.** If "am I an admin" is answered by a table the user may
   write, any member can `UPDATE` their own row to `role='owner'`.
2. **Timing.** Creating a tenant or accepting an invitation has to allow the
   *next* event in the same batch. An async projection that catches up "soon" is
   too late — the second INSERT is already being policy-checked.

So `tenant_members` and `tenant_invitations` are maintained by a `SECURITY
DEFINER` trigger on `public.events` (`sync_tenant_authorization`,
`tenants.sql:366-451`), in the same transaction as the append, and have **no
INSERT/UPDATE/DELETE policies at all**. They are still derived data — drop them,
replay the log, get them back — but derived synchronously and by the database.

The trigger is deliberately dumb: it records what the event says. The decider in
`src/domain/tenants/aggregate.ts` decided whether the event was allowed. Keeping
the rules in TypeScript and only the consequence in SQL is what stops the
trigger becoming a second, divergent implementation of the domain.

> **The rule of thumb** (`tenants.sql:118-120`): projections that answer *"what
> should I render"* can be async and rebuildable. Projections that answer *"what
> am I allowed to do"* cannot.

---

## 5. What a domain module looks like

| File | Contract |
|---|---|
| `events.ts` | Event types as `DomainEvent<'Name', {…}>` unions + an `X_STREAM_TYPE` constant. Deprecated fields stay optional forever — old history still has them |
| `commands.ts` | Command union + zod schemas. Where a rule is also a DB constraint, both copies exist on purpose (slug regex: `commands.ts` ↔ `tenants.sql:90-92`) |
| `aggregate.ts` | The `Decider`. `evolve` is total and never throws — unknown event types fall through to `return state`, so a stream written by newer code still replays |
| `projection.ts` | A `Projection` writing a `*_read_model` table. Idempotent assignments only, everything derived from the stored event, never from a session |
| `queries.ts` | Read side. Touches read models only, **never replays aggregates**, and takes `tenantId` explicitly even though RLS would scope it anyway |
| `actions.ts` | `'use server'`: authenticate → validate → `executeCommand` → `runProjection` → `revalidatePath` |

Action-layer invariants worth stating out loud:

- `actorId` comes from the session, **never** from a client argument.
- Membership is proven by `requireTenant(slug)` *before* the command; the decider
  then re-checks the role against folded state (`requireRole`).
- A tenant's `streamId` **is** its `tenantId`.

---

## 6. Deviations from the textbook (all deliberate)

1. **Projections run synchronously, in-request, after each command**
   (`projection.ts:66-72`). No queue, no worker. The `Projection` interface is
   shaped so a background worker could drive the same objects unchanged.
2. **The trusted/untrusted split** of §4.
3. **Set-based validation escapes the aggregate.** "No two tenants share a slug"
   is a rule about the *set* of tenants, and a decider only sees its own stream.
   So the slug is claimed in `tenant_slugs` *before* `TenantCreated`, and a lost
   race surfaces as a 23505 the action turns into "that URL is taken"
   (`tenants.sql:63-78`).
4. **PII stays out of the log.** Every member can read the whole stream — and
   must, in order to append — so invitee emails live in
   `tenant_invitation_emails` beside the log, referenced by a `token:` key.
5. **External facts are injected into commands, not read by deciders.** Seat
   limits and feature flags are I/O; the action resolves them and passes them as
   command fields.
6. **Dual enforcement is avoided on purpose.** Capability ceilings are enforced
   only in SQL (`event_guest_may_write()`); the decider knowingly lets a host
   switch on something the platform ceiling forbids, and the database ANDs them.
   See events.md §2.
7. **No snapshots.** Every command replays the full stream (`store.ts:33-35`).
   Fine at current sizes; snapshotting is the named fix when a stream passes a
   few hundred events.
8. **Not everything is event-sourced**, and that is not an oversight. Challenges,
   contact messages, event bookings, `event_spaces`, `event_machines` and guest
   admissions are plain tables. ES is used where history and rules pay for it.

   The line, stated once so it does not have to be re-argued per feature: **the
   log records what the platform did, not what a game remembers.** A project was
   created, a version was saved, a space published something — those are facts
   about us and they belong in the log. A player's coin count inside somebody's
   arcade game is not; it changes several times a second, has no audit value,
   and appending it forever produces a stream that must be folded from the
   beginning to answer one number. So XP saves are planned as a row with
   last-write-wins, and a game that genuinely wants history asks for it through
   a separate `append` call rather than getting it by accident on every write.
   See xp-scenes.md §3.3.
9. **The platform actor escape hatch.** `command.platform: true` (backoffice
   only) bypasses exactly one check — `requireRole` — and never a space
   invariant like last-owner (`20260903000000_backoffice_stream_writes.sql`).

---

## 7. Seams, coupling, and what a refactor touches

**Clean seams** — change behind these without touching the domain:

- **The store.** Everything in `src/es/` takes `SupabaseClient<Database>`
  (`store.ts:6`). Swapping storage means reimplementing three functions:
  `loadStream`, `readAllFrom`, `appendToStream`.
- **The projection scheduler.** `Projection` objects are already decoupled from
  what drives them. Moving to async workers changes `runProjection`'s *call
  sites*, not the projections.

**Coupling worth knowing before you start:**

- **Every action repeats execute → project → revalidate.** Each domain has its
  own private `dispatch()` helper (e.g. `tenants/actions.ts:67-96`); there is no
  shared one. A generic dispatcher is the obvious extraction, and it is where a
  fix for the unguarded-`runProjection` failures in [audit.md](../operations/audit.md) would
  naturally live.
- **Three rules are duplicated in SQL by design**: the slug regex, the
  capability default-on rule, and the trigger's event-type names. **Renaming an
  event type means editing `sync_tenant_authorization`.**
- **The projection `name` is the checkpoint key.** Renaming replays from zero.
- **`SpaceCapabilitySet` is a read-modify-write on a JSONB column**
  (`tenants/projection.ts:59-84`) — safe only while a single `runProjection`
  pass per tenant is the sole writer. Any move to concurrent projection workers
  breaks it first.
- **RLS is a parallel authorization system.** `requireTenant` (404 at the page),
  `requireRole` in the decider (domain error), and RLS policies (final backstop)
  answer overlapping questions. Changing role or membership semantics means
  changing all three.

**Known correctness gap, documented in-code** (`projection.ts:73-81`):
`global_seq` identities are handed out *before* commit, so a slow transaction can
commit after a later one and be skipped by the cursor. This was impossible when
one user's commands were serialised by their own request; with shared tenants
two members writing at once can interleave that way. The named fixes are a
transactional outbox or a `pg_current_snapshot()`-based cursor. The "Replay
events" button is the cheap escape hatch until then.

---

## 8. Bootstrap: the one hole in the policy model

Creating a tenant means appending `TenantCreated` *before* any membership
exists, so the insert policy cannot require membership. The hole is
`tenant_is_unclaimed(t)` — "nobody other than me has ever written to this id"
(`tenants.sql:198-219`).

It is safe because it closes itself: every route by which a second person enters
a workspace writes an event (`InvitationAccepted` by the joiner, `MemberRemoved`
by the remover), so a tenant with more than one participant is never unclaimed
for anybody.

The same branch had to be added to the **SELECT** policy
(`20260725140000_tenant_bootstrap_read.sql`) for two reasons that are easy to
rediscover the hard way:

1. `append_events()` ends in `INSERT … RETURNING *`, and Postgres applies SELECT
   policies to returned rows. The creator could write the row and then be
   refused sight of it.
2. `executeCommand`'s retry re-reads the stream. During bootstrap that read came
   back empty, so a retry decided against version 0 and conflicted forever.

Whatever lets you write into an untouched tenant must also let you read it.
