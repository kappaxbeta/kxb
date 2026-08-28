# Using the XP editor

How to build a level. [xp-manual.md](manual.md) is the reference - the format
field by field, every limit with its measurement, and the argument behind each
decision. This is the other half: what to press.

If something here disagrees with the manual, the manual is right and this is
stale. Tell somebody.

---

## Getting in

`/xp` lists the documents on disk. `/xp/<id>` plays one, `/xp/<id>/edit` builds
one.

In development the route is open. In every deployed environment it is a
backoffice admin and nobody else, and that is deliberate rather than
provisional - the creator is an operator tool. The people who *play* an XP never
come here; they arrive in a match (`/t/<slug>/battle/<battleId>`), which renders
the same runtime with a roster over it.

A document is a file: `public/xp/xps/<id>.xp.json`. There is no table and no
migration. To start a new one, copy an existing file and change its `id` and
`name`.

---

## The window

A macOS-shaped frame around panels you can drag, split, stack into tabs and
resize. The layout saves itself and comes back on reload; a saved layout that no
longer parses falls back to the default rather than to an empty window.

The rail down the left toggles each panel. They are all optional except the
viewport, which is the work.

| Panel | What it is for |
|---|---|
| **Viewport** | The level. Drag to draw, right-drag to pan |
| **Scene** | Things by name, architecture folded by model, the marks, the player |
| **Models** | The catalogue, searchable. Click to pick, **drag to place** |
| **Tools** | What a drag does, which height, the turn, and whether there is ground |
| **Rules** | A blueprint's triggers, as rows |
| **Scripts** | JavaScript, by name, and which blueprints run it |
| **Document** | The counts, the capabilities, and what the parser would say |

Open **Document** while you work. It is the only panel that tells you things you
cannot see by looking - whether the packs and capabilities line up, and what the
level would be refused for if it were reloaded right now.

---

## The tools

| | |
|---|---|
| **Select** | Click a thing to find out what it is. **Never builds** |
| **Place** | One piece where you let go, then hands you back to Select |
| **Draw** | Paints while the button is down |
| **Erase** | Takes away what a drag crosses |
| **Line** | Two corners, a straight run |
| **Fill** | Two corners, filled |
| **Room** | Two corners, four walls and no ceiling |

Select is the default, because the first thing anybody does with a level they
already have is click something to find out what it is.

**Place hands you back to Select holding the piece it just laid.** The next thing
you do after putting a crate somewhere is nudge it, turn it, or look at what it
is - none of which Place can do. Draw deliberately does not do this: a brush that
stopped being a brush after one stroke would be useless.

### Keys

| | |
|---|---|
| `Q` / `W` | Working height down / up |
| `R` | Turn the next piece 90° |
| `B` | Draw ⇄ Place |
| `E` | Erase ⇄ Place |
| `G` / `T` / `Y` | Move / turn / size handle |
| `Esc` | Deselect |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `⌘C` / `⌘X` / `⌘V` | Copy / cut / paste, one cell along |
| `⌫` | Delete the selection. **Does not copy** - that is `⌘X` |

---

## Building

### Lay a floor

Pick **Primitive_Floor** in Models, choose **Fill**, and drag a rectangle. A
floor tile is four cells across, so tiles land on multiples of four.

Height is the **Level** in Tools (`Q` and `W`), *except* when the pointer is over
something - then the piece goes on top of what you are pointing at. The slider is
the answer for the empty parts of the world; the geometry answers everywhere
else.

### Walls

**Primitive_Wall** is four wide, four high and one deep. `R` turns it. Use
**Line** along an edge, or **Room** to get four walls from two corners.

> **A door is a gap in a wall run.** `Primitive_Doorway` has a 1.6 m opening in a
> 4 m wall, and the cell is a metre - so the opening straddles two cells and
> fills neither, and both end up solid. The doorway rasterises to a wall. Leave a
> piece out instead. There is a test pinning this so it stays a decision rather
> than a surprise.

### Put one thing somewhere exact

**Drag it out of Models into the viewport.** It lands where you let go - on top
of a floor, against a wall, or on the working plane if there is nothing under the
cursor - and it is selected, so the handles are already on it.

Dropping onto the **Scene** panel works too. That one has no position of its own,
so it puts the piece where the pointer last was in the viewport.

