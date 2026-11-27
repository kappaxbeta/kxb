# XP Creator

A creator for playable experiences, and a runtime that reads them out of a
document.

You build an XP in an editor, save it as one document, and hand that document to
a runtime. The runtime does not know what game it is running until it reads the
document - the same way a console does not know what game it is running until
you push a cartridge in.

**v1 lives in the backoffice.** The creator is an operator tool at
`/ovaloffice/xp`, next to the builder, the studio and the animator. Not a
customer feature, not a public route, nobody outside the team. **v2 is handing
XPs out** - export, the download, the libraries, self-hosting - and it is
designed for but not built. Section 12 says what that costs and what it does not.

**M0 and M1 are built.** The prototype pack is measured and catalogued, the
document format and its parser exist, and `/xp/first-room` is a world you can
walk around in. Section 14 marks what is done, and Sections 4 and 14 record what
the building taught that the planning had not. The rest is still a plan, written
against what the repo already has - most of the hard parts were already here and
the work is mostly about *arranging* them rather than writing them.

Read [architecture.md](../architecture/event-sourcing.md) first if you have not - the event
sourcing rules here are the ones already in force, not new ones.

**Two documents continue this one and neither is built.**
[xp-backend.md](backend.md) answers §16.1 - what an XP is once it has an
audience, and it turns out to be a folder owned by an account and living in a
space. [xp-scenes.md](scenes.md) answers what a document is once one place is
not enough: a tree of scenes, timelines that make a scene play itself, and the
three save scopes that turn a level into a world people come back to. That one
changes the format, so it is announced and landed alone - see
[xp-two-sessions.md](two-sessions.md).

---

## 0. The honest size of this

As stated the ask is an engine, an editor, a netcode layer, a scripting system,
a package format, a registry, an export pipeline and a self-hostable backend. As
one project that is a year. Cut to what v1 actually is - an editor and a runtime
in the backoffice - it is about three months of two-week slices, and the first
slice is worth having on its own.

So this document is arranged to be *cut*. Section 14 is the milestone order and
every milestone ends with something playable. Stop after M2 and you have a proto
pack in the builder and a runtime that walks around a document you wrote by
hand. Stop after M3 and you have the shooter. Stop after M4 and the modes work
in two browsers.

**What deferring the download does and does not change.** It removes the
exporter, the bundler, the published packages and the project template - none of
which get harder by waiting, and all of which would need rewriting once a real XP
existed to export. The pack registry is not deferred but cut outright, because
the `source` URL on each pack does its job better (Section 13). It changes
nothing about the architecture: the four habits that make export possible are
the same four that make the engine testable: a self-describing document, a
backend behind a port with two implementations, no Supabase import under the
runtime, and directory boundaries where package boundaries would go. Those are
free while the code is being written and miserable to retrofit, so v1 keeps
them.

