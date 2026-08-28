# XP runtime — feature inventory

A field-by-field list of what the `packages/xp` engine and its host (the
editor, the player, the netcode) actually do *today*. Written as a checklist
rather than an explanation — the argument for each decision is in
[../manual.md](../manual.md) and ../creator.md; this is the
flat list to write a user-facing manual from. Nothing here is a proposal;
anything not built lives in ../backlog.md and is called out
at the bottom as explicitly **not** in this list.

Source of truth for every claim: `packages/xp/src/*.ts`, cross-checked
against `docs/xp/manual.md` §1–11, `docs/xp/editor-guide.md` and
`docs/xp/backend.md` as of 2026-08-12.

---

## 1. The document

- **One JSON file is a whole game.** `format: "xp/1"`, an `id`, a `name`, a
  one-line `blurb`. No database row, no build step, no migration.
- **Packs** (`packs: [{ id }]`) declare which art the document uses; a
  document cannot claim a different author or licence than the pack table
  says.
- **Capabilities** (`capabilities: [...]`) declare what the product may do
  with this document — see §9.
- **Spawn** — a cell coordinate plus `facing`, in degrees.
- **Blueprints** — named kinds of thing (§5).
- **Entities** — placed instances of a blueprint, in fractional world units.
- **World** — `floorY`, `ground`, `placements` (architecture, §3),
  `marks` (facts the rules can see, §9).
- **Player** — what you arrive as (§4, §5).
- **Rules** — the game mode block (§9).
- **Camera** — where the world is watched from (§8).
- **Scripts** — named JavaScript sources (§6).
- **Data** — declared, persistent named numbers (§10).
- A document that fails to parse produces a page listing **every** problem
  with its exact address, rather than a blank canvas or the first error only.
- Every unknown verb, event, comparison, mark kind, capability or field name
  is refused **at parse time, by name** — nothing fails silently at runtime.

---

## 2. Placements vs. entities

Two different kinds of thing in the world, and the distinction the whole
format hangs on:

| | Placement | Entity |
|---|---|---|
| What it is | Architecture (walls, floors, stairs) | A thing (crate, pickup, door) |
| Collision | Rasterised into the cell grid once, at load | Its own box, tested every frame |
| State | None — no name, no properties, no rules | Properties, triggers, can despawn |
| Cost | Once | Every frame |

- Both are **fractional** — a placement can sit at `2.3`, meet a wall at an
  angle, or lean against a floor. Collision is still cell-resolution: a wall
  at `2.5` is solid to within half a metre of where it looks solid.
- A placement can be turned into a blueprint from the editor (**→ make it a
  blueprint**), consuming the placement and keeping its position/turn/scale.

---

## 3. The world and the grid

- **The cell is one metre.** Architecture is voxelised at build time
  (triangle-vs-cell, flood-filled from outside), so stairs are steps, ramps
  are ramps, and a window has a hole. 747 of 3 892 shipped models carry a
  shape mask; the rest fill their bounding box.
- **Sub-metre detail does not survive the grid.** A door needs to be a *gap*
  in a wall run — a doorway model with an opening under a metre wide
  rasterises solid.
- **`placement.collider` overrides the measured shape**, per placement:
  - absent → the measured shape (mask or box)
  - `"none"` → fills no cells (banners, signs, foliage — things you should
    walk past)
  - a list of up to 8 boxes, in the model's own frame → drawn cells,
    replacing (not intersecting) the measured shape
  - `"none"` beats `bounce`: a pad you fall through cannot launch you.
- **Steps up to 1.05 cells are walked, not jumped.** Two cells is a wall.
- **A tilted piece (`pitch`/`roll`) collides as its bounding box** — bigger
  than what is drawn, never smaller. `rotation` (yaw) is snapped to the
  nearest quarter turn for collision, so a level-turned wall stays exact.
- **`stretch`** (three multipliers, per axis, before the turn) is free of the
  tilt cost — a quarter turn still swaps two axes exactly.