Placements are not on a lattice any more. A crate can sit at 2.3, a ramp can meet
a floor, a wall can stand at an angle. What is still cell-shaped is *collision*:
the rasteriser rounds, so a wall at 2.5 is solid where it looks solid to within
half a metre. See [§4](manual.md) for what that costs.

### The handles

Three icons appear top-left of the viewport when something is selected: move,
turn, size.

Turn shows **one ring**, and that is not a bug. `rotation` is yaw - degrees about
Y - and yaw is what nearly everything in a level uses, because it is the turn
that keeps a collision box axis-aligned.

The other two angles exist. A placement and an entity each take an optional
`pitch` and `roll`, and the inspector has a field for each beside `turn`, along
with three multipliers that stretch a piece along its own axes - so a ramp can
lean and a crate can become a plank. They are **typed rather than dragged**: a
three-ring trackball is a control most people fight, and five fields that work
today beat a gizmo that is coming. Press **Try** to look at the result.

What a tilt costs is collision. See [§4](manual.md) - briefly, a tilted piece
collides as the box around the tilt, which is bigger than what is drawn and
never smaller.

### When a piece collides wrong

Under the tilt fields there is **collides as**. Most pieces should be left on
*measured shape* - the model voxelised at build time, which is right for the
whole construction kit.

The two times it is not: something hung across a way through (a banner, a sign,
a cable) that you should be able to walk past, and something with an opening
narrower than a metre - an arch, a gateway - whose doorway rounded shut and left
a solid block. Switch the first to **walk through** and it stops filling cells.

The second needs the doorway put back, and that is a `collider` list in the JSON
rather than a control here: a couple of boxes in the model's own frame, drawn
where its legs are. [§4](manual.md) has the table. A piece that already has one
shows as *drawn · 2 boxes*, and switching it away throws them out.

### Making something fall

Under **collides as**, on a blueprint, there is a **physics** switch. Off - which
is everything by default - the thing is scenery: it sits exactly where you put
it until a rule moves it. On, it becomes a **body**: it falls, it lands on the
floor and on other things, it bounces off walls, and **walking into it pushes
it**, with no rule and no script anywhere.

That last part is worth trying before you tune anything. Turn physics on for a
ball, press play, and run at it.

**A push is not a hit**, and the difference is most of how this feels. Walking
or sprinting into something moves it along in front of you at your pace and it
stops when you stop, like shouldering a box across a floor — nothing is stored,
so a touch cannot send it across the level on its own. To make it roll on by
itself you have to *hit* it: a **dash**, or a **kick** from a script, which does
not go through contact at all and so is not limited by how fast you can run.

Six numbers, all optional, each showing its default until you set it:

| | |
| --- | --- |
| **gravity** | a multiple of the world's. `0` floats where you leave it; below zero it rises, which is a balloon |
| **bounce** | how much speed comes back off a surface. `0` stops dead |
| **mass** | divides every push. `1` is a football; `20` barely notices you |
| **friction** | how fast a roll dies on the ground. The one you will actually reach for |
| **drag** | the same, in the air |
| **roll** | degrees it turns per cell travelled, so a ball does not look like it is skating |

Clearing a box puts the default back.

**`collides as` and `physics` are opposite questions**, which is why they sit
together. The first is *does this stop other things*; the second is *does this
get stopped*. All four combinations are useful: a coin you walk straight through
that still falls to the floor is **walk through** with physics on, and a ball
you can shove past rather than get stuck on is the same pair.

**A body is measured off its model, not off its position.** A thing with **walk
through** still occupies the shape it is drawn as, and it stands where the model
stands — the kit's centre-pivoted pieces are lifted so that dropping one on a
floor puts it *on* the floor. Get this wrong and the thing floats its own radius
above the ground with its shadow underneath it, which is what a ball did for a
while.

**A body standing inside something cannot move at all.** It is drawn where you
put it, it never falls, and nothing says why. This is nearly always the same
mistake: a thing with **walk through** has no box, so its collision footprint is
half a metre around its *middle* - put it at 1.4 on a floor whose surface is at
1, and its bottom is buried. Move it up, not down.

Two rules go with it. **`hit`** fires when a body meets the level - the floor, a
wall, a piece of the kit - which is where a thud, a puff of dust or a broken
crate hangs. **`collide`** is the other one, and it fires when a body meets
another *thing*; `hit` never names what it touched, because the level is not an
entity. In a script it is `self.push(x, y, z)` to hit something, `self.speed` to
ask how fast it is going, and `self.dx`/`dy`/`dz` to steer or stop it outright.

