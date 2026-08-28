# Netcode

How people, punches, balls and finish lines get from one browser to another,
which client is trusted with what, and why the answer is never "the server".

Read this before adding anything to the realtime channel, before making a client
authoritative over a new thing, and before debugging something that "works
locally but is flaky with two people in the room". It is written against
`src/app/world/lounge/_canvas/multiplayer.tsx`, `src/app/world/_presence/presence-core.ts`,
`src/app/world/_presence/reliable.ts`,
`src/app/world/lounge/_sim/football.ts`, `src/app/world/lounge/_sim/race.ts` and the
battle aggregate in `src/domain/battle/`.

Capacity planning is not here — rooms, caps, overflow and the per-tenant budget
live in events.md §6, and the deployment topology in
scaling.md §2.

---

## 1. The shape of the thing

There is no game server. Browsers talk to each other over Supabase Realtime,
which relays messages and stores nothing. The Next.js app tier is not in the
path at all — websockets terminate on `backend.kxb.team` directly, which is why
an app deploy never disconnects a live lounge.

That leaves one question, and this whole document is about it: **if nothing in
the middle is authoritative, who is?**

The answer is deliberately not uniform. Three different models are in use, and
each is chosen because of what the alternative would cost:

| Thing | Authority | Why not otherwise |
|---|---|---|
| Where your body is | You, absolutely | Nobody else has your input; a correction would be a rubber band |
| Whether you hit someone | The attacker, damage clamped by the victim | Both clients see different positions; somebody has to pick |
| Where the ball is | One elected client, for everyone | Two simulations of one ball diverge within seconds |
| Your place in a race | The server, from log order | It is the one thing no client can know |
| The score | The server, from reported goals | Goals are the durable record; positions are not |

The recurring pattern is **local authority, durable confirmation**. A client
decides the thing it is best placed to decide, tells the log, and — where it
matters — waits to be told the log agreed before treating it as settled. §7 is
that pattern on its own.

---

## 2. Channels and topics

Four channel families, four owners. One subscriber per topic string per client,
and that is a hard constraint rather than a convention: supabase-js keeps one
channel object per topic, so a second component asking for the same topic gets
the first one's already-subscribed channel back and cannot attach presence
callbacks to it.

| Topic | Created in | Owner |
|---|---|---|
| `lounge:<tenantId>` | [multiplayer.tsx](../../src/app/world/lounge/_canvas/multiplayer.tsx) | `<Multiplayer>`, inside the canvas |
| `battle:<battleId>` | same | same |
| `hall:<roomId>` | same | same |
| `room:<tenantId>:<place>:<ownerId>` | [room-presence.ts](../../src/app/world/_presence/room-presence.ts) | `useRoom()` |
| `chat:<tenantId>[:<roomId>]` | [chat-dock.tsx](../../src/app/t/[slug]/chat-dock.tsx) | `<ChatDock>`, in the sidebar |
| `radio:<tenantId>` | [radio-dock.tsx](../../src/app/t/[slug]/radio-dock.tsx) | `<RadioDock>` |

`<Multiplayer>` gets exactly one of the first three, chosen by precedence in
`lounge-scene.tsx`: a battle id wins, then a room id, then the lounge. The
`hall:` prefix exists because `room:` was already taken by homesteads, and two
RLS policies parsing one prefix is the hazard that split them.

Chat used to live on the lounge topic and had to move out, which is what
`chat:<tenantId>` and migration `20260818010000_chat_topic.sql` are for. The
failure was specific and worth remembering: an already-subscribed channel cannot
take presence callbacks, so `<ChatDock>` asking for `lounge:<tenantId>` handed
`<Multiplayer>` a channel it could no longer attach presence to.

The division that follows from it: **the scene owns the lounge, battle and hall
topics; the rail owns chat and radio.** The rail gets chat because it is the
surface that is always mounted — the scene comes and goes as somebody walks in
and out, and a subscription there would stop the conversation when you went to
read a page.

Components that need to cross between the two do it through plain stores
(`said-store`, `chat-store`, `party-store`, `here-store`, `door-store`), never a
second subscription.

