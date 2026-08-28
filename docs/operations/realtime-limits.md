# Realtime limits — what they are, how to set them, and why these numbers

The per-tenant ceilings that Supabase Realtime enforces on the Strato box. They
are the reason a runaway client cannot take the backend down, and they are also
the most likely thing to be quietly wrong.

**The numbers live in
[`src/domain/health/realtime-limits.ts`](../../src/domain/health/realtime-limits.ts),
in one exported constant.** Three things read it and none of them keep a copy:

- [`scripts/realtime-limits.sh`](../../scripts/realtime-limits.sh) **sets** the
  box from it (via `scripts/realtime-limits-env.ts`, which prints it as shell
  assignments)
- the backoffice health page **checks** the box against it
- this document **explains** it

That arrangement is deliberate and it is the whole feature. A checker that keeps
its expectations somewhere other than the setter eventually disagrees with it,
and the first symptom is the page reporting drift that is really a typo — a
monitor that cries wolf gets switched off, and then it is not a monitor.

So: change the constant, run the script, and the page agrees by construction. If
this document ever disagrees with the constant, **the constant is right** and
this document is stale.

---

## 1. How to set them

```bash
./scripts/realtime-limits.sh
```

That is the whole procedure. It checks the seed is off, applies, reads the row
back, and fails loudly if what came back is not what went in.

To look without touching anything:

```bash
./scripts/realtime-limits.sh --status
```

To try different values without editing the script — useful on an event box:

```bash
REALTIME_EVENTS_PER_SEC=40000 ./scripts/realtime-limits.sh
```

**No restart is needed.** Realtime re-reads its tenant row on its own within
about a minute. This is lucky, because restarting is what used to break it
(§3).

`scripts/supabase-restart.sh` calls this script at the end of every run, so a
restart re-asserts the limits rather than losing them.

### Doing it by hand

If you ever need to bypass the script, the two things it gets right that a bare
`psql` will not:

```sql
-- as supabase_admin, NOT postgres: postgres can SELECT this table but its
-- UPDATE fails with "permission denied for table tenants"
UPDATE _realtime.tenants
   SET max_events_per_second   = 25000,
       max_concurrent_users    = 10000,
       max_bytes_per_second    = 25000000,
       max_joins_per_second    = 2000,
       max_channels_per_client = 500
 WHERE external_id = 'realtime-dev';
```

```bash
ssh strato "docker exec supabase-db psql -U supabase_admin -d postgres -c \"...\""
```

Use `psql -c`. Never pipe a heredoc into `docker exec -i psql` on this box — a
hung one wedges the Docker daemon and takes the whole stack with it.

And **read the row back afterwards.** An UPDATE against a tenant name that does
not exist affects zero rows and exits 0.

### `updated_at` does not move when you apply

There is no trigger on that column, so an UPDATE leaves it reading whatever it
read before. After a successful run it will still show the date of the last time
the row was *created*, not the last time it was changed.

This matters because the timestamp is load-bearing in the other direction. A
seed revert is a `delete` + `insert`, which stamps a fresh one — so `updated_at`
suddenly matching a restart time is still the signature of §3 happening again.
It just is not, and never was, confirmation that an apply worked. The values
themselves are the only confirmation of that, which is why the script compares
them.

---

## 2. The numbers, and why each one

Sized for roughly **1 000 spaces with a peak on the order of 500 concurrent
players**.

| Limit | Was | Now | Sized against |
|---|---|---|---|
| `max_events_per_second` | 5 000 | **25 000** | ~16 000/s worst case at 500 players, plus headroom |
| `max_concurrent_users` | 1 000 | **10 000** | browser tabs, not players — one person can be two |
| `max_bytes_per_second` | 10 MB | **25 MB** | ~2.5× the draw at the event ceiling |
| `max_joins_per_second` | 500 | **2 000** | the deploy thundering herd, not steady state |
| `max_channels_per_client` | 100 | **500** | headroom, not a measured need — see below |

**Every one of these is a circuit breaker, not a capacity setting.** Raising one
does not make the box faster. It changes what happens when the box is asked for
more than it has, and the answer you want is "one tenant gets throttled", not
"the BEAM saturates". Realtime shares six cores with Postgres, Kong, GoTrue and
Storage, so an unbounded Realtime is an outage of *login and the database*, not
of multiplayer.

The measured hardware ceiling is about **63 000 messages/s** — 40 players across
10 rooms produced ~1 900 msg/s at 18% of one core out of six. Every value above
sits well inside it on purpose.