---

## Two kinds of thing

A **placement** is architecture: walls, floors, stairs, pillars. It rasterises
into cells once at load and never moves. It has no name, no properties and no
rules.

An **entity** is a thing: a crate, a pickup, a target, a door. It has its own
collision box exactly where the model is, it can hold properties, it can have
rules, and it can stop existing.

Rule of thumb: if it needs a name or a rule, it is an entity. Four hundred walls
as entities would be four hundred boxes tested sixty times a second for scenery
that never moves.

Entities come from **blueprints** - a kind of thing, named, with a model and
optional properties, tags, sockets and triggers. Every crate made from the
`crate` blueprint gets the same rules, which is what makes forty of them one
edit.

---

**Turning one into the other.** Select a placed piece in the **Built** list and
it offers *→ make it a blueprint*: the piece becomes an entity of a new
blueprint, in its place, keeping its position, turn and size. The placement is
**consumed** rather than left behind — an entity sitting inside the scenery it
was made from is two things in one cell that look identical and behave
differently, which is worse than either. The name comes off the model and is
uniquified, and the Blueprints panel opens on what it made, because wanting
behaviour is why anybody pressed it.

## The whole document: mode, sides and camera

Three things that are true of the level rather than of whatever is selected, so
they live together under the counts rather than in a panel each.

**Mode** is the preset — `freestyle`, `deathmatch`, `football`, `parkour`,
`shooter` — plus what ends it. A preset the world cannot back up is greyed out
with the reason beside it: `football` needs a goal at each end, `parkour` a start
and a finish. That is the same refusal the parser makes, said before the click
rather than as a save that silently does nothing.

**Sides** is who is against whom, which is a separate question from the preset —
a deathmatch can be every player for themselves or two sides of four.

| | |
|---|---|
| **all vs all** | Nobody has a side. Team spawn marks are not read |
| **teams** | The sides the spawn marks name |
| **1 vs all** | One against everybody, and a match names the one |

Pressing the one that is already on **clears it**, which is how a level goes back
to meaning whatever its marks say. That is the only way to say it: absent here
is derived, not a fourth value.

**Camera** is where the world is watched from, and it is an *input mode* as much
as a view — the keys are read against wherever the camera calls forward.

| | |
|---|---|
| **follow** | Behind the body. `behind`, `above` and `beside` frame it — `beside` is the shoulder cam |
| **side-on** | Flat on, along one axis. A platformer |
| **fixed** | Nailed to one spot. Leave the angles off and it **watches the player** |

`lens°` and `sees` are the field of view and the far plane, and both were
constants until a level could have an opinion. A field belonging to another kind
disappears when you switch — the file cannot hold a `span` on a follow camera, so
neither can the panel.

## Marks

The facts about a level: where a side spawns, where red scores, where a run
starts and finishes.

They matter more than they look. `capabilities` is a claim the parser *checks*
against the marks - a document saying `match` with fewer than two spawns is
refused on load, by name. So a level can be perfect and still refuse to open.

In the **Scene** panel: five buttons, one per kind. A new mark lands under the
pointer rather than at the origin, and it is selected so you can move it with the
handles. Spawns ignore width and height; a goal does not.

| Claim | What the world must have |
|---|---|
| `freeplay` | Nothing. A world you can be in is a world |
| `match` | A spawn for each side |
| `football` | A red goal and a blue goal |
| `competition` | A start and a finish |

---

## Rules

The **Rules** panel. Pick a blueprint, then its triggers are rows.

A rule is three things: **on** (`enter`, `exit`, `damaged`, `spawned`,
`finished`, `pressed`, `collide`, `held`, `dropped`, `returned`, `emitted`), an
optional **when** (one property against one number), and **do** (a list of
verbs).

The vocabulary is closed, which is why this fits on a panel rather than needing a
language: four events, six comparisons, eight verbs. There is nothing you can
write here that fails at runtime. A rule that genuinely needs to *compute* is a
script, one panel over.

### The verbs

