# Scripting — feature inventory and recipes

What a script can actually reach today, and a set of worked recipes to start
from. The third of the user-manual inventories, beside
[editor-features.md](editor-features.md) and
[runtime-features.md](runtime-features.md) — same rules: a flat list of what is
built, not what is planned. The argument for each decision is in
[../manual.md](../manual.md) §6.5 and ../creator.md §10; this
is the list to write a user-facing manual from.

Source of truth for every claim: `packages/xp/src/rules/script.ts`,
`script-api.ts`, `triggers.ts`, `verbs.ts` and the host at
`src/app/xp/_runtime/simulation.tsx`, as of 2026-08-13. **Every code block in
§11 is run by `packages/xp/src/script-recipes.test.ts`** against the same
interpreter a browser runs, so a snippet that stops working fails a test rather
than a reader.

> Where this list and [../manual.md](../manual.md) §6.5 disagree, this one is
> newer. Three things moved after that section was written: `onTrigger` reaches
> five events rather than two, `other` is a real entity rather than `null`, and
> a level can have a script of its own.

---

## 1. What a script is

- **JavaScript in a QuickJS interpreter compiled to wasm**, not a Web Worker —
  so it answers same-frame questions synchronously, is interruptible, and has a
  genuinely closed global scope rather than a browser's surface with things
  subtracted from it.
- **The source lives in the document**, under `scripts`, as a name → source map.
  An XP is one file; a level whose behaviour is in four other files is a level
  that arrives half missing.
- **Names match `/^[a-z0-9][a-z0-9_-]*$/i`**, and each source is capped at
  **64 kB**.
- **Each entity gets its own run of the script.** Two turrets sharing `patrol`
  each get their own variables — a script is compiled as a *factory*, not
  evaluated as a module.
- **A blueprint with no `script` costs nothing**, and a document with no scripts
  at all never creates an interpreter.
- **The dividing line against verbs**: verbs for what happens, scripts for what a
  thing knows. A crate that breaks at zero health is three verbs and should stay
  three verbs; a platform whose position depends on last frame's position is not
  expressible as verbs at all.

---

## 2. Where a script is attached

Two places, and they behave differently:

| | Written as | `self` is | Runs |
|---|---|---|---|
| **On a blueprint** | `blueprints.<name>.script: "patrol"` | the entity | once per live entity of that blueprint |
| **On the level** | `script: "director"` at the top of the document | **not an entity** (id `-1`) | once, for the whole document |

- Both must name a key that exists in `scripts` — the parser refuses a blueprint
  or a document naming a script nobody wrote, by name, at parse time. A level
  whose logic silently does not run is a level that is merely boring, with
  nothing anywhere saying why.
- **The level's script has no body.** `self` is a handle onto nothing:
  `self.x` reads 0, moving it moves nothing, and `getEntityByName` is how it
  reaches the world. What it has instead is `world`, which is the point of it.
- The level's script gets `onSpawn` once at load and `onTick` every frame. It is
  **not** in the entity world, so it never receives `onTrigger`.
- Written in the editor under the **Scripts** panel in the left rail
  (`src/app/xp/_editor/panels/scripts.tsx`) — a list of the document's scripts, an
  editor for the one selected, and which blueprints use it.

---

## 3. The three hooks

| Hook | When |
|---|---|
| `onSpawn()` | Once, when the thing comes into being — placed by the document, spawned by a rule, or spawned by another script |
| `onTick(dt)` | Every frame. `dt` is seconds, capped host-side at **0.05** |
| `onTrigger(event, other)` | Something happened to it — see §4 |

- **All three are optional**, and a script with none of them is legal and does
  nothing, which is what a half-written one should do.
- **Declarations or `const` arrows** are both picked up. Neither is worth
  correcting.
- **Which hooks exist is recorded as bits at compile time**, so a script with no
  `onTick` costs no crossing into wasm per frame. That is the entire per-frame
  cost of a script that only reacts to things.
- **Order within a frame**: instances are reconciled (new entities get their
  `onSpawn`), then every `onTick` runs, then anything the scripts set off among
  themselves is delivered.