### Where 25 000 events/s comes from

Movement costs `SEND_HZ × M × (N-1)` deliveries per second per room, with M
moving out of N present. Quadratic inside a room, linear across rooms.

500 players spread over ~100 rooms:

- standing around and chatting → **~4 000/s** (an idle player sends one keepalive
  every 2 s, not 8 frames)
- a football match on every pitch → **~16 000/s**

25 000 covers the worst of that with room to spare, and is ~40% of what the
hardware can do — which is what keeps it a working brake rather than a
decoration.

### `max_channels_per_client` — headroom, and what it costs

Raised 100 → 500 as a deliberate call, and the reasoning is recorded because
this is the one limit here that is **not** sized against a measured need.

A browser holds about five channels at a time — lounge presence, room presence,
chat, radio, an xp host — and chat *swaps* its topic when the rail changes room
rather than accumulating one per room, so the working set does not grow with the
number of rooms in a space. 100 was already twenty-fold headroom; 500 is a
hundred-fold.

What the raise costs: this limit's real job is catching **a subscription leak in
our own client** — the React effect that subscribes on every render and never
unsubscribes. That bug reaches 500 about as fast as it reaches 100, so the
protection is not lost, but the moment it announces itself arrives later and a
leaking client holds five times the Realtime state before it does.

What it buys concretely: the elected-client relay in
coalescing-design.md (Option A) has
a room's owner subscribe to one ingress topic per player, and at 100 this limit
was what capped room size in that design. That design is not being built — but
if it ever is, this is no longer the thing standing in the way.

---

## 3. The failure this all exists because of

Realtime's `priv/repo/seeds.exs` does `Repo.delete!(tenant)` followed by
`Repo.insert!`. With `SEED_SELF_HOST: "true"` that runs **on every boot**,
destroying the row and recreating it at the schema defaults. There is no env var
for the limits, so there is no "just configure it properly" option.

On 2026-07-31 this presented as: UPDATE the limits, restart to clear the cache,
measure no improvement at all. The giveaway was `updated_at` on the tenant row
matching the restart time to the second.

So two things must both hold, and `realtime-limits.sh` checks the first before
doing anything:

1. `SEED_SELF_HOST: "false"` in `/opt/supabase-project/docker-compose.yml`
2. the row itself carrying the right values

**What it looks like when this is lost is not an outage.** From
optimization1.md, measured back when the
limit was the stock 100:

| Players in one room | Frames delivered |
|---|---|
| 3 | 50.7% |
| 10 | **8.6%** |
| 16 | 6.0% |

Nine movement frames in ten silently dropped. That reads to everyone involved as
"the netcode got worse", not as "a config value reverted" — which is why the
restart script re-asserts rather than merely checking.

---

## 4. The client-side number that has to match

`NEXT_PUBLIC_REALTIME_BUDGET` (default in
[`src/domain/events/presets.ts`](../../src/domain/events/presets.ts)) is what
the event console compares a planned room layout against before an operator
commits to it. It throttles nothing — it is a warning threshold.

It must track `max_events_per_second` anyway. If the server allows 25 000 and
the console thinks 5 000, it starts flagging perfectly safe events as over
budget; operators learn the warning is noise, and it stops working on the day it
is right.

Two traps:

- It is `NEXT_PUBLIC_*`, so it is **inlined at build time**. `deploy.sh
  --env-only` cannot change it and will not say so.
- If it is set as a CI repo variable, that wins over the default in the source.

Event boxes set their own via `scripts/event-box/setup.sh` and should keep doing
so — a box provisioned at 20 000 should say 20 000, not whatever kxb.team runs.

---

## 5. What to do when a limit is actually hit

Look for `MessagePerSecondRateLimitReached` in the Realtime logs:

```bash
ssh strato "docker logs realtime-dev.supabase-realtime --tail=200" | grep -i ratelimit
```

Then, in order of preference:

1. **Cap room size in the product.** Cost is quadratic in players-per-room and
   linear in rooms, so two rooms of 12 are about half the traffic of one room of
   24. This is a product decision that buys the same headroom as a rewrite.
2. **Widen `POSITION_EPSILON`**, so slow drift stops costing full-rate frames.
3. **Drop `SEND_HZ` from 8 to 6.** Another 25%.
4. **Raise the limit**, if the box has the headroom — check Realtime's actual CPU
   first rather than assuming.

Only after all four, and only if a room of 25+ moving players is a real product
requirement, does the relay service in
coalescing-design.md become the
answer.