| | |
|---|---|
| `damage` / `heal` | Changes `hp`, clamped at zero |
| `setProp` / `addProp` | Writes a property |
| `despawn` | Removes it. **A rule stops here** |
| `spawn` | Makes one, relative to this entity |
| `deactivate` / `activate` | Turns it off and back on. `seconds` on the first, or until something turns it back |
| `carry` | Hangs it off whoever set the rule off |
| `drop` / `unhand` | Lets go of one thing, or of everything |
| `disarm` / `arm` | Takes the weapon away and gives it back |
| `stun` | Roots a player where they stand, still standing |
| `teleport` | Sends it to an entity or a mark, **by name** |
| `checkpoint` | Where this player comes back to |
| `load` | A door out, by the name the document gave it |
| `sound` | The host plays it |
| `score` | The host decides what a score is |
| `emit` | The host tells whoever needs to know |

`target` is `self` or `other` - whoever set it off.

It was "the eight verbs" for a long time after there were eighteen, which is
what `manual.test.ts` now exists to stop: it fails when a name in the engine's
vocabulary is missing from either of these two documents.

**`pressed` needs a key first.** It listens for a binding by the name the level
gave it, so a document with no `player.keys` cannot have one — the picker says
"pressed — bind a key first" rather than accepting the choice and quietly
refusing to save it.

**`collide` is not `enter`.** `enter` is *the player walked into me*; `collide`
is *another entity touched me*, which nothing could notice before it existed. A
ball rolling into a goal fires the second and never the first.

### One thing telling another: `emit` and `emitted`

`emit` was a verb with no reader for a long time — it put a line in the corner of
the screen and nothing in a document could hear it. So the only way for one thing
in a level to tell another thing something was to write a number on it and have
the other thing watch that number every frame.

`emitted` is the other half. It names what it is listening for, and it hears
whatever any `emit` said:

| | |
|---|---|
| The bell | `on: pressed` (key `use`) → `emit` `"ring"` |
| The gate | `on: emitted` (event `"ring"`) → `setProp open = 1` |
| The lights | `on: emitted` (event `"ring"`) → `activate` |

**Every listener hears it**, which is the point — the bell does not name the gate,
so adding a third thing that reacts is a new rule and no edit to the bell. `other`
is whoever emitted, so a `when` can ask about the sender the same way it does for
a press or a crossing.

**The name is exact.** No wildcards, no namespaces — a rule listening for
`gate-open` does not hear `gate-opened`. An `emitted` with no name is refused
when the document is read, the way a `pressed` with no key is.

**A chain works, and a loop stops.** A rule may emit from inside an `emitted`
rule, so `one` → `two` → `three` runs to the end. A rule that emits the name it
is listening for is a loop, which is bounded rather than made unsayable: after
512 deliveries in one frame the rest are dropped. A level anywhere near that
number has a bug in it.

**A script's `emit` reaches these rules too**, and does not cross the network. A
rule's does. The reason is the one `@kxb/xp/sharing` gives about animation: a
script runs on every client from the same inputs and has therefore already
emitted everywhere, while a rule caused by a body fired on one machine only.

### Make a crate break

1. Give the blueprint an `hp` property.
2. Add a rule; set **on** to `damaged`.
3. Tick **when** and set it to `hp <= 0`.
4. Change the first verb to `despawn`.
5. Add a `spawn` verb before it if you want pieces left behind, and a `score`.

Order matters: anything after `despawn` is writing to a corpse, so the rule stops
there. `damage → despawn → something` is the shape almost every one of these
takes.

### Two things the panel will not let you do

The last verb has no remove button, and a `spawn` can only name a blueprint that
exists. Both are refused by the edit layer because both produce a document the
parser sends back - and a refusal arrives as "nothing happened", which is worse
than not being offered.

---

## Trying it, and the log

**Play** takes a snapshot and opens it over the editor. There is no save, no
session and no room — it is the one screen where looking at the thing costs
nothing.

The **Log** button in that title bar keeps everything the level said this run:
a pickup collected, a script's `log`, a rule that refused. The ticker over the
scene shows the last few and fades them, which is right while playing and
useless while building — a rule that fired twenty seconds ago has left nothing to
look at. It collects whether or not the panel is open, so opening it shows what
already happened rather than starting from the moment you wondered.

## Scripts

For behaviour a rule cannot express. JavaScript, in a sandbox, with three hooks:
`onSpawn`, `onTick(dt)` and `onTrigger(event, other)`.

`self`, `world`, `log` and `getEntityByName` are in scope. Nothing else is - no
`fetch`, no `Date`, no `Math.random`.

