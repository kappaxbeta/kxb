# Scaling

How this app goes from one machine to several, what breaks when it does, and
what deliberately does not change.

Read this before adding a second app server, before putting anything in front of
Caddy, and before writing an autoscaler. It is written against the deployment in
`compose.yaml`, `Caddyfile` and `deploy.sh`.

---

## 1. Where we are

Two machines, both real, both mostly idle.

| | machine | cores | RAM | runs |
|---|---|---|---|---|
| app | Hetzner, `kxb.team` | 2 | 3.7 GB | Caddy + two Next.js containers |
| db | Strato, `backend.kxb.team` | 6 | 7.9 GB | the full self-hosted Supabase stack |

The app box runs two Next.js containers because Node is single-threaded and the
box has two cores. That is documented in `compose.yaml` and it is *not* a
distributed system: both containers are on one Docker network, share one bind
mount, and Caddy balances between them randomly.

Load at the time of writing is 0.08 on the app box and 0.38 on the database box.
Nothing in this document is urgent. It exists so that the day it becomes urgent
is a day of executing a plan rather than making one.

---

## 2. Why the app tier scales at all

Three properties, none of them accidental, and all three worth protecting when
writing new code.

**Requests carry their own identity.** Auth is a Supabase JWT in a cookie,
refreshed in `src/proxy.ts` on every request. There is no server-side session
table and no in-memory session store, so any node can serve any request from any
user. This is what makes sticky sessions unnecessary — see §5.3.

**Nothing opens a Postgres connection.** Every read and write goes over HTTPS to
PostgREST. There is no `pg` client anywhere in `src/`. This is the single
biggest reason horizontal scaling is cheap here: the usual failure mode — five
app nodes times twenty pooled connections exhausting `max_connections` — cannot
happen. The connection ceiling lives entirely on the database box, in PostgREST
and supavisor, and it does not move when app servers are added.

**Realtime bypasses the app tier completely.** Presence, chat, the multiplayer
lounge and the football ball all connect browser → `backend.kxb.team` directly.
No websocket terminates on an app server. Two consequences: adding app servers
does nothing at all for realtime load, and an app-tier deploy never disconnects
a live lounge.

The practical summary: **app servers are cattle, the database box is a pet.**
Everything in §6 follows from that.

---

## 3. What had to change, and why

### 3.1 Uploads — done

This was the one hard blocker. `/api/upload` wrote to `UPLOAD_DIR`, a host
directory bind-mounted into both containers, and `/api/uploads/[slug]` read it
back. Two containers on one box share that mount. Two boxes share nothing. A
file accepted by node B is a 404 from node A, at random, forever.

Files now live in a private Supabase Storage bucket
(`supabase/migrations/20260901000000_uploads_storage.sql`). What did **not**
change is the access check: `public.uploads` is still the authorization record,
the serving route still looks the slug up with the caller's own session, and RLS
on that table still decides whether a non-member gets a row or a 404. Only the
source of the bytes moved.

The bucket is private and has no `storage.objects` policies. Only the service
role touches it, only from those two routes. That mirrors what the bind mount
had — the filesystem was not public either; the route was the only door.

Two things to know about it:

- **It is slower per image.** A local disk read became a request to the database
  box. That is the price of statelessness, it is bounded by the `immutable`
  cache header, and the fix if it ever becomes hot is a 302 to a signed URL so
  the bytes never traverse Node at all. That was deliberately not done in the
  same change — a signed URL works without a session for as long as it lives,
  and trading a per-request check for a bearer capability deserves its own
  decision.
- **There is a temporary disk fallback.** `readObject()` in the serving route
  falls back to the old bind mount when an object is not in the bucket, so that
  deploying before running the backfill cannot 404 every existing image. It only
  works on a machine that has that mount. **It must be deleted before the second
  app server exists**, or it silently hides a failed copy.

Backfill, run from a workstation because the Hetzner box has no bun:

```bash
rsync -az hetzner:/mnt/volume-hel1-1/uploads/ ./uploads-backfill/
UPLOAD_DIR=./uploads-backfill bun run scripts/uploads-to-storage.ts
```

It is a dry run without `--apply`, it copies files and touches no rows, and it
is safe to re-run. Point the Supabase env vars at production, not at the local
stack — the script prints the host it is about to write to for exactly that
reason.

Unrelated but adjacent: `df` shows `/mnt/volume-hel1-1` resolving to `/dev/sda1`.
That "volume" is a plain directory on the root disk, which is 72% full. Once the
backfill is verified, the old files can go and take that problem with them.

### 3.2 Replica discovery

