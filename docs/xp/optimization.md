# What xp should take from the xo work — and what to think through first

2026-08-18. Companion to
[../performancestudy/optimization3.md](../performancestudy/optimization3.md),
which was driven by a report from players in Nigeria and fixed two things in the
lounge. This note is the honest sorting of that work into what already applies to
xp, what probably does, and what would be a mistake to copy across without
thinking.

**Nothing here has been measured against xp.** The round-3 numbers all come from
`/demo`, which is the lounge. Treat every claim below as a hypothesis with a
stated reason, not a finding.

## Already done

**xp art is cached on the device.** `/xp/packs`, `/xp/thumbs` and `/xp/shots` now
answer with a month of freshness. This was the larger half of the art by file
count — 4,459 glTF files under `public/xp` against 1,394 under the world packs —
and it was reloading on every visit.

`/xp/xps` is deliberately *not* cached: those are the 14 authored level
documents, the one thing under `/xp` whose bytes change while the URL does not.
That distinction is the thing to preserve if anyone widens the rule later.

Uploaded xp assets were already right — served by content hash, `immutable` once
published, `no-store` while a draft.

## Probably applies, but measure xp first

### The request count, which is likely worse here

A lounge load is 195 requests. Nobody has counted an xp load. The reasons to
expect it to be *worse*, not better:

- A level pulls from `packs`, and packs are per-theme rather than shared, so two
  levels with different looks share almost nothing on the device.
- The `bb10` palette is a **split glTF** — 117 files, a separate `.gltf` + `.bin`
  per block. Any xp using world blocks inherits that shape.
- Levels are authored, so their asset set is not bounded by anything a reviewer
  chose.

The first useful thing is a number: run the round-3 waterfall against `/xp/<id>`
for the heaviest published level and count requests and bytes. That is an
afternoon and it decides whether merging packs into single `.glb` files is worth
doing.

### The jitter, which xp almost certainly also has

The lounge drew remote bodies by easing toward the newest packet, which wobbles
drawn speed **±39% on a perfect LAN** — the derivation is in
`src/app/world/_presence/peer-motion.ts`. If the xp runtime smooths remote state the same
way, it has the same defect, and for the same reason: easing chases a target
instead of replaying a timeline.

**Do not copy `peer-motion.ts` across without reading the next section.** The fix
is right for the lounge and the reasons it is right do not all hold here.

## Think this through before copying it

### 1. xp has two clocks, and this module has opinions about time

The runtime already keeps `performance.now()` milliseconds for buffers and
elapsed *seconds* for rules. Both are `number`, so mixing them compiles and only
breaks in multiplayer. `peer-motion` is entirely in the first of those — its
`record`/`sample` pair must be handed the same local clock, and a `delay` in
milliseconds.

Whatever wires it needs to be explicit about which clock it is on, or this
becomes exactly the class of bug that is invisible until two people play.

### 2. Interpolation is right for *bodies*, and wrong for a lot of what xp sends

The lounge sends poses: a position that *is* something. Interpolating a position
between two known values is meaningful.

xp sends events — a pickup, a goal, damage, a script trigger. Those are things
that *happened*, and there is no such thing as halfway through one. The existing
codebase already draws this line (an emote is its own event rather than a field
on `MoveMessage`, precisely so it is not re-announced by every keepalive), and
the xp desyncs recorded so far were **never** body drift — they were a local
event one client never heard.

So: interpolate the bodies, and do not let a playout buffer anywhere near the
event stream. Delaying an event by 250ms to match a body is a different and much
worse design, and it would make the ordering problems harder rather than easier.

### 3. A playout delay changes what "touching" means

In the lounge this surfaced immediately: drawing a peer further behind meant
`BALL_PREDICT_HOLD` had to grow, or a local kick would be overruled by a packet
describing a ball that had already been hit.

xp has more of these than the lounge does, not fewer — triggers, contact damage,
pickups, goals — and its own note already records that a trigger fires against a
mutating world and that a carried piece has a stale `world.box`. **Every one of
those is a comparison between two things that must be at the same instant.** If
bodies are drawn 250ms in the past and triggers are evaluated against the newest
state, they are no longer the same instant.

That is the real work in bringing this to xp, and it is design work rather than a
port. The lounge got away with a single derived constant. xp will not.

### 4. Levels are authored, so constants cannot be tuned per level

`MIN_PLAYOUT_DELAY`, `MAX_DELAY` and the history window were chosen for one room
with known contents. An xp can be anything — a slow puzzle where 600ms of delay
is free, or a race where it is the whole game. Anything adopted here should be
expressed in terms the runtime can reason about rather than a number picked once.

## Not xp-specific, but xp benefits most

- **Cloudflare's default cache list excludes `.glb` and `.gltf`.** xp is
  overwhelmingly those two extensions, so a default CDN setup would cache almost
  nothing that matters here. The cache rule in round 3 must include `/xp/`.
- **The renderer shares two cores with SSR.** `app-renderer-1` runs on the same
  `cpx22` as both app replicas. Scene renders are an xp-adjacent feature and they
  compete with page loads for the same CPU.

## Order I would take it in

1. Count an xp load. Requests and bytes, heaviest published level. Cheap, and it
   tells you whether anything else on this list matters.
2. Confirm xp actually eases remote bodies the way the lounge did. If it does not,
   most of this note is moot.
3. Settle the instant question in §3 *on paper* before writing code.
4. Only then port the interpolation.