- **A script that spawns something scripted gets that thing's `onSpawn` in the
  *same* frame.** `reconcile` walks `world.alive`, which is a `Set`, and a
  member added while it is being walked is still visited. The `onTick` loop is
  the one that takes a snapshot, so a thing spawned this frame does not also
  *tick* this frame.

---

## 4. Listening: which events actually arrive

`onTrigger` is handed an event name and whoever set it off. **Five events reach
it from the world, plus one from other scripts:**

| Event | `other` is | Fires when |
|---|---|---|
| `enter` | whoever walked in | a prober's box starts overlapping this entity's |
| `exit` | whoever walked out | it stops overlapping |
| `collide` | whoever hit it | a collision, as opposed to an overlap |
| `held` | whoever picked it up | it goes into anybody's hands, ours or a peer's |
| `dropped` | **`null`** | it is put down, however it was put down — a thing no longer held has no holder to name |
| `damaged` | `null` | **only when a script dealt the damage** (`entity.damage(n)`), delivered in the same frame |

**`damaged` from a script is fired on a different rule from `damaged` in the
rules.** The bridge queues the hook whenever the target was alive before and
after, while `applyDamage` returns early on an entity with no `hp` property. So
`bag.damage(0)` on something with no health fires the **script's** `onTrigger`
and **none of its rules** — and on something with `hp` it fires both, which
makes `damage(0)` a deliberate poke that changes nothing.

**The rest of the trigger vocabulary is rules-only.** `spawned` has its own hook.
`pressed`, `finished`, `dealt`, `returned` and `emitted` fire rules but are
**not** delivered to any script — a level that must react to the whistle in code
does it by watching a property a rule wrote.

Three details that decide whether a script hears anything at all:

- **A blueprint only receives `enter`/`exit` if it carries at least one
  trigger**, and the parser requires every trigger to have at least one verb on
  it. So a blueprint cannot declare a bare `on: enter` purely to wake its script
  up; give it something harmless, conventionally
  `{ "op": "emit", "event": "touched" }`.
- **`other` is a real entity, including the player.** It used to be `null` — the
  player was a box with an id and nothing behind it. A script can now read the
  arriving player's position, properties and name (`getEntityByName('player')`
  finds the same body).
- **The hook runs *after* that entity's own verbs have.** A script asking about a
  property sees what the rules just did to it, not what it was before.

---

## 5. Saying something back: `emit` and `score`

Both leave the sandbox as **effects** — the engine has no opinion about what
they mean, and the host decides.

- **`entity.emit('name')`** produces `{ kind: 'emit', event, from, script: true }`.
  It puts a line in the on-screen ticker **and** is delivered to every entity
  with an `on: emitted` trigger listening for that name.
- **Every listener hears it.** The sender does not name a receiver, so a second
  thing that reacts is a new rule and no edit to the emitter. The listener's
  `other` is whoever emitted, so a `when` can ask about the sender.
- **The name is matched exactly** — no wildcards, no namespaces. An `emitted`
  trigger with no name is refused when the document is read, the way a `pressed`
  with no key is.
- **A chain works; a loop is bounded.** An `emitted` rule may itself emit, so
  `one` → `two` → `three` runs to the end. A rule that emits what it listens for
  is cut off after `MAX_SIGNALS` (512) deliveries in a frame rather than hanging
  the tab.
- **A script's emit does not cross the network; a rule's does.** The same
  argument `@kxb/xp/sharing` makes about animation: a script runs on every
  client from the same inputs and has therefore already emitted everywhere, so
  broadcasting it would fire every listener twice. A rule caused by a body fired
  on one machine only. That is what the `script: true` on the effect is for, and
  its only consumer.
- **Only the roots go on the wire, never the chain** — a peer that receives
  `gate-open` runs its own `emitted` rules and regenerates the rest.
- **Scripts still cannot subscribe.** `onTrigger` does not receive `emitted`;
  the listener is a *rule*. A script that wants to react to a name puts a verb
  on an `emitted` trigger that writes a property, and watches that.
