# Capacity — the ceilings, where each one lives, and how to raise it

The app has no single "capacity" number. It has half a dozen ceilings, each
put in by a different part of the stack for a different reason, and the one
you hit first depends on what the crowd is doing. This page lists them from
the front door inwards, and for each: what it bounds, where it is set, how to
change it, and what it looks like from the outside when it is the one being
hit. Read it before an event; reach for it when "people cannot get in".

Related: [realtime-limits.md](realtime-limits.md) for the Realtime tenant
ceilings (their own page, because the numbers are subtle),
../architecture/scaling.md for adding a second
app box, ddos.md for capacity that is being *taken* rather than used.

---

## 1. Guests at the door — GoTrue's anonymous sign-in limit

**What it bounds.** How many anonymous accounts GoTrue will mint per hour,
per client IP. Every guest walking through `/g/<token>` is one anonymous
sign-in (a signed-in member is not; they enter as themselves).

**The catch, and why the default is wrong for us.** The sign-in is made by the
app server (`enterAsGuest` → `supabase.auth.signInAnonymously()` over the
server client), and that client forwards no client IP. So GoTrue sees *one*
IP for the whole platform, and its default of **30 per hour** is a
platform-wide cap of thirty guests an hour — which a single link-holder can
exhaust on purpose with thirty cookie-less POSTs. Found in the guest-access
review of 2026-08-23 (guest-access-audit-2026-08-23.md).

**What it looks like when hit.** Every guest after the thirtieth sees
*"Guest access is not switched on for this deployment."* at the door — the
message `enterAsGuest` gives when `signInAnonymously` fails for any reason.
Nothing in the backoffice says so. GoTrue answers 429 to the app; check
`docker logs supabase-auth` on strato for `over_request_rate_limit`.

**Where it is set.** On the Supabase box (`ssh strato`), in *our* compose
override — not upstream's file and not `.env`:

    /opt/supabase-project/docker-compose.kxb.yml   →  services.auth.environment
    GOTRUE_RATE_LIMIT_ANONYMOUS_USERS: "1000"

Set to 1000 on 2026-08-23. A backup of the file from before the edit sits
beside it as `docker-compose.kxb.yml.bak-<timestamp>`.

**How to apply a change.** Editing the file does nothing until the container
is recreated with the new environment. Restarting is not enough; `recreate`
is (it is `docker compose up -d --wait --force-recreate --no-deps auth`):

```bash
ssh strato 'cd /opt/supabase-project && sh run.sh recreate auth'
```

A few seconds in which sign-ins fail; existing sessions are untouched
(their JWTs are stateless). Then verify the running container has it:

```bash
ssh strato 'docker inspect supabase-auth --format "{{range .Config.Env}}{{println .}}{{end}}" | grep RATE_LIMIT_ANONYMOUS'
```

and that `docker compose config | grep GOTRUE_RATE_LIMIT_ANONYMOUS_USERS`
resolves it — if it does not, the kxb override has dropped out of
`COMPOSE_FILE` in `.env` (`sh run.sh config` shows the active list).

**Locally** the same knob is `[auth.rate_limit] anonymous_users` in
`supabase/config.toml`, and it is *not* synced to production by
`scripts/supabase-push-config.ts`, which is why the two can disagree.

**The better fix, not yet done.** Forward the real client IP to GoTrue from
the server client (a `global.headers` `X-Forwarded-For` on
`src/lib/supabase/server.ts`, once we are sure GoTrue honours it behind Kong),
so the limit means what it says: per person, not per platform. Until then
the number has to be the platform's hourly guest budget, and 1000 is that.

## 1b. Staying signed in — GoTrue's token-refresh limit

**What it bounds.** How many access-token refreshes GoTrue serves per
five-minute window. Every live session — guest or member alike — holds a JWT
that expires after an hour (`GOTRUE_JWT_EXP: 3600`) and refreshes it for as
long as the tab is open. So unlike §1 this one is priced by *everybody
online*, not by arrivals at the door.

**The catch is §1's catch again.** Refreshes made server-side all come from
the app box's IP and share one bucket. The default is **150 per five
minutes** — call it 1 800 an hour — and 1 500 people online is already ~125
per five minutes on average, with no allowance at all for bunching. And they
do bunch: a crowd that arrived together expires together, one hour later, to
the minute.

**What it looks like when hit.** Sessions drop mid-visit — guests bounced to
`/g/left` and members to the login, in a wave, about an hour after a busy
arrival, while the door itself works fine. `docker logs supabase-auth` shows
`over_request_rate_limit` on `/token`.

**Where it is set.** Nowhere yet, which is the finding (checked 2026-08-23):
the running container is on the default. Same file and block as §1:

    /opt/supabase-project/docker-compose.kxb.yml   →  services.auth.environment
    GOTRUE_RATE_LIMIT_TOKEN_REFRESH: "1000"