Attach one to a blueprint from the panel. Deleting a script detaches whatever was
running it, because a blueprint naming a script that does not exist is a document
that will not open.

Anything a script logs, and anything that throws, appears on the HUD while
playing. A turret that quietly does nothing is the failure this exists to
prevent.

### What you are handed

| | |
|---|---|
| `self` | The entity this script is on |
| `getEntityByName(name)` | Another one, or `null`. Indexed, so asking every frame is fine |
| `world.tick`, `world.time` | Frames since the start, and seconds |
| `log(...)` | Goes to the HUD, capped at 200 lines |

On an entity: `.x .y .z .rotation .scale` (read and write), `.moveTo` /
`.moveBy`, `.get` / `.set` / `.add` for properties, `.damage` / `.heal`,
`.despawn()`, `.spawn(blueprint, dx, dy, dz)`, `.score(n)` / `.emit(event)`,
`.distanceTo` / `.flatDistanceTo`, and `.alive`.

One asymmetry worth knowing: **reading a position gives world coordinates,
writing one moves it locally.** It only shows up on something with a parent -
asking where a gun on a hand *is* means where it is drawn, and moving it can only
move it within the hand.

### Recipes

Each of these is a whole script. Attach it to a blueprint in the panel.

**A platform that goes up and down.** The one that makes a level three
dimensional, and the runtime carries anybody standing on it.

```js
function onTick(dt) {
  // A sine of world.time rather than an accumulator: two clients that have been
  // running for different lengths of time still agree, because both are asking
  // the same function about the same clock.
  self.y = 3 + Math.sin(world.time * 0.8) * 2
}
```

**A door that opens when you are near it.** `flatDistanceTo` and not
`distanceTo` - "how close" almost always means on the floor, and the version that
counts height is a door that stays shut for somebody standing on a crate.

```js
function onTick() {
  const who = getEntityByName('player')
  if (!who) return
  const open = who.flatDistanceTo(self) < 3
  self.moveTo(self.x, open ? -4 : 1, self.z)
}
```

**A turret that tracks and fires.** `world.time` for the cadence rather than a
counter, for the same reason as the platform.

```js
function onTick() {
  const who = getEntityByName('player')
  if (!who || who.flatDistanceTo(self) > 20) return

  // atan2 of the difference, in degrees, because rotation is the document's unit.
  self.rotation = (Math.atan2(who.x - self.x, who.z - self.z) * 180) / Math.PI

  if (world.time - self.get('lastShot') < 1.5) return
  self.set('lastShot', world.time)
  self.spawn('bolt', 0, 1, 0)
}
```

**A patrol between two points.** Marks are not addressable from a script, so the
route is two named entities - which is also how you move the route without
touching the code.

```js
function onTick(dt) {
  const a = getEntityByName('post-a')
  const b = getEntityByName('post-b')
  if (!a || !b) return

  const to = self.get('toB') ? b : a
  const dx = to.x - self.x
  const dz = to.z - self.z
  const away = Math.hypot(dx, dz)

  if (away < 0.4) {
    // Flipped by a property rather than a local variable: a script is reloaded
    // when the level is, and a local would forget which way it was going.
    self.set('toB', self.get('toB') ? 0 : 1)
    return
  }
  self.moveBy((dx / away) * 2 * dt, 0, (dz / away) * 2 * dt)
}
```

**A pickup that respawns.** Despawning is final, so the thing that comes back is
a new one - and it is spawned by something that is still alive.

```js
function onTrigger(event, other) {
  if (event !== 'enter' || !other) return
  other.add('coins', 1)
  self.score(1)
  self.set('takenAt', world.time)
  self.set('gone', 1)
}

function onTick() {
  if (!self.get('gone') || world.time - self.get('takenAt') < 8) return
  self.set('gone', 0)
  self.spawn('coin', 0, 0, 0)
}
```

**A countdown that ends the round.** `emit` rather than anything cleverer: what a
score or an event *means* is the host's business, which is what lets the same
level be a practice range and a match.

```js
function onSpawn() {
  self.set('endsAt', world.time + 300)
}

function onTick() {
  if (self.get('called') || world.time < self.get('endsAt')) return
  self.set('called', 1)
  self.emit('full time')
}
```

### When to reach for a script, and when not to

A rule fires **immediately**, in the same frame, and is data a panel can show as
rows. A script runs in a sandbox and costs a little every frame it ticks.