`HEALTH_PEERS` in `compose.yaml` lists `http://app:3000,http://app2:3000`.
Those are Docker compose service names and resolve on one host only. Across
machines they must become private-network addresses:

```
HEALTH_PEERS: http://10.0.0.2:3000,http://10.0.0.3:3000
```

This is only the health page (`src/domain/health/replicas.ts`), so getting it
wrong is cosmetic — except that the health page is the thing that tells you a
node is wedged, so a lying health page is worse than none.

Longer term this list should come from the same place the autoscaler gets its
node list, rather than from a hand-edited env var. Until nodes are created
automatically, hand-edited is honest.

### 3.3 Deploys must stop building on the box

`deploy.sh` rsyncs the working tree and runs `docker compose up --build` on the
server. With N boxes that is N builds of the same commit — on 2-core machines
that OOM easily, which is why `next.config.ts` already turns off type checking
during the build.

Worse than slow: if two boxes ever produce different builds, users get
`ChunkLoadError`, because Next.js chunk filenames are not stable across builds.
A browser that loaded its HTML from node A will request chunks that node B has
never heard of. The existing `--remove-orphans` comment in `deploy.sh` is about
this exact failure at container level; across machines it gets easier to hit and
harder to see.

So: **build once, ship a digest.**

1. Build locally (or in CI): `docker build -t registry/kxb-app:<sha> .`
2. Push to a registry — Hetzner has one, or self-host on the app box.
3. Each node pulls **the digest**, not the tag. Tags float; digests do not, and
   "all nodes run the same code" is the property being bought.
4. Roll one node at a time, waiting for `/api/health` before moving on.

The `NEXT_PUBLIC_*` build args stay build-time, which means changing one of them
still means a rebuild and a full roll. That is unchanged and unavoidable — they
are inlined into the client bundle.

### 3.4 Cron must stay on exactly one host

`/api/cron/sample-health`, `reap-guests`, `revoke-links` and `sync-entitlements`
are driven by lines in the Hetzner box's crontab that curl the public URL. That
design is already correct for a cluster: one caller, hitting the load balancer,
landing on whichever node — `sample-health` then fans out to every replica by
itself.

The trap is packaging. If the crontab ends up in the node image or in the
provisioning script, every new node starts firing the same jobs, and
`sync-entitlements` running four times concurrently is not a no-op. **Cron is a
property of one designated host, never of the image.** When that host is the one
being replaced, move the crontab first.

Only `sample-health` has an installer (`scripts/health-cron.sh`, tag
`# kxb-health`). The other three were installed by hand and are written down
here because that is the only copy — a rebuilt box loses them silently, and
nothing surfaces a sweep that never runs. Restore with `crontab -e`, tag
`# kxb-cron`, staggered off the `*/5` health minutes:

```
7 * * * * curl -fsS --max-time 120 -X POST -H "Authorization: Bearer $(grep -m1 ^CRON_SECRET= /opt/app/.env | cut -d= -f2-)" https://kxb.team/api/cron/revoke-links >/dev/null 2>&1 # kxb-cron
27 * * * * curl -fsS --max-time 120 -X POST -H "Authorization: Bearer $(grep -m1 ^CRON_SECRET= /opt/app/.env | cut -d= -f2-)" https://kxb.team/api/cron/reap-guests >/dev/null 2>&1 # kxb-cron
17 3 * * * curl -fsS --max-time 300 -X POST -H "Authorization: Bearer $(grep -m1 ^CRON_SECRET= /opt/app/.env | cut -d= -f2-)" https://kxb.team/api/cron/sync-entitlements >/dev/null 2>&1 # kxb-cron
* * * * * curl -fsS --max-time 50 -X POST -H "Authorization: Bearer $(grep -m1 ^CRON_SECRET= /opt/app/.env | cut -d= -f2-)" https://kxb.team/api/cron/project >/dev/null 2>&1 # kxb-cron
```

The last one is the projection sweep and its schedule is load-bearing in a way
the other three are not. `--max-time 50` and a 40s internal deadline are both
under the minute between runs, so two sweeps can never overlap — and two
overlapping sweeps are two projectors on one cursor, which is the thing the
sweep was built to stop happening. If it is ever moved off a one-minute cadence,
those two numbers move with it.

It is also the one where §3.4's rule bites hardest. Every node firing this job
is every node projecting the same events at the same moment; unlike
`sync-entitlements`, which merely wastes Stripe calls, this one reintroduces the
original bug at cluster scale.

`sync-entitlements` previously ran a `/opt/app/sync-entitlements.sh` that was
never deployed, so it failed nightly into `/var/log/entitlement-sync.log` for as
long as the line existed. Curl the route instead — there is no script.