- **`world.ground`** — a solid plane at `floorY`, everywhere. Off by default;
  off means a catch plane forty cells down, not nothing.
- **What is under the world, four answers, mutually exclusive where noted:**
  - `ground: true` — never fall
  - neither flag — catch forty cells down, walk back
  - `restart: true` — back to spawn (or the last save point)
  - `fatal: true` — a real death: health to zero, the respawn wait, and back
    where a death puts you
  - `restart` and `fatal` cannot both be set (the parser refuses the pair);
    neither may be set beside `ground: true`
- **Draw calls are not limited and do not scale with piece count.** The
  renderer instances one call per distinct model, so a thousand walls of one
  kind is cheap and forty walls of forty kinds is not.

### Measured limits (`bun run xp:bench`)

| Limit | Value |
|---|---|
| Placements | 8 000 |
| Entities | 1 000 |
| World radius | ±128 cells |
| World height | 64 cells |
| Mark size | 1–24 cells |
| Solid cells (rasterised) | 2 000 000 |

---

## 4. Movement and the character controller

- Standard first/third-person body controller: walk, sprint, jump (double
  jump — a full-strength ground jump and a weaker air jump), gravity, terminal
  fall speed.
- **Jump height is authored in cells**, converted to launch velocity so it's
  tied to gravity and can't drift out of sync with level geometry.
- **Auto-step** onto anything up to 1.05 cells tall — this is what makes
  stairs and low crates climbable without a capsule collider.
- **Landing snaps to the actual measured surface**, not the cell boundary —
  correct even on non-integer-height objects (a crate whose top is at 1.46,
  say).
- **Bounce pads** — a fixed launch height (in cells), not physical
  restitution, so a course is provable rather than approximate. Landing on a
  bounce pad does not count as a "landing" (no jump-refill, no landing
  animation).
- **Moving platforms carry you** — a script-moved entity's collision box
  moves, and anybody standing on it (while grounded) rides along; your own
  movement adds on top, so walking against the platform's own speed holds you
  still. A platform sliding past under a jump does not snatch you sideways.
- **Multiple players push each other apart** horizontally (no server
  authority needed — every client resolves the same symmetric rule).
- **`V` toggles a chase camera** behind the body (see §8); the controller and
  the trigger pass behave identically in first- and third-person.

---

## 5. Blueprints, entities, composition

- **A blueprint is a named kind of thing**: a model, a collider, tags,
  starting properties, sockets, triggers, an optional script, an optional
  idle `pose`, an optional point light, an optional `draw: false` (invisible
  marker node — for teleport destinations, patrol waypoints, aim points).
- **Collider**, per blueprint:
  - `"auto"` (default) — a box from the model's measured geometry
  - `"none"` — walked through; the enter/exit pass still notices you via the
    model's footprint (used for pickups)
  - `{ w, h, d }` — an explicit box, centred on the entity
- **Properties are numbers only.** A missing property reads as zero. An
  entity's own `props` override its blueprint's.
- **Parts** — sub-models bolted onto one blueprint (a turret's base + barrel,
  a lamp post + light). Not a way to nest blueprints; a part with no
  behaviour of its own beyond a fixed offset.
- **A point light per blueprint** — colour, intensity, range, bounded at
  parse time.