Every channel is `private: true`, so authorisation is RLS on
`realtime.messages`. Each prefix has a `<prefix>_topic_*` SQL function and a
read and a write policy, added by the migration that introduced the feature.
The functions return NULL rather than casting when the topic does not match
their shape, so a malformed topic authorises nothing instead of erroring.

Broadcast self-echo is off everywhere. A good deal of code depends on that —
handlers routinely skip messages where `u === userId` and would double-apply
their own effects if it were ever turned on.

---

## 3. Presence, and what is derived from it

Presence is keyed by `userId`, tracked once on `SUBSCRIBED` with
`{ userId, name, avatar, conn }`. Only the `sync` event is handled anywhere in the
codebase; there are no `join` or `leave` handlers, because sync carries the
whole roster and the whole roster is what every consumer wants.

Sync is therefore also the garbage collector. Transforms, emotes, speech and
stride history are all pruned against the present set on every sync, or those
maps would accumulate every visitor the tab ever saw.

Two things are *derived* from the roster rather than negotiated, and both work
because every client sorts the same list the same way:

- **Ball ownership** — `ballOwner(clients)`, §6.1.
- **Room admission** — homestead doors, in `room-presence.ts`.

The key is the `userId`, so one person with the lobby open twice is *one* roster
entry with two metas under it. That is right for everything drawn — one person
is one body — and wrong for anything elected, which is what `conn` is for: a
uuid minted per subscription, carried in the meta, and the reason the election
list is built from every meta rather than from the deduplicated peer list.

Deriving beats negotiating here for one reason: the case a handover protocol
exists to handle is the owner's tab closing without warning, which is exactly
the case where it cannot send the handover message. A sorted roster needs no
message at all — the instant presence drops the owner, everyone independently
computes the same replacement.

`CHANNEL_ERROR` and `TIMED_OUT` are surfaced to the offline banner rather than
swallowed, because the most likely cause is an unapplied presence migration,
and silently having no peers looks identical to being alone.

---

## 4. Bodies

Movement is broadcast at `SEND_HZ = 8`, not per frame, and only when something
actually changed — position past `POSITION_EPSILON` (0.02 blocks), heading past
`YAW_EPSILON`, dancing toggled, or health changed. A `KEEPALIVE_MS` of 2000
puts a packet out regardless, so somebody who joins while you are standing still
learns where you are instead of waiting for you to twitch.

Eight rather than twelve because fan-out makes room traffic quadratic: every
sender's every packet goes to every receiver, so a 20-player room at 12Hz is
4 800 messages a second leaving the server. Receivers interpolate, and
interpolation looks just as good from eight samples as from twelve.

`MoveMessage` is deliberately terse — single-letter keys, positions rounded to
two decimals — because nobody can see a millimetre and shorter numbers mean
smaller frames eight times a second. Health rides along inside it rather than
getting its own event, which makes it self-healing: a client that missed the
one-shot broadcast learns the right number from the next position update
instead of drawing a full bar over somebody on their last legs.

On the receiving side, remote bodies are eased toward their last known target
with exponential smoothing (`SMOOTHING = 11`) rather than timestamped
interpolation. It is one line, it is framerate independent, and when a packet is
late the body keeps drifting toward the last target instead of stopping dead and
then teleporting. Gait is read from the resulting speed against `WALK_SPEED` and
`RUN_SPEED`, so nobody has to broadcast an animation state.

**The drawn position is the real one.** Everything that resolves contact —
dashes, kicks, ball strikes — reads the interpolated transform, not the raw
packet. What you see is what touches, and the alternative would let people be
hit by a body that was never drawn where the hit happened.

---

## 5. Combat

Hits and kicks are the simplest authority split in the codebase, and the model
is worth stating plainly because the ball follows from it.

**The attacker judges the connection.** `judgeDash` and `judgeKick` run in the
attacker's frame loop against their own view of everyone's body, and send a
message addressed to one victim. The attacker is the only client whose
sub-frame timing is real; every other view is up to a packet stale.