- **`entity.score(n)`** produces `{ kind: 'score', amount, by }` and credits
  **the entity you called it on**. That is deliberately different from the
  `score` *verb*, which credits whoever set the trigger off — a script has no
  "whoever set it off".
- Also leaving as effects and worth knowing about: `spawn`, `despawn`, `damage`
  and the sounds and loads a script's verbs can cause.

---

## 6. `self` — the entity API

Reading a position gives **world coordinates**; writing one moves it **locally**,
relative to whatever it hangs from. The only asymmetry in the API, and it only
shows up on something with a parent — for anything unparented, which is nearly
everything, the two are the same number.

| | |
|---|---|
| `.x` `.y` `.z` `.rotation` `.scale` | Read and write. A scale of zero or less is ignored |
| `.moveTo(x, y, z)` / `.moveBy(dx, dy, dz)` | One crossing and one box rebuild instead of three |
| `.alive` | Whether it still exists |
| `.held` | **Read-only** — in anybody's hands, ours or a peer's. Assigning does nothing |
| `.get(k)` / `.set(k, v)` / `.add(k, v)` | Properties. Numbers only; a missing one reads as zero |
| `.damage(n)` / `.heal(n)` | `damage` runs the entity's own `damaged` rules *and* its `onTrigger`; `heal` is `add('hp', n)` and wakes nothing |
| `.despawn()` | |
| `.spawn(blueprint, dx, dy, dz)` | Relative to this entity. Gives back the new entity, or `null` |
| `.score(n)` / `.emit(event)` | Effects — §5 |
| `.distanceTo(o)` / `.flatDistanceTo(o)` | Flat ignores height, which is what "how close" means in a level with stairs |
| `.runAnimation(clip, loop?, parts?)` | Plays a clip; `runAnimation(null)` clears it |

**Lamps**, on anything the document gave a `light` block:

| | |
|---|---|
| `.intensity` `.range` `.colour` `.angle` | Read and write, **clamped** rather than refused, so a fade that overshoots on the last step ends dark instead of throwing the write away |

A script **cannot light an entity the document never called a lamp** — writes to
these on anything else do nothing. A level would otherwise have lights in it that
nothing in the file mentions.

**Animation** is the one thing a script could not do before: `blueprint.pose`
says what a body holds at rest and the host picks the rest from how it is moving,
so a script could walk a character across a room and could not make it wave when
it got there.

- **No `parts`** — the clip is the whole body and replaces what it was doing.
  Right for a death, a sit, a knockdown.
- **With `parts`** — `['arms']`, `['torso', 'head']` — the clip applies to those
  bones and is laid *over* whatever else is happening, so a character waves while
  it walks. Parts are `head`, `torso`, `arms`, `arm.l`, `arm.r`, `legs`, `leg.l`,
  `leg.r`, `upper`, or a bone name.
- **Clip names are not checked** — this engine does not know which glTFs a host
  loaded. An unknown name leaves the body doing what it was doing; the editor's
  picker is what stops an author writing one.
- **A script's animation does not need to cross the wire** (a rule's does):
  scripts are deterministic and run on every client, so `runAnimation` in an
  `onTick` already happens everywhere.

---

## 7. `world` — the clock, the dice, and the level's data

| | |
|---|---|
| `world.tick` | Frames since the start |
| `world.time` | Seconds. **Already one `dt` in by the first `onTick`** — a cooldown seeded at 0 fires 3 times in 3 seconds, not 4 |
| `world.seed` | The number the whole room was told, for a stream you keep yourself |
| `world.random()` | `0, 1)`, like the function it replaces |
| `world.roll(n)` | A die. `roll(6)` is 1–6, `roll()` is 6 |
| `world.randomInt(a, b)` | **Inclusive at both ends**, because `randomInt(1, 7)` is a bug somebody writes once a project |
| `world.pick(list)` | One of them. `undefined` for an empty list — a loot table that ran out is not a broken script |
| `world.get(k)` / `.set(k, v)` / `.add(k, v)` | The level's declared `data` |
| `world.spend(k, n)` | Take some **if there is some**, and say whether there was |
| `log(...)` | To the host's log panel, capped at 200 lines. Not a console |