Two things worth reading before the rest, because they are the decisions the
plan hangs on rather than details inside it: **Section 1.2** (the engine copies
the lounge's modules rather than importing them, and the lounge is not touched)
and **Section 2.0** (backoffice-only, and the four things that stops being a
problem).

---

## 1. What already exists

The reason this is tractable: the simulation is already written, and it is
already framework-free. These modules take numbers and return numbers, have
tests that run without a browser, and none of them import React or three.

They are the **source material**, not dependencies - see 1.2. The XP engine
copies them and owns its copies.

| What | Where | What the XP engine takes from it |
|---|---|---|
| Character controller | `src/app/world/lounge/_sim/physics.ts` | Walking, gravity, jumps, axis-at-a-time collision against an `isSolid` predicate, player separation |
| Melee | `src/app/world/lounge/_sim/combat.ts` | Dash attack, damage roll, health, the "each client owns its own health" rule |
| Ball game | `src/app/world/lounge/_sim/football.ts` | Ball integration, kicks, goal crossing, kickoff, single-owner election |
| Race | `src/app/world/lounge/_sim/race.ts` | Start/finish marks, timing, finish reporting |
| Spawning | `src/app/world/lounge/_sim/spawn.ts` | Spawn points, arrival ring, respawn placement |
| Presence protocol | `src/app/world/_presence/presence-core.ts` | The wire shape for who is here, emotes, speech |
| Peer rendering | `src/app/world/lounge/_canvas/multiplayer.tsx` | 8 Hz position fan-out, interpolation, nameplates, health bars, team rings |
| Voxel aggregate | `src/domain/lounge/{events,aggregate,commands}.ts` | Chunked block storage, batched edits, the bounds that keep it cheap |
| Edit buffering | `src/app/world/lounge/_hooks/use-edit-buffer.ts` | Local-first placement, background flush, the `persist: false` demo mode |
| World document | `src/domain/builder/world.ts` | `Placement`, ground, lamps, marks - a built world as JSON |
| Pack address space | `src/domain/builder/packs.ts` | `pack/name` ids, per-pack scale and lift onto a one-unit grid |
| Model catalogue | `src/domain/builder/catalogue.generated.ts` | 1,308 models, generated, with thumbnails |
| Drawing tools | `src/domain/builder/draw.ts` | Line, rectangle, fill, wall runs on the cell lattice |
| Share codec | `src/domain/builder/share.ts` | A world compressed into a URL, validated on decode |
| Marks | `src/domain/lounge/goal-events.ts` | Goals, start and finish frames, as placeable objects with a lifecycle |
| Rig and clips | `src/domain/animator/{rig,clip,presets}.ts` | The dummy's 23 bones, IK limits, pose keys, GLB export |
| Scene keys | `src/domain/studio/keys.ts` | Generic keyframing of any numeric property of any node |
| Bounds measuring | `scripts/prop-bounds.ts` | Reads geometry, reports footprint - the basis for auto-collision |
| Model thumbnails | `scripts/render-models.ts` | Offline renders for picker tiles |

Two assets matter more than the rest:

- **`public/xo/proto/`** - 171 files of KayKit Prototype Bits. Walls, floors,
  slopes, stairs, doorways, pillars, crates, barrels, lockers, a workbench, a
  weapon rack, three guns, ammo, bullets, targets that break into pieces, and
  `Dummy_Base`. This is a shooter's art department, already in the repo, and
  it is not registered in any pack yet. It is the right first pack for the XP
  creator for exactly that reason - it is unclaimed, so nothing existing can
  break when we scale it.
- **`public/xo/pda/dummy/Dummy.glb`** - the same dummy as a GLB, already
  described bone by bone in `src/domain/animator/rig.ts`, already tested
  against the file. The default skeleton exists.

### 1.1 What does *not* exist, and is the actual work

- Anything that reads a game out of a document. Every rule today is a `.ts`
  file the renderer imports.
- Entities. The lounge has blocks, avatars, a ball and goals - four hardcoded
  kinds. There is no general "thing in the world with components on it".
- Blueprints. There is no way to say "a crate is this model, this collider,
  this trigger, and it breaks into `target_pieces_*` when shot".
- Any editor for behaviour. The builder places models; the studio poses a
  photograph; the animator moves bones. None of them author *rules*.
- Input maps. Keys are hardcoded in `lounge-scene.tsx`; touch controls are a
  fixed layout in `touch-controls.tsx`.
- Any packaging, export or backend abstraction at all. Everything reaches for
  `@/lib/supabase/*` directly.

### 1.2 Copy, do not import. And do not touch the lounge.

Two rules, and they are the same rule from two directions.

**The lounge is not being ported.** `src/app/world/lounge/lounge-scene.tsx` is
5,352 lines. Rewriting it on top of the XP runtime is the obvious-looking move
and it is the wrong one: the lounge is live, people are in it, and the reward
for a perfect refactor is a world that behaves exactly as it did before.

**The XP engine copies the pure modules rather than importing them.**
`src/domain/xp/physics.ts` is a copy of the lounge's, tests
included, and from that moment it is a different file with a different owner.
Nothing under `src/domain/xp/` imports from `src/app/world/`.

This is a deliberate trade, so both sides of it should be written down.

*What copying buys.* The engine can change. A shooter wants a different jump
arc, a crouch, a per-role speed, a hitscan raycast against colliders the lounge
does not have - and every one of those is a five-minute edit on a copy and a
negotiation on a shared module, where the other consumer is a room with people
standing in it. Shared code between a stable product and an active prototype
means the prototype either drags the product around or gets stuck. It also means
the engine ends up with **zero dependencies on app code**, which is the same
property v2's export needs anyway, arrived at for free rather than by
untangling.

*What copying costs.* Drift, and fixes that have to be made twice. That cost is
real and worth paying here, but it should be paid with eyes open:

- Copy the **tests** with the module. A copied `physics.ts` without
  `physics.test.ts` is how a copy silently rots.
- Head each copied file with a one-line provenance note - what it was copied
  from and roughly when - so anyone reading it knows there is a sibling.
- When a genuine bug is fixed in one, fix it in the other in the same change.
  Behaviour *differences* are fine and expected; a bug is not a difference.
- Do not copy back. Improvements in the XP engine do not get merged into the
  lounge on the grounds that they are better - that turns two independent files
  into one shared file with extra steps.

The modules worth copying are the seven in the table above that are already
pure. Anything that is not pure - `lounge-scene.tsx`, `multiplayer.tsx` - is
read for its protocol and its constants, and rewritten.

### 1.3 The rule is enforced, not agreed

`eslint.config.mjs` restricts imports under `src/domain/xp/**`: nothing from
`@/domain/builder`, `@/domain/lounge`, `@/domain/studio`, `@/domain/world` and
the rest, and nothing from `@/lib/supabase`. The message names this section and
tells you what to do instead.

A convention would not have held. An import is one keystroke of autocomplete
away, it compiles, the tests pass, and the coupling is invisible until somebody
changes a shared constant and a room full of people falls through the floor.

**The assets are separated too.** `public/xp/packs/` holds the XP creator's own
copy of the art, and `public/xp/thumbs/` its own thumbnails. Same bytes as
`public/xo/` today, 2.3 MB of them, and a separate address space on purpose:
re-exporting a pack at a different scale, or dropping one, cannot reach over and
change what the lounge is drawing. It is also what makes the export in Section
12 a copy of one directory rather than an audit of which files the lounge also
needs.

The divergence is not hypothetical - it showed up on the first day. The XP pack
table lists the prototype kit first and the builder's lists blocks first,
because "what you build with" has two different answers in two different tools.
One shared array could not say both.

---

## 2. The two environments

### 2.0 Who this is for

**The backoffice, and only the backoffice.** The creator lives at
`/ovaloffice/xp`, next to the builder, the studio and the animator, and it is an
operator tool - not a feature customers get. Nobody outside the team opens it.

That is a scoping decision with real consequences, all of them good for the
first year:

- **No permission model.** `/ovaloffice` is already gated. An XP has no
  visibility field, no sharing, no "who may edit this" - because there is one
  answer and it is already enforced one layer up.
- **No public route to defend.** The player environment is `/ovaloffice/xp/[id]`
  too. A world in the lounge is something strangers walk into; an XP is
  something we run.
- **The file-or-row question gets quieter** (16.1). A row exists to give a thing
  an owner and an audience. An operator tool has neither, so a file stays right
  for longer than it otherwise would.
- **The `kxb` backend adapter shrinks.** Identity is an admin who is already
  signed in. Teams are people we invited. No guest flow, no join links, no
  onboarding.

What it does *not* change: the runtime still reads a document and talks to a
backend port, because that is what makes the thing testable and what leaves the
door open. Building an operator tool is not a reason to hardcode.

When an XP eventually needs an audience - a demo world, a customer's arena, a
public match - the shape it grows into is the battlefield's (Section 3.1), and
that is a decision to make with a specific XP in hand rather than in advance.

### 2.1 Creator

Route: `/ovaloffice/xp/[id]`.

It is one screen with the viewport in the middle and a rail that switches tool:

| Tool | What it does | Starts from |
|---|---|---|
| **World** | Place models on the grid, draw walls and floors, import an existing built world | Copies of `builder/draw.ts` and the lounge's block picker; `builder/packs.ts` for the address space |
| **Workbench** | Turn a model into a blueprint: colliders, sockets, trigger volumes, clips, material overrides | New, on top of a copy of `animator/rig.ts` |
| **Entities** | Drop blueprints into the world, set their per-instance properties | new |
| **Rules** | Pick a mode preset, then tune it - teams, score limit, respawn, weapons, timers | new |
| **Input** | Key map and mobile layout, both starting from a working default | new |
| **Cameras** | First person, third person, orbit, fixed - per role | `studio/shot.ts` conventions |
| **Script** | The escape hatch. Declarative rules first, code later (Section 10) | new |
| **Try out** | Mount the player environment over the unsaved document | Section 2.3 |
| **Save / open** | A `.xp.json` on disk, autosaved to `localStorage` as you go | `builder/world.ts` conventions |

No Export tool in the rail for now (Section 12). Save writes the document; that
is the whole distribution story until there is somebody to distribute to.

### 2.2 Player

Route: `/ovaloffice/xp/[id]/play`. One React component, mounted by that route -
and the same component an export would mount later, which is the only reason to
keep it a component rather than a page.

The player environment owns everything the creator deliberately does not:

- **Who you are.** An admin who is already signed in, read through the identity
  port (Section 11) rather than from Supabase directly. Guests and sign-in flows
  are ports that exist and go unimplemented until an XP has an audience.
- **Which side you are on.** Team assignment from the rules block - fixed,
  balanced, first-come, or picked.
- **Who owns what.** Authority election for shared objects (Section 9).
- **The network.** One channel per instance, the same 8 Hz fan-out the lounge
  uses, with the same rate ceiling in mind.
- **The loop.** Fixed-step simulation, systems in a declared order, render
  interpolated.

The player environment reads *only* the document plus the backend adapter. If it
ever imports a rule directly, that rule belonged in the document.

### 2.3 Try out

Try out is not a preview. It is the player environment, mounted in the editor,
over the in-memory document, with the backend adapter swapped for the local one
and three dummy players spawned in.

That is what makes it worth having: a preview that runs different code from the
real thing tells you nothing, and the whole architecture here exists so that the
runtime is a pure function of `(document, backend)`. Trying out is passing it a
document that has not been saved and a backend that forgets.

The three controllable players from the ask live here: one you drive, two you tab
between, all three running the same code a networked player runs with the
`local` adapter standing in for the wire. That is how you test a two-team mode
alone, which is most of what you will be doing - and it is why the `local`
adapter has to be real rather than a stub.

---

## 3. The cartridge

One document. Everything an XP is.

```jsonc
{
  "format": "xp/1",
  "id": "…",              // stable across versions
  "version": "0.4.0",
  "meta": { "name": "Proto Shooter", "blurb": "…", "authors": [], "license": "…" },

  "packs": [              // what art this needs, and where it came from
    {
      "id": "proto", "version": "1.0.0", "integrity": "sha256-…",
      "author": "Kay Lousberg", "licence": "CC0",
      "source": "https://kaylousberg.itch.io/"
    }
  ],

  "world": { /* the BuilderWorld shape, copied - see domain/builder/world.ts */ },

  "blueprints": {         // the GOBs
    "crate": {
      "model": "proto/Box_A",
      "collider": { "kind": "box", "auto": true },
      "sockets": [{ "name": "lid", "node": "Box_A_lid" }],
      "triggers": [{ "on": "damaged", "do": [{ "op": "spawn", "blueprint": "crate_debris" }, { "op": "despawn" }] }],
      "clips": {}, "material": {}, "tags": ["breakable"]
    }
  },

  "entities": [           // blueprint instances placed in the world
    { "blueprint": "crate", "at": [4, 0, -7], "rot": 90, "props": { "hp": 20 } }
  ],

  "roles": {              // what a player can be
    "shooter": { "blueprint": "player_dummy", "camera": "fps", "loadout": ["pistol"], "speed": 6.5 }
  },

  "teams": [ { "id": "red", "colour": "#f0abfc" }, { "id": "blue", "colour": "#67e8f9" } ],

  "rules": {              // the mode, and its knobs
    "preset": "deathmatch",
    "assign": "balanced",
    "scoreLimit": 20, "timeLimit": 300,
    "respawn": { "delay": 3, "at": "team-spawn" },
    "friendlyFire": false
  },

  "input": {
    "keys":  { "forward": ["KeyW", "ArrowUp"], "fire": ["Mouse0"], "…": [] },
    "mobile": { "layout": "twin-stick", "buttons": [{ "action": "fire", "at": "br", "icon": "…" }] }
  },

  "cameras": { "fps": { "kind": "first", "eye": 1.7, "fov": 75 } },

  "scripts": [],          // Section 10

  "backend": {            // what this XP asks of whatever it is plugged into
    "needs": ["identity", "party"],
    "wants": ["persistence", "leaderboard"]
  }
}
```

Four decisions inside that shape are worth defending.

**The world keeps the `BuilderWorld` shape.** `src/domain/builder/world.ts`
already models a built world as placements on a one-unit lattice with ground and
lights, it already has a share codec, and `src/domain/worlds/blocks.ts` already
crosses it into standable lounge blocks. Inventing a *different* world shape
would mean two importers, two renderers and two sets of scale bugs.

Copied, not imported, per 1.2 - and here the copy earns its keep immediately,
because the XP version diverges on day one: entities alongside placements,
per-placement collider overrides (shipped, see 7), and eventually a y-range the lounge's
`WORLD_HEIGHT` does not allow. Keeping the *shape* is what makes "import a world
you already built" a one-function conversion; keeping the *file* would make
every one of those additions a change to a document the builder also writes.

**Entities are separate from the world.** A wall is a placement; a crate that
breaks is an entity. They render the same and they are stored apart, because
placements are bulk data you drag out by the hundred and entities are things you
name, script and address. Mixing them means every entity lookup walks the whole
world.

**`backend.needs` versus `backend.wants`.** The document's contract with the
slot. `needs` failing to resolve is a hard error before the XP loads; `wants`
failing is a degraded feature and a note in the console. It earns its keep in v1
straight away: an XP with a leaderboard has to run under `Try out` on the
`local` adapter, which has no event store, and without the split it would simply
refuse to start there.

**Packs carry an integrity hash.** Nothing reads it in v1 (Section 13). It is in
the format from M1 because a format that grows a hash later has to migrate every
document written before it, and an unread field costs nothing.

### 3.1 Where it lives

Same trade `builder/world.ts` already makes, for the same reasons, and
backoffice-only makes it easier rather than harder: **a file, for all of v1.** It
autosaves to `localStorage` as you edit and Save writes a `.xp.json`. No table,
no migration, no permission story, and the editor is usable the day it renders.

The argument that usually kills file-first is "but then nobody can find it", and
that argument does not apply to a tool three people open. What it does mean is
the editor must not lose work: autosave every change, keep the last few
snapshots in `localStorage` rather than one, and warn before opening over unsaved
edits. Losing an afternoon of building is the one unforgivable bug a builder can
have, and it is the *only* thing a file costs here.

The row comes when an XP needs an audience. The shape to take then is
`src/domain/battlefields/events.ts`: a stream holding the *identity* - name,
author, visibility, published version - while the document stays a blob, exactly
as a battlefield's identity is a stream and its blocks are chunks. See
Section 16.1.

---

## 4. The proto pack, and the grid - **done (M0)**

`xo/proto` is registered, catalogued and drawn. What the measurement found, and
the two things that came out of it:

**One authored unit is one metre is one cell, so `scale: 1`.** Measured off the
geometry rather than guessed: a table is 0.8 units tall, a door 2.8, a locker 3,
the dummy 2.197, and every structural piece is an integer - walls 4 by 4 by 1,
floors 4 by 4, the big cube 4 a side and the small one 2. That is a set drawn at
a metre a unit, and this grid is a metre a cell, so nothing needs converting and
a wall spans exactly four blocks.

The cross-check is what settles it: a bb10 cube measures 2.02 authored at its
declared `scale: 0.5`, which is the one cell it is supposed to be, and the peep
fox measures 1.686 at `scale: 1`, which is the "shade under two cells" the pack
comment claims. The proto dummy at 2.197 then lands just above a peep and just
below a 2.8 door - which is what a humanoid next to a chunky animal should look
like. `scripts/render-models.ts` machinery will draw the line-up at true scale
if it ever needs re-checking.

**`lift: 0`, and a finding for the workbench.** 65 of the 85 models stand on
y=0, which is every piece you build with. The other 20 are centred on their own
pivot: the guns, the ammo, the coins, the bat, the barrels, the wall targets.
That is correct for what they are - things that hang off a socket or a wall -
and it means placing one on the lattice sinks it by half its height. **That is a
per-blueprint offset, not a pack one**, because moving the pack would lift the
other 65 off the ground. Section 5's collider/socket pass is where it gets
fixed, and the fact that the centred set is exactly the socket set is a hint
that the pack author already sorted them for us.

**A second finding, for the player blueprint.** The dummy is 2.197 cells tall
while the character controller puts an eye at 1.7. Eyes at 77% of height reads
as looking out of the chest; a human is nearer 93%. So the player blueprint
carries a scale of about 0.82, making the dummy 1.8 cells with its eyes where
the camera is. That is a blueprint knob, not a pack one - the architecture is
metric and correct, and only the character needs sizing to the camera.

**What was done:** `proto` added to `PACKS` and to `PACK_ORDER` second (behind
`bb10`, not first as originally planned - the existing builder's ordering rule
is "what you build structures out of", which is both of them, and demoting
blocks in a live tool to serve a project that has not shipped is not a trade
worth making). Catalogue regenerated: 1,308 models becomes 1,393. 85 thumbnails
rendered to `public/thumbs/builder/proto/`. `Pack` gained `author`, `licence`
and `source` (Section 12.3), which is why all twelve entries changed.

**Not done, deliberately: the lounge palette is untouched.**
`src/domain/lounge/palette.ts` guards an immutable event log; a barrel in it is
a cube you walk on that happens to be drawn as a barrel. The XP runtime renders
placements directly, so it never needs the palette. Same line `worlds/blocks.ts`
already draws.

The grid placement system is the lounge's, unchanged in behaviour: raycast to a
face, snap to the cell, place on release, drag to run. What changes is where the
result goes - a `Placement[]` in the document rather than a `BlocksPlaced` event.
`use-edit-buffer.ts` is the model for the write path if XPs ever become
collaborative; for a single-author editor, straight to local state is right.

**The cube from the lobby stays.** The highlight cube, the face normal, the
one-cell step - that is the interaction people already know, and it is the
cheapest thing in the whole plan to port because it is a raycast and a `Math.floor`.

---

## 5. The workbench

The workbench turns a model into a **blueprint**: a game object that knows what
it is made of.

You open a `.gltf`, and the workbench shows its node tree. Then you annotate:

- **Colliders.** Auto is the default and it is a box from the geometry bounds -
  the measurement `prop-bounds.ts` already does. Manual gives you box, sphere,
  capsule, or "voxel", meaning it participates in the same `isSolid` grid the
  character controller already queries. Per-node, so a table is a top you stand
  on and legs you walk between.
- **Sockets.** Named attachment nodes. The dummy's rig already documents two of
  these (`handslot.l`, `handslot.r`) and calls out that they are places to hang
  a weapon rather than parts of a body - which is exactly what a socket is. A
  gun blueprint attaches to a socket; that is the whole weapon system.
- **Triggers.** A volume plus an event plus a list of ops. `on: enter | exit |
  damaged | used | timer`, ops from a fixed vocabulary (Section 10).
- **Clips.** Animations from the file, plus anything authored in
  `/ovaloffice/animator` - which already exports GLB and re-opens JSON. A
  blueprint maps *states* to clips: idle, walk, run, jump, fire, hit, die. The
  mixer is `THREE.AnimationMixer`; the state machine is data.
- **Material overrides.** Colour, emissive, and a named shader from a small
  shipped set. Not arbitrary GLSL - see Section 16.4.

The workbench is where the "bigger dummy" happens: the default player blueprint
is `pda/dummy` at play scale, and a variant at a larger scale is a second
blueprint pointing at the same file, not a second model.

Skins: a blueprint declares a `skeleton` (`dummy` or `peep`), and a skin is any
GLB that binds to that skeleton. The peeps are the second skeleton because 24 of
them already exist, `src/domain/lounge/avatars.ts` already has the roster to
copy, and a signed-in operator already has one chosen. So "the skin a logged-in
user picked" is a value the player environment reads from the identity port and
hands to the blueprint - not a new feature.

Which is also the answer to the ask's "import skins the user can choose": v1 has
two skeletons and 25 skins between them without importing anything, and a real
skin importer - upload a GLB, check it binds, store it - is worth building only
once somebody has one to upload.

---

## 6. Entities and systems

Call it ECS if you like; do not build a general one.

The concrete plan: **components are plain maps keyed by entity id, systems are
functions run in a declared order, and the whole thing is pure over a `World`
struct.** No archetypes, no bitsets, no scheduler. The reason is the same one
that makes `physics.ts` testable: a system that takes state and returns state
can be tested without a canvas, and the moment you add an archetype allocator
you cannot.

```ts
interface XpWorld {
  tick: number
  transform: Map<Id, { x: number; y: number; z: number; rot: number }>
  velocity:  Map<Id, Vec3>
  health:    Map<Id, number>
  blueprint: Map<Id, string>
  owner:     Map<Id, PlayerId | null>   // Section 9
  // …one map per component, added as needed
}
```

Systems, in order, at a fixed 60 Hz step:

```
input → intent → movement (physics.ts) → separation → weapons → projectiles
      → collisions → triggers → rules → cleanup
```

Two rules keep this honest:

- **A system never touches the renderer.** The scene reads the world after the
  step and interpolates. This is what lets the whole simulation run in a test.
- **A system never awaits.** Anything asynchronous - a server action, a
  persistence write - is an *effect* the step returns, drained by the host.
  Same discipline the deciders in `src/es/` keep.

Performance ceiling to design against, not to optimise for now: a few hundred
entities and eight to sixteen players. Past that the maps become typed arrays,
and nothing above changes shape.

---

## 7. Collision and triggers

Three collision worlds, and they do not fight:

1. **The voxel grid** - the world's placements, rasterised into the `isSolid`
   predicate `physics.ts` already takes. Free, exact, and already tested.
2. **Blueprint colliders** - boxes and spheres, broad-phased on a uniform grid
   with the same cell size. Overkill avoided: at a few hundred entities on a
   256-cell world, a hash grid is thirty lines and beats anything cleverer.
3. **Trigger volumes** - no physical response, just enter/exit bookkeeping per
   entity pair, resolved after movement so a trigger fires on the position you
   actually ended at.

Auto-collision is the default because the alternative - every crate needing a
hand-drawn box - is what makes editors unusable. It is derived at *import* time,
written into the blueprint, and editable afterwards. Deriving it at runtime would
mean parsing geometry to answer "can I walk here".

**Per-placement overrides - done.** `placement.collider` is `"none"` or a list of
up to eight boxes in the model's own frame, and it replaces the measured shape
rather than intersecting with it. A list rather than one box because the piece
that needs it is an arch, and one box cannot hold a doorway; boxes rather than a
finer grid because (1) is a `Set.has` and the whole controller is written against
unit cells. `docs/xp/manual.md` §4 has the table and the three rules.

Projectiles are a raycast against (1) and (2) with a max range, not simulated
bodies. A shooter needs hitscan long before it needs ballistics, and the
`Bullet` model in the proto pack is a tracer, not a physics object.

---

## 8. Modes

A mode is a **preset**: a rules block with sane defaults and a system that reads
it. Four ship at M4, each mapped to something that already works.

| Preset | Rules it adds | Starts from |
|---|---|---|
| **Football** | Two teams, one ball, goals, score, kickoff | A copy of `football.ts` - ball integration, kicks, goal crossing, single-owner election |
| **All vs all** | No teams, kills score, respawn on a delay | Copies of `combat.ts` and `spawn.ts` |
| **Freestyle** | No score, no timer, building allowed | The lounge's own behaviour, minus the rules |
| **Parkour** | Start and finish marks, timer, per-player best | A copy of `race.ts`, and the `start`/`finish` mark kinds `goal-events.ts` already defines |
| **Shooter** (demo) | Weapons, hitscan, ammo, breakable targets | New weapon system, proto pack art |

The presets are data in a file, not rows - the same argument
`src/domain/lounge/templates.ts` makes and the same file shape: an id, a name, a
blurb, and a pure function returning the rules block. Adding a fifth is adding an
entry.

### 8.1 The shooter demo

The forcing function for the whole project, and the reason the proto pack is
first. It is the demo because it exercises every part that is genuinely new -
blueprints, sockets, triggers, projectiles, a per-role camera, a weapon state
machine and a mobile layout that is not a walk stick - while the parts that are
not new (movement, health, respawn, presence) are already written and tested.

What it is: a prototype-grey arena of `Primitive_*` walls, floors, slopes and
stairs. Three dummies. A pistol on a socket. `target` and `Wall_Target` that
break into `target_pieces_A..F` when hit. Crates and barrels that break. Ammo
boxes that refill. Deathmatch rules, five minutes, first to twenty.

Every asset in that list is already in `public/xo/proto/`.

**Built, as `public/xp/xps/shooter.xp.json`** - and the thing worth reporting is
how little of it is code. The arena, the targets, the crates, the barrels that
take the shooter down with them and the ammo boxes that refill are all *rules in
the document*: a `damaged` trigger asking `hp <= 0`, then `spawn`, `score`,
`emit`, `despawn`. Nothing in `src/app/xp` knows what a target is.

What the runtime had to grow was three things, none of them about shooting in
particular:

- **`castRay`** (`packages/xp/src/world/shooting.ts`) - the cell grid and the entity
  boxes, nearest wins. The camera behind the body uses the same function, which
  is why it is not called `shoot`.
- **`player.weapon`** - a blueprint on one of the body's sockets. The same
  attachment a rider in a kart's seat gets; `damage` and `range` are properties
  on it, so a rifle is a second blueprint rather than a second code path.
- **`spawnWeapon`** - because the player is the one entity a document does not
  place, so there was nothing in `entities` to hang a gun off.
- **A tracer** - the streak from the muzzle to where the shot stopped. Not a
  projectile: the damage is done before it is drawn. It is there because a miss
  with no picture is indistinguishable from a gun that is not working.

Still missing against the paragraph above: the deathmatch *rules* - five minutes,
first to twenty - which are a mode (§8) rather than a level, and the three
dummies, which are the try-out with three players (§2.3). The demo is a shooting
range with a score, and the thing it was the forcing function for - can a
document describe a game rather than a room - is answered.

**Since then it has been made bigger, and the answer held.** The arena is forty
cells across on two floors - a catwalk down the east side with a nest over the
target gallery, stairs at one end and a ramp out of the pit at the other - and
what is in it is five kinds of thing to shoot rather than one: targets that
break, poppers and bullseyes that go down and come back up on `deactivate` and
`returned`, two runners sweeping the gallery on a rail, and mines that hunt
whoever is playing. Only the last three needed anything the format did not
already have, and none of them needed the runtime: a runner is `world.time` and
two properties, a mine is a distance and `damage`, and the piece of a broken
target that used to lie on the floor for ever now clears itself up because
debris has an eight-second script on it. First to sixty, seven minutes.

The one thing worth knowing before copying the mine is that it is the only
divergence in any level we ship: `getEntityByName('player')` is *this* browser's
player, so in a room of four, four mines chase four people, one per screen.
Everything else about where it flies comes off the clock, so the moment it stops
chasing it is back on a circuit everybody sees the same.

---

## 9. Network, authority, teams

The netcode does not change. What changes is that it is configured rather than
compiled.

**Transport.** One Realtime channel per instance, `xp:<instanceId>`. Position
and heading at 8 Hz, for the reason `multiplayer.tsx` documents at length: room
traffic grows with the square of the room, and interpolation makes eight samples
look like sixty. The tenant rate ceiling is 5,000 events/s - which at 8 Hz is
comfortable to about twenty-five players in one room and is the number to design
the instance cap against.

**Authority - the "owner declaration" in the ask.** Three tiers, chosen per
component in the document rather than argued about per feature:

- `self` - you are authoritative over your own position, and over your own
  health. This is already the lounge's rule and it is the one that keeps two
  clients from disagreeing about whose bar is where.
- `elected` - exactly one client owns the object and integrates it; everyone
  else interpolates. This is what a shared crate, a moving platform or an AI bot
  uses.

  **The election changed, and this paragraph used to say it would not.** It said
  the lowest stable id present, re-run on leave, "generalises without changing".
  It generalises fine and it decides ownership by a property that has nothing to
  do with the object: in a two-player kickabout the player whose presence id sorts
  first integrates the ball for the whole match, so their touches are resolved on
  the machine holding the true positions and the other player's are the owner
  *inferring* a shove from an interpolated avatar box a quarter of a second old.
  Which of the two you are is a string comparison.

  So **ownership follows the ball**: whoever gets on it takes it, and the lowest
  id is now only the floor - the first frame, and an owner who has left. It moves
  on an explicit claim rather than being computed from who is nearest, because
  "nearest" has to be evaluated against the same numbers on every machine and
  there are none: the owner has the true ball and true feet, a follower has both
  interpolated and late, and each client sees itself live and everybody else
  delayed. Two clients computing "am I nearest" from two different pictures can
  both answer yes, which is two simulations of one ball - continuously, rather
  than once per handover. A claim carries a sequence number, a claim level with
  what you hold is a race the lower id wins, and the resolution is a pure
  function, so every receiver agrees whatever order the packets arrive in.
  `packages/xp/src/net/owning.ts` has the protocol and `owning.test.ts` asks it from
  three points of view in three orders.

  Two things a handover needs that are easy to leave out, both learned the hard
  way: the new owner must **adopt** the last sample rather than clear the buffer,
  or the ball rolls from a standstill every time anybody touches it; and a
  follower must believe **one owner at a time**, because for half a round trip
  after a claim the old owner is still sending.
- `server` - the event log decides. Slow, durable, and correct for the handful
  of facts that must survive a refresh: the final score, a race time, who won.

The rule of thumb the codebase already follows and this should keep: **nothing
that changes 8 times a second is ever written to the event log.** Ephemeral state
is realtime and gone; durable state is a stream.

**Teams and assignment.** `assign: fixed | balanced | first-come | pick`, read
from the rules block by the player environment at join. Team colours come from
the document; the ring under a player is a copy of `team-ring.tsx`, which is
about forty lines and one of the easier things in this plan.

**A known trap, from the lounge.** A result latched locally before the server
confirms it is a result you can lose - the race finish bug is exactly this. In
the XP runtime, any `server`-authority outcome must show as *pending* until the
append returns, and reconcile on failure. And errors in a mode system must
surface somewhere that is visible during play, not in a panel that closes at
kickoff.

---

## 10. Scripting

The question underneath the ask is "how much can a creator express without
writing code", and the answer changes over three stages. Do not skip to the end.

**Stage 1 - verbs (M3).** A trigger's `do` is a list of ops from a closed
vocabulary: `spawn`, `despawn`, `damage`, `heal`, `teleport`, `give`, `take`,
`score`, `setProp`, `playClip`, `playSound`, `emit`, `after`, `if`. Conditions
are a small expression grammar over entity props and world state. This is
declarative, serialisable, diffable, safe by construction, and it is enough for
every one of the five presets. Most creators never leave it.

**Stage 2 - sandboxed JS. Done, and in v1.** The signal this section said to
watch for - the verbs running out - arrived at the first thing anybody wanted to
build with them: a platform whose position depends on the last frame's position.
No list of ops expresses that, however long the list.

*And it is not the Web Worker this paragraph originally proposed.* That plan is
worth quoting because the reason it was dropped is the whole argument: "a module
with lifecycle hooks running in a Web Worker with no DOM, no fetch and no
globals; the worker boundary is the sandbox, message passing is the API. Cost:
one frame of latency for anything a script decides, which is why the verbs stay
for anything that must be immediate."

That cost is not a cost, it is a disqualification. *Most of what a script decides
has to be immediate* - where a platform is, whether a door is open, whether a
shot connected - so a sandbox that answers next frame answers too late for the
majority of its use, and the verbs would have had to grow into a second language
to cover the gap.

What replaced it is **QuickJS compiled to wasm**, which is synchronous, and
which turned out to be better on three further counts that were not the reason
for choosing it:

- **It can be interrupted.** `while (true) {}` is cut off after a fixed number of
  operations - about 6 ms, measured. There is no way to do that to a worker
  except by killing it, and no way at all to a `new Function`.
- **It is closed by construction.** A fresh context is the language and nothing
  else: no `fetch`, no `setTimeout`, no `window`. The worker plan was a list of
  things to *subtract* from a browser, and a list you can be wrong about.
- **The test runs the same interpreter the browser does.** It is a wasm build, so
  `bun test` and a player's tab execute identical bytecode. That matters more
  here than in most projects, because §15 is a whole section about the one thing
  this repo cannot check by looking.

Two things were removed from the sandbox that a language would normally have,
and for one reason: `Date` and `Math.random`. Two clients running the same rules
over the same entities have to agree, a clock is per machine, and random is
random. The fuel budget is counted in *operations* rather than milliseconds for
the same reason - a deadline cuts a script off at a different place on a slower
machine, and two players would diverge. `world.time` replaces both: one clock,
injected, so a five-minute match runs in a millisecond under a test.

The verbs stay, and their justification improves. It was "the verbs are for
what must be immediate", which a synchronous sandbox makes moot; it is now **the
verbs are for what should be readable** - three rows in a panel, diffable, and
impossible to write wrong. The level that needs no script is the better level.

What it cost: 590 KB of wasm in a chunk only `/xp` loads, and a few microseconds
a hook. What it exposed: the character controller has no notion of a *rider*, so
a script can move a platform but a platform cannot yet carry you. That is a
controller feature and its own slice, and the manual says so rather than the demo
pretending otherwise.

**Stage 3 - wasm routines (v2, and see 16.3).** The ask is for "game routines
exportable as wasm, with an interface to talk with user auth, invite, access,
playmode". That is two different things and they should not be conflated:

- **wasm as a portable rules module** - a compiled deterministic simulation
  step, shipped inside the cartridge, running the same way on any host. Real
  value: a mode written in Rust or AssemblyScript that runs identically on our
  runtime and someone else's, and cannot reach anything we did not import.
- **wasm as a sandbox** - it is one for memory, and not one for capability. A
  wasm module still only touches what the host imports into it. So the auth /
  invite / access / playmode interface is a **host import table**, and it is the
  same interface as Section 11's ports. wasm does not remove the need to define
  them; it consumes them.

Which is why 11 comes before this in the build order even though it reads later.

---

## 11. The backend slot

The cartridge metaphor's other half. An XP declares what it needs; a host
provides it; neither knows the other.

Optional members are the ones v1 leaves unimplemented on purpose. They are in
the interface because the ask names them - auth, invite, access, playmode - and
because a port designed around one caller is not a port; they are optional
because a backoffice XP has no guests to admit and no links to send.

```ts
export interface XpBackend {
  identity: {
    current(): Promise<XpPlayer | null>       // id, name, skin, roles
    signIn?(): Promise<XpPlayer>              // v2
    guest?(name: string): Promise<XpPlayer>   // v2
  }
  party: {
    instance(id: string): Promise<XpInstance>
    join(instanceId: string, as?: string): Promise<XpSeat>
    invite?(instanceId: string): Promise<{ url: string; expires?: string }>  // v2
  }
  access: {
    may(action: 'play' | 'edit' | 'host', xpId: string): Promise<boolean>
  }
  transport: {
    channel(topic: string): XpChannel                // send / on / leave
  }
  persistence?: {
    get(key: string): Promise<unknown>
    put(key: string, value: unknown): Promise<void>
    append?(stream: string, event: XpEvent): Promise<void>   // durable outcomes
  }
  // No `catalogue` port. Resolving a missing pack was going to be a registry;
  // it is now a URL in the document that a person follows. See Section 13.
}
```

Two adapters get built, both at M2. The third is named so the interface is shaped
for it, and is nobody's task:

| Adapter | Identity | Transport | Persistence | For |
|---|---|---|---|---|
| `local` | A name in `localStorage` | `BroadcastChannel` between tabs | IndexedDB | Try-out, tests, running with no network |
| `kxb` | The signed-in operator | Supabase Realtime | The event store, via server actions | XPs in the backoffice |
| `selfhost` | Whatever the host wires in | Whatever the host wires in | Whatever the host wires in | Someone else's Next.js app - later, Section 12 |

The `local` adapter is not a stub, even with export deferred. It is what `Try
out` runs against, it is what the system tests run against, and it is the only
way to iterate on rules without two browser windows and a network. That it also
happens to be what an exported game would run on is a bonus, not its reason.

Building both from the start is worth defending, since one would obviously be
cheaper: a port with a single implementation is not a port, it is indirection.
The second implementation is what proves the interface is actually an interface,
and it costs a few hundred lines now versus untangling direct Supabase calls out
of a running engine later.

**The rule that makes this work:** nothing under the runtime may import
`@/lib/supabase/*`. Enforce it with an ESLint `no-restricted-imports` rule on the
runtime directory rather than with review - a lint rule is cheap and a convention
is not.

---

## 12. Export, and the Next.js lib - v2

**Not being built.** Recorded here so the shape stays known and so nothing gets
done now that forecloses it.

The eventual answer is three artefacts, because three different people would be
asking: the **cartridge alone** for someone who already has a runtime; a
**playable bundle** - runtime, document, and only the models actually referenced,
opening from a file server with no build step on the `local` adapter; and a
**source project**, a Next.js template with the document in it and a `backend.ts`
where the adapter is wired. The third is the one that answers "not stuck on your
infra": they own the repo, they choose the host.

The libraries it would need are worth naming because the boundaries are the
thing being protected now, and they are the same boundaries that make the engine
testable:

| Package | Contains |
|---|---|
| `@kxb/xp-format` | Document types, validator, migrator between format versions |
| `@kxb/xp-engine` | The simulation - components, systems, the pure modules from Section 1 |
| `@kxb/xp-react` | The R3F scene, HUD, input, the `<Xp>` component |
| `@kxb/xp-backend` | The `XpBackend` interface plus the `local` adapter |

Until then these are directories under `src/`, not packages. `pnpm-workspace.yaml`
exists but declares no packages, and adding a `packages:` list for code nobody
imports from outside is overhead with no payer. The directory boundaries are the
real work; turning four directories into four packages later is a day.

### 12.1 What deferring costs, and what it does not

Deferred, and cheap to defer: the bundler, the asset tree-shaker, the project
template, npm publishing, versioning and the docs that go with them. None of
these get harder by waiting, and every one of them would need rewriting anyway
once a real XP existed to export.

**Kept anyway, because retrofitting them is the expensive kind of work:**

- The document is **self-describing** - a version, a format tag, a pack list
  with integrity hashes. Section 13 explains why the hash goes in now even though
  nothing checks it: a format that grows a hash later has to migrate every
  document written before it.
- The backend is a **port with two implementations** (Section 11).
- **No `@/lib/supabase/*` import under the runtime**, enforced by lint. This is
  the single rule that keeps export possible, and it is free while the code is
  being written and miserable afterwards.
- **Directory boundaries** matching the package table above.

### 12.2 The licence question - checked, and it is a non-issue

Raised here as a risk, then checked against the purchased originals. **Every
model and audio pack in `public/` is CC0.** There is no licence obstacle to
export, to redistribution, or to a customer shipping our art in their own
commercial game.

| Repo pack | Comes from | Author | Licence |
|---|---|---|---|
| `xo/proto`, `xo/pda/dummy` | KayKit Prototype Bits 1.1 | Kay Lousberg | CC0 |
| `xo/bb10` | KayKit Block Bits 1.0 | Kay Lousberg | CC0 |
| `xo/restaunt` | KayKit Restaurant Bits 1.0 | Kay Lousberg | CC0 |
| `tinyXO/*` | Tiny Treats Collection 1 | Isa Lousberg | CC0 |
| `xo/peeps` | Kenney Cube Pets | Kenney | CC0 |
| `public/audio/*` | Kenney (five sound packs) | Kenney | CC0 |

CC0 is a waiver of copyright, not a permissive licence with conditions. It
permits commercial use, modification, and redistribution of the files
themselves, by us and by anyone we hand them to, with no attribution required.
So the "gate" this section originally proposed - an exporter that refuses or
strips packs that may not be redistributed - has nothing to refuse and should
not be built.

### 12.3 Provenance: link, do not copy

The tidy-up this leaves is **three fields on the `Pack` entry** in
`src/domain/builder/packs.ts` - `author`, `licence`, `source` - and nothing else.
No `License.txt` copied into `public/`, no vendor archives in the repo.

| Pack | Author | Source |
|---|---|---|
| `proto`, the dummy, `bb10`, `restaurant` | Kay Lousberg | https://kaylousberg.itch.io/ |
| `tinyXO/*` | Isa Lousberg | https://tinytreats.itch.io/ |
| `peeps`, the audio | Kenney | https://kenney.nl/ |

Those three URLs are the ones the packs themselves ship, so they are the
publisher's own address rather than a guess at one.

Copying the licence files in would be the more self-contained choice, and it is
not worth it here. CC0 is irrevocable - it cannot be withdrawn later, so there
is no future state where we need the original text as evidence of anything. The
only thing a copied file buys over a link is surviving link rot, and the fact
that actually matters is the word "CC0", which is recorded in the entry either
way. A dead itch.io link next to `licence: 'CC0'` still answers the question.

**The fields travel with the document.** `source` is not just repo bookkeeping -
it is copied into the document's `packs[]` entry (Section 3) when an XP is saved,
so an XP always carries the address of the art it is made of. An export then
writes those addresses into the folders that need them: a `CREDITS.txt` at the
root and a `SOURCE.txt` in each asset directory, both generated, naming the
author, the licence and the page to get the pack from.

That is the whole provenance story, and it is worth being clear about what it
buys: anyone who receives a project can see where every model came from, replace
a pack with a newer version from the publisher, or fetch the pack themselves if
we shipped a document without the models in it. All of it from three fields
nobody has to maintain by hand.

**Credit anyway.** All three authors ask for credit and none require it. The
generated files cover it, and the creator's About panel should link them too.
Costs one template string, and these packs are the reason the thing looks like
anything.

One nuance, for the day an export ships: Kenney's bundle readme asks that the
*All-in-1 bundle* not be redistributed as a bundle, while explicitly allowing
each asset pack to be distributed separately. We ship 24 Cube Pets models, not
the bundle, so this is already satisfied - worth not accidentally breaking by
copying a whole vendor archive into a repo later.

**A correction this turned up:** `src/domain/animator/rig.ts` calls the dummy
"Kenney's prototype dummy". It is KayKit Prototype Bits, by Kay Lousberg -
`prototypebits_texture.png` sits next to it in `public/xo/pda/dummy/`. Harmless
for the code, wrong in a comment that is otherwise the most careful description
of that rig anywhere, and wrong in the one field where being wrong about a third
party matters.

---

## 13. The pack registry - dropped

Not deferred. **Cut**, and 12.3 is why.

A registry exists to answer one question: *this host does not have the pack, so
where does it come from?* The `source` URL in the pack entry answers it, from
the publisher, for free, and better than we would - itch.io and kenney.nl already
host these files, already version them, and are already the address the authors
want people sent to. Building a mirror of that is work whose best possible
outcome is a slightly faster copy of somebody else's download page.

So there is no registry, no static index, no CDN of tarballs, and no
`catalogue` port implementation. What remains is two fields already in the
format - `source` on the pack entry, and a clear error naming the missing pack
and its URL when a document asks for art the host does not have.

**What this genuinely gives up.** A URL to a download page is a pointer for a
*person*, not a fetch a *program* can perform: a human clicks, gets a zip, and
unpacks it. Automatic resolution - a server noticing a pack is missing and
installing it unattended - would need stable file URLs and hashes, which a
publisher page does not promise. That capability is now off the table, and it
should be: nothing in v1 or v2 as scoped needs it, and the fallback if it ever
does is not a registry either. It is putting the handful of CC0 packs we
actually use in a bucket behind our own CDN, which the licence permits outright
and which is an afternoon.

**The integrity hash stays in the format**, and now purely as a
what-you-have-is-what-I-had check rather than as the key to a content-addressed
store. Same reasoning as before: a field nobody reads costs nothing, and a
format that grows one later has to migrate every document written before it.

---

## 14. Milestones

### v1 - the creator, in the backoffice

Five milestones, each ending with something that runs.

**M0 - Proto pack. Done, twice over.** Measured, registered, catalogued,
thumbnails drawn - once in the existing builder (85 models, alongside its other
twelve packs) and once in `src/domain/xp/`, which owns its own pack table, its
own generated catalogue, its own asset folder under `public/xp/`, its own three
scripts and its own tests. `/xp` renders the second one so it can be looked at.
Section 4 has the measurements; §1.3 has the decoupling.

The catalogue carries **measured bounds per model**, which was not in the plan
and should have been: it is what tells a wall from a half wall in a square tile,
what derives the centred-pivot flag instead of a hand-pasted list, and what
Section 7's auto-collision is a box from. Deriving any of that at runtime means
parsing a glTF in the frame that needs the answer.

**M1 - Format and player, read-only. Done.** `xp/1` and `parseXp`, a copied
character controller, a rasteriser that turns measured geometry into cells, and
`/xp/[id]` reading a hand-written `.xp.json` you can walk around in. No editor.

Four things it settled that the plan had not:

- **The rasteriser rounds rather than floors.** A wall is a metre thick and
  centred on its own origin, so it straddles a cell boundary and an honest
  floor/ceil fills two cells - a wall you cannot walk within a metre of. A cell
  grid cannot hold half a wall, so the question is which way to be wrong, and
  "the space you can see is the space you can walk in" is the one a player can
  predict.
- **Holes are not representable, and that bites at once.** A box is convex, so
  `Primitive_Doorway` rasterises to a solid wall. A door is a gap in a wall run -
  which is why the example room is sealed. A piece that looks like a way out and
  is not would be worse than no door. Two things have since chipped at this: the
  build-time voxel masks, which give 747 of the 3 892 models their real shape,
  and `placement.collider`, which is the escape hatch for the ones a metre cell
  still cannot measure. Neither makes a 1.6 m opening representable on a 1 m
  grid; the second lets you say what should have been there instead.
- **The centred-pivot finding from M0 is now used, not just recorded.** The 20
  socket pieces are raised half their height so they stand on a floor, and the
  same offset feeds the collision box - so the barrel you see and the barrel you
  bump into come from one number.
- **The min corner had to join the measured size.** A four-wide wall runs -2..2,
  but a door is hinged and runs 0..1.6. Assuming the centre puts every door half
  a metre into the wall beside it.

**How M1 is verified, since it cannot be watched.** The Browser pane is always
`document.hidden`, so `requestAnimationFrame` never fires and the canvas stays
black - the runtime is the one thing in this repo that cannot be checked by
looking at it in the pane. So it is checked two other ways, and both caught real
bugs:

- `xps.test.ts` walks every shipped document headlessly - parse, rasterise,
  drop the player in, let gravity settle them, then walk five seconds in each of
  four directions and assert they neither escape nor fall out of the world.
- `bun run xp:shot <id>` draws the document with the software rasteriser, using
  the same transform the renderer uses, so a wall facing the wrong way or a prop
  buried in the floor is visible without a GPU.

The walking test found a quarter-turn bug that put the west wall nine cells
inside the room; the shot found the barrels sunk to their waists. Neither is
something an assertion about the arithmetic would have noticed, because in both
cases the arithmetic was self-consistent.

**M2 - Entities, blueprints, backend ports (2-3 weeks).** Component maps, the
system loop, the workbench's collider/socket half, the `XpBackend` interface and
both the `local` and `kxb` adapters. Ends with: crates you bump into and a
trigger that fires.

**M3 - The editor, and the shooter (3-4 weeks).** The creator screen, the rail,
grid placement, the rules panel, the verb vocabulary, input maps with working
defaults, try-out with three players. The shooter preset and demo XP.
**Ends with: the demo everything else is sold on.**

**M4 - Modes and multiplayer (2-3 weeks).** Football, all-vs-all, freestyle and
parkour presets on top of the copied modules. Teams, assignment, authority
tiers. Ends with: two browsers, one XP, a working match.

That is v1. Roughly three months, ending with a working creator and five modes
that operators can build worlds in.

### v2 - handing it out

Not scheduled, and not started until v1 has produced XPs somebody wants to hand
over. What it contains, in the order it would need doing:

- **Export** (Section 12) - the three artefacts, the packages, a `CREDITS.txt`.
- ~~**Scripting stage 2**~~ - landed in v1 instead, and not in a worker.
  Section 10 has what changed and why.
- **Self-host** - the backend as a Docker image, or a `selfhost` adapter someone
  else wires up.
- **wasm rules modules** and **sync** - both gated on decisions that cannot be
  made yet (16.3).

The v1/v2 line is drawn at exactly one place: **v1 runs XPs, v2 gives them
away.** Everything in v1 is built so that v2 is possible and none of it is built
so that v2 is soon.

---

## 15. How this gets verified

Not in the Browser pane. The pane is always `document.hidden`, so
`requestAnimationFrame` never fires and no game loop ticks in it - a scene that
looks frozen there is not a bug. The XP runtime inherits that limitation whole.

So the verification plan is the one the lounge already uses, and it is why
Section 6 insists systems stay pure:

- **`bun test src`** for everything that is a function of numbers: the step
  loop, collision, triggers, the rules systems, the format validator and its
  migrations. Every existing pure module already has a test file next to it -
  `physics.test.ts`, `combat.test.ts`, `football.test.ts`, `race.test.ts` - and
  those come across with the copies (1.2), which is most of a test suite on day
  one and the main reason copying is affordable at all.
- **Round-trip tests on the format**: document → save → open → identical
  document, and old version → migrate → current. Cheap, and it catches the entire
  class of bug that quietly corrupts somebody's afternoon of building.
- **`bun run xp:shot <id>`** for anything the runtime draws. The Browser pane
  cannot show it - no `requestAnimationFrame`, so the canvas stays black - and
  this draws the same document through the same transform with the software
  rasteriser instead. It is what caught the barrels sunk to their waists.
- **Two real browser windows** for anything network, driven by hand. There is no
  substitute and it is not worth building one yet.
- **`scripts/` renders** for anything visual - the repo already shoots models,
  blocks, props and scenes offline. A blueprint's thumbnail comes from the same
  machinery.

One note for the HUD: scene actions here skip `revalidatePath`, so `useOptimistic`
silently reverts. Use `useState` with a manual rollback in any XP HUD that writes.

---

## 16. Decisions still open

**16.1 Is an XP a file or a row?** ~~Open.~~ **Answered** - and the answer took
the recommendation. A file for all of v1; the revisit is
[xp-backend.md](backend.md), which takes the battlefield shape as predicted
and adds the thing this section did not anticipate: an XP that needs an audience
also needs its own *art*, so it stops being a file and becomes a folder.

**16.2 Does the lounge eventually become an XP?** Copying rather than importing
(1.2) makes this less likely, not more: two engines that have drifted for six
months do not merge back. *Recommendation: assume never. If the XP engine turns
out to be strictly better, the honest move is a deliberate rewrite of the lounge
against it, decided on evidence, not a gradual convergence.*

**16.3 What does "sync later" mean?** The ask keeps a door open for exported
games syncing back. That is either (a) telemetry - scores and sessions reported
to us, easy, and mostly a privacy question; or (b) shared state between our
instance and theirs, which is a distributed systems project of its own. These
have almost nothing in common. *A v2 decision; nothing in v1 depends on it.*

**16.4 How much shader freedom?** Arbitrary GLSL in a document is arbitrary code
on every host that runs it, and it is the one thing in the format that cannot be
made safe by validation. Less pressing while every host is us. *Recommendation: a
small set of shipped shaders with parameters, and revisit only when a real XP is
blocked by it.*

**16.5 Asset licences.** ~~Open.~~ **Answered** - every pack in `public/` is
CC0, from Kay Lousberg, Isa Lousberg and Kenney. Nothing is blocked and no
export gate is needed; see Section 12.2 for the table and the two small tidying
tasks it leaves behind.

**16.6 Instance size.** The rate ceiling suggests ~25 players in one instance at
8 Hz. Operator-only makes that comfortably enough for v1. It becomes a real
question the first time an XP has an audience, and the fix then is interest
management - only fan out to who can see you.

---

## 17. Not in v1

Stated so that nobody plans around them.

**Deferred but designed for** (Section 12): export, the download, the published
packages, self-hosting, wasm rules modules, sync. These are v2, and v1 keeps four
cheap habits so they stay possible.

**Cut, not deferred:** the pack registry (Section 13). The `source` URL on each
pack does its job, and the publishers host the files better than we would.

**Not planned at all:** terrain or heightmaps (the world is a lattice), vehicles,
navmesh AI (bots follow paths and use the same character controller), in-editor
multi-user collaboration, a marketplace, a visual node graph for scripts, physics
beyond boxes and rays, level of detail, a dedicated authoritative server.

**Payments to creators: an idea, with one cheap thing to do now.** Not v1, not
scheduled, and Section 18 is the whole argument. The one thing it asks of v1 is
that finished sessions get logged, because usage nobody recorded cannot be
reconstructed later.

Every one of those is a reasonable thing to want later. None of them is between
here and a shooter that works.

---

## 18. The creator fund - an idea

**The idea.** €3 of the €20 a space pays each month goes into a pool rather than
to us, and worlds are paid out of that pool in proportion to how much they were
played.

Recorded here rather than in `PRODUCT.md` because the only part of it that
touches the next three months is a decision about what the runtime writes down,
and that decision belongs next to the runtime.

### 18.1 The number first, because it changes what is worth building

€3 a space a month. At 50 paying spaces the fund is €150 a month **across every
world in it**. At 500 it is €1,500. Split pro-rata across a dozen worlds, the top
earner makes rent money and everyone else makes coffee.

That is not an argument against it - it is an argument about what to build. A
fund at this size is a **signal**, not an income: it says the thing you made was
played, in a unit nobody can argue with. So the thing worth building first is a
**visible balance**, and the thing worth deferring hardest is the machinery that
turns a balance into money in someone's bank account. The balance is a
projection over two streams we already know how to write. The payout is KYC, tax
residency, Stripe Connect onboarding, and a German entity becoming a payment
intermediary - see 18.5.

Build the ledger. Show the number. Pay it out when the number is large enough to
be worth the paperwork.

### 18.2 How the split works, and the failure mode of the obvious answer

The obvious rule is pro-rata over the whole pool: `your minutes / all minutes ×
fund`. It is the rule streaming music used for fifteen years and its failure mode
is well documented - it pays for **duration**, so a world that holds someone
idle for forty minutes beats a world that gives them a perfect five, and the
optimal strategy is to be slightly boring for a long time. That is the exact
opposite of what this product is for (`landing-repositioned-to-play`: here to
play, not to sit).

Three candidates, and the third is the recommendation:

| Rule | Pays for | Breaks on |
|---|---|---|
| Pro-rata minutes | Time held | Idle worlds beat tight ones; one big world dilutes everyone |
| Per session | Sessions started | Rewards churn; a lobby you bounce off scores like a match you finished |
| **User-centric** | **Where each member's own €3 went** | **Needs per-member attribution, which is more rows** |

**User-centric.** Each paying space's €3 is split only across the worlds *that
space's members actually played* that month. Your money follows your attention.
It removes cross-subsidy entirely - a world cannot earn from strangers who never
opened it - and it removes the incentive to farm minutes off an audience that
is not yours. It also degrades gracefully at small scale: with five spaces and
three worlds the numbers are still meaningful, where a global pool at that size
is noise.

The cost is real and worth naming: attribution is per member per world per
month, so the projection is `members × worlds` rows rather than `worlds` rows.
At the sizes above that is nothing.

Within a member's €3, split by **sessions with a floor** rather than raw minutes:
a session under ~60 seconds counts for nothing, and every session past that
counts the same. Long enough to have played it, and no reward for staying.

### 18.3 The rules that keep it honest

Small fund, so cheap to game, so the guards go in with the first version rather
than after someone notices:

- **A session counts once it has a real identity behind it.** Guests generate
  usage and no money, so under a user-centric split their plays are simply worth
  €0. That is honest rather than a limitation - nobody paid, so there is nothing
  to divide.
- **Authors do not earn from their own play.** Same member, same world, no
  accrual.
- **Cap per member per world per month.** Playing your favourite world two
  hundred times should not out-vote your colleague playing theirs twice; one
  member's €3 has a floor on how finely it splits.
- **Accrual is computed from the log, not accumulated in a counter.** A payout
  anyone can recompute from events is a payout nobody has to trust.

### 18.4 The 8-week problem, which is not a policy choice

This is where the repo already knows something. `src/domain/billing/` exists as
an aggregate rather than a column for one reason, stated in the README: **a SEPA
debit can be reversed for up to eight weeks, so "paid" is never final.** A
workspace can go active → suspended long after the money appeared.

A fund that pays out on `PaymentSucceeded` is therefore paying out money that
can be clawed back, and a payout is not reversible in the way a debit is. You
cannot un-send it.

So the fund has two balances and they are not the same number:

- **Accrued** - the €3 landed, the sessions are counted, the split is computed.
  Visible to the creator immediately, because the signal is the point (18.1).
- **Payable** - the same accrual, once the reversal window on the debit that
  funded it has closed. Roughly eight weeks behind.

That holdback is not us being cautious with someone else's money. It is the
settlement rail's own timing, and a fund that ignores it is a fund that
occasionally pays out of our pocket. Suspension in between is a
`SubscriptionSuspended` event we already write - the accrual it funded reverses
with it, before anything left the building.

### 18.5 Why the payout half is expensive, in order

Named so nobody costs this as "add Stripe Connect":

1. **Money out needs an account to send it to**, which means Connect onboarding,
   identity verification, and a bank account per creator.
2. **A creator's earnings are their income**, in whatever country they are in.
   Platforms that pay sellers in the EU have reporting duties (DAC7), and that is
   a duty on us, not on them.
3. **The operator is a Kleinunternehmer** (`gewerbe-kleinunternehmer`). Money
   flowing through the business to third parties is a different shape from
   invoicing €20 for a space, and it is a question for the Steuerberater before
   it is a question for the codebase.
4. **Below some threshold none of that is worth it.** Which is the argument for
   the balance-first version, and for a manual first payout to three people
   rather than an automated one to everybody.

None of this blocks the ledger. All of it blocks the transfer.

### 18.6 What v1 does about it: one event

✅ **Landed, as a row rather than an event.** `xp_sessions`
(`20261027000000`), written by `/api/xp/sessions` from `_runtime/net/play-session`,
shaped and refused by `domain/xps/sessions.ts`. The reasoning that changed is at
the end of this section; the argument for doing it at all is unchanged and is
below.

Everything above can be designed in a year. Exactly one part of it cannot be
back-dated, and that is the usage. **Sessions nobody logged cannot be
reconstructed**, so if the fund is a real intention, the runtime writes down
finished play from the day it can:

```ts
export type XpSessionEnded = DomainEvent<
  'XpSessionEnded',
  {
    xpId: string
    xpVersion: string      // which cartridge - a world's takings are per version
    playerId: string       // null for a guest: counted, worth nothing (18.3)
    instanceId: string
    startedAt: string
    seconds: number
    outcome?: string       // finished, left, disconnected
  }
>
```

It fits the existing rules rather than bending them:

- It is a **durable outcome**, so it is `server` authority under Section 9, and
  it goes to the event log. Nothing 8 Hz goes near this - one append at the end
  of a session, not a heartbeat.
- It goes through the **`persistence.append` port** (Section 11), which is
  already optional and already in `backend.wants`. Under `Try out` on the `local`
  adapter it no-ops, which is correct: practice sessions are not takings.
- The **split rule is a projection, not a schema.** Pro-rata, per-session,
  user-centric, the cap, the floor - all of them are computed off this stream
  after the fact, so changing the rule is rewriting a query and replaying, not
  migrating anything. That is the whole reason to write the raw session rather
  than an accrual.
- Section 9's trap applies: the append must not be latched locally before it
  returns (`race-finish-latched-before-confirmation`). A session that shows as
  counted and was not is worse than one that shows as pending.

Cost, honestly: one event type, one append at teardown, and a projection nobody
reads yet. Call it a day. The alternative is deciding in 2027 that the fund is a
good idea and having no history to pay anybody for.

**What building it changed, and what it did not.** The cost was right and the
last three bullets above survive unaltered — the split is still a projection,
`Try out` still writes nothing, and nothing is latched before the write returns.
The first bullet is the one that did not survive contact:

- **It is a table, not the event log.** `events_insert_tenant` requires
  membership of the tenant being written to, so an append would fail for exactly
  the sessions the fund exists to count — somebody playing a world published by
  a space they are not in. And `append_events` takes an expected version, so
  every session ending would contend with every other and with the author
  saving. A session ending is not a decision about an aggregate; it is a fact
  that arrived. [scenes.md](scenes.md) §3.3 made the same argument in the other
  direction about coins, and it holds here.
- **The reference does the work of two fields.** `xpId` and `xpVersion` are one
  string in `domain/xps/ref.ts` and the table stores that, so a builtin is
  loggable as `sidestep` and a project's pinned version rides along. No foreign
  key follows from it, which is correct: a deleted world keeps its takings.
- **`playerId` is never null for a guest, and it stops mattering anyway.** A
  guest is an anonymous account, so the row is attributed at the time and
  `cron/reap-guests` deletes the account later; `on delete set null` turns it
  into usage attributable to nobody without a column for it. 18.3's rule arrives
  on its own.
- **Nothing is shown to the player at all**, which is the strong form of Section
  9's rule rather than a way around it: there is no pending state to be wrong,
  because a ledger is not something the game reports on.
- **`outcome` is `left` in every row today.** Nothing in the runtime has an end
  yet ([backlog.md](backlog.md) §0.3), and the other two words are kept in the
  constraint so that the day a match can end, only the caller changes.

### 18.7 What it forces a decision on

The fund is the answer to a question Sections 3.1 and 16.1 leave open - *when
does an XP stop being a file?*

**The day a world earns money it has an author, and an author needs a row.** A
payout is attributed to a person, a person disputes it, a dispute needs a record
of who owned the world in the month being paid for. A `.xp.json` on somebody's
disk cannot answer that. So the fund and the battlefield-shaped identity stream
(Section 3.1 - a stream for identity, a blob for the document) arrive together,
and neither one arrives before there is an XP with an audience.

Which is also why this is Section 18 and not milestone M5. Backoffice-only
(Section 2.0) means every world is ours, and a fund that pays us out of our own
subscription revenue is an accounting entry, not a product.

### 18.8 Open

- **Is €3 a fixed slice or a percentage?** Fixed reads better ("€3 of your €20
  goes to the people who made the worlds") and breaks the moment pricing changes
  or a second plan exists. 15% survives both and is harder to say.
- **Where do unclaimed shares go?** Under a user-centric split, a member who
  played nothing has €3 attributable to nobody. Recycling it into the general
  pool rewards the biggest worlds - the thing 18.2 was avoiding. Keeping it is
  cleaner and needs saying out loud, because "€3 to the fund" then means "up to
  €3".
- **Do events feed it?** `/events` bookings are from €200 and invoiced by a human
  (`events-booking-lands-in-contact-messages`). An event run inside somebody's
  world is the clearest case of a world earning its keep, and it is also the case
  with no subscription behind it.
- **Does a world's *version* earn, or the world?** The event records both.
  Paying the version means a fork that improves a dead world earns for itself.
  Paying the world means the original author keeps earning. This is the question
  with the most feelings attached and the least urgency.