So: anything that is "when X happens, do Y" is a rule. Reach for a script when
something has to *compute* - a position over time, a distance, an angle, a
cadence - or when it has to remember something between frames.

Properties are the memory. There are no variables that survive a frame, which is
deliberate: `self.set('toB', 1)` is visible in the inspector, saves with the
document, and can be read by a rule; a module-level `let` would be none of those.

---

## The player

In the **Scene** panel, under **Player**.

Absent means the built-in dummy, and that is the common case - most levels want a
person in them, not a paragraph about what a person is.

Set a **body** to be something else: a kart, a bird, a tank. Once a body has
sockets you can also set where the person's own avatar hangs, and what they are
**holding**.

A weapon is a blueprint on a socket - the same attachment a rider in a kart's
seat gets. What makes it a weapon is its *properties*: `damage` and `range`, read
when the trigger is pulled. A blueprint with neither is something you are
carrying.

Give the body an `ammo` property and rounds are counted; leave it off and they
are not. Ammo lives on the player rather than the gun, because an ammo box hands
it to whoever walked in.

---

## Ground, and falling

`world.ground` in Tools puts solid ground at `floorY`, everywhere. Off by
default.

On, it is somewhere to stand while a level is half built. Off, the bottom of the
world is a catch plane forty cells down - which is not standing anywhere, it is
falling more slowly.

Off is still the right default, because an invisible floor under the whole world
hides the hole you left in the real one.

---

## Saving

**Save** downloads `<id>.xp.json`. Put it in `public/xp/xps/` yourself, which is
also how you decide it is finished.

The draft autosaves to `localStorage` on every edit - losing an afternoon's
building to a refresh is the one unforgivable bug a builder can have. The
**draft** link in the title bar goes back to what is on disk.

A draft that no longer parses is dropped rather than repaired. That happens when
the format grows a field: your draft from yesterday does not have it, and the
file on disk is the thing it was a draft *of*.

---

## Checking your work

The runtime **cannot be watched in the Claude Browser pane**. The pane is always
`document.hidden`, so `requestAnimationFrame` never fires and the canvas stays
black; it also gives the canvas no size, so R3F never even starts. That is not a
bug to chase. Four things replace looking:

```bash
bun test src packages     # the engine, the rules, the documents
bun run xp:shot <id>      # draws a document with the software rasteriser
bun run xp:bench          # re-measures the limits
```

...and a real browser, for anything that moves.

`xp:shot` goes through the same transform the renderer uses, so it catches a
model pivoted through the floor or a scale out by a factor of four - the things
no test fails on and every eye sees.

### Playing it

`/xp/<id>` walks the level. `?room=<anything>` makes two tabs two players, which
is how you check that a level works with somebody else in it.

`V` switches to a camera behind the body. Click to look, WASD to move, shift to
sprint, space to jump (twice), and click to fire if you are holding something.

---

## Things that will catch you

**A target mounted flush against its own stand is unhittable.** Architecture
rasterises into the cells it *mostly* covers, so the stand's cells swallow
anything sitting against it - every shot lands on the post. Nothing about the
level looks wrong. The shooter demo was laid out twice because of this, and there
is a test that fires at each target for exactly this reason.

**A door is a gap in a wall run.** See above. It is the same cell approximation
seen from the other end - and an arch you cannot walk under is the same thing
again, in the one case where there is now something to do about it. See
*when a piece collides wrong*.

**Select never builds, and it used to.** If you are on an old build and stray
clicks are laying walls, that is what you are seeing.

**Distinct models decide how heavy a level is, not the piece count.** The
renderer makes one call per mesh per distinct model, so four thousand walls of
one kind are cheaper than forty of a hundred kinds. The Scene panel warns past a
dozen.

**An unnamed entity cannot be addressed by a rule or a script.** The Document
panel counts them.

---

## Where things live

| | |
|---|---|
| `packages/xp/` | The engine. Pure, tested, no browser |
| `src/app/xp/_editor/` | This screen |
| `src/app/xp/_runtime/` | Playing: the scene, the frame loop, the HUD |
| `public/xp/xps/` | The documents |
| `public/xp/packs/` | The art |

Two boundaries are enforced by lint and are not negotiable: `packages/xp` must
not import the app, React, three or any browser global, and `src/app/xp` must not
import the lounge - copy a component in and own it.
