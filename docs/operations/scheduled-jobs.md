# Scheduled jobs — what runs on a clock, and what breaks when it stops

Five jobs keep things true that nothing else keeps true. Four are the app's and
live in one crontab; the fifth is the health sampler and has its own script.

**Every one of them fails silently.** `curl -fsS` prints nothing on an HTTP
error it was told to fail on, output goes to `/dev/null`, and none of them have a
user waiting on them. So the interesting question for each is not "what does it
do" but **"what goes wrong, and how would I ever notice"** — which is what this
page is organised around.

---

## 1. The jobs

| Schedule | Job | Stops happening if it stops |
|---|---|---|
| every minute | [`project`](../../src/app/api/cron/project/route.ts) | read models silently drift from the log |
| `7 * * * *` | `revoke-links` | expired guest links keep working |
| `27 * * * *` | [`reap-guests`](../../src/app/api/cron/reap-guests/route.ts) | one anonymous account per visitor, for ever |
| `17 3 * * *` | [`sync-entitlements`](../../src/app/api/cron/sync-entitlements/route.ts) | a lapsed subscription keeps its access |
| `*/5 * * * *` | `sample-health` | the health page has live probes but no history |

The first four carry the tag `# kxb-cron` and belong to
[`scripts/app-cron.sh`](../../scripts/app-cron.sh). `sample-health` and the two
host agents carry `# kxb-health` and belong to
[`scripts/health-cron.sh`](../../scripts/health-cron.sh). Two tags, two scripts,
and neither touches the other's lines.

---

## 2. Installing them

```bash
./scripts/app-cron.sh install
```

Idempotent — it drops its own tagged lines and rewrites them, so running it
twice leaves four lines rather than eight. Also run automatically at the end of
every **production** deploy, which is the point: a rebuilt box gets its schedule
back without anyone remembering.

```bash
./scripts/app-cron.sh status      # what is installed, both tags
./scripts/app-cron.sh stop        # comment them out, change nothing else
./scripts/app-cron.sh start       # uncomment
./scripts/app-cron.sh uninstall   # remove
```

`stop` comments rather than deletes, deliberately: during an incident the useful
action is "stop this for twenty minutes", and if that meant uninstalling then
turning it back on would mean re-deriving the schedule at 3am.

### It refuses without `CRON_SECRET`

The installer checks `/opt/app/.env` before writing anything. That check is not
politeness — without the secret every job sends `Authorization: Bearer ` and
takes a 401 **every hour for ever**, printing nothing, while the crontab looks
perfectly correct in `crontab -l`. A schedule that exists and does nothing is
worse than one that is missing, because the missing one gets noticed.

---

## 3. The traps

### 3.1 One host, never the image

Cron is a property of one designated machine. Put these in the image and every
node fires them. `sync-entitlements` running four times merely wastes Stripe
calls; **`project` running on four nodes is four projectors on one cursor**,
which is the bug the sweep exists to end.

`deploy.sh` installs it because `deploy.sh` targets exactly one `DEPLOY_HOST`
and always has. If it ever loops over nodes, that call has to move out of the
loop. The comment beside it says so; this is the second place, because that is
the kind of thing one place is not enough for.

### 3.2 Develop must never sweep

`compose.dev.yaml` uses `env_file: /opt/app/.env`, so **dev.kxb.team runs
against production's database** and holds production's `CRON_SECRET`. A crontab
line pointed at `dev.kxb.team/api/cron/project` would authenticate perfectly and
drain production's projections alongside the real sweep.

Three locks, and the third depends on neither of the others:

1. nothing points a crontab at dev
2. `deploy.sh --dev` returns before the block that installs one
3. `PROJECTION_SWEEP: "off"` in the dev service, honoured by the route

The first two are both "somebody would have to do the wrong thing". The third is
not.

Develop's *inline* projections still run and still write production read models.
That is unchanged and is what "connected to prod" already meant.

### 3.3 The sweep's timing is arithmetic, not taste

`--max-time 50`, a 40s deadline inside the route, one-minute cadence. Two of
those three are under the third so **two sweeps can never overlap**. Change the
cadence and both numbers change with it.