Note the `--max-time 300` on that line is load-bearing rather than decorative.
The route is bounded to finish inside it: it prioritises accounts by what a
wrong answer costs, caps the work list, runs Stripe calls five at a time, and
stops *starting* new ones after four minutes. Its JSON reply carries `skipped`
for exactly that reason — a non-zero value every night means the run no longer
fits, and the schedule or the cap needs looking at. Before that, the job walked
every account serially and simply got killed part-way through with nothing
written down anywhere.

### 3.5 The Next.js cache is per-process

`revalidatePath` clears the cache of the node that ran it, and no other. This is
already true today across `app` and `app2`, and it is mostly moot because nearly
every page reads auth cookies and is therefore dynamic. The public marketing
pages are the exception, and they change when someone deploys anyway.

If it starts to matter, the fix is a shared `cacheHandler` in `next.config.ts`
backed by Redis. Do not build that speculatively — it adds a stateful component
to a tier whose entire value is not having one.

Related and already known: scene HUD actions skip `revalidatePath` entirely, so
`useOptimistic` silently reverts there. That is a local pattern, not a scaling
concern, but it is the same underlying fact.

---

## 4. Target topology

```
                         DNS: kxb.team
                              |
                    Load balancer  (TLS terminates here)
                     /        |        \
              app-1        app-2        app-N        ← identical image digest
                     \        |        /
                    private network 10.0.0.0/16
                              |
                    backend.kxb.team → Supabase (Strato)
                              ↑
              browsers connect here directly for Realtime
```

Caddy comes off the app nodes. The nodes then bind only to the private network,
so port 3000 is not merely unpublished but unreachable — a genuine improvement
over today.

---

## 5. The load balancer

### 5.1 Which one

**Hetzner Cloud Load Balancer** (~€6/month) is the default answer. It is managed,
it health-checks, it lives outside the machines it balances, and it can be
reconfigured through the same Cloud API `scripts/event-up.ts` already talks to —
which is what makes autoscaling a script rather than a project.

**A Caddy box** is the alternative: one small server running the Caddyfile that
is already written, with the upstream list extended. Cheaper, one more thing to
patch, and it is a single point of failure that the managed option is not. It is
the right choice only if something is needed that the Hetzner LB cannot do —
`uri_hash` balancing (§5.3) being the realistic example.

### 5.2 Configuration that matters

- **Health check** `GET /api/health` on port 3000, every 10s, 2 failures to
  remove. The route already exists and is cheap; `?deep=1` is the authenticated
  expensive one and must not be what the LB calls.
- **Draining.** Give in-flight requests time to finish before a node leaves the
  pool. Uploads are up to 10 MB, so 30s is a reasonable drain.
- **Proxy protocol / forwarded headers.** Caddy currently sets `X-Real-IP` by
  hand because some rate-limiting paths expect it. Whatever terminates TLS has
  to keep doing that, or every request appears to come from the load balancer —
  which quietly breaks analytics geolocation (`src/domain/analytics/geo.ts`) and
  any future per-IP limit.
- **TLS.** Moving termination to the LB means Let's Encrypt is no longer Caddy's
  job. Keep the `caddy_data` volume until the migration is confirmed; losing it
  and then needing to fall back means re-issuing into a rate limit.

### 5.3 Keeping a tenant on one server — don't

The instinct is to route all of one workspace's traffic to one node. Here that
is unnecessary, and buying it costs real things.

**Why it is unnecessary.** A node holds nothing about a tenant between requests.
Membership and role come from `tenant_role()` inside a Postgres RLS policy on
every query. The session is a JWT in a cookie. Uploaded files are in Storage
(§3.1). Event state is in the append-only log. Two consecutive requests from one
user can land on different nodes and produce byte-identical results, because
every fact either travels with the request or lives in the database.

**What it costs.** Affinity means uneven load — one busy workspace pins one node
while others idle, and the LB cannot help. It means a node's removal logs out or
degrades a specific set of tenants rather than a random slice of traffic. And it
makes deploys worse: rolling one node drops one tenant's requests entirely
rather than a share of everyone's.

**When it would become necessary:** only if a node starts holding per-tenant
state in memory — an in-process cache of a tenant's aggregate, a lock, a
subscription. If that day comes, note that the honest fix is usually to move the
state out, not to pin the traffic.

**If you still need it**, the mechanism depends on the layer:

- **Cookie affinity** (Hetzner LB supports it) sticks a *browser* to a node, not
  a tenant. Good enough for in-process caches, useless for anything that needs
  all of a tenant's traffic in one place, since a workspace has many browsers.