Apply exactly as §1: recreate `auth`, then check the running environment.

**Rehearsing both waves.** `scripts/load-test-auth.ts` reproduces §1's
arrival wave and this section's refresh wave (and, with `--realtime`, holds
the sockets) against whatever `NEXT_PUBLIC_SUPABASE_URL` points at — local by
default, and it refuses production without a flag because every arrival is a
real row in `auth.users`. The header comment is the manual.

## 2. Guests in a space at once — `guest_limit`

**What it bounds.** Strangers standing in one space right now, counted by
`tenant_guest_count()` — admitted guests with a live occupancy beat in the
last two minutes, so somebody leaving frees their place without waiting for
the reaper. Checked once, at the door, by `enterAsGuest`.

**Where it is set.** Three rungs, resolved as
`min(max(tier, override), ceiling)` — `src/domain/billing/limits.ts` is the
rule and `docs/product/pricing.md` §10 the argument:

- **tier** — what the space bought; constants in `src/domain/billing/tiers.ts`
  and the `limits` column edited at `/ovaloffice/pricing`. A commit or the
  pricing page.
- **override** — what an operator granted *this* space: the per-tenant valued
  flag `guest_limit` at `/ovaloffice/access`. No deploy. Can only raise what
  was bought.
- **ceiling** — what the installation tolerates: the flag's global default,
  same page. Clamps everybody, comped or not.

**What it looks like when hit.** *"This space is full right now. Try again
in a few minutes."* — and, unlike every other limit, this one **fails
closed**: if the lookup errors the door says *"Could not check whether there
is room right now"* rather than lifting a billed cap. So a database hiccup
looks like a full room; see `tenantLimitStrict`.

## 3. People in a room — `room_cap()`

**What it bounds.** Bodies in one world, from `world_occupancy` beats.
`room_cap()` answers `rooms_read_model.cap` for the room, else the event's
`event_spaces.room_cap`; null is no cap. Enforced by `can_enter_room()` at
the room door, not in the lounge.

**Where it is set.** Per room by whoever may manage rooms (the cap is part
of the room); per event in `event_spaces` — the event console at
`/ovaloffice/events/<tenantId>` or `scripts/event-*.ts`. See
../product/event-spaces.md.

**What it looks like when hit.** The door into the room says it is full; the
rail still lists it.

## 4. The rest of the per-space caps

`seat_limit` (members), `xo_place_limit` (rooms), `xp_place_limit`,
`project_limit`, `match_limit`, `page_limit`, `picture_limit` — all the same
three-rung mechanism as §2, all raised from the same two pages
(`/ovaloffice/access` for override and ceiling, `/ovaloffice/pricing` for the
tier). All of them **fail open** — a broken lookup lifts a cap rather than
clamping one — which is the opposite of the guest door and deliberate: an
extra room an admin can see beats every space clamped to zero.

## 5. Realtime — events per second, channels, joins

The ceiling a crowded lounge actually hits first. The numbers, the reasoning,
how to apply them and the trap that reverts them on restart are all in
[realtime-limits.md](realtime-limits.md); do not change them from memory.
The short version: `max_events_per_second` is per *tenant* (Supabase's word
for the whole installation), currently 25 000, and the self-host seed puts
the default back on every restart unless `SEED_SELF_HOST` stays false.

## 6. The app tier

Two replicas behind Caddy on hetzner (`compose.yaml`, `replicas: 2`); the
count is in the compose file and a deploy applies it. Both replicas must run
the same image or the browser gets `ChunkLoadError` — deploy.md
§"When something is wrong". The app is stateless enough to add a third; what stops a
second *box* is the list in ../architecture/scaling.md
§9, and the ceiling that does not scale with boxes is the lounge's fill
rate on the *client* (≈7.6 ms + 2 ms/Mpx — `dpr` is the lever, see the
performance study), not the server.

## 7. The database box

One box, and the real exposure — ddos.md §4.4 and
../architecture/scaling.md §6. Connection
pool and statement timeout are what a full event looks like from inside
`enterAsGuest`, which is why §2 fails closed.

---

## Before an event, in order

1. §1 — is `GOTRUE_RATE_LIMIT_ANONYMOUS_USERS` in the running `supabase-auth`
   container, and is it more than the number of people you expect in the
   busiest hour?
2. §1b — is `GOTRUE_RATE_LIMIT_TOKEN_REFRESH` set, and is it more than
   (everybody online ÷ 12) per five minutes?
3. §2 — does the space's effective `guest_limit` (tier, override, ceiling)
   cover the crowd? Set the override on `/ovaloffice/access`.
4. §3 — room caps on the rooms that will be full.
5. §5 — Realtime limits still what [realtime-limits.md](realtime-limits.md)
   says, and not reverted by a restart.
6. Run the guest door once yourself from a private window. It is the only
   check that exercises all four.