**The victim clamps the consequence.** Damage is rolled by the attacker and
`sanitiseDamage`d by the victim; impulses are `sanitiseImpulse`d against
`KICK_IMPULSE` and `KICK_LIFT`, with lift floored at zero so a "kick" cannot
drive somebody through a floor. Spawn protection is checked on the receiving
side too, because it is the victim's health being defended and the attacker's
clock is not theirs to trust.

**Only the addressee acts.** Everyone on the channel sees every hit, but
bystanders do not do the arithmetic — they learn the outcome from the victim's
next health update, which rides along in `MoveMessage`. That is what keeps one
player's health bar from having two authors, and it is why health is on the
movement packet rather than in a broadcast of its own.

**Every message carries a minted id.** `HitMessage.i` and `PushMessage.i` are
deduped through one bounded `seenHits` set. A redelivered push matters more than
a redelivered hit, not less: it would shove the victim twice as far as the
kicker saw, and settle the argument about where everybody is standing in the
kicker's favour.

---

## 6. The ball

Football is the one system where a second simulation is actively harmful, so it
has a single author. One client — the owner — steps the physics, resolves every
contact, judges every goal and broadcasts the result. Everybody else draws what
they are told and does not advance the ball locally at all. `runBall` branches
on that near the top and the branch is wide, because *nobody does both* is the
invariant the whole feature rests on.

### 6.1 Election

`ballOwner` sorts every *connection* in the room — `(userId, conn)` pairs, self
included — and takes the lowest, returning `conn` as the owner key. Every client
computes it from its own presence sync, so no messages are exchanged and a
vanished owner is replaced within one sync.

Ordered by person first and tab second, so a second tab can only take the ball
off the *other tab of the same person*, never off the room: the answer is the
one the room would have given when ownership was a bare user id.