- **`spend` is the refusal, not a subtraction with a nicer name.** `add(k, -5)`
  already subtracts. Buying something is *check the balance and take it*, and as
  two calls that is two moments a level can be wrong between. Short is a refusal
  that writes nothing and answers `false`; nothing here has an opinion about
  debt, and `add` will take a balance below zero quite happily.
- **A field the document never declared does not stick.** `get` reads 0, and
  `set`/`spend` do nothing and **say so in the log** — "there is no field called
  `X` — declare it in Data before writing to it". The parser refuses an
  undeclared field in a *rule* and cannot do the same here, because a key in a
  script may be built at runtime.
- **Chance is `hash(seed, tick, index)`, not a generator with a cursor.** A
  cursor works until somebody joins a match in progress: their cursor is at zero,
  everybody else's is at four thousand, and the two machines roll differently
  forever after. Addressed instead of advanced, a client that was wrong about how
  many rolls a frame contained is wrong for one frame.
- It is dice and jitter, **not a secret** — every client can compute the next
  one. Hidden state is [server authority.

> **The level's data is not reachable from `onTrigger`.** `world.get` reads 0 and
> `world.set`/`add`/`spend` do nothing, silently, for the whole of that hook —
> the data is only bound for the duration of `step`, and `onTrigger` is delivered
> outside it. Recipe 6 is the way round it. This is a gap rather than a decision.

---

## 8. What was taken away, and what was never there

**Never there** — a fresh QuickJS context simply is the language and nothing
else, which is the main reason it was chosen over a Web Worker: `fetch`,
`XMLHttpRequest`, `setTimeout`, `WebSocket`, `window`, `require`, `process`.

**Taken away, deliberately**, because two clients run the same rules over the
same entities and have to agree about the result:

- **`Date` is deleted.** A clock is per machine — two browsers on one desk are
  commonly seconds apart.
- **`Math.random` throws**, rather than disappearing, and the message names the
  replacement: *"Math.random is not available to a script: two clients would
  disagree about the result. Use world.random(), world.roll(6) or
  world.randomInt(a, b)."* A missing function sends an author looking for a typo;
  this sends them to the fix.

Both are the first things anybody reaches for, which is exactly why they are
removed rather than discouraged: a script using either looks correct on the
machine it was written on and desynchronises everywhere else.

---

## 9. When one goes wrong

- **One throw stops that entity's script**, permanently, for that run. It would
  otherwise throw again next frame with the same state, sixty times a second, and
  the failure that mattered would be at the top of a list of three thousand
  identical ones.
- **The rest of the level keeps running** — the other entities, the other
  scripts, the rules.
- **Line numbers are the author's.** A script is compiled as the body of a
  factory, so the interpreter's idea of line 1 is not yours; the offset is taken
  back out before anybody sees it, and there is a test pinning it.
- **Failures are shown on the HUD during play**, not in a console — the runtime
  says how many scripts are running and names what broke. A script that quietly
  stopped is a level that looks finished and is not.
- **Compile errors arrive as document problems** when the XP is opened, with the
  script's name and the author's line.

---

## 10. Limits and what a hook costs

| Limit | Value | Why |
|---|---|---|
| Source | 64 kB per script | Every byte is compiled before anything is drawn |
| Memory | 4 MB, shared by every script in one XP | A runaway array should hit a `RangeError`, not the tab's own limit |
| Fuel | 4 interrupt callbacks per hook call (~20 000 operations, ~3 ms) | `while (true) {}` is cut off |
| Stack | 256 kB | The recursion somebody writes by accident |
| Log lines | 200, oldest dropped | |

**The fuel is a count of operations, not a deadline in milliseconds.** A deadline
cuts a script off at a different place on a fast machine than on a slow one, so
two players would end up with different entity states — the one failure this
engine is arranged to make impossible.

Measured per frame against a 16.7 ms budget (`bun run xp:bench`, and an upper
bound — a loaded laptop makes this table fiction):

| entities | no `onTick` | arithmetic only | reads/writes `self` | looks another entity up |
|---|---|---|---|---|
| 100 | 0.01 ms | 0.06 ms | 0.60 ms | 1.00 ms |
| 500 | 0.02 ms | 0.32 ms | 3.36 ms | 5.09 ms |
| 1 000 | 0.04 ms | 0.66 ms | 6.48 ms | 10.62 ms |

**A script that only computes is cheap; a script that talks to the world is
not** — the cost is per call across the sandbox boundary, not per line of
JavaScript. A thousand entities doing arithmetic is 4 % of a frame; the same
thousand asking about their neighbours is 64 % of it. So the ceiling depends on
what the scripts *do*, not how many there are. The way to raise it is to touch
the world less often — cache what `getEntityByName` gave you, read `self.x` once
into a variable — not to write less code.

---

## 11. Recipes

Every one of these is run by `packages/xp/src/script-recipes.test.ts`.

### 1. A platform that patrols

The canonical case for a script rather than verbs: where it should be depends on
where it was.

```js
let going = 1

function onTick(dt) {
  self.x += going * 3 * dt
  if (self.x > 3) going = -1
  if (self.x < -3) going = 1
}
```

```jsonc
"blueprints": { "block": { "model": "proto/Primitive_Cube", "script": "patrol" } }
```

`going` belongs to *this* block. Two blocks with `patrol` on them each get their
own, which is why a script is a factory and not a module. Anybody standing on it
is carried, as long as they are grounded.

### 2. A door that opens when you are near

```js
const OPEN = 3

function onTick() {
  const player = getEntityByName('player')
  if (!player) return
  const near = self.flatDistanceTo(player) < 4
  self.y = near ? OPEN : 0
}
```

`flatDistanceTo` ignores height, which is what "how close is the player" means in
a level with stairs: somebody one floor up is not out of range. Guard the `null`
— the player is not in the world before they spawn.

### 3. A cooldown, which is how a script waits

There is no `setTimeout`. A delay is `world.time` and a number you kept, which is
also the only version of a delay two clients agree about.

```js
let ready = 0

function onTick() {
  if (world.time < ready) return
  ready = world.time + 1
  self.add('shots', 1)
}
```

Note the off-by-one worth knowing: `world.time` is already one `dt` in by the
first `onTick`, so this fires at 0.05 s, 1.05 s, 2.05 s — three times in the
first three seconds.

### 4. A pickup that knows who took it

```js
function onTrigger(event, other) {
  if (event !== 'enter' || !other) return
  other.add('coins', 1)
  self.score(1)
  self.despawn()
}
```

```jsonc
"coin": {
  "model": "proto/Box_A",
  "collider": "none",
  "script": "coin",
  "triggers": [{ "on": "enter", "do": [{ "op": "emit", "event": "coin" }] }]
}
```

**The trigger block is what makes the hook fire at all** (§4) — a blueprint with
no triggers is never tested for crossings, and a trigger with an empty `do` does
not parse. `other` is the player as a real entity, so `other.add` writes a
property on them.

### 5. Chance everybody agrees about

```js
function onSpawn() {
  self.set('face', world.roll(6))
  self.set('side', world.pick([10, 20, 30]))
}
```

Two clients opening the same document with the same seed get the same face. Alone
— a test, a screenshot, the editor — the seed is the document's own id, so the
same level rolls the same game every time it runs.

### 6. Buying something, and where the purse is reachable from

`world.spend` is one call so that checking and taking cannot come apart. But the
level's data is **not** bound during `onTrigger` (§7), so the hook raises a flag
and `onTick` does the work:

```js
let asked = false

function onTrigger(event) {
  if (event === 'enter') asked = true
}

function onTick() {
  if (!asked) return
  asked = false
  if (world.spend('coins', 5)) self.spawn('prize', 0, 1, 0)
  else log('not enough coins')
}
```

Written the obvious way — `world.spend` straight inside `onTrigger` — it reads a
balance of 0, takes nothing, and says nothing. That is the gap, not the design.

### 7. Waving while walking

```js
let waved = false

function onTick() {
  const player = getEntityByName('player')
  if (!player) return
  const near = self.flatDistanceTo(player) < 5
  if (near && !waved) { self.runAnimation('Wave', true, ['arms']); waved = true }
  if (!near && waved) { self.runAnimation(null); waved = false }
}
```

`['arms']` is what turns a clip into a *layer*: the arms take the offset the
animator authored and the legs keep their cycle. Without it the clip is the whole
body and replaces what it was doing. The `waved` flag is what stops it being
asked for sixty times a second.

### 8. A lamp that breathes

```js
function onTick() {
  self.intensity = 2 + Math.sin(world.time * 3)
}
```

Only on a blueprint with a `light` block. Values are clamped, so a curve that
overshoots lands at the edge instead of being thrown away.

### 9. A director — the level's own script

```jsonc
"script": "director",
"data": { "wave": { "scope": "player", "value": 0 } }
```

```js
let next = 0

function onTick() {
  if (world.time < next) return
  next = world.time + 2
  world.add('wave', 1)
  log('wave ' + world.get('wave'))
}
```

`self` is not an entity here, so everything goes through `world` and
`getEntityByName`. This is the hook for anything that is about the level rather
than about a thing in it.

### 10. One thing telling another

A script announces; **rules** listen. The gate is not named by the bell, so a
third thing that reacts is one more rule and no edit to the script.

```js
// on the bell
function onTrigger(event) {
  if (event === 'enter') self.emit('ring')
}
```

```jsonc
"gate": {
  "model": "proto/Primitive_Wall",
  "props": { "open": 0 },
  "triggers": [
    { "on": "emitted", "event": "ring", "do": [{ "op": "setProp", "key": "open", "value": 1 }] }
  ]
}
```

For a *script* to react, have the rule write a property and watch it — the
`was` variable is what turns a level into an edge:

```js
let was = 0
function onTick() {
  const gate = getEntityByName('gate')
  if (!gate) return
  const now = gate.get('open')
  if (now === was) return
  was = now
  self.runAnimation(now ? 'Cheer' : null)
}
```

### 11. Damage that wakes the rules

```js
// on the fist
function onSpawn() {
  const bag = getEntityByName('bag')
  if (bag) bag.damage(3)
}

// on the bag
function onTrigger(event) {
  if (event === 'damaged') self.add('hits', 1)
}
```

`damage()` goes down the same path a shot does, so the bag's own `damaged`
**rules** fire *and* its `onTrigger` is called in the same frame. A script that
wanted to change health without waking anything up wanted `set('hp', n)`, and can
say so.

---

## 12. What a script cannot do

- **React to the whistle.** `finished`, `dealt`, `pressed` and `returned` fire
  rules, never scripts (§4). Watch a property a rule wrote instead.
- **Reach the level's data from `onTrigger`** (§7). A gap; recipe 6 is the way
  round.
- **Hear an emitted name directly.** `emit` reaches **rules** (`on: emitted`),
  not `onTrigger` — a script listens by having such a rule write a property it
  watches (§5).
- **Wait.** No `setTimeout` — a deadline in `world.time` is the only delay two
  clients agree about (recipe 3).
- **Push you.** Being carried is standing on top of something. A block moving
  *into* you stops you, like a wall that happens to be somewhere else next frame.
- **Keep a secret.** Everything a script computes, every client can recompute.
  Hidden state is server authority.
- **Reach another script's hooks.** The four names are passed in rather than read
  off a global, so a script that shadows `self` breaks only itself.

---

## What's deliberately not on this list

Proposals, not features — see the linked design docs before promising any of
these:

- An expression language for rules, so that computing does not require a script
  (../creator.md §10)
- Scripts reacting to *why* a match ended — recorded as known-deferred in
  `packages/xp/src/rules/triggers.ts` beside the `finished` event: it arrives as a way
  to read match-level facts (the clock, the score, the winner) designed once,
  rather than as three event names
- Server-side scripts, or any script the client cannot reproduce
  (../server-authority.md)
- AI-written scripts (../ai-integration.md)