- **Composition / sockets** — one entity can hang off another (a rider in a
  kart's seat, a gun in a hand, a light on a post):
  - a child's position/rotation/scale are relative to its parent
  - socket offsets are turned by the parent's *whole* orientation before
    being added — a rider stays behind the driver as the kart turns
  - a parent's `stretch` moves where its children sit; it does not reshape
    them (a shear can't be represented)
  - names are optional (unnamed = unaddressable by rules/scripts) but unique
    when present
  - the parser refuses a missing parent, a socket that doesn't exist, a
    duplicate name, and a parent/child loop
- **Rigged (skinned) characters render properly posed**, not in a fixed bind
  pose, up to **8 concurrent posed bodies** per scene — beyond the cap, extra
  rigged entities fall back to the ordinary instanced (T-pose) draw path
  rather than disappearing.
- **`spin`** — names a sub-node inside a model's own mesh (distinct from a
  Part) that a live property drives continuously, in degrees, by whatever
  rate a script or rule writes — for a fan blade, a valve, a turning sign.

---

## 6. Rules: triggers, conditions, verbs

- **Triggers fire on one of seven events**: `enter`, `exit`, `damaged`,
  `spawned`, `finished`, `pressed`, `collide`.
  - `enter`/`exit` — the **player** crossing the entity's box; fires once per
    crossing, not every frame stood inside it.
  - `collide` — **another entity** touching this one (a ball rolling into a
    goal); the player never fires this, so nothing double-applies.
  - `pressed` — a bound key, named by the document (`player.keys`).
- **`when`** is one comparison, and no more: a property against a number,
  using `< <= == != >= >`. A missing property reads as zero.
- **`do`** is a list of verbs, each `target: "self" | "other"`:

  | Verb | Does |
  |---|---|
  | `damage` / `heal` | Changes `hp`, clamped at zero |
  | `setProp` / `addProp` | Writes a property |
  | `despawn` | Removes the entity; the rule stops here |
  | `spawn` | Makes a new entity, relative to this one |
  | `deactivate` / `activate` | Turns a thing off (optionally timed) / back on |
  | `carry` | Attaches the target to whoever set the rule off, at a socket |
  | `drop` | Lets go of what's held |
  | `unhand` | Lets go of everything held — except a worn weapon |
  | `disarm` / `arm` | Takes the weapon away / gives it back |
  | `stun` | Roots a player in place for `seconds` (required) |
  | `swing` | A punch at whatever is in front, at arm's length (`reach`, up to 4). Refused while your hands are full |
  | `teleport` | Sends the target to a named entity or mark |
  | `checkpoint` | Sets where a player respawns; highest order wins |
  | `load` | Sends the player to another XP, by name |
  | `sound` | Plays a named sound effect |
  | `score` | Host-defined scoring effect |
  | `emit` | A named event the host can react to |

- **A rule stops the moment its entity despawns** — nothing after `despawn`
  runs.
- Unknown verbs/events/comparisons are refused at parse time by name — not a
  silently-ignored typo.
- The **Rules editor panel is a closed form, not a text field**: four+
  events, six comparisons, and this fixed verb list — nothing typed here can
  fail at runtime. Anything that needs to *compute* is a script (§7).

---

## 7. Scripting (the escape hatch)

> The full inventory, with the API tables and worked recipes, is
> [script-features.md](script-features.md). This is the summary.

- **JavaScript, per blueprint, running in a sandboxed QuickJS interpreter**
  (compiled to WASM) — not a Web Worker, so it can answer same-frame
  questions synchronously and has a genuinely closed global scope (no `fetch`,
  `XMLHttpRequest`, `setTimeout`, `WebSocket`, `window`, `require`).
- **Each entity gets its own independent run of the script** — two entities
  sharing a script do not share variables.
- **Three hooks**, all optional: `onSpawn()`, `onTick(dt)` (dt in seconds,
  capped at 0.05), `onTrigger(event, other)` — which receives `enter`, `exit`,
  `collide`, `held`, `dropped`, and `damaged` when a script dealt it. The rest
  of the trigger vocabulary (`pressed`, `finished`, `dealt`, `returned`) fires
  rules only.
- **A level can have a script of its own** (`script` at the top of the
  document), running with `world` but no body — `self` is not an entity.
- **What a script can see**: `self` (the entity it's on), `getEntityByName`,
  `world.tick` / `world.time`, `world.random()` / `world.roll(n)` /
  `world.randomInt(a,b)` / `world.pick(list)`, `world.seed`, `log(...)`
  (capped at 200 lines, surfaced on the play HUD, not a console).
- **On an entity**: `.x .y .z .rotation .scale` (read/write), `.moveTo` /
  `.moveBy`, `.get` / `.set` / `.add` (numeric properties), `.damage` /
  `.heal`, `.despawn()`, `.spawn(blueprint, dx, dy, dz)`, `.score(n)` /
  `.emit(event)`, `.distanceTo` / `.flatDistanceTo`, `.alive`.
- **`emit` has a reader: the `emitted` trigger.** A rule names what it listens
  for and hears whatever any `emit` said — from a rule or from a script. Every
  listener hears it (the sender names no receiver), the name is matched exactly,
  `other` is the emitter, chains work, and a rule that emits what it listens for
  is cut off after `MAX_SIGNALS` (512) deliveries in a frame.
- **A rule's emit crosses the network; a script's does not** — a script has
  already emitted on every client, so sending it would fire every listener
  twice. Only the roots are sent, never the chain, which each client
  regenerates.
- **`other` is a real entity, including the player** — a script can read the
  position, properties and name of whoever walked into its trigger. (`dropped`
  and script-dealt `damaged` are the two that hand `null`, having no subject.)
- **Position reads compose the parent chain (world space); writes are always
  local to the entity's own parent** — the one asymmetry in the API.
- **`Date` and `Math.random` are removed, not merely discouraged** — every
  client must compute the same result from the same inputs, so time comes
  from `world.time` (an agreed clock, injected, fast-forwardable in tests)
  and randomness comes from `world.random()` and friends, which are
  deterministic: `hash(seed, tick, index)`, with the index resetting every
  tick, so a client that miscounts rolls in one tick only disagrees for that
  tick, not forever.
- **A script's failure is isolated and visible.** One throw stops that
  entity's script permanently (not retried every frame); the rest of the
  level keeps running; the failure — with the author's own line number — is
  shown on the HUD during play.
- **Moving platforms**: a script moving an entity moves its collision box,
  and anybody grounded on it rides along (§4).
- **Cannot yet**: reach the level's `data` from inside `onTrigger` (silently
  inert — the data is only bound during `step`); wait (no `setTimeout` — store
  a `world.time` deadline instead); push a player around (a moving entity
  blocks, it doesn't shove); subscribe to an emitted event (`emit` is an
  announcement to the host, not a bus).

### Limits

| Limit | Value |
|---|---|
| Script source | 64 kB each |
| Script memory | 4 MB, shared per XP |
| Script fuel | ~3 ms per hook call, counted in operations (not wall-clock), so every machine cuts off at the same point |
| Stack | 256 kB |
| Log lines | 200, oldest dropped |

---

## 8. Camera

- **Three kinds**, and the camera block is also the input mode — movement is
  computed from wherever the active camera calls "forward":
  - **`follow`** (default) — behind the body, looking where you look.
    `behind` (max distance, shortens automatically when something's in the
    way), `above`, `beside` (negative = left shoulder), `fov`, `far`.
  - **`side`** — flat, along a fixed axis (`x` or `z`) — a 2D-platformer
    camera. `distance`, `span` (orthographic view height), `far`. No `fov`
    (orthographic).
  - **`fixed`** — nailed to a world position (`x`, `y`, `z` all required).
    `yaw`/`pitch` are optional together; **absent means the camera tracks the
    player automatically**.
- **First-person vs. third-person is a separate runtime toggle** (`V`),
  layered on top of `follow`/absent cameras only — it starts in first person
  automatically when the player has a weapon, third person otherwise, and is
  ignored entirely by `fixed`.
- Numeric bounds are enforced at parse time (`fov` 20–140, `far` 16–4096,
  `pitch` ±90, etc.) — a document that can't be honoured is refused before it
  ever loads.

---

## 9. Capabilities and the rules block (game modes)

- **Capabilities** declare what the *product* may do with a document, and
  every claim is checked against the world's marks at parse time — not
  discovered by playing it:

  | Capability | World must have |
  |---|---|
  | `freeplay` | Nothing |
  | `match` | At least two `spawn` marks |
  | `football` | A `red` mark and a `blue` mark |
  | `competition` | A `start` and a `finish` mark |

  A document declaring none gets `["freeplay"]` — a level nobody can
  schedule is a level nobody can open.

- **`rules`** is the optional game-mode block: what ends the round, how it's
  scored, who's against whom.
  - **`preset`** — `freestyle` (default, no score, no end), `deathmatch`,
    `football` (needs the `football` capability), `parkour` (needs
    `competition`), `shooter`.
  - **`sides`** — `ffa` (nobody has a side), `team` (the sides the spawn
    marks name), `one-vs-all` (one player against everyone, chosen by the
    host, never derived automatically). Absent is *derived*, not a constant:
    two-or-more differently-named `spawn` marks means `team`, otherwise
    `ffa` — an author can overrule what their own marks imply.
  - **`assign`** — how players are split across sides (`spread` by default).
  - **`scoreLimit`** / **`timeLimit`** — optional end conditions.
  - **`respawn`** — a wait before returning after a death; instant if absent.
  - **`players`** — `{ min, max }`, default `{1, 25}` (the transport's
    ceiling, not a design choice).
  - **`roles`** — optional per-player role assignment.
- **Five ready-made presets**, each a pre-filled starter document with world
  geometry, marks and rules already wired up (§16).

---

## 10. Data & progress (persistent state)

- **A level can declare its own named, numeric, scoped fields** — coins,
  best time, a shared town total — independent of anything the runtime uses
  internally.
- **Every field has a required scope**, one of three, matched to the shared
  store's own scopes (§12):
  - `player` — private to each player
  - `space` — one shared value, writable by anyone present
  - `shared` — each player's own value, visible to everyone
- **Every field has a required starting value** — so "the first time somebody
  opens this" is a decision the author made, not an accident of reading
  `undefined`.
- **An optional label** for display. Up to **32 fields** per document (a
  panel limit, not a storage one).
- **Numbers only**, by design — the same vocabulary a rule already reads and
  writes with (`setProp`, a `when` comparison), so declaring a field adds no
  new syntax anywhere.
- **Field names a rule mentions but the document never declared are flagged
  by the parser, by name** — a typo in a save-field is caught before it ships.
- **Progress (where you last stopped)** is a separate, small, built-in
  concern — one key, one position (`x, y, z, facing`), plus an optional
  scene and checkpoint order:
  - **A room resumes you where you left off.**
  - **A race always starts at the start** — a course with `competition`
    never resumes.
  - **A match always starts everybody together** — `match` never resumes.
  - Whether a level resumes is decided from *what the document declares
    itself to be* (its capabilities and preset), never from whether a saved
    position happens to exist.
  - A stored value that doesn't parse as a valid position is dropped, not
    repaired — starting at spawn is safe; a body at `NaN` is not.

---

## 11. Combat & shooting

- **A weapon is just an entity on a socket** — the same mechanism a rider in
  a kart's seat uses. What makes it a weapon is having `damage` and `range`
  properties; anything else on a socket is just something you're carrying.
- **A gun you pick up off the floor is a gun too** — the same question is asked
  of the hand, so `carry` on a blueprint with `damage` arms you and `unhand`
  disarms you. A worn weapon wins over a picked-up one.
- **You can fight without one** — the `swing` verb is a punch on a key, it
  reaches about two paces, it works while you're running, and it costs whatever
  `damage` says on the player's own blueprint. Your hands have to be empty.
- **Shots are hitscan** — a ray from the camera, tested against the world's
  cell grid and every entity with a collision box, nearest hit wins. A target
  behind a wall is protected; a target flush against a wall is not.
- **Damage flows through the same pipeline a `damage` verb uses** — `hp`
  changes, then `damaged` triggers fire, so a rule checking `hp <= 0` is
  always checking the shot that just landed. That includes being hit by
  somebody else in a room: the arbiter's answer arrives as damage, so
  `damaged` rules fire on the screen of the person it happened to.
- **The visible bullet is a drawn record of a shot that already landed**, not
  a simulated projectile — travelling from the muzzle (not the eye — the two
  are offset on purpose) to wherever the ray actually stopped. A miss draws a
  streak too, so an empty room doesn't read as a broken gun.
- **Ammo is optional and lives on the player, not the gun.** A body with an
  `ammo` property spends one per shot and is refused at zero; a body without
  one never runs out.
- **`V` (chase camera) is a view, not a different mode** — the trigger pass,
  crosshair and controller behave identically in first- and third-person; in
  first person the body isn't drawn (the camera is inside its head) but it
  still exists for rules to reference.

---

## 12. Multiplayer & netcode

### Rooms

- **`/xp/<id>?room=<room>` joins a Realtime topic**, gated behind a feature
  flag (off by default) and a signed-in session.
- **The room id is the whole access control** — hold it, you're in. No
  roster check yet (that arrives the day a room belongs to a scheduled
  match).
- **Only inputs go on the wire, at 8 Hz, as a broadcast** — never world
  state. Every client runs the identical document and rules, so anything
  that happens (a crate breaking, a score) happens identically on every
  machine; sending it would just be redundant and a source of disagreement.
- **Remote players are drawn in the recent past** (interpolated between two
  received samples, ~250 ms behind), never extrapolated — a wrong guess about
  where someone was *going* reads as a snap-back the moment they change
  direction; a slight delay does not. Shots are tested against the same
  interpolated positions players actually see, so "I shot them and it didn't
  count" can't happen.
- **A silent peer keeps their last pose** rather than vanishing (a dropped
  packet isn't a departure) and is treated as gone after 5 seconds of
  silence. Facing angle interpolates the short way around (350°→10° is 20°,
  never a near-full spin).
- **A battle (match) can hand off into an XP** — the lobby's summon flow
  offers shipped XPs as a fourth kind of ground; picking one sends every
  player to `/xp/<id>?room=<battleId>`. Nothing about score or outcome comes
  back out of the XP into the battle yet — it's a room you play in, not one
  that reports a result.
- **No player-vs-player authority yet** — a shot fired inside a room does not
  damage a remote body; only the local body is simulated against the level.

### The shared store

- **A tiny synced key-value store** (`getState` / `setState` / `subscribe`)
  with exactly two write scopes, so conflicts are structurally impossible
  rather than merely resolved:
  - **your own slice** (`players[me]`) — only you can write it; a message
    about your slice from anyone else is dropped
  - **`shared`** — written only by one elected host (the lowest player id
    present, recomputed whenever the roster changes — the same rule football
    already uses for ball ownership)
- No CRDT, no operation log, no merge logic — ownership makes the problem
  disappear rather than solving it.
- **Sortable, self-ordering ids** (snowflakes) for anything written to the
  store or a log: fixed-width, sort correctly with plain `<`, minted by one
  clock (the elected host's), built from UTC to avoid a once-a-year DST
  sorting bug, and guaranteed never to go backwards even if the system clock
  does.

---

## 13. Hosts (what the runtime needs supplied)

- The engine declares, but does not implement, four things a host must
  provide: **identity** (who's playing), **network** (join a topic, send/
  receive), **persistence** (optional — what survives a refresh), and a
  **clock** (`now()`, injected rather than read directly, which is what lets
  a five-minute match run in under two milliseconds under test).
- **An `arbiter` slot** exists for games whose fairness cannot be decided
  client-side — an `ask()`/`view()` pair that answers with a verdict
  (refused / lost / stale), not just a value. A document that needs one
  refuses to load on a host that doesn't provide it, rather than silently
  running client-authoritative and looking like it works.
- **Two hosts exist today**: an in-memory one (tests, the benchmark,
  single-player) and a `BroadcastChannel`+`localStorage` one (two tabs on one
  machine, used by the editor's **Try**). Both cap send rate at 8 Hz even
  though the transport could go faster, so nothing is ever tuned against a
  speed the real network doesn't have.
- **A sender never receives its own message** — removes a whole class of
  double-applied update from every caller.

---

## 14. Building it: the editor

- **A dockable, macOS-style window**: Viewport, Scene, Models, Tools, Rules,
  Document, Scripts — drag, split, stack into tabs, resize; the layout
  persists and falls back to the default rather than to an empty window if a
  saved layout no longer parses.
- **Seven tools**: Select (default, never builds), Place (one piece, then
  hands control back to Select), Draw, Erase, Line, Fill, Room (two corners →
  four walls, no ceiling).
- **A model can be dragged straight out of the picker** into the viewport (it
  lands where you release — on a surface, against a wall, or on the working
  plane) or onto the Scene panel.
- **Move / turn / size handles** appear on anything selected; turn shows one
  ring (yaw only — the axis that keeps collision boxes aligned). Pitch, roll
  and per-axis stretch are typed fields, not dragged.
- **A drag previews before it commits** — a whole stroke (a 40-cell wall) is
  one undo step, not forty.
- **Undo/redo** over whole document snapshots, bounded at 50 steps; copy/cut/
  paste for placements, entities and marks.
- **Placing the same thing on the same spot again is not a new undo step.**
- **The Rules panel is a closed-vocabulary form** — see §6 — with nothing
  that can fail to parse.
- **The Scripts panel** — JavaScript by name, with which blueprints run each
  one.
- **The Document panel** — live counts, capability status, and exactly what
  the parser would refuse right now, without reloading.
- **Marks are placed and edited in the viewport** — spawns, goals, start/
  finish — the same objects capability-checking reads.
- **Play** takes an in-memory snapshot and opens it over the editor —
  solo, no save, no room, so trying a change costs nothing.
- **A log panel** records everything the running level said this session
  (pickups, script `log()` calls, refused rules) even while closed.
- **Autosave to `localStorage` on every edit**; **Save** writes the document
  file. A draft that no longer parses (format moved on) is dropped rather
  than silently repaired.
- **An edited document is guaranteed to still parse** — there's a test that
  draws, serialises and reparses a built level specifically to hold this
  property.

---

## 15. Art: catalogue and packs

- **A generated catalogue of every model**, per pack: size, minimum corner,
  whether it's centre-pivoted, an optional voxel shape mask, an optional
  list of named sub-nodes (used for multi-part models and `spin` targets).
- **~3 900 models across ~30 packs** as of the current build, searchable by
  pack + name, with colour-variant kits collapsed into single "tiles" with
  swatches in the picker (the document still stores the full, specific model
  id per colour).
- **A curated sound-effects pack**, 8 named sounds with multiple takes each,
  a minimum gap between repeats (so a burst of hits doesn't become a wall of
  identical noise), and a per-play volume — pick is caller-supplied per play,
  so two players can hear different takes of the same impact.
- **Rigged/skeletal models are pack-flagged**, not detected by filename
  convention — a pack table entry decides whether its models render skinned.
- **Blueprint presets** — dropping certain known hazard/pickup models (spike
  traps, spike balls, sawblades, stars, diamonds, hearts) auto-fills a
  working blueprint (collider, tags, and a working trigger) once, at creation
  — never re-applied or re-linked afterward, so editing later can't
  mysteriously change behaviour derived from a model name.

---

## 16. Starter templates

Four ready-to-open documents, each a complete, valid, playable starting
point:

| Template | Gives you |
|---|---|
| **Room** | A floor and four walls, `freeplay`, ground on (safe to build in) |
| **Race** | A course with start/finish marks 24 cells apart, `competition` + `parkour` |
| **Match** | Two team spawns, `deathmatch`, a score limit |
| **Capture** | The most complete demo: a weapon, a flag you carry (pickup/drop/score verbs), disarm-on-hit, a base to return it to |

---

## What's deliberately not on this list

Documented as **proposals**, not runtime features — see the linked design
docs before promising any of these in a user manual:

- Scenes — one document holding more than one place (scenes.md)
- Server authority for anything beyond the `arbiter` interface (server-authority.md)
- Player-vs-player damage inside a room (§12)
- A folder-based XP (assets beyond the shipped catalogue, review, the store) — v2, see backend.md
- Mobile/desktop/XR-specific input (devices.md)
- AI-generated levels (ai-integration.md)