That pair is what makes two tabs safe. Elected by user id alone, both tabs of the
lowest-sorting player believed they owned the ball, could not see each other —
each filtered the other's packets as its own echo — and stepped two divergent
simulations, judging goals twice under two different minted ids, which is exactly
what `countedGoals` cannot deduplicate. Ball packets therefore carry `c` (the
sender's connection) beside `u`, and the "is this my own echo" test on the ball
handler is the only one on the channel that compares connections rather than
people.

`ballClientKey` falls back to the user id when there is no connection, so a
client that has not reloaded since this shipped is identified the old way at both
ends and the room does not split its election mid-deploy.

The cost of deriving rather than negotiating is that ownership can change under a
client that has not noticed yet, which is where the interesting failures live.

### 6.2 Handover

Ball packets from anybody but the current owner are discarded, so a client that
has not yet seen the owner leave cannot keep writing to everyone's ball.

There is one exception, and it fixes a bug that looked like flakiness for a long
time. A client that *joins or reloads into* the lowest id usually gets its
presence sync before the outgoing owner's next ball packet. It elects itself
immediately, and from that moment the strict rule discards the only copy of
where the ball actually is — leaving `ball.current` null, which used to fall
straight into the kickoff seed and restart a match in progress from the centre
spot with a full ten-second pause, broadcast to everybody.

Two changes close it:

- A ball packet is **accepted from a non-owner while we have no ball at all**.
  Nothing can be hijacked by that: there is nothing to overwrite, and only a
  client that believes it is the owner broadcasts in the first place.
- A new owner **waits `BALL_ADOPT_GRACE` (500ms) before seeding a kickoff**.
  The outgoing owner sends at 12Hz, so a real handover lands several packets
  inside that window and the seed never runs. At a genuine match start nothing
  arrives, the ball is seeded a fraction of a second late, and the delay is
  invisible inside a ten-second pause.

Ownership duration is tracked in `ownedSince`, reset whenever we are not the
owner or the match is not live — so the grace measures continuous ownership of a
live match, not wall-clock since page load.

### 6.3 Stepping it

The owner clamps its physics step to `BALL_MAX_DELTA` (1/20s) for the same
reason the character controller does: a tab that woke up owing four seconds must
not advance the ball four seconds in one step, through a wall and out of the
world.

**That clamp must not reach the velocity estimates.** Bodies have no velocity on
the wire — the owner differences each body's position against last frame's
(`strides`) to get one, which needs no cooperation from anybody and makes a
dashing peer show up as a body doing 26 blocks a second without a flag. But the
displacement being differenced accrued over the *real* elapsed time, so dividing
it by the clamped step invents speed nobody travelled at: a 200ms GC pause while
a peer walks at 5 blocks/s reads as 1 block ÷ 0.05s = 20 blocks/s, a dash-grade
phantom kick that fires the ball off the pitch.

So `runBall` takes both — `delta` for the simulation, `elapsed` for the
differencing — floors the divisor at a frame's worth of time so a zero delta
cannot divide by zero, and caps the implied speed at `DASH_SPEED`. Past that,
the number came from an interpolation snap after a hang rather than from anybody
running.

Contacts are resolved sequentially, one body at a time, so two people flanking
the ball each see the other's push in the ball they are striking — exactly as
two kicks a frame apart would. `strike` *sets* a velocity rather than adding
one, which is what makes stale positions safe: the same contact resolved twice
sends the ball at the same speed, not twice as fast.

### 6.4 Goals

The owner judges crossings against the swept segment of its own frame, because
it is the only client whose before-and-after are real ones. Credit goes to the
last toucher; an own goal is a touch by somebody whose side is not the side that
scored.

A goal is the one event in a match that **cannot be reproduced by trying again**.
By the time a report fails the owner has already reset the ball and broadcast the
kickoff pause, so the room has seen a goal celebrated that nobody will score a
second time. `onGoal` therefore mints one id, retries up to
`GOAL_REPORT_ATTEMPTS` (3) with a linear backoff on *rejections* — the network
went, or the write threw on the far side — and gives up loudly rather than
silently.

It does not retry an `ok: false`. That is a decided answer from the aggregate
(the match is not live, is not football, or the goal was already counted), and a
second attempt would not change it.

Retrying is safe because the id is minted once, outside the loop, and the
decider counts an id at most once. This is what `countedGoals` was built for.

### 6.5 A stalled owner

Non-owners watch for silence longer than `BALL_STALL_MS` (2000ms) and raise a
warning. The clock starts on the first frame spent as a non-owner rather than at
zero, so joining a room does not accuse the current owner of having died before
you had any chance to hear from them.

It is warn-only by design, and that is a real limitation: a backgrounded owner
whose tab is throttled but alive keeps ownership, and the room stays stuck until
that tab actually closes. Presence is the only thing that reassigns the ball.

---

## 7. Races, and the confirmation pattern

The race path is the clearest example of local authority with durable
confirmation, and it is the shape to copy.

**The client decides it crossed.** `FinishLine` sweeps last frame's position
against this frame's through `finishCrossed`. Nobody else has sub-frame
position, and peers arrive at 8Hz, so no other client could judge it.

**The server decides the place.** `reportFinish` sends no place and no time and
could not: place is `state.finishers.length + 1` — purely the order the log
accepted reports — and the time is stamped from the server's clock, so a browser
cannot post a fast time by being wrong about what time it is. There is no
tiebreak and none is possible.

**Accepted is not recorded.** This is the part worth internalising. `ReportFinish`
returns *no events and no error* when the server does not think the match is
live, and the client learns the match went live from a five-second poll — so
`ok: true` genuinely does not mean the finish counted. Trusting it latched the
crossing as done and left the racer permanently unable to finish, with a
scoreboard that never moved to explain why.

So `onFinish` reports, re-reads the roster, and returns true only if a place
actually appeared. `FinishLine` latches `reported` only on that true; a refusal
leaves the racer able to cross again, which is the entire retry mechanism — run
back through the line and it tries afresh. The re-read is not extra traffic, it
is the refresh that was already due.

Two client guards and two server guards, and they are independent on purpose:

| Layer | Guard |
|---|---|
| Client | `sending` — one in-flight report per crossing |
| Client | `reported` — latched only on a confirmed roster read |
| Client | `race.live` closes once our place lands, stopping a lap of honour |
| Server | `decide` returns `[]` for a racer already in `finishers` |
| Server | `evolve` ignores a duplicate `RacerFinished` at replay |

The trail (`previous`) is updated *before* the `live` check, not after. Nulling
it while waiting meant the frame the off arrived on had no segment to sweep, and
crossings in that window vanished.

**A teleport is announced, not inferred.** Going down in a race puts the racer
back on the start line, and the segment from where they fell to where they came
back sweeps everything in between — including the finish, if they were knocked
out past it. `revive` raises `teleportedRef` on the frame it moves the body and
`FinishLine` drops that one segment. The distance test this replaces could only
catch a teleport that was *far*; the dangerous one is near, because a death spot,
a start line and a finish within a few blocks of each other is a short course,
not an exotic one. `MAX_STEP` (12 blocks) stays as a backstop for a move nothing
announced: the character controller clamps its own step at `MAX_DELTA`, so a body
under its own power covers about three blocks in the very worst frame — a full
dash while falling at terminal speed — however long that frame took.

---

## 8. Delivery, and the things that happen once

Everything above is written as though a broadcast either arrives or does not
matter. For most of the channel that is true, and true by construction. It is
not true for four messages, and the difference is the one worth holding on to:

> A message about what **is** repairs itself. A message about what **happened**
> does not.

A `move` is a fact about where a body is, so the next one at `SEND_HZ` corrects
whatever the last one missed and `KEEPALIVE_MS` covers standing still. The ball
is restated by its owner once a second even at rest (§6.3). Losing one of those
costs an eighth of a second of staleness and nothing else.

The other kind has no next packet:

| Event | What losing it looks like |
|---|---|
| `room` | You go on building in a battle-mode lounge, or hold a block map for a world that was replaced. Reads as "it went empty and never came back" |
| `hit` | The attacker saw a hit land that you never took. You disagree about your health for the rest of the round |
| `push` | The same, about where you are standing |
| `ball-reset` | The ball went back to the middle for everyone but you |

This matters more than it looks, because it is the *actual* cause of the desyncs
worth chasing. Watching two clients diverge, it was never that they simulated
the same input differently — the sim modules are pure and both ends run the same
code. It was that one of them never heard the input.

### 8.1 How a WebSocket loses a message

Not the way a datagram does, and building for uniform random loss would be
building for the wrong failure. Realtime rides one TCP connection, so there are
exactly two ways to miss something:

- **The socket went away and came back.** A tab sleeps, a phone changes network,
  the server recycles. Everything broadcast in that window happened to a room
  you were not attached to, and resubscribing does not replay it.
- **The tenant went over its ceiling.** Broadcasts above the per-second limit
  are dropped rather than queued (§9) — and since room traffic is quadratic, the
  busiest moment is exactly when a `room` flip is most likely to be the casualty.

Both are **bursty**: a contiguous run, not one here and one there. That shapes
the fix — the replay ring is sized for a run, and a receiver asks for a *range*
rather than sending one request per hole.

### 8.2 The design

`src/app/world/_presence/reliable.ts`, pure and free of Supabase and React for the same
reason `presence-core` and `peer-motion` are: reordering, duplication and a
sender vanishing mid-gap are not things anybody can stage by hand with two
browsers open.

Every sender stamps those four events with a counter, `s`, from **one sequence
space shared by all four kinds**. That single space is the decision that makes
the thing work at all. A `hit` addressed to somebody else is a message this
client will never act on — but it still has to be *counted*, or its loss is
invisible and the next `room` looks contiguous when it is not. So sequencing
sits **below** the addressee filter, not above it.

A receiver holds the next `s` it expects from each sender. Ahead of that goes in
a holding pen and provokes a resend request; behind it is a duplicate and is
dropped; equal is delivered, and the pen is then drained of whatever follows on.

The reply to a request is another broadcast, because Realtime has no private
lane and the alternative is a channel per pair. Everybody hears the answer;
everybody who already had it drops it as a duplicate. One extra small message
per hole per room is the price.

### 8.3 The refusal

**A gap is never held open forever.** The commonest reason a message never
arrives is that the person who would resend it closed the tab, and blocking on
it would mean everything later from them is stuck behind a message that no
longer exists anywhere. That turns one lost packet into a permanently frozen
peer, which is worse than the loss.

So after `GAP_GRACE_MS` the pen drains past the hole and the skip is counted.
**Reliable here means "asked for twice and waited a second", not "guaranteed"** —
and the count is surfaced rather than swallowed, because a silent write-off is
the bug this exists to end.

Two consequences worth knowing before you debug it:

- The outbox and inbox live *outside* the channel effect, deliberately. A fresh
  outbox on every resubscribe would restart our counter at one, and peers still
  expecting the old number would read our next minute as duplicates and discard
  it. Keeping the inbox across the same boundary is what makes a disconnect
  recoverable at all: the first packet back reveals the gap.
- The inbox is pruned to the presence roster. A peer who left will never answer,
  and a peer who *returns* comes back on a fresh sequence starting at one — which
  an inbox still expecting their old number would silently drop for the rest of
  the session.

`s` is optional on the wire. A client that has not reloaded since this shipped
sends none, and a message with no sequence is delivered straight through: the old
behaviour, which is the right reading during a rollout. Same bargain `t` struck
in `peer-motion`.

### 8.4 What this is not

It is not server authority, and it does not move this system toward it. Nothing
here validates anything — a client that lies about a hit is still believed
(§5), and one sequence number does not make it less believed. What it removes is
the failure where two honest clients disagree because one of them was not told.

`emote` and `chat` are deliberately excluded. A face lives three seconds and is
never written down, so a resent one is a face pulled at the wrong moment rather
than a face restored. A chat line is stored server-side *before* it is broadcast
(§2), so the recovery for a missed one is a refetch, not a replay.

---

## 9. Rate limits

Client-side, the budget model is in `src/domain/events/presets.ts`:

```
realtimeWorstCase = SEND_HZ × roomCap × (roomCap − 1) × roomCount
```

Quadratic in room size, linear in room count — which is why the answer to "more
people" is more rooms, not bigger ones. One room of 80 is 50 560 events/s and
impossible; twelve rooms of seven is 4 032 and fits inside kxb.team many times
over. `budgetVerdict()` is what the events console shows, against
`NEXT_PUBLIC_REALTIME_BUDGET` (25 000 on kxb.team, 20 000 on an event box).

Server-side, the per-tenant ceilings on production are 25 000 events/s, 25 MB/s,
10 000 concurrent users, 2 000 joins/s and 500 channels per client — raised from
stock self-host defaults that are two orders of magnitude lower, and sized for
~1 000 spaces at ~500 concurrent players.

**These revert on restart unless `SEED_SELF_HOST` stays false.** Realtime's
`seeds.exs` deletes and reinserts the tenant row on every boot, with no env var
for the limits, so a stack restart silently puts them back to defaults.

Set them with [`scripts/realtime-limits.sh`](../../scripts/realtime-limits.sh),
which is also where the numbers and their justifications live;
`supabase-restart.sh` runs it after every restart so the revert cannot outlive
the reboot that caused it. Full detail, including what a lost limit looks like
from the outside, is in
[operations/realtime-limits.md](../operations/realtime-limits.md). The
`TenantNotFound` symptom when the row is missing entirely is in
events.md.

---

## 10. Known gaps

Documented rather than fixed:

**A throttled owner holds the ball.** §6.5.

**Reliable delivery has not been watched happen.** §8 is covered by
`src/app/world/reliable.test.ts` — drops, bursts, reordering, duplicates, a
sender vanishing mid-gap — and the wiring typechecks, but no two-browser session
has yet been run with the network throttled to see a resend land. The lounge
cannot be driven from the Browser pane (auth-gated, and no `rAF` in a hidden
pane), so that check needs two real browsers.

*(Three more were found by audit and have since been fixed: `ReportGoal` never
read `actorId`, so anyone in the host space could fabricate a result; the defeat
report and the full-time whistle were both latched before confirmation, in
breach of §7. See [audit.md §2](../operations/audit.md).)*