- **Hashing the path** is the one that can give real tenant affinity, and the
  obvious spelling of it does not. `lb_policy uri_hash` hashes the *whole*
  request URI, so `/t/acme/lounge` and `/t/acme/battle` are two different hashes
  and land on two different nodes — per-URL affinity, not per-tenant. Getting
  the tenant requires hashing only the slug: capture it with `path_regexp`,
  write it to a header, and balance on that header instead. Caddy can do this;
  the Hetzner LB cannot, which is the one strong argument for keeping a Caddy
  box in front. Note the failure mode either way — when the node set changes the
  hash re-maps and affinity is silently broken for a subset of tenants, which is
  exactly when you were relying on it. An explicit slug→group mapping avoids
  that at the cost of being a thing to maintain. See `docs/architecture/subdomains.md` §6.1.

**Real tenant isolation already exists and looks nothing like this.** An event
space can be given a whole machine — its own app, its own Supabase, its own
subdomain — by `scripts/event-up.ts`. See `docs/product/event-spaces.md`. That is the pattern
to reach for when a tenant genuinely needs a box: separate at DNS, not at the
load balancer, and with its own database rather than a shared one.

---

## 6. Scaling Supabase

The database box does not get an autoscaler. It gets, in this order:

1. **A bigger box.** 6 cores at load 0.38 has a lot of headroom, and vertical
   scaling has no correctness implications whatsoever. This will carry further
   than anything else on this list, and it is one reboot.
2. **More PostgREST.** `supabase-rest` is stateless, and under HTTP-heavy load it
   — not Postgres — is usually the CPU hog. Run 2–4 replicas behind Kong on the
   same box before doing anything cleverer.
3. **Supavisor**, already running as `supabase-pooler`, is what keeps step 2 from
   exhausting `max_connections`.
4. **Read replicas**, and only here does it get properly hard. Writes are
   event appends and must go to the primary; a read model served from a replica
   can be behind the event that just produced it, so a user sees their own action
   not happen. Treat this as a project with its own design document, not a config
   change.
5. **Realtime** scales worst of everything here — it is clustered Elixir with
   per-tenant rate limits that a self-host seed will happily reset on restart.
   If lounges are what grow, that box gets bigger rather than multiplied.

Sharding by tenant is not on this list. It is the last resort, it forecloses
cross-tenant queries the backoffice depends on, and every step above buys more
headroom for less risk.

---

## 7. Automation

The ingredients already exist: `scripts/event-up.ts` creates Hetzner servers
through the Cloud API with `HCLOUD_TOKEN`, and `health_samples` / `host_samples`
record CPU, memory and event-loop lag every five minutes.

An autoscaler is then: read the last N host samples → if sustained CPU or event
loop lag crosses a threshold, create a server from a snapshot, pull the image
digest, register it as an LB target → on the way down, deregister, drain, delete
oldest first.

**Build the manual pair first.** `scale-up.ts` and `scale-down.ts`, run by hand,
used for a few real events. Two reasons. Traffic here is *known in advance* —
events have dates — so scheduled scaling beats reactive scaling on the exact
workload this app has. And an autoscaler firing on the wrong signal costs money
continuously and adds a failure mode to the tier that was supposed to be simple.
Automate the trigger only after seeing which metric actually predicted trouble.

Whatever creates nodes must, in this order: pull the pinned digest, pass the
runtime `.env`, join the private network, **not** install a crontab (§3.4), and
only then register with the load balancer. Registering before the app is healthy
sends real traffic to a cold Next.js process.

---

## 8. Order of work

**Phase 0 — safe today, no topology change.**
Uploads to Storage (done; backfill still to run). `HEALTH_PEERS` by address.
Registry-based deploy. Cron pinned and documented as one host's job.

**Phase 1 — two machines.**
Private network, load balancer, Caddy off the app nodes, second app server.
Delete the disk fallback in `/api/uploads/[slug]` as part of this, not after.

**Phase 2 — automation.**
Manual scale scripts, used in anger. Autoscaling only once Phase 1 has run under
real load.

---

## 9. Checklist before adding node #2

- [ ] `scripts/uploads-to-storage.ts --apply` has run and reports 0 missing
- [ ] An image uploaded today serves correctly with the bind mount unmounted
- [ ] The disk fallback in `/api/uploads/[slug]` is deleted
- [ ] Both nodes run the same image digest, verified from the outside
- [ ] `HEALTH_PEERS` lists both by private address, and the health page shows two
- [ ] Exactly one host has the crontab
- [ ] The LB health check hits `/api/health`, not `?deep=1`
- [ ] `X-Real-IP` still arrives at the app