### 3.4 `reap-guests` used to delete the log, and the sweep is how it showed

The one already sprung, and the only one on this page that had consequences.

`reap-guests` deletes anonymous accounts. `events.actor_id` referenced
`auth.users` **`on delete cascade`** from the day the table was written, so every
visitor collected took their events out of the append-only log with them — the
one writer in the system permitted to delete history, running hourly, against
the visitors who had just played a match.

The damage never surfaced as a failure. It surfaced as a *hole* in
`events.tenant_seq`, which parks every projection behind it: `alpha` carried 54,
all of them between `battle` events, and `magazine_read_model` read as empty for
a week on a space that had been filling it. The whole story is in
[event-sourcing.md §3.2](../architecture/event-sourcing.md) and in the three
migrations that met it from each side.

Fixed in `20261223000000` — `on delete set null`, which is what every other "who
did this" column in the schema already does. **The job itself is unchanged and
still right**: an account nobody can sign into is litter, and collecting it is
housekeeping. What changed is that collecting it no longer costs the space its
history.

The lesson for anything added to this crontab: a scheduled job that deletes
rows deletes everything a foreign key hangs off them, and the cascade is not
written where the job is. `reap-guests` is 160 lines of comments about which
accounts are safe to collect, and none of them could have told you this,
because the deletion it was doing was three tables away.

---

## 4. Is it working?

### The sweep

Ask it. This is the same call cron makes, so it is safe to run by hand:

```bash
ssh hetzner 'curl -sS --max-time 50 -X POST -H "Authorization: Bearer $(grep -m1 ^CRON_SECRET= /opt/app/.env | cut -d= -f2-)" https://kxb.team/api/cron/project'
```

Healthy steady state:

```json
{"pending":0,"swept":0,"applied":0,"failed":0,"errors":[],"spaces":7,"projections":15,"remaining":0,"ms":274}
```

| Field | Healthy | What it means otherwise |
|---|---|---|
| `pending` | 0 | how many projection/tenant pairs were behind at the start |
| `remaining` | **0** | behind *and not reached* before the deadline |
| `failed` | 0 | a projection threw; `errors` names which |
| `skipped` | absent | present means `PROJECTION_SWEEP=off` on this deployment |

**`remaining` is the number to watch.** Non-zero on one run is a backlog after a
quiet period. Non-zero run after run means the sweep no longer keeps up in a
minute, and the answer is a shorter interval or its own process — not a bigger
batch, which only makes each run longer.

`pending` being large while `remaining` is 0 is normal and good: it found work
and finished it.

### Everything else

```bash
./scripts/app-cron.sh status
```

If a job's effects have stopped but the line is there, check the box can reach
`https://kxb.team` at all, then run the curl by hand without `-fsS` so it prints
what it has been swallowing.

---

## 5. Event boxes

An event box gets its own crontab from
`scripts/event-box/setup.sh` at provisioning time — `project`, `reap-guests` and
`revoke-links`, pointed at its own domain, authenticated with its own
`CRON_SECRET` minted alongside its other secrets.

`sync-entitlements` is deliberately absent. An event box has no Stripe customers
— the space is provisioned by an operator, not bought — so it would page every
account nightly to ask a question with no answer.

**The sweep matters most here.** An event is the most guest-heavy thing this
product does: eighty strangers through a link, writing to a space none of them
are members of, which is exactly the shape that produces the silent no-op the
sweep repairs (see
[event-sourcing.md §3.1](../architecture/event-sourcing.md)). Event boxes had no
crontab at all until 2026-08-13.

Deploys do **not** update a running event box — that isolation is the point, and
it means a box provisioned before a change keeps running what it was built with.

---

## 6. Related

- [architecture/event-sourcing.md §3.1](../architecture/event-sourcing.md) — why
  there are two projectors and why the sweep is the authority
- architecture/scaling.md §3.4 — cron in a
  multi-node world
- [operations/realtime-limits.md](realtime-limits.md) — the other thing on these
  boxes that fails silently
- deploy.md — what a deploy does and does not touch
