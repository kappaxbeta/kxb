# The XP manual

How to write an XP, what the engine will do with it, and where it stops.

This is the reference. xp-creator.md is the plan and the
argument - why any of this is shaped the way it is. If you want to know *what a
field does*, you are in the right file; if you want to know *why the doorway
does not work*, that one has the reasoning and this one has the number.

Two more, and both are *proposals* rather than descriptions — nothing in either
is built, so where they disagree with this file, this file is what the code
does.

- xp-backend.md — an XP made by somebody outside the team,
  carrying its own art: the folder, the checks, storage, who owns it, the store,
  and review.
- xp-scenes.md — one document holding more than one place: the
  scene tree, timelines, and where a game's memory lives. It changes the format,
  so read xp-two-sessions.md on shared ground first.

---

## 1. A document, end to end

An XP is one JSON file in `public/xp/xps/<id>.xp.json`. Nothing else is
required; there is no row, no migration and no build step.

```jsonc
{
  "format": "xp/1",
  "id": "first-room",
  "name": "First room",
  "blurb": "One line, shown in the list.",

  // Which art it uses. Provenance is filled in from the pack table, so a
  // document cannot claim a different author or licence for our models.
  "packs": [{ "id": "proto" }],

  // What the product may do with it. Checked against the world - see §6.
  "capabilities": ["freeplay", "match"],

  // Where a player arrives. Cell coordinates; the eye is 1.7 above.
  "spawn": { "x": 0, "y": 1, "z": 2, "facing": 180 },

  // Kinds of thing. Named, because entities refer to them.
  "blueprints": {
    "crate": {
      "model": "proto/Box_A",
      "collider": "auto",
      "tags": ["breakable"],
      "props": { "hp": 10 },
      "triggers": [
        {
          "on": "damaged",
          "when": { "prop": "hp", "is": "<=", "value": 0 },
          "do": [
            { "op": "spawn", "blueprint": "debris" },
            { "op": "score", "amount": 5 },
            { "op": "despawn" }
          ]
        }
      ]
    }
  },

  // Things, placed in world units - not on the grid.
  "entities": [{ "blueprint": "crate", "x": 2.4, "y": 1, "z": 4.2 }],

  // Who you arrive as, and what you arrive holding. Absent means the dummy.
  "player": { "blueprint": "marksman", "weapon": { "blueprint": "pistol", "socket": "hand" } },

  "world": {
    "floorY": 0,
    // Solid ground at floorY, everywhere. Off by default - see §4.
    "ground": false,
    // Architecture. Fractional, and rasterised into cells at load.
    "placements": [{ "model": "proto/Primitive_Floor", "x": 0, "y": 0, "z": 0 }],
    // Facts the rules can see: goals, a start, a finish, where a side spawns.
    "marks": [{ "kind": "spawn", "x": 0, "y": 1, "z": 2, "team": "red" }]
  }
}
```

Open it at `/xp/<id>`. A document that does not parse gives you a page listing
every problem with its address, rather than a blank canvas.

---

## 2. Placements and entities are different things

The single most useful thing to understand before authoring.

| | Placement | Entity |
|---|---|---|
| What it is | Architecture | A thing |
| Position | World units, fractional | World units, fractional |
| Collision | Rasterised into a cell grid, once | Its own box, tested per frame |
| State | None | Properties, triggers, can stop existing |
| Costs | Once, at load | Every frame |
| Use it for | Walls, floors, stairs, pillars | Crates, pickups, targets, doors |

A wall is a placement. A crate you can break is an entity. Putting four hundred
walls in as entities would mean four hundred boxes tested sixty times a second
for scenery that never moves.

**Both are fractional now, and the row that matters is the one below it.** A
placement had to be a whole cell until the editor learned to place against
surfaces, and the constraint turned out never to have been load-bearing - the
rasteriser always rounded, because a model's own bounds are fractional. What
still differs is *collision*: a placement's is a set of cells worked out once, so
a wall at 2.5 fills the cells it mostly covers and its collision is a cell-sized
approximation of what is drawn. An entity's is its own box, exactly where the
model is. That is why a crate is an entity: on the lattice you would bump into it
a third of a metre before you touched it.

---

## 3. Limits, and where they come from

Every number here is measured, not chosen. `bun run xp:bench` produces the
tables and re-running it is how you argue with them.

### Placements: **8 000**

A load-time cost. Superlinear, because it is *cells* that cost and a floor tile
is sixteen of them.

| placements | cells | `buildSolids` |
|---|---|---|
| 1 000 | 16 000 | 7.8 ms |
| 2 000 | 32 000 | 19.6 ms |
| 5 000 | 80 000 | 75.4 ms |
| 10 000 | 160 000 | 198.6 ms |

8 000 keeps the worst case around 150 ms on a developer's laptop - call it a
third of a second on something ordinary. The budget here is a person's patience,
not a frame.

### Entities: **1 000**

The tighter limit, because an entity costs *every frame* rather than once.

| entities | one `step` | one `stepTriggers` |
|---|---|---|
| 200 | 0.04 ms | 0.04 ms |
| 500 | 0.06 ms | 0.06 ms |
| 1 000 | 0.13 ms | 0.43 ms |
| 2 000 | 0.24 ms | 0.81 ms |

Both linear, and both cheap enough at two thousand that the linear scan was the
right call - a spatial index would be optimising 1.4 % of a frame.

**The number that actually bounds it is not in the table.** The trigger pass
runs per *prober*, so the cost is entities × players. At 1 000 entities and
sixteen players that is 6.9 ms of a 16.7 ms frame, before anything is drawn.
When 1 000 is not enough, the fix is spatial - only test what is near a player -
not a bigger constant.

### The rest

| Limit | Value | Why |
|---|---|---|
| World radius | ±128 cells | A world 256 across. Not about space - placements are a list - but about a document claiming a wall at 90 000 and a floor at the origin. |
| World height | 64 cells | Generous for a room, cheap to check. |
| Mark size | 1–24 cells | Wide enough for any pitch, narrow enough that a goal can still be missed. |
| Solid cells | 2 000 000 | A guard against a handful of placements scaled up by a thousand. |
| Voxel mask edge | 16 cells | Everything in the kit is four or under; a hundred-cell mask is a megabyte of hex in a checked-in file. |
| Script source | 64 kB each | Every byte is compiled before anything is drawn. |
| Script memory | 4 MB per XP | A runaway allocation should be a `RangeError`, not the tab's own limit. |
| Script fuel | ~3 ms a hook | An endless loop is cut off. Counted in operations, not milliseconds, so every machine cuts at the same place. |
| Realtime send rate | 8 Hz | Room traffic grows with the *square* of the room. Interpolation looks the same from eight samples as from twelve. |
| Players per instance | ~25 | The tenant rate ceiling is 5 000 events/s; at 8 Hz that is where it lands. |

### What is *not* limited, and why it still matters

Draw calls. The renderer instances one call per mesh per distinct **model**, so
four thousand walls of one kind is cheaper than forty walls of a hundred kinds.
The example room is 38 objects and roughly 11 instanced meshes. If a level feels
heavy, count its distinct models before counting its pieces.

---

## 4. What the grid can and cannot represent

The cell is one metre. The prototype kit is authored at a metre a unit, so
architecture lands exactly - a wall really is four cells by four by one.

**Shapes are measured, not boxed.** Every model is voxelised at build time
(triangle-vs-cell, then flood-filled from outside so the inside is solid), so
stairs are steps, slopes are ramps and a window has a hole. 747 of the 3 892
models carry a mask; the rest fill their box and take the cheap path.

**Sub-metre detail does not survive.** The clearest case:
`Primitive_Doorway` has a 1.6 m opening in a 4 m wall. The opening straddles two
cells and fills neither, so both are solid and the doorway rasterises to a wall.

> **A door is a gap in a wall run.** Leave a piece out rather than placing a
> doorway. There is a test pinning this so it stays a decision rather than a
> surprise.

### `placement.collider`: when the measured shape is wrong

The mask is what the geometry measured, and sometimes the geometry is not what
you meant. An arch whose opening is narrower than a metre rounds shut and
becomes a solid block; a banner strung across a road is a wall. Both look
correct and neither behaves.

| Value | Meaning |
|---|---|
| absent (default) | The measured shape: the mask if the model has one, its box if not |
| `"none"` | Fills no cells. Banners, signs, foliage, anything hung across a way through |
| `[{ "x": -2, "y": 0, "z": -0.5, "w": 1, "h": 4, "d": 1 }, …]` | Boxes you drew, in the model's own frame |

A **list**, because the piece this exists for has two legs — one box cannot say
"solid here and here, air in between". Up to eight of them. They cost nothing:
a placement rasterises into cells once at load, so more boxes are more range
loops in a pass that already runs.

The box is a **minimum corner and a size**, which is the shape
`catalogue.generated.ts` prints a model's own bounds in — open it, read the
entry, write down the part of it you want. That is deliberately *not* how an
entity's collider works (`{ w, h, d }`, centred on the entity), and §5 says why.

Three things worth knowing:

- **The frame is the model's, before the turn.** The boxes go through the same
  quarter turn the model does, so a gateway turned to face east has its legs
  turned with it rather than left lying across the road.
- **A drawn collider replaces the mask, it is not cut by it.** Draw a solid
  plinth over a staircase and you get a plinth. Anding the two would mean an
  override could only ever take cells away, and you could not predict the
  result by reading it.
- **`none` beats `bounce`.** A pad you fall through cannot throw you. Setting
  both is not refused; it is a spring somebody turned off.

The editor's inspector shows the setting on any selected piece and can switch
between the measured shape and `none`. Drawing boxes is a JSON edit — a panel
for it would be a box editor with a gizmo per box, which is the workbench in
§5 of `creator.md` rather than a field in a sidebar.

**Steps up to 1.05 cells are walked, not jumped.** That is what makes stairs
work. Two cells is a wall. A crate half a metre tall is something you climb onto,
which is correct and occasionally surprising.

**A placement is fractional and its collision is not.** Since the editor learned
to place against surfaces, `x`, `y` and `z` are world units - a crate against a
wall rather than a third of a metre off it, a ramp meeting a floor, a piece at an
angle. The rasteriser still rounds, so what you get is the cells the piece mostly
covers: a wall at 2.5 is solid where it looks solid to within half a metre. The
alternative is testing every placement as an oriented box every frame, which is
what the entity limit exists because of.

**A tilted thing collides as the box around the tilt.** `rotation` is yaw and is
*snapped to the nearest quarter turn* for collision - which works because a
quarter turn of an axis-aligned box is still one. `pitch` and `roll` are not
that, so there is no snap available and no cheap shape a tilted box is close to.
What you get instead is the box that contains it: a ramp at 30 degrees fills the
cells its slope passes through **plus the wedge of air above and below it**.

> **Bigger than what is drawn, never smaller.** That is the direction chosen and
> the reason: bumping into air beside a ramp is an annoyance whose cause you can
> see, and falling through a ramp you are standing on reads as the level being
> broken. A tilted piece also stops reading its shape mask, so a tilted
> staircase is a solid tilted block rather than a staircase with holes in the
> wrong places.
>
> A tilt is worth a moment's thought before you use one for structure. As
> *scenery* - a leaning sign, a fallen pillar, a crate knocked on its corner -
> it costs nothing anybody notices.

**`stretch` is free of all of that.** The three multipliers scale the model along
its own axes *before* the turn, so a quarter turn still swaps two of them and the
snap stays exact. A crate stretched into a plank collides as a plank.

### `world.ground`

Solid ground at `floorY`, everywhere, forever. **Off by default.**

On, it is the thing every other engine gives you for nothing: somewhere to stand
while a level is still half built. Off, the bottom of the world is a catch plane
forty cells down - which is not standing anywhere, it is falling more slowly.

Off is still the right default, and the reason is what it hides: a floor you laid
is a floor you can see, and an invisible one under the whole world turns the hole
you left into a place you can walk. It is a checkbox in the editor's Tools panel,
beside the level.

It is not rasterised into the cell grid. It is the character controller's floor
clamp, which is the same thing seen from the other side - and it is why anything
else that asks "what is under me" (the third-person camera, a shot fired at the
ground) takes it as a separate argument rather than getting it from `isSolid`.

### What is under the world: four answers

| | |
|---|---|
| `ground: true` | A solid plane. You cannot fall at all |
| neither | A catch forty cells down. A miss costs the walk back |
| `restart: true` | Back to the spawn — or your last save point, because a hole and the spikes beside it must not send you to two different places |
| `fatal: true` | A **death**: health to zero, the `rules.respawn` wait, and back where a death puts you |

**`restart` and `fatal` are refused together**, and that is the rule worth
knowing. Both answer "what happens when you fall", so a document carrying both
has not said which it means — and picking one would be inventing an intention
the author would only discover by watching somebody die or not die. Both are
also refused beside `ground`, because a solid plane means the fall never reaches
the height that would do anything.

`fatal` exists so that a hole costs what every other mistake costs. A course
where falling into a pit sends you back with your health untouched, while the
spikes beside the pit kill you and hold you down, is a course teaching two rules
for one mistake — and a player learns the inconsistency rather than the level.

It is **not a second death path**. The fall takes the health to zero and
everything downstream is what a hazard already runs: the freeze, the wait, the
line, the revive, the counter. The body still returns the instant it crosses the
plane, which is what stops a corpse falling out of sight for the length of the
respawn wait.

All three are checkboxes in the editor's Tools panel, beside the level — and the
last two only appear with `ground` off, because the editor must not write a
document it cannot reopen.

---

## 5. Blueprints, entities, rules

### Collider

| Value | Meaning |
|---|---|
| `"auto"` (default) | A box from the model's measured geometry |
| `"none"` | You walk through it. Pickups, coins, trigger volumes |
| `{ "w": 1, "h": 2, "d": 1 }` | An explicit box, centred on the entity |

`"none"` is not a shortcut - an ammo box you have to walk around to collect is
an ammo box nobody collects. A blueprint with no collider still notices you: the
enter/exit pass uses the model's footprint.

**One box, centred, where a placement's is a list of corners.** The two look
inconsistent and are not. An entity's origin *is* its middle - it is a crate
standing somewhere - so centred is the description that needs no arithmetic, and
its body is tested by a linear scan sixty times a second, which is what keeps it
to one box. A placement's collider is authored against the model's printed
bounds and rasterises into cells once, so it is written the way those bounds are
written and may be as many boxes as the shape needs. See §4.

### Properties

Numbers only. Every verb that touches one does arithmetic on it, and a property
that is sometimes a string is one every rule has to check first. An entity's own
`props` override its blueprint's rather than replacing them.

### Signs: text in the world

An entity can carry `text` (up to `MAX_SIGN_TEXT_LENGTH`, 240 characters),
`colour` and `background` — both `0xRRGGBB`, the same shape a lamp's `colour`
is. All three are per **entity**, not per blueprint: a "sign" blueprint is one
kind of thing and every one placed from it says something different, the same
argument `checkpoint`'s `order` makes.

Not a property — `props` is numbers only, by design (see above), and a sign's
words are not something a verb should be able to do arithmetic on.

Drawn in the scene rather than on the HUD: a billboarded label appears near an
entity that has `text` once a player is close enough to plausibly be reading
it, nearest few first when there are more than the runtime draws at once.
Picking the catalogue's `sign` model in the editor starts a blueprint tagged
`sign`, which is what the Properties panel reads to decide whether to show
the field at all — the same way it decides whether to show a save point's
`order`. Any blueprint tagged `sign` by hand gets the same field, whatever
its model.

### Triggers

`on` is one of `enter`, `exit`, `damaged`, `spawned`, `finished`, `dealt`,
`pressed`, `released`, `collide`, `hit`, `held`, `dropped`, `returned`.

**The unstick button emits `unstuck`.** It moves the player back to the start,
which is all it can do on its own — but being stuck is rarely only about you: a
ball wedged where nobody can reach it strands everybody. So the press is offered
to the level as an `emitted` event and the document decides what else it means.
A level with no rule for it is unaffected.

**`pressed` and `released` are the two edges of one key**, and both carry the
`does` name they listen for. The pair is what a level says *hold this and carry
it* with: pick up on the way down, put down on the way up. Before `released`
existed that had to be two `pressed` rules with a latch between them to stop the
first undoing the second inside a single press — and across several entities in
reach it could not be made to work at all, because nothing one of them writes is
visible to the next one asked.

Only `pressed` takes a `within`. What you let go of is what is in your hand, not
what you happen to be pointing at by then — and between the two you will have
walked somewhere, which is the whole point of holding it.

**`damaged` is for damage from *outside* the rules** — a shot, a swing, a
script's `.damage(n)`, **or the arbiter telling you somebody hit you**. That last
one is the reason a rule like *being hit makes you drop what you are carrying*
works in a room at all: the health the others shoot at is the server's, it comes
back on a poll, and until it went through `damage()` the number simply changed
and no rule ever saw it. The level worked alone and did nothing with anybody
else in it. The `damage` **verb** only changes the number: a verb that fired
rules would recurse, which is the same refusal `carry` makes about `held`. So a
blueprint that hurts itself on `pressed` and reacts on `damaged` is one whose
second rule never runs, and nothing says so. Write both on the same event
instead, in order — `fire` walks the list once and asks each `when` at its turn,
so the second sees what the first did:

```json
{ "on": "pressed", "key": "attack", "within": 2,
  "do": [{ "op": "damage", "target": "self", "amount": 10, "upTo": 20 }] },
{ "on": "pressed", "key": "attack", "within": 2,
  "when": { "prop": "hp", "is": "<=", "value": 0 },
  "do": [{ "op": "deactivate", "target": "self", "seconds": 3 }] }
```

**`returned` is the other half of `deactivate`.** A thing turned off with
`seconds` on it comes back on its own, and until this event nothing in the
document could hear it happen — so a thing that came back could not come back
*changed*. It is what makes a target worth hitting twice: knocked to zero, gone
for three seconds, and back at full health.

```json
{ "on": "returned", "do": [{ "op": "heal", "target": "self", "amount": 999 }] }
```

Nothing sets it off, so `other` is null — a timer ran out, which is a fact about
the clock rather than about anybody in the room. It is deliberately **not**
`spawned`: a thing that was merely off has not come into being, and folding the
two would re-run every set-up rule a blueprint has each time a pickup refilled.

**`held` and `dropped` are the object's own view of being carried.** `carry`
moved a thing and told nobody, so a flag that should glow in somebody's hand, a
lamp that should light when lifted or a bomb that should start counting had no
moment to hang a rule on. Both fire on the *thing being carried*, and whoever
picked it up arrives as `other` — so `damage target: "other"` on a `held` rule
hurts them, and `when: { "of": "other", … }` asks about them. `dropped` has no
subject: a thing that has been put down is in nobody's hands.

They fire however it happened — `carry`, `drop`, `unhand`, a `teleport` out of
somebody's grip, and a peer picking it up on their own machine — because they
are found by comparing who is holding what against last frame rather than by
being told from inside a verb.

**And there is a state to go with the edge: `held`.** It reads `1` while a thing
is in anybody's hands and `0` otherwise, in a condition (`{ "prop": "held", "is":
"==", "value": 1 }`) and in a script (`self.held`). It is the world's own answer
rather than a property, so nothing has to keep it in step and no blueprint may
declare one — a `props` block naming `held` is refused, because a number you can
see being ignored is worse than a field that does not exist.

```json
{ "on": "held", "do": [{ "op": "setProp", "target": "other", "key": "flag", "value": 1 }] }
```

**`dealt` is how a level with secret roles acts on them.** `rules.roles` is a
deck the arbiter shuffles and hands out one value each; the client is told its
own and nobody else's. When it arrives, the value becomes a **property on the
player, named after itself and set to 1** — a player dealt `bug` has
`props.bug = 1` — and `dealt` fires once on every entity that asks for it, the
same way `finished` does.

So "make a noise at the one person who was dealt the bug" is an ordinary rule on
the player's own blueprint:

```json
{ "on": "dealt", "when": { "prop": "bug", "is": "==", "value": 1 },
  "do": [{ "op": "sound", "sound": "hit" }] }
```

A player who was dealt nothing has no such property, which reads as zero — so a
rule written the other way round (`"value": 0`) is true before the deal as well
as after it, which is the safe direction for anything that takes something away.
A level with no `roles` never fires the event at all.

> **Do not use this event to decide who can hurt whom.** Proto Bug tried, with a
> `dealt` rule that set the crew's `ammo` to zero, and it cannot work: this
> client is the only one that ever sees its own secret, so a rule here is a rule
> only the person it disadvantages is keeping. Disarming the crew also disarmed
> them against the *bug*, which was the whole of their game. `rules.lethal` is
> the field for it — see §6.1 — and it is enforced by the arbiter, which is the
> only party that has seen the whole deal.

**`enter` and `collide` are not near-synonyms**, and the difference is *who is
doing the overlapping* rather than anything about solidity. The runtime hands
the trigger pass exactly one **prober** — the player — so `enter` means "the
person walked into me" and nothing else in a level could set anything off by
moving: a ball rolled into a goal, a crate carried into a wall, a thrown thing
meeting the floor, none of them fired. `collide` is the other side: **another
entity touched this one**, and the player deliberately does not fire it, because
firing both would run one rule twice.

Both events are **overlaps**, not impacts. An entity with a collider does stop
the player — the controller is handed the entity boxes as blockers alongside the
grid — but neither of these events is reported by that collision. They are found
by comparing who is inside what against last frame, which is why a thing you
walk *through* (`collider: "none"`) fires them just as reliably as a thing you
walk into. Solidity and triggerability are unrelated.

`collide` costs *askers × entities* per frame, where an asker is an entity whose
blueprint declares one. A level with none pays a single walk of the live set.

**`hit` is the third one, and it is about the level rather than about a thing.**
`enter` is "a person touched me", `collide` is "another entity touched me", and
`hit` is "I ran into the world" — a floor, a wall, a placement. It only ever
fires on something the document made a **body** (below): scenery never arrives
anywhere, so until a thing could fall there was nothing to report.

`other` is `null` on a `hit`, always, the same way it is on a `dropped`: what it
ran into is the level, which is not an entity and has no id. A rule that needs
to know *what* it touched wants `collide`.

It fires on the frame of the contact and not while something is lying still —
a body at rest reports nothing, so a landing sound is a sound and not a drone.

### `blueprint.body`: things that fall, roll and get shoved

```json
"ball": {
  "model": "kenney/soccer-ball",
  "collider": "auto",
  "body": { "bounce": 0.55, "friction": 1.4, "roll": 260 }
}
```

A blueprint with no `body` is scenery: it is exactly where the document put it
until a rule, a script or a hand moves it. With one — **even an empty `{}`** —
gravity, the floor, the walls and anybody's shoulder get an opinion about where
it is.

| field | default | what it is |
| --- | --- | --- |
| `gravity` | `1` | multiple of the world's pull. `0` floats; a negative one rises, which is the balloon |
| `bounce` | `0` | fraction of speed returned off a surface. `0` stops dead, `1` never tires |
| `drag` | `0.1` | fraction of speed lost per second **in the air** |
| `friction` | `3` | the same, **on the ground**. This is what decides how far a rolled thing travels |
| `mass` | `1` | divides every push. `1` is a football, `20` barely notices you |
| `roll` | `0` | degrees turned per cell travelled, so a ball does not look like it is skating |

**`roll` is drawn, not simulated.** The renderer turns the mesh about the axis
perpendicular to the way it is travelling — real rolling, not a spin on the spot
— and it works the distance out from where the thing is *drawn*, so it looks the
same on every client whether or not that client is the one integrating. Nothing
reads it back: a rolling ball's box, its triggers and its goal line are all
exactly where an unrolled one's would be. Rolling without slipping is
`180 / (pi * radius)`, so about **115** for a ball half a cell across and `57`
for one a full cell; larger is a beach ball spinning faster than it travels,
which is allowed.

`body` sits beside `collider` rather than inside it because they answer opposite
questions: `collider` is *does this stop other things*, `body` is *does this get
stopped*. All four combinations are useful — a coin you walk straight through
that still falls to the floor is `"collider": "none"` with a body.

**The player pushes things by walking into them**, with no rule and no script,
and *pushing is not hitting*. Walk or sprint into a ball and it goes along in
front of you at exactly your pace and **stops the moment you do** — like
shouldering a box across a floor. Nothing is stored, so a touch cannot send it
across the pitch on its own.

Speed of its own comes from an *impact*: whatever you are doing over a sprint is
transferred and the thing rolls on afterwards. In practice that means a **dash**,
and a **kick** — a script calling `push` — which does not go through contact at
all and so is never limited by how fast you can run.

The way out is the shallowest side of the box, not the line between the two
centres. That matters when you are standing *in* something: two centres nearly
coincide, so the direction becomes whatever the last millimetre of noise says
and the thing leaves sideways at speed. A box has a nearest way out however deep
you are in it. Everything here divides by `mass`, which is the field to reach for
when something should feel heavy.

**`bounce` here is a coefficient and `bounce` on a spring pad is not.** A pad
throws a *player* a fixed number of cells so a course built on it can be proved
(§4). Nothing about a ball is a course, and a ball that returned the same height
off a two-cell drop and a ten-cell drop would be the bug.

**One client integrates the moving things and everybody else watches.** The
lowest player id in the room owns them: it simulates them and says where they
are eight times a second, and everybody else draws the ball *between* two of
those samples, a fixed delay behind — exactly what every player's avatar has
always done, over the same transport, at the same rate. The election costs no
packets — every client already knows the roster, so every client reaches the
same answer at the same moment — and it re-runs on its own when somebody leaves.

A follower deliberately does **not** keep simulating and get corrected. That was
tried and it is what made the ball jump: two clients only agree until one of
them resolves a bounce a frame before the other, and at twenty cells a second
one tick of disagreement is two and a half cells — far enough that a correction
stops easing and teleports. Every wall, every player, every post is one of
those. A quarter of a second late and perfectly smooth beats live and jumping.

Alone in a room you are the owner, so a level played by one person behaves
exactly as it did before any of this existed.

What this fixes is not drift, which is smaller than it sounds: friction is a
fraction per second, so two machines at different frame rates stop a rolled ball
within a millimetre of each other. It is the things one client never *learned* —
a kick is a local key press, and a client that missed one has a ball a pitch away
from everybody else's with nothing in the physics to bring it back. A push made
by somebody who is not the owner therefore crosses as a **force**, not a
position, and is applied through the same mass and the same speed cap as a local
one. Walking into something needs no packet at all: the owner can see where
everybody is standing.

The rule of thumb behind all of this: nothing that changes eight times a second
is ever written to the event log. A final score is; a ball is not.

`when` is one comparison and nothing more: `{ "prop": "hp", "is": "<=", "value": 0 }`.
Comparisons are `<  <=  ==  !=  >=  >`. A missing property reads as zero.

**A `value` may be a number, or a number the level is keeping.** `"value":
"@world.wanted"` compares against a field the `data` block declares rather than
against a literal — one level deep, so `@world.a.b` and `@self.hp` are refused
by the parser and there is nothing further to learn. A field nobody has written
reads as zero, exactly as a missing property does, and a `@world.` naming a
field the level never declared is refused where the same typo in a rule is.

It is the one indirection in the whole format and it went into the shallowest
slot on purpose: `prop` stays a name and `of` stays a subject, so nothing became
an expression except the number. What it buys is the game that could not be
written without a script — the round rolls a number into a field, and the thing
to catch is whichever one carries it:

```jsonc
"does": [{ "op": "roll", "key": "wanted", "sides": 6 }],
// on the catchable blueprint
{ "on": "held", "when": { "prop": "number", "is": "==", "value": "@world.wanted" },
  "do": [{ "op": "emit", "event": "caught" }] }
```

**`roll` is a dice, and it lands in the level's own data.** `{ "op": "roll",
"key": "dice", "sides": 6 }` names a field the `data` block declares, and the
number is decided by the arbiter when there is one — because a roll every client
can reproduce is a roll every client can re-do until it likes the answer. With
no arbiter it is the host's own random, which is honest alone and not between
four people; a level that cannot tolerate that says `needs: arbiter`.

It writes **nothing** while it waits for an answer, deliberately: a rule reading
`dice == 0` after a roll that has not landed would behave as though the dice came
up a face it has not got.

**`sit` takes a chair, and the table decides who gets it.** `{ "op": "sit",
"team": "blue" }` asks for one of the sides the spawn marks name. It is the same
shape as `roll` and for a sharper version of the same reason: *is blue free* is a
question two clients can both answer yes to in the same moment, so nothing is
written until the arbiter says so — and it refuses a chair somebody is already
in, ignores you asking for the one you are in, and gives up your last one if you
ask for another.

It is what `assign: 'claim'` is for, and under that value **a host may not
overrule it**. Every other way onto a side answers *which side is this person on*
without asking them — a hash of their id, a join order, a lobby that decided
before anybody loaded the document. A level whose seats mean something to the
person in them says `claim`, binds four keys to four `sit` verbs, and everybody
picks their own.

### Being hit, and seeing it

**Anything whose blueprint declares `hp` shows a bar once it has been hurt**, and
only then: an untouched level draws nothing, which is what makes it feedback
rather than a health inspection. The bar sits above the thing's own box, so a
barrel and a wall each get one in the right place, and it drains from the left
edge, green to red.

The ceiling is the blueprint's own `props.hp` — a thing at full health is one
whose number still equals what its blueprint started it at, so there is no
maximum to declare and nothing to keep in step.

`"bar": false` on the blueprint turns it off. Two cases want that: a thing whose
damage is meant to be **secret** — a door with a hidden lock, a boss the fight is
about guessing — and a thing hit so often the bar is noise. It changes nothing
about what happens to the thing, only whether anybody is shown it.

**And it flinches.** Anything whose health goes down wobbles for a quarter of a
second — a decaying shake and a small twist, on the *drawn* model only. The
entity has not moved: its position, its box and its collider are all exactly
where they were, so a thing you can see wobbling is still a thing you can hit
where you can see it. Like the bar, it is driven by the health rather than by
the shot, which is why it happens for all three ways damage arrives — a shot, a
rule, and somebody else's hit coming over the wire.

**A hit does not have to be the same size every time.** `upTo` on `damage` or
`heal` makes the amount a whole number anywhere between the two, both ends
included: `{ "op": "damage", "target": "self", "amount": 10, "upTo": 20 }` takes
off ten to twenty. A punching bag that comes off at exactly ten every time is a
bag you can count rather than one you hit.

The number is drawn from the same seeded stream a script's `world.random()` uses
(§10), so a level played alone rolls the same game twice. Two clients rolling
differently for the same swing is not a problem: the hitter deals the damage and
the *outcome* is what crosses the wire.

**Healing stops at full.** `heal` will not take a thing above its blueprint's own
`hp`, which is what makes "back to full" writable at all — no verb can read a
maximum, so the way to say it is to heal by more than enough and let the ceiling
do the arithmetic. That is the second half of the `returned` example above.

**Damage crosses the wire.** Before this, a crate was hit on one machine and
every other screen showed an untouched box until it vanished. The picture peers
exchange now carries what is below full, as a number and not a fraction — the
receiver has the blueprint, so it has the ceiling, and a fraction would round
differently on two machines showing the same crate.

### What a script can reach

The sandbox hands a script four things and nothing else — no `fetch`, no `Date`,
no `Math.random` (see §10 for why). This is all of it.

**`self`** — the entity the script is attached to, and `null` in the level's own
script. **`getEntityByName('gate')`** finds any other, or `null`.

An entity has `x`, `y`, `z`, `rotation`, `scale`, `angle`, `intensity`, `range`,
`colour` as plain properties you can read and write, and `held` which is
read-only — being carried is a fact about the world, and `carry`/`drop` are how
it changes. Then:

| | |
|---|---|
| `get(key)` / `set(key, n)` / `add(key, n)` | its own properties. Missing reads as 0 |
| `damage(n)` / `heal(n)` | `damage` goes down the same path a shot does, so the entity's own `damaged` rules still fire. `set('hp', n)` is the way to change health *without* waking them |
| `despawn()` | |
| `spawn('blueprint', dx, dy, dz)` | offset from this one; returns the new entity or `null` |
| `score(n)` / `emit('event')` | the entity you call it on gets the point — a script has no "whoever set it off" |
| `distanceTo(other)` / `flatDistanceTo(other)` | flat ignores height, which is what "how close is the player" usually means in a level with stairs |
| `moveTo(x, y, z)` / `moveBy(dx, dy, dz)` | |
| `material` | what it is made of, read and written: `self.material = 'rainbow'`, and `'own'` puts its model's own materials back. A name that is not one of those throws, with your line number |

**`world`** is the level: `world.tick`, `world.time` (seconds, agreed by
everybody), `world.seed` (the number the whole room was told), and
`world.random()`, `world.randomInt(a, b)`, `world.roll(6)`, `world.pick(list)` —
a stream every client reproduces, which is why `Math.random` is refused.

**And `world.get` / `world.set` / `world.add` reach the `data` block** — the same
three names an entity has for its own properties, because it is the same idea one
level up. **This is how you add money when somebody uses something:**

```js
function onTrigger(id, event) {
  if (event === 'pressed') world.add('money', 5)
}
```

with `"money"` declared in Data. A rule says the same thing as
`{ "op": "addProp", "key": "money", "value": 5, "target": "world" }`, and both
write the same number — a script adding a coin and a rule asking whether there
are ten are looking at one map.

**Taking is `world.add('money', -5)`**, and **buying is `world.spend`**:

```js
if (world.spend('money', 5)) self.spawn('sapling', 0, 0, 1)
```

It answers `true` when it went through and `false` when the balance was short,
writing nothing in that case. That is not a subtract with a nicer name — it is
the *refusal*. Buying is "check the balance and take it", and written as two
calls that is two moments a level can be wrong between: a script that checks,
does something else, then takes, has spent money it did not have. Short is a
refusal rather than a partial spend, because taking what there is and answering
`false` is the worst of both — the caller reads "nothing happened" and the money
is gone anyway.

Nothing floors anything. `add` will take a balance below zero quite happily,
which is right for a score and wrong for a purse, and which of those a field is
belongs to the level.

A field the document never declared **is refused and logged**: `parseXp` catches
a *rule* that names one and cannot catch a script, where the key may be built at
runtime, so the check happens at the write. It says so rather than failing
quietly, because accepting it silently means the value works all session and is
gone the next morning — the scene only writes declared fields back to the store.

**`log(...)`** goes to the Scripts panel, and nowhere else.

### The level's own script

`"script": "hub"` names one of `scripts` and runs it **for the document**, not
for a thing in it. It is where a rule about the level goes — three things having
happened, a door opening, a round being counted — which otherwise gets hung on
whichever entity happened to be nearby, and that is where a level's logic goes
to be lost.

It has **no `self`**: `onTick` and `onSpawn` are the two hooks that mean anything
without one, because `onTrigger` is an event that happened *to something* and a
level is not a thing that can be walked into. It keeps running with nothing alive
at all, which is the difference from an entity's script — the level is what it is
about, and the level is still there.

Document-level rather than inside `world`, because a document can have several
scenes sharing one `scripts` table: a hub in a world would become four hubs the
day somebody adds a room.

**`pass` hands the turn on, and the first one starts them.** A level that says
`pass` is a level that means turns — the verb has never meant anything else — so
there is nothing to switch on and no field to set: the first press seats
everybody who has joined, in an order the server keeps, and hands the turn to the
next of them.

It carries nothing, because whose turn it is and who is next are the arbiter's
and a field here would be a client naming somebody else's turn. `roll` refuses
when it is not yours — but only in a level that has started turns at all, so a
game with no turns is unaffected. **Whose go it is is drawn on the HUD**, as
*your turn* or the name of whoever has it, so a player who cannot roll is told
why without having to try.

Two properties worth writing a game against. **Somebody who joins later gets a
seat**: the order is read from who is in the match each time the turn moves
rather than frozen when it started, so a fourth player who arrives mid-game
takes their place in it. And **a rematch clears the table**, so the next round
seats itself on its own first `pass`.

**When** a turn ends is the document's business: rolling a six and going again is
a rule about a game, and the arbiter has never been told any of those.

**Somebody the room has voted out is skipped**, and a turn left parked on them
can be moved on by anybody — being out is a decision the room made, so the order
follows it. Somebody who simply *closes their tab* is different: the turn stays
theirs, because nothing here can tell gone from thinking.

**`raid` takes something out of somebody else's save.** `{ "op": "raid" }`, and
it carries nothing — including who. The level's `visit` block says *what* moves
and how much, and the server picks *whose* at random among everybody who can
spare it.

That is the design rather than a missing field. A player who could name a target
would name the same one, which is the farming every game with this mechanic has
cooldowns and caps to blunt; not offering the choice is a stronger rule than any
of them, and it means a level needs no way to type a name — which in a world
whose pointer is locked would be a panel that takes the camera off whoever is
playing. The answer says who it turned out to be, so a level can put a name on it
from the roster it already has.

Three things it refuses, each of them said rather than swallowed: **your own
cooldown** has not run out (once per the `visit` block's `cooldown`, so "once a
day" is `86400`), **nobody has any to spare** — which includes everybody who was
raided by anyone else inside the same window, so one person cannot be picked over
all morning — and **there is no arbiter**, on a host that has none.

```json
{ "on": "pressed", "key": "use", "within": 2, "do": [{ "op": "raid" }] }
```

**`meet` calls a meeting**: `{ "op": "meet", "seconds": 60 }` opens a vote for
the whole room, and the panel that shows it and takes a press is the one that
already existed. The arbiter clamps the length and refuses a second meeting over
a running one, so a level may put this on as many buttons as it likes. A host
with no arbiter cannot hold one and says so.

**A mark's `kind` is one of `spawn`, `start`, `finish`, `red`, `blue` or
`point`.** The first five mean something to the runtime — where people arrive, a
race's two ends, two team goals. **`point` means none of them**: a named place
and nothing else, which is what a board's fields are. It exists because
`advance` walks a track of named marks and every other kind already had a job:
numbering forty fields as `spawn` would put players on random squares, and as
`finish` a level with no race in it would be full of finish lines.

**`advance` walks a piece along a track of marks**, which is the one thing
`teleport` cannot do: it names a single mark, and "three fields further on"
depends on where the piece is now. `{ "op": "advance", "target": "self", "by":
"dice", "along": "track" }` looks for marks called `track-0`, `track-1` and so
on, and `along` names the *property* it keeps the index in as well — a piece on
`track-4` has `props.track = 4`, so where it stands and where it thinks it stands
cannot drift apart, and a rule can ask "am I home yet" by reading that number.

`by` is a field in `data`, almost always the one a `roll` just landed in.
**Running off the end is not a move**: when `track-<n>` does not exist the piece
stays where it is, which is the rule a board game actually has — you need the
exact roll to come home. Clamping to the last field would pile everybody onto it.

**Both walls of a track are that one rule**, and the second one is worth knowing
because it needs no vocabulary at all. A piece waiting in its yard is not on the
track yet, and the way to say so is to start it *before* the track: at `-6`,
`advance` by three looks up `track--3`, which is not a mark, so the piece stays
in the yard. *You need a six to come out* is the same sentence as *you need the
exact roll to come home*, read from the other end — and **a roll you cannot use
still costs the turn**, which is the rule rather than a consolation.

**A track is a numbering and not a lane.** Four colours can walk the same forty
squares from four entry points by naming each square four times over — `blue-20`
and `red-0` one square, each colour's numbers turning off into home fields of its
own after `39`. `advance` never has to know that, because it only ever looks up
one name.

> `mensch.xp.json`, which this was built for, no longer uses any of it: its
> pieces are picked up and put down by hand. [round.md](round.md) §3 is what a
> board is when nothing computes a move, and it is worth reading beside this —
> the verb is still here and still tested, for the level that wants it.

**A thing a player lets go of lands on a field.** The runtime puts it on the
nearest named `point` mark rather than where the hand happened to be, at any
distance, and a level with no `point` marks has nothing to snap to and leaves it
where it fell. A board has squares: a piece a few centimetres off its own is a
board that slowly stops being readable, and *which field is that piece on* stops
having an answer — which is the question every rule about a board asks. It is
also what makes a move sayable, because a name travels where three floats do not.

`do` is a list of verbs:

| Verb | Fields | Does |
|---|---|---|
| `damage` / `heal` | `amount`, `upTo?`, `target` | Changes `hp`, clamped at zero and — for `heal` — at the blueprint's own `hp`. With `upTo` it is a whole number anywhere between the two, both ends included |
| `setProp` / `addProp` | `key`, `value`, `target` | Writes a property |
| `despawn` | `target` | Removes it. A rule stops here |
| `spawn` | `blueprint`, `dx`,`dy`,`dz` | Makes one, relative to this entity |
| `deactivate` | `target`, `seconds?` | Turns it off. Absent `seconds` is until something turns it back on |
| `activate` | `target` | Turns it back on |
| `carry` | `target`, `socket?` | Hangs it off whoever set the rule off |
| `drop` | `target` | Lets go of what it is holding. Out of a **player's** hands it lands on the nearest field, as above |
| `unhand` | `target` | Lets go of everything — but not a worn weapon, which `disarm` owns |
| `disarm` / `arm` | `target` | Takes the weapon away and gives it back. No `seconds`: a disarm ends when whatever caused it ends |
| `stun` | `target`, `seconds` | Roots a player where they stand, still standing. `seconds` is required — a stun with no end is a player who has left |
| `dash` | `target`, `cells` | An **effect** — a shove forward, the length of a dash. `stun`'s twin: neither can be written into the world, because the host owns where a player is and, for this one, which way they are *going*. Negative is a hop backwards. It goes through the character controller, so a dash into a wall stops at the wall |
| `swing` | `target`, `reach?` | An **effect** — a punch at whatever is in front, at arm's length. The third of the family, and it is what a level about hitting people is built on: a shot needs a weapon, and this needs a hand. `reach` defaults to about two paces and is capped at four cells — a longer one is a hitscan gun with the wrong name. **Refused with your hands full**, so a level that gives you a flag has taken your fists away by doing so. What it takes off is `damage` on the swinger, beside `ammo` and for the same reason, and the arbiter is told it once at join |
| `material` | `target`, `material` | What it is made of: `own` is the model's own glTF materials, `rainbow` is the Fresnel glass. `own` is how a level says "stop glowing" |
| `teleport` | `target`, `to` | Sends it to an entity or a **mark**, by name |
| `checkpoint` | `target` | Where this player comes back to. Highest number wins |
| `load` | `xp` **or** `scene`, `who?` | An **effect** — a door. `xp` leaves for another document, by the name the document gave it; `scene` walks into another room of this one, nothing fetched. One or the other, never both. `who` is `"room"`, which is also what leaving it out means |
| `sound` | `sound` | An **effect** — the host plays it |
| `animate` | `clip`, `loop?`, `parts?`, `target` | Plays a clip on a body. No `parts` replaces what it was doing; `parts` lays it over the top |
| `play` | `motion`, `target` | Runs one of the blueprint's own **motions** by name — its model's nodes, not a skeleton. Playing it again restarts it |
| `rest` | `target` | Puts every node back where the model draws them, and forgets the motion |
| `score` | `amount` | An **effect** - the host decides what a score is |
| `emit` | `event` | An **effect** - the host tells whoever needs to know |
| `movie` | `sequence` | An **effect** — plays one of the level's **cuts** over the top. Not a `load`: the level carries on existing underneath, nothing is fetched, and only this player watches. The name has to be a cut this document declares, unlike a clip or a scene |

`target` is `"self"` (default) or `"other"` - whoever set it off.

Two rules worth knowing:

- **`enter` fires once**, on the way in. Standing in a trigger does not fire it
  again. Without that, a coin is collected sixty times a second. `collide`
  follows the same rule, for the same reason — a ball resting against a gate
  would otherwise be teleported every frame. There is no `uncollide`: nothing
  has asked to know that two things stopped touching.
- **A rule stops when its entity despawns.** Anything after would be writing to
  a corpse, and `damage → despawn → something` is the common shape.

An unknown verb, event or comparison is **refused at parse time, by name**. A
rules system that ignores a typo is one where the level looks finished.

### Composition: things attached to things

An entity can hang from another one.

```jsonc
"blueprints": {
  "kart":  { "model": "proto/Cube_Prototype_Small",
             "sockets": { "seat": { "x": 0, "y": 1, "z": -0.5 } } },
  "rider": { "model": "dummy/Dummy", "collider": "none" }
},
"entities": [
  { "blueprint": "kart",  "name": "kart-1", "x": 10, "y": 1, "z": 4 },
  { "blueprint": "rider", "parent": "kart-1", "socket": "seat", "x": 0, "y": 0, "z": 0 }
]
```

A child's position, rotation and scale are **relative to its parent**, so the
rider moves with the kart without either of them knowing the other exists. The
same mechanism hangs a gun off a hand and a light off a post; chains compose all
the way up.

**A socket offset is turned by the parent before it is added.** A seat half a
metre behind the driver stays behind the driver when the kart faces the other
way - which is the whole reason this is not a sum of positions. By the parent's
*whole* orientation, so a rider in a kart that is pitched up a ramp is pitched
with it, and the two rotations are multiplied rather than added axis by axis: a
parent pitched a quarter turn carrying a child yawed a quarter turn is not a
thing at 90/90/0.

**What composition cannot express is a stretch through a turn.** A child rotated
inside a parent stretched along one axis is a *shear*, and a shear is not a
position, a rotation and three multipliers. So a parent's `stretch` moves where
its children are and does not reshape them: a lamp hung on a wall you have
squashed flat is in the right place, and is the shape the lamp always was.

`name` is optional, because naming four hundred crates is worse than naming
none, and unique when present: two entities answering to one name makes
`getEntityByName` a coin toss, and a coin toss inside a rule is the hardest kind
of bug to see.

The parser refuses a parent that does not exist, a socket the parent does not
have, a socket with no parent, a duplicate name and a **loop** - the last
because without it, the first thing that asks where either entity is recurses
forever, on the frame the level loads, inside a renderer, with no message. A
child may be written above its parent; insisting otherwise would make the order
of a JSON array meaningful.

### The player

The one entity a document does *not* place. The host spawns it, one per person,
at a `spawn` mark.

```jsonc
"player": { "blueprint": "kart", "avatarSocket": "seat" }
```

| | |
|---|---|
| Absent | The built-in body: the prototype dummy at play scale |
| `blueprint` | What you *are* - a kart, a bird, a tank |
| `avatarSocket` | Where the person's own avatar hangs on that body |
| `weapon` | A blueprint on one of the body's sockets - see §5.5 |

Absent is the common case and it is deliberate: most levels want a person in
them, not a paragraph about what a person is. What the field is for is the level
that cares.

**The model is not the document's business at runtime.** The person choosing an
avatar is the person playing, so the host reads their choice and fills the
socket. In development there is nobody to ask, which is why the dummy is the
fallback rather than a placeholder to be replaced later.

The player's blueprint `props` are theirs from the first frame, which is what
makes `hp` and `ammo` work at all - a body declaring `hp: 100` and arriving with
nothing would be a body every rule reads as already dead (a missing property
reads as zero).

### 5.5 Shooting, and the camera behind you

```jsonc
"player": { "blueprint": "marksman", "weapon": { "blueprint": "pistol", "socket": "hand" } },
"blueprints": {
  "pistol": { "model": "proto/Gun_Pistol", "collider": "none",
              "props": { "damage": 25, "range": 60 } }
}
```

**A weapon is an entity on a socket.** The same mechanism a rider in a kart's
seat gets, deliberately - a gun in a hand and a driver in a seat are the same
relationship, and a second kind of attachment would be a second thing to keep in
step with the first. So it turns with the body, the same instancer draws it, and
a script can find it as `weapon`.

**What makes it a weapon is its properties.** `damage` and `range`, read when the
button goes down. A blueprint with neither is something you are carrying.

**And a gun on the floor is a gun.** The sentence above is asked of the *hand*
as well as of the socket: anything a body is carrying that has a `damage` is
what it fires, so a level that issues no weapon and leaves pistols lying around
is a level where you pick one up, shoot it, and drop it when you are hit —
`carry`, `unhand` and the properties you already have, with nothing new in the
document. A **worn** weapon wins over a picked-up one, because that is the one
the host draws and the one the arbiter was told about, and a level that wants
the pickup to matter issues none.

**One hand, one thing.** `carry` refuses a second thing on the same socket, so
taking a flag with a gun in your hand needs an `unhand` in front of it - which
is a decision rather than a pocket, and is how capture the flag says "you cannot
carry it and shoot".

**The shot is hitscan.** A ray from the camera, tested against the cell grid and
against every entity that has a box, nearest wins. That ordering is the whole
point: a target standing against a wall is hittable and a target behind one is
not. What it lands on takes damage through `damage()`, which changes `hp` and
*then* fires the `damaged` triggers - so a rule asking `hp <= 0` is asking about
the shot that just landed.

> **Watch the cell approximation here.** A target mounted flush against its own
> stand sits inside the cells the stand rasterises into, so every shot hits the
> post. Nothing about the level looks wrong. There is a test in `xps.test.ts`
> that fires at each target in the shooter demo for exactly this reason.

**The bullet you see is a record, not a projectile.** The shot has already
landed by the time anything is drawn, so the streak is the *report* of it -
travelling from the muzzle to where `castRay` said it stopped, and read by
nothing. A second thing deciding what a bullet hit would disagree with the first
one the moment somebody strafed.

Two details it is worth knowing are deliberate. It leaves the **gun** while the
shot leaves the **eye** - they are half a metre apart, which is invisible at the
far end and obvious at the near one, and the crosshair has to be honest about
where a shot goes. And a **miss draws one too**, which is the more important of
the two: a shot into an empty room with no picture is indistinguishable from a
gun that is not working.

**Ammunition is on the player, and only if the document asks for it.** A body
with an `ammo` property spends one a shot and is refused at zero; a body without
one has nothing to run out of. It is on the player rather than on the gun because
an ammo box hands it to whoever walked in - `target: "other"` is the player, and
a verb that reached through them into what they are holding would be a verb that
needs to know about hands.

**`V` puts the camera behind the body.** A view and not a mode: the controller is
identical, the trigger pass still fires where the person is standing, and the
crosshair is still where a shot goes. The arm is four metres and it shortens
whenever there is something in the way - a fixed one spends half of every
corridor behind a wall, showing the level from the outside. In first person the
body is not drawn, because the camera is inside its head; it still exists, so a
rule can still name it.

---

## 6. Capabilities: what the product may do with this XP

`backend.needs` points down at the host. Capabilities point *up* at the product:
can this be a match, can two runs of it be ranked, can somebody just wander it.

| Capability | The world must have |
|---|---|
| `freeplay` | Nothing. The one claim that is never a lie |
| `match` | At least two `spawn` marks - one shared spawn is a scrum, not a match |
| `football` | A `red` mark and a `blue` mark |
| `competition` | A `start` and a `finish` |

**Every claim is checked against the world at parse time.** An XP declaring
`football` with no goals is refused in the editor, by its author, before
anybody is invited - rather than loading, starting, and failing at kickoff in
front of everybody.

A document declaring none gets `["freeplay"]`, because an XP no flow can
schedule is a level nobody can open.

### 6.1 The rules block: what game this is

`rules` answers the question `capabilities` does not: given that somebody has
scheduled this, **what ends it, how is it scored, and who is against whom**. The
whole block is optional and absent is a mode rather than a missing field — read
it through `rulesOf` rather than testing for it.

| Field | Absent means |
|---|---|
| `preset` | `freestyle` — a world with no score and no end |
| `mode` | `space` — a place that is simply there |
| `sides` | *derived* — see below |
| `assign` | `spread` — the room splits itself across the sides |
| `scoreLimit` | a tally rather than a race to a number |
| `timeLimit` | nothing ends it on a clock |
| `respawn` | instant, which is what every level did before the field existed |
| `players` | `{ min: 1, max: 25 }`, the transport's ceiling rather than a design |
| `roles` | nothing is dealt, and nobody is told anything |
| `lethal` | every gun is live against everybody, which is a deathmatch |
| `perRole` | a role decides nothing but what a rule reads off it |

`preset` is one of `freestyle`, `deathmatch`, `football`, `parkour`, `shooter`,
and two of them demand a capability: `football` needs `football`, `parkour` needs
`competition`. The parser refuses the pair, so the editor greys the option out
with the reason beside it rather than letting a save silently do nothing.

**`mode` and `preset` are two axes, and the split is the point.** `preset`
answers *what you do* — shoot, score, run a course — and `mode` answers *what
this is*:

| `mode` | |
|---|---|
| `space` | A place that is simply there. No round, nothing to win, and what happens in it stays. `steal-a-plant` is one: your plants are on the shelf tomorrow. |
| `lobby` | Where people gather before or between rounds — **and it can still keep score.** The rest of the block applies unchanged, which is the whole reason it is a mode rather than a flag. |
| `battle` | A run: it starts, it ends, and what it counted should go with it. See xp-flow.md §5, which makes the same distinction for the data block and is where the `run` scope came from. |

They were one list, and the sign of it was that `preset`'s list read as four
styles and an absence — `freestyle` is not a game you play, it is a statement
that no game is being played. Folding them back together would mean a
`lobby-shooter` beside `shooter` and then a `lobby-football`, which is a product
of two lists rather than a list. A deathmatch running all evening in the corner
of a foyer and a deathmatch that starts and ends are the same *style*.

Absent is `space`, and left absent rather than written in: every document on
disk predates the field and none of them is a round.

**`roles` is dealt from the top.** The arbiter takes as many values as there are
players, in the order they are written, and only then shuffles who gets which.
So the roles that must be in play go first: a ten-entry deck played by three
deals entries one to three. Shuffling the whole deck and taking three would make
one bug in ten a coin toss — seven rounds in ten with no bug in them, and no way
for anybody in the room to tell that is what had happened.

**`lethal` names the one dealt role whose shots count.** A hit is refused unless
the shooter was dealt it: everybody keeps a visible weapon, everybody's shots
draw a tracer, and only one person's take health off anybody — so a gun that
does nothing looks exactly like a gun that does, which is the only way to keep
who is who a secret. It is a rule rather than an arrangement of blueprints
because no client can keep it; see the warning under `dealt` in §5.

**`perRole` says what each dealt value *means*.** `lethal` is one hard-coded
question about the deck — do this role's shots count — and this is the general
form of it, keyed by the value:

```jsonc
"rules": {
  "roles": ["hidden", "seeker", "seeker", "seeker"],
  "perRole": {
    "hidden": { "allow": ["use"], "seen": "nobody" }
  }
}
```

It is a second block rather than a richer `roles` because the deck is a *list*:
three of four players being `seeker` is three entries, in the order they are
dealt from, and a map cannot say that. Every key has to be in the deck, or the
parser refuses it — a rule for a role nobody is dealt looks set and never once
applies, which is `lethal`'s quietest failure arriving through another door.

**`allow` narrows what the phase already left live, and can never widen it.** It
is the same list a phase's own `allow` is (§6.1c), and the two intersect in that
order: a phase saying *watch, do not touch* stays true for everybody at the
table, whatever they were dealt. That is not tidiness — a role that could hand a
key back would mean answering "does this button do anything" needs two tables,
one of which is secret, so nobody watching could answer it at all.

**`seen` is how the rest of the room may draw you**, and there are three:

| `seen` | drawn as |
|---|---|
| `normal` | body, name, team ring — what everybody without a rule is |
| `team` | only to your own side; in a level with no sides, to nobody |
| `nobody` | not drawn at all |

The room can tell that *somebody* is invisible — it could hardly not, having no
body to look at — and it is told which player by id. What it is never told is
their role. The deal carries a second map, value to look, and the arbiter
publishes the look per player: deciding whether to draw somebody needs that
person's role, so anything a client could compute itself would be a client that
had been handed somebody else's secret.

Your own screen says so, under the role in the corner: *nobody can see you*.

> ⚠️ **A level that deals, names a lethal role, or calls a meeting has to say
> `"backend": { "needs": ["arbiter"] }`, or it will not parse.** The refusal
> names what forced it — *this level deals roles, which no client can decide*.
>
> It is not paperwork. Each of those three is either decided somewhere no client
> can reach or it is not happening at all: with no arbiter nothing is dealt, so
> nobody holds `lethal`, so no shot lands on anybody, and the level is a room
> where the two things it is about cannot happen. `needs` **refuses** and
> `wants` **degrades**, and there is nothing here to degrade to.
>
> **`roll` and `pass` are deliberately not on that list.** A dice from this
> browser's own random is honest for somebody playing alone and dishonest at a
> table, and `needs` has no way to say *fine alone, not fine with company* — so a
> board game may want an arbiter without being refused for playing solo.

The side it leaves without a gun is left with the **vote**. `meet` opens one, a
majority of those still standing eliminates whoever it names, and it is not
asked to be right: name the bug and the round is over, name a colleague and the
colleague is gone and the bug is still aboard.

### 6.1b The camera block: where the world is watched from

**Read `packages/xp/src/world/camera.ts` before changing anything here.** The block is
an *input mode* that happens to also move the camera: `player.tsx` takes forward
from where the camera looks, so a camera choice picks the movement basis with
it. The bug it prevents is about `W`, not about the view.

Three kinds. Absent is `follow`, which is what every document had before the
block existed.

| Kind | Where it is | Carries |
|---|---|---|
| `follow` | Behind the body, looking where you look | `behind`, `above`, `beside`, `fov`, `far` |
| `side` | Flat on, along one axis — a platformer | `axis`, `distance`, `span`, `far` |
| `fixed` | Nailed to one spot in the world | `x`, `y`, `z`, `yaw`, `pitch`, `at`, `seats`, `fov`, `far` |

**A field belonging to another kind is refused**, and the refusal names where it
belongs. That is not strictness: a `span` on a follow camera is a setting an
author believes in and nothing reads.

**`fixed` needs `x`, `y` and `z`** — there is nowhere sensible to default a
camera to, and the origin is inside the floor of most levels.

**Three answers to which way it looks**, and a document gives at most one:

| | |
|---|---|
| nothing | **It watches the player** — the shot a camera in the corner of a room is for. |
| `yaw` + `pitch` | It stares that way. They go together, because half a direction keeps tracking on the axis nobody typed. `yaw` is the document's own convention — zero looks along `+z`, the way a mark faces. |
| `at: {x, y, z}` | It stares at that **spot**, whoever is playing and wherever they walk. All three axes, like a seat: a point missing its height is a shot half composed. |

`at` beside `yaw`/`pitch` is refused — a point and a direction are two answers
to one question, and picking a winner would ignore the one somebody typed
second.

**`at` is what a table needs, and an angle cannot do it.** Four chairs round a
board all look at one middle, and the block has a single `yaw` for the whole
document — so blue's chair and green's, a quarter turn apart, could never both
be aimed. A *spot* is the same sentence from every chair, so one field seats the
whole table. It is also the better shot: a camera centred on whoever is playing
is centred on somebody standing at the **edge** of the board, with half the
frame behind them, and it swings as they walk.

**Watching the player turns the shot and never the keys.** The camera block is
an input mode (§6.1a), and reading the basis off a lens that is tracking somebody
makes `W` mean a slightly different direction after every step — worse near the
lens, where the heading collapses and swings through a half turn as they pass
underneath. So the keys come off where the *shot* points: `at` if there is one,
the angles if there are any, and otherwise the line to the spot the shot was
framed for, which is where the player arrives.

**`seats`** gives each side its own `x, y, z`, keyed by the names `Mark.team`
uses. Positions only — the lens, the far plane and where it looks are about the
level rather than the chair, which is exactly why one `at` serves four seats. A
side with no entry sits where the block itself says.

**`behind` / `above` / `beside`** frame the chase camera. `behind` was the
constant `CHASE = 4` and is still a *maximum* — the runtime shortens it whenever
there is something in the way — so raising it does not put the camera through a
wall. `beside` is the shoulder cam; negative is a left shoulder, and both it and
`above` may be negative because both are shots.

**`fov` and `far`** were hardcoded in the scene at 75 and 400. `fov` is refused
on `side`, which is orthographic and where three ignores it. The *near* plane is
still ours: it is a property of the projection rather than of the shot, and a
document able to set it would be a document able to make its own level
invisible.

First person versus third is **not** in this block. It is a runtime toggle that
starts in first person when the level gives the player a weapon and in third
otherwise, and a `fixed` camera ignores it entirely — first person inside a
camera bolted to the far corner of a room is not a thing anybody means.

### 6.1c The flow block: the round this level plays


**A level can carry a round per mode.** `flow` is the one it plays when nothing
more specific is said, and `flows` keys a round to a mode:

```jsonc
"flow":  { "start": "idle",   "phases": { … } },   // what any mode plays
"flows": {
  "lobby":  { "start": "waiting", "phases": { … } },
  "battle": { "start": "warmup",  "phases": { … } }
}
```

Same shape, same checks, and a problem is reported against `flows.battle.` so it
names the round you typed rather than sending you to the wrong half of the file.
A key that is not a mode is **refused**, because a round nothing will ever play
is not a round.

The same level is a place people are in and a match that gets played in it. A
foyer with a kickabout in the corner has a round of its own — a whistle, a kick
off, a score that resets — and it is not the round the foyer runs the rest of
the evening. Saying both with one `flow` means a state machine with a second
state machine written along its edges.

**`flow` is what a mode with no round of its own plays.** Not nothing: a level
with one round that happens to be scheduled as a match is the ordinary case and
should not have to write the same phases under every mode. The fallback only
goes one way — a round under `flows.battle` never runs in a room, because a
foyer that suddenly has a whistle in it is the quiet kind of wrong — and a level
with neither has no round at all, which has to stay possible.

**A round can name the place it is played in.** `scene` on a flow, by its key in
the `scenes` table:

```jsonc
"flows": {
  "lobby":  { "scene": "foyer", "start": "waiting", "phases": { … } },
  "battle": { "scene": "arena", "start": "warmup",  "phases": { … } }
}
```

Entering the round takes you there, the way walking through a door does. Absent
moves nobody, which is every flow written before the field and every level with
one place in it. A scene the document does not have is **refused** at parse
time, naming the round it is on — `flows.battle.scene` — because a round that
jumps to a room that is not there is a level that starts and then goes nowhere
with nothing on any console to say why. A *door* (a `scenes` entry that is a
string, i.e. somewhere else entirely) is refused too: a round is played in a
place of its own.

**The run names the scene, not the other way round.** One arena hosting three
different rulesets is the normal case; a scene that carried its own ruleset
would make it the exception.

`flowFor` is the one place that decides, and it is a *projection* rather than a
branch: the runtime, the HUD and the editor go on reading a single flow, the way
`standingIn` lets them go on reading a single world in a document with scenes.
Which flow is running is the **session's** answer rather than the file's — the
battle room says so, and `world.mode` in a script reports it.
A match already had six phase machines — playing/over, waiting/running/finished,
a vote being open, being out, spectating, whose turn — and not one of them was
writable by a document. `flow` is a level saying what its *own* phases are.

```jsonc
"flow": {
  "start": "roll",
  "phases": {
    "roll": { "allow": ["roll"], "next": [{ "on": "rolled", "go": "move" }] },
    "move": {
      "does": [{ "op": "emit", "event": "your go" }],
      "allow": ["use"],
      "next": [
        { "on": "six",   "go": "roll" },
        { "on": "moved", "go": "roll" }
      ]
    }
  }
}
```

Nothing in it is new vocabulary. `does` is a `Verb[]` — the same one a rule's
`do` is — and it runs **once, on entering**, not every frame; a `does` that ran
continuously would be a trigger with extra steps. `when` is a `Condition`. `on`
is an event name matched against `emit`, which is what a turn-based level
actually uses: a rule that finishes a turn says so, and the flow hears it.

**A step needs one of `when`, `on` or `after`**, and the parser refuses one with
none — a step that fires on nothing is the same silent-forever failure as a rule
matching a tag nothing carries. `after` is seconds and is **the only field in
the whole block that needs a clock everybody agrees on**; a document whose
transitions are all `when` and `on` is sequenced by writes to its own data, so it
needs no shared timer and no arbiter at all when it is played alone.

**`allow` names which of `player.keys` are live**, by `does` name. Absent is all
of them, and **empty is none** — which is the useful one: it is how a phase says
*watch, do not touch* without inventing a rule that refuses every press. A press
the phase does not allow is dropped rather than queued.

Two refusals are the point of the block. **A destination that does not exist**,
which would otherwise be a run that reaches that step, goes nowhere, and freezes
with nothing in any log to say why. And **a phase nothing can reach** — not an
error in any language, and always a mistake here.

The panel draws it as a graph, laid out by distance from the start, because the
one thing nested JSON cannot show is the shape of a state machine. Everything a
phase is can be edited there: drag between two nodes to point an arrow, and a
phase's `does` is the same verb rows the rules panel draws.

**`wins` is when the run is over**, and it is the field that makes a flow a game
rather than a loop: without it the turn passes round the table forever and
nothing anywhere can say somebody got four pieces home.

```jsonc
"wins": { "of": "world", "prop": "mine-home", "is": ">=", "value": 4 }
```

A `Condition` again — `addProp target: "world"` already writes the level's own
data and `of: "world"` already reads it, so *first to four* needed no counter of
the block's own. It says **that** the run is won and not *who* won: the
condition is about the level's state, and the scoreboard has been answering
"who is ahead" all along. When it holds the run ends, every entity gets
`finished`, the flow stops stepping, and `R` offers a rematch.

> ⚠️ **What it counts has to be scoped `run`.** `blue-home >= 4` is the obvious
> way to write *first player home wins* and it is correct exactly once: a
> `space` field still holds last game's four, so the next run is won on its
> opening frame, before anybody moves. The parser refuses it and names the
> field.
>
> Only the ending is checked this way. A **transition** may read a saved number
> — "ten coins, go to the shop phase" is a persistent unlock deciding which way
> a round goes — because a step is asked once you are in a phase, where an
> ending is asked from the first frame and answered once. The right-hand side is
> not checked either: `value: "@world.needed"` naming a saved field is a
> *target* rather than a tally.

The limits are 32 phases and 8 ways out of each. A level with no `flow` is a
*place people are in* rather than a match they are playing, which is what most
levels are.

### 6.2 `sides`: who is against whom

The other half of a mode, and a separate question from the preset — a deathmatch
can be every player for themselves or two sides of four, and neither is a
different game. Three values, spelled as the battle lobby already spells them:

| | |
|---|---|
| `ffa` | Nobody has a side. Team spawn marks in the world are **not** read |
| `team` | The sides the spawn marks name, handed out by `assign` |
| `one-vs-all` | One player against everybody else, and **a host names the one** |

**Absent is derived, not a constant**: a document with two or more `spawn` marks
carrying different `team` names is `team`, and anything else is `ffa`. That is
exactly what `sideOf` did before the field existed, which is the point — every
`.xp.json` already on disk behaves as it always did, and the field is how an
author *overrules* their own marks.

**`one-vs-all` is never derived**, because nothing in a world means it. It also
hands out nothing on its own: picking exactly one player out of a room needs the
roster, and the roster is not there on the frame a side decides which spawn
somebody arrives at. So a match names the one — it arrives as the side the lobby
put them on — and until then nobody has a side, which is the same answer
`assign: 'host'` already gives.

Two refusals, both at parse time: a declared `team` or `one-vs-all` in a world
with fewer than two team spawns, and `one-vs-all` written beside an explicit
`assign: 'spread'` (nothing here can pick the one, so saying to split the room is
refused rather than ignored).

**What a match does with it.** `battleModeFor` reads this — declared or derived —
and it is what a battle's own `mode` becomes when the match is fought inside an
XP: `ffa`, `team` or `one_vs_all`. That decides whether the lobby offers *Join
red* and *Join blue* or a single *Join*, and whether a side is handed to the
runtime at all. It deliberately never returns the battle's `football` or `race`
modes: those carry a clock and a scoreline the *battle* reads, and an XP reports
no result back out yet.

---

## 6.5 Scripts

The escape hatch. A trigger's verbs are readable as rows in a panel and cannot
be written wrong; a script is JavaScript, and it is what you reach for the
moment a rule has to *compute* — how far away is the player, how long since I
last fired, where should this be now.

The dividing line, plainly: **verbs for what happens, scripts for what a thing
knows.** A crate that breaks when its health hits zero is three verbs and should
stay three verbs. A platform whose position depends on the last frame's position
is not expressible as verbs at all, however many of them there are.

```jsonc
"scripts": {
  "patrol": "let going = 1\nfunction onTick(dt) { self.x += going * 3 * dt; if (self.x > 3) going = -1; if (self.x < -3) going = 1 }"
},
"blueprints": {
  "block": { "model": "proto/Primitive_Cube", "script": "patrol" }
}
```

The source lives in the document, not in a file beside it: an XP is one file, and
a level whose behaviour is in four other files is a level that arrives half
missing.

**Each entity gets its own run of the script.** Two blocks with `patrol` on them
each have their own `going`. That is why a script is compiled as a factory rather
than evaluated as a module — one shared variable between two turrets is a bug
nobody finds until there are two turrets.

### The hooks

| | |
|---|---|
| `onSpawn()` | Once, when the thing comes into being — placed by the document or spawned by a rule |
| `onTick(dt)` | Every frame. `dt` is seconds, and never more than 0.05 |
| `onTrigger(event, other)` | `enter` or `exit`, the same crossings the verbs see. `damaged` too, when another script caused it |

Write them as declarations or as `const` arrows; both are picked up. A script with
none of them is legal and does nothing, which is what a half-written one should
do.

### What a script is handed

Four names, and nothing else in scope.

| | |
|---|---|
| `self` | The entity this script is on |
| `getEntityByName(name)` | Another one, or `null`. Indexed, so asking every frame is fine |
| `world.tick`, `world.time` | Frames since the start, and seconds |
| `world.random()`, `world.roll(6)`, `world.randomInt(a, b)`, `world.pick(list)` | Chance, and every client gets the same of it |
| `world.seed` | The number the whole room was told, for a stream you keep yourself |
| `world.mode` | `'space'`, `'lobby'` or `'battle'` — the document's `rules.mode` |
| `world.style` | `'freestyle'`, `'deathmatch'`, `'football'`, `'parkour'` or `'shooter'` — its `rules.preset` |
| `world.live` | Whether anybody else is in here: a real room with a host behind it, rather than the editor's try-out or a level opened alone |
| `log(...)` | Goes to the host, capped at 200 lines |

An entity:

| | |
|---|---|
| `.x` `.y` `.z` `.rotation` `.scale` | Read and write |
| `.moveTo(x,y,z)` / `.moveBy(dx,dy,dz)` | One crossing and one box rebuild instead of three |
| `.alive` | Whether it still exists |
| `.get(key)` / `.set(key, v)` / `.add(key, v)` | Properties. Numbers only, missing reads as zero |
| `.damage(n)` / `.heal(n)` | `damage` runs the entity's own `damaged` rules; `heal` does not |
| `.runAnimation(clip, loop?, parts?)` | Plays a clip. `runAnimation(null)` stops it. See below |
| `.despawn()` | |
| `.spawn(blueprint, dx,dy,dz)` | Relative to this entity; gives back the new one or `null` |
| `.score(n)` / `.emit(event)` | Effects — the host decides what they mean |
| `.distanceTo(other)` / `.flatDistanceTo(other)` | Flat ignores height, which is what "how close" usually means |

**Reading a position gives world coordinates; writing one moves it locally.** The
only asymmetry in the API and it only shows up on something with a parent: asking
where a gun on a hand *is* means where it is drawn, and moving it can only move
it within the hand, because the rest of its position belongs to the hand. For
anything unparented — nearly everything — the two are the same number.

### Clips the level carries

**A document can hold its own animation.** Everything above plays a clip out of
the pack we ship — 139 of somebody else's idea of walking. The animator writes
into `clips`, and a `pose`, an `animate` verb, an animation graph or a script's
`runAnimation` can name one exactly the way it names a pack clip.

```jsonc
"clips": {
  "salute": {
    "rig": "dummy",
    "duration": 1,
    "loop": false,
    "times": [0, 0.0417, 0.0833, "…"],
    "bones": { "upperarmr": ["…four numbers a sample…"] },
    "root": ["…three a sample, only when it moves…"]
  }
}
```

Worth knowing:

- **Baked, not keyed.** One dense sample a frame, with the easing already in the
  samples — so every machine agrees, and three.js binds it without interpreting
  anything. The animator's `.animation.json` keeps the keys and stays the
  editable file; **a saved clip cannot be opened back into the timeline.**
- **It costs bytes.** About 18KB of JSON for a two-second clip at 24fps on a
  full rig. The panel says the number before you press the button.
- **`rig` is checked against the body.** A dummy clip on a peep binds nothing and
  plays nothing, so the pickers only offer the ones for the rig in hand.
- **The level's clips win.** They are laid over the pack's by name, so a level
  that authors its own `Idle_A` gets its own.
- **A clip with nothing posed in it is not saved.** Bones that never move are
  dropped, so a clip nobody has touched bakes to nothing — the panel says which
  were skipped rather than writing a document that will not open.

### Motions

**A body is not the only thing that moves.** `runAnimation` and `animate` below
play a *clip* on a *skeleton* — a name out of the animation pack, bound to bones.
Nearly everything in a level has no bones at all, and until motions it could not
be animated: a fan, a door, a lift, a lever, a crate that shakes when it is hit.

A **motion** is a named sequence a blueprint owns, and it turns that model's own
nodes:

```jsonc
"motions": {
  "open": {
    "steps": [
      { "kind": "turn", "node": "lid", "axis": "y", "amount": 90, "seconds": 0.4 },
      { "kind": "turn", "seconds": 2 },                            // a pause
      { "kind": "turn", "node": "lid", "axis": "y", "amount": 0, "seconds": 0.6 }
    ]
  },
  "idle": {
    "loop": true,
    "steps": [{ "kind": "spin", "node": "blade", "axis": "y", "amount": 180, "seconds": 1 }]
  }
}
```

| kind | `amount` is | What it does |
| --- | --- | --- |
| `spin` | degrees a **second** | Keeps turning. The fan, the coin, the radar dish |
| `turn` | the angle to end at | Goes there and stays, eased at both ends. The door, the lever |
| `swing` | how far out | Out and back, `times` of them. The pendulum |
| `shake` | how far out | The same trip, dying away. The hit reaction |

Four things worth knowing:

- **A step with no `node` is a pause.** That is the only spelling of one; there
  is no `hold` kind.
- **`turn` goes *to* an angle, from wherever the node already is.** So "turn to
  90" then "turn to 0" is a door that opens and shuts. The other three are
  distances *from* where it is.
- **The last step to mention a node wins, and steps before the playhead have
  finished.** During the pause above the lid stays open, because nothing in the
  pause says anything about the lid.
- **A motion that ends holds its last frame**, the way a one-shot clip does. So
  "the door stays open" needs no verb; `rest` is what puts everything back.

A rule starts one with `play` and stops it with `rest`; playing one that is
already running restarts it. Across the network only the *name* and the second it
began travel — where the door is now is worked out on every machine from those
two, which is why two people watching one door see the same door.

`spin` on a blueprint is the other half of this and is still the right answer
when the angle is **derived** rather than played: a dial that reads a score, a
wheel that turns with speed. It names a node and a property, and something else
writes the property.

### Animation

**`runAnimation` is the one thing a script could not do.** `blueprint.pose` says
what a body holds *at rest* and the host picks the rest from how it is moving, so
a script could walk a character across a room and could not make it wave when it
got there. The verb `animate` is the same thing from a rule.

```js
self.runAnimation('Cheer')                        // once, then back to normal
self.runAnimation('Melee_Unarmed_Attack_Punch_A') // a swing
self.runAnimation('Wave', true, ['arms'])         // waves *while* it walks
self.runAnimation(null)                           // stop
```

**`parts` is what turns a clip into a layer**, and it is the whole distinction:

- **No parts** — the clip is the *whole body* and replaces what it was doing.
  Right for a death, a sit, a knockdown. A body that carried on walking through
  one of those would be a call that did nothing.
- **Parts** — `['arms']`, `['torso', 'head']` — the clip applies to those bones
  and is laid **over** whatever else is happening. The arms take the offset the
  animator authored and the legs keep their cycle.

The parts are `head`, `torso`, `arms`, `arm.l`, `arm.r`, `legs`, `leg.l`,
`leg.r`, and `upper` for everything above the hips. A bone name works too, for
when a group is too coarse. A name that is neither is dropped rather than
refused — the same contract every other name here has.

Under it is the additive layering the host's own gestures use: the clip is
masked to those bones and made additive against its own first frame, so what is
added is the *difference* the animator authored rather than the pose. That is
why a wave laid over a walk is a wave and not an argument between two arms.

**It crosses the wire, and which half needs to is worth knowing.** A *script*
does not: scripts are deterministic and run on every client, so `runAnimation` in
an `onTick` already happens everywhere. A *rule* does — `stepTriggers` is handed
one prober, the local player, so an `enter` fires only on the machine of whoever
walked in. Without the packet they step on the pad, the guard salutes on their
screen, and stands still on everybody else's.

What is sent is the name, the loop flag, the parts and the tick it was asked on.
The tick makes the *same* clip asked for twice into two waves rather than one
that never repeats — and a receiver deliberately **keeps its own** tick for a
clip it is already playing, because two clients counting their own frames would
otherwise restart each other's animations eight times a second. A different clip
is still a new event; the same one arriving again is not.

**The clip name is not checked**, for the reason `blueprint.pose` is not: this
engine does not know which glTFs a host has loaded. A name it does not hold
leaves the body doing what it was doing, and the editor's picker is what stops
an author writing one.

### What is not in there, and why

`fetch`, `XMLHttpRequest`, `setTimeout`, `require`, `process`, `WebSocket`,
`window`. None of these were removed: a fresh QuickJS context simply is the
language and nothing else, which is the main reason it was chosen over a Web
Worker. A worker inherits a browser's whole surface and you subtract from it —
a list you can be wrong about.

Two were removed, deliberately:

> **`Date` is gone and `Math.random` throws.** Two clients run the same rules
> over the same entities and have to agree about the result. A clock is per
> machine — two browsers on one desk are commonly seconds apart — and random is
> random. Both are the first things anybody reaches for, which is exactly why
> they are taken away rather than discouraged: a script using either looks
> correct on the machine it was written on. Use `world.time`, which is one clock,
> agreed, and injected — so a test runs a five-minute match in a millisecond,
> and `world.random()`, which is chance everybody agrees about.

**Random, and why it is not a generator.** `world.random()` is in `0, 1)` like
the function it replaces; `world.roll(6)` is a die, `world.randomInt(1, 6)` is
inclusive at both ends, and `world.pick(list)` takes one of them. What makes
them shared is that a value is `hash(seed, tick, index)` rather than the next
number out of a cursor:

- the **seed** is the room's topic, so everybody in one instance was told the
  same number. Alone — a test, a screenshot, the editor — it is the document's
  own id, so the same level rolls the same game every time it runs;
- the **tick** everybody already agrees on;
- the **index** resets at every tick boundary.

That last line is the whole design. A generator with a cursor works until
somebody joins a match already in progress: their cursor is at zero and
everybody else's is at four thousand, and from then on the two machines roll
differently, silently, forever. Addressed instead of advanced, a client that was
wrong about how many rolls a frame contained is wrong for one frame.

> It is dice, jitter and which of four idles a peep picks — **not a secret**. It
> is derived entirely from numbers every client holds, so every client can
> compute the next one. Hidden state is
> [server authority, and it is a different thing.

### The limits

| Limit | Value | Why |
|---|---|---|
| Source length | 64 kB per script | Every byte is compiled before anything is drawn |
| Memory | 4 MB, shared by every script in one XP | A script building an array in a loop should hit a `RangeError`, not the tab's own limit |
| Fuel | 4 interrupt callbacks per hook call | `while (true) {}` is cut off after about 3 ms — measured, `bun run xp:bench` |
| Stack | 256 kB | The recursion somebody writes by accident |

**The fuel is a count of operations, not a deadline in milliseconds.** A deadline
cuts a script off at a different place on a fast machine than on a slow one, so
two players would end up with different entity states — the one failure this
engine is arranged to make impossible.

### What a hook costs

Measured, `bun run xp:bench`, per frame against a 16.7 ms budget:

| entities | no `onTick` | arithmetic only | reads and writes `self` | looks another entity up |
|---|---|---|---|---|
| 100 | 0.01 ms | 0.06 ms | 0.60 ms | 1.00 ms |
| 500 | 0.02 ms | 0.32 ms | 3.36 ms | 5.09 ms |
| 1 000 | 0.04 ms | 0.66 ms | 6.48 ms | 10.62 ms |

**Take these as an upper bound.** They come off a developer's laptop that is
never idle, and the first set published here was 2.4× worse across the board for
no reason but that two other things were compiling at the time. If a number here
looks wrong, check `uptime` before believing it — a load average over about ten
makes this table fiction.

The shape matters more than the numbers. **A script that only computes is
cheap; a script that talks to the world is not**, and the cost is per call across
the sandbox boundary rather than per line of JavaScript: a thousand entities
doing arithmetic is 4 % of a frame, and the same thousand asking about their
neighbours is 64 % of it.

So the ceiling depends on what the scripts *do* rather than on how many there
are. A thousand is fine if they mostly think; a few hundred is the limit if they
mostly look around. The way to raise it is to touch the world less often — cache
what `getEntityByName` gave you, read `self.x` once into a variable — not to
write less code.

Blueprints with no `script` cost nothing at all, and a document with no scripts
never creates an interpreter.

### When one goes wrong

**One throw and that entity's script stops.** It would otherwise throw again next
frame with the same state, sixty times a second, and the failure that mattered
would be at the top of a list of three thousand identical ones. The rest of the
level keeps running.

The failure is shown **on the screen during play**, not in a console — the
runtime's HUD says how many scripts are running and names what broke. A script
that quietly stopped is a level that looks finished and is not, which the lounge
has already been bitten by twice.

Line numbers are the author's. A script is compiled as the body of a factory, so
the interpreter's idea of line 1 is not yours; the offset is taken back out
before anybody sees it, and there is a test pinning that.

### Moving platforms carry you

A script moves an entity; the entity's collision box moves with it; and anybody
standing on that box is carried. All three, or none of them is useful — the
first version of this shipped with only the first two, and a lift was a thing
that rose through you and left you standing in the air.

You are carried while **grounded** and only then. A platform sliding past under
a jump does not snatch you sideways, which is the case that decides this is a
check on whether you are standing rather than on how near you are. Your own
movement is added to the ride, so you can walk about on a moving platform, and
walking against it at its own speed stands still.

> **The controller is told how far a box moved, not how fast.** A script may put
> a platform anywhere at all — teleport it, snap it to a path, follow a curve —
> so a velocity would be a guess about something the script already knows. The
> host passes `blockersOf(world, since)` a map it keeps between frames and each
> box comes back with its own delta.

**Landing is on the surface, not on the cell above it.** Related, and it was
wrong from the day entities got colliders: the landing snap went to the cell
boundary, which is right for the voxel grid and wrong for a box. A measured
collider is not a whole number tall — `Box_A` is 0.46 — so a crate's top is at
1.46 and landing put your feet at 2, hovering half a metre above it with
`grounded` false and unable to jump. Every entity you could stand on was
affected and every test used boxes a whole number tall, so nothing noticed.

### What a script cannot do yet

- **Know who walked in.** `onTrigger` is handed `null` for the player, because
  the player is the one body a document does not place (§5). A script that wants
  to know *who* arrives when the player becomes an entity.
- **Wait.** There is no `setTimeout`. A delay is `world.time` and a number you
  stored, which is also the only version of a delay that two clients agree about.
- **Push you.** Being carried is standing on top of something. A block moving
  *into* you does not shove you along — it stops you, like a wall that happens
  to be somewhere else next frame.

---

## 6.8 Rooms: an XP two people are in

Off unless `NEXT_PUBLIC_XP_ROOMS=on`, and off is the default. See
`src/lib/xp-rooms.ts` for why this is a flag rather than a permission: a room is
a Realtime topic, Realtime is a shared budget, and a level left open in a tab
sends eight messages a second into it until somebody closes it.

`/xp/<id>?room=<room>` opens two topics. Three things have to line up or the
level is exactly what it was - one person, alone, with no channel open: the
flag, a room in the URL, and a signed-in person to be. The last one is not a
decision the page makes, only one it makes early: the topic is `private: true`
and its policy is `to authenticated`.

**Two topics, and they answer different questions.**

| Topic | Who is on it | Carries |
|---|---|---|
| `xp:<room>` | everybody in the instance | which room of the level the room is in - a `door` claim, and the greeting that repairs a missed one |
| `xp:<room>/<scene>` | everybody standing in that room of it | positions at 8 Hz, faces, and each client's picture of the world |

The scene is in the topic rather than filtered out of one, and that is the whole
of docs/xp/scenes.md §1.6: two people in different scenes do not see each other
because nothing is *sent*, not because something is dropped. It also makes a big
room cheaper rather than more expensive - traffic grows with the square of the
room, so twenty-five people in one topic is 625 and the same twenty-five across
five scenes is five lots of 25.

The door cannot go on the scene topic, and the reason is the repair rather than
the send: somebody who joins arrives in `enter`, which once the room has moved
is the one topic nobody is on, so a claim broadcast there would never reach the
person who needs it. `_runtime/net/room-link.ts` is the instance topic and has the
argument in full.

**`<room>` is still the unit of a session.** One instance, one set of players,
one arbiter, one result; the scene is which room of it you are standing in.
`xp_room_topic` in the migration splits the scene back off for exactly that
reason, and each half is bounded at 64 characters - a scene appended to a long
room id would otherwise push the topic past a single limit, and a topic the
policy refuses is a room that is silently empty for everybody in it.

**The room id is the capability.** Hold it and you are in. That is a smaller
claim than the lounge's or a battle's, and deliberately: an XP room has no
roster to check against yet. The moment one belongs to a *match* the check that
belongs there is `is_battle_participant`, exactly as the battle topics already
do.

### What goes on the wire

Four numbers and an id, eight times a second, as a broadcast. Not the world:
every client runs the same document and the same rules, so a crate that broke is
a rule firing on everybody's machine - and sending the crate would be sending
something the receiver already knows, which is also how the two would come to
disagree.

### Everybody else is drawn in the past

`INTERPOLATION_DELAY` behind, between two samples that both arrived. The
alternative is extrapolating - guessing where somebody is *now* from where they
were going - which is wrong every time they change their mind, and reads as a
body being snapped back rather than as a correction.

For a shooter that is still the right trade: a shot is tested against the boxes
the buffer produces, so what you hit is what you saw. "I shot them and it did not
count" is the bug that makes a game feel broken; "they were a tenth of a second
further along than I could see" is one nobody can perceive.

`Crowd` in `@kxb/xp/engine` is the buffer, and it is pure because two laptops
cannot be put inside `bun test` - every bug in it looks like "the network is bad"
from the outside. It holds a body through silence rather than deleting it (a
dropped packet is not a departure), drops a sample that arrives out of order
rather than sorting it in (interpolating backwards walks somebody two steps
forward and one back), and turns the short way round north (350° to 10° is twenty
degrees, and the direct version spins a body most of the way round its own axis).

### A match fought inside one

The battle lobby's summon wizard offers the shipped XPs as a fourth kind of
ground, when the flag is on. Picking one sets `xpId` on `BattleCreated` and
leaves `worldId` as the host's own space - both, not either, because the roster,
the RLS, the sides and the scoring all reach for the world, and a match without
one would be a second shape for every one of them to handle. What changes is
only where the players are sent: `/xp/<xpId>?room=<battleId>`, which is why the
room id had to be any opaque string rather than a uuid.

The battle room hands over rather than rendering the XP itself - it is a lounge
scene with a roster over it, and an XP is its own runtime. The handover is a page
with a door on it rather than a redirect, because a redirect drops somebody
inside a level with no idea what they joined and no obvious way out.

**Nothing comes back out.** No score, no winner, no end - the match is a room you
play in rather than one that finishes, and the page says so rather than leaving
somebody waiting for a result. A score returning from an XP into the battle
stream is the next milestone.

### What is deliberately not here yet

Authority. Nobody owns anything, nothing is reconciled, and a shot at another
player does nothing to them - the trigger pass tests the local body against the
level, and remote bodies are drawn rather than simulated. That is §9 of
xp-creator.md, and this is the milestone before it: the one that
answers whether two people can be in the same room at all.

---

## 7. The shared store

`@kxb/xp/store` is a store shaped like the ones the app already uses -
`getState`, `setState`, `subscribe` - except that setting tells everybody and
reading sees what everybody set.

**Every part of the state has exactly one writer.**

- **`players[me]`** — your own slice. Where you are, what you are holding, what
  you picked up. Nobody else can write it: a message about your slice from
  anybody but you is dropped, and the sender's id comes from the transport
  rather than from the message.
- **`shared`** — the host's. Totals, the clock, the winner. One machine adds up,
  so the sum is a fact rather than an average of four opinions.

There is no conflict resolution, no CRDT and no operation log, on purpose:
ownership makes conflicts *impossible* rather than resolvable, which is smaller
to build and far smaller to reason about when the scores disagree.

The host is elected as the lowest player id present - stable, so every machine
picks the same one from the same roster, and re-run whenever somebody joins or
leaves. It is the same role football already uses for the ball.

A worked flow - the one this was built for:

```
each player   → setMine({ coins: n })      as they collect
the host      → sums per team from getState().players
              → setShared({ scores })
when time up  → setShared({ winner })
              → persistence.append(...)     once, by one machine
```

### Ids that sort themselves

`@kxb/xp/store` re-exports snowflakes: nineteen fixed-width characters that sort
correctly with plain `<`, in a `sort()` with no comparator, and in a database
column.

**They are built from UTC, and Berlin is a display.** Local time repeats an hour
at the end of October, so ids built from it sort *backwards* for that hour -
once a year, at night, unreproducibly. `berlinTime(id)` is where the timezone
belongs: at the edge, on the way to a person's eyes.

**One clock mints them - the host's.** Two browsers on the same wifi are
commonly seconds apart, so ordering by whichever machine made an event is
ordering by a set of clocks rather than by a clock. The minter also refuses to
go backwards when the system clock does, which `Date.now()` will.

---

## 8. Hosts: what you have to supply

`@kxb/xp/host` declares what an XP cannot supply for itself and implements none
of it: who you are, how a message reaches the other players, what survives a
refresh, and what time it is. A *host* fills those in.

```ts
interface XpHost {
  identity: XpIdentity        // who is at the keyboard
  network: XpNetwork          // join(topic) -> XpSocket
  persistence?: XpPersistence // optional, and optional means optional
  arbiter?: XpArbiter         // who decides, when the clients must not
  now(): number               // seconds since the instance started
}
```

**The arbiter is the newest slot and the only one with no host behind it yet.**
Two calls — `ask(action, payload)` for an outcome and `view()` for what this
client may know — and both answer with a *verdict* rather than a value, because
"stored it" and "agreed with you" are different answers. A refusal says which of
three kinds it is: `refused` (the rules said no — show why), `lost` (no reply —
unresolved, not failed, and never drawn as done) or `stale` (the round moved on
— re-read the view). `memoryArbiter()` implements it in a `Map` for tests, which
is what makes the interface mean anything; the database function behind it is
designed in server-authority.md §4.1 and unbuilt.

It is named `arbiter` and not `server` because `server` is already one of §9's
three authority tiers, and a document that needs one **refuses to load** where
no host provides it — which is what stops a game whose fairness depends on it
running client-authoritatively somewhere else and looking like it works.

Two are built, and the second is what proves the first was written against an
interface rather than against a transport wearing one.

| | `memoryHost` | `localHost` |
|---|---|---|
| Where | `@kxb/xp/host` | `src/app/xp/hosts/local.ts` |
| Identity | Whatever you pass in | A name and id in `localStorage` |
| Transport | Callbacks, same process | `BroadcastChannel` — every tab on this origin |
| Storage | A `Map` | `localStorage` |
| Clock | Injected | `performance.now()` |
| Reaches | This function | This machine |
| For | Tests, single player, the benchmark | `Try out`, two tabs |

**Why `localHost` is in the app and not the package.** `BroadcastChannel`,
`localStorage` and `crypto` are browser globals, and `packages/xp` is forbidden
from touching any of them — by lint, deliberately. An engine that reaches for a
global only runs where that global exists.

### What each is honest about

`memoryHost` delivers synchronously, in order, losslessly. A real transport does
none of those, so it **cannot find a race**: a rule that only works because a
message arrived instantly passes here and fails on a network. What it proves is
that the *rules* are right. What proves the netcode is two browsers.

`localHost` is same-origin and same-machine. Two tabs, yes; two laptops, no.
That is the right scope for trying a level out, and it is why it is called the
*local* mode rather than the offline mode — the difference matters the first
time somebody expects a friend to see it.

Both cap `sendHz` at 8 even though a `BroadcastChannel` could carry far more.
Deliberate: a rule tuned against a transport faster than the real one is a rule
that breaks when it meets the real one.

### Three details that are load-bearing

- **`now()` is injected, never read.** An engine that reads its own clock cannot
  be run faster than real life, so every test about a timer would take as long
  as the timer. A four-player match with a sixty-second clock runs in 1.5 ms
  because sixty seconds is a variable.
- **`localHost.now()` uses `performance.now()`, not `Date.now()`.** Monotonic by
  specification: it does not move when NTP corrects the system clock. A match
  timer that jumps is a match timer nobody trusts again.
- **A sender never hears its own message.** A sender that did would have to
  remember to ignore it, and every caller forgetting once is a whole class of
  double-applied update.

### Asking for what you need

```ts
missingCapabilities(host, ['identity', 'network'])  // [] means go
```

An empty list means the host can run this XP. Anything in it is a clear refusal
naming what is missing — the difference between "this host has no database" and
a level that starts and then quietly loses every score.

---

## 9. Editing a document

`@kxb/xp/edit` is everything an editor does that is not drawing. It exists as a
separate, pure layer for one reason: **the editor is the one thing here that
cannot be watched while it is built.** A canvas in the Browser pane never gets a
frame, so "did that click land on the right cell" has to be answerable by a
function or not at all.

Every function takes a state and returns a new one. Nothing mutates.

```ts
let state = editing(document)
state = place(state, { x: 2, y: 0, z: -3 }, { model: 'proto/Primitive_Wall' })!
state = stroke(state, line(from, to), { model: 'proto/Primitive_Wall' })!
state = undo(state)
```

### The functions

| | |
|---|---|
| `editing(doc)` | A document with somewhere to go back to |
| `at(doc, cell)` | What is anchored at a cell, or null |
| `place(state, cell, opts)` | One piece. Replaces what was there |
| `erase(state, cell)` | Take one away |
| `stroke(state, cells, opts)` | A whole drag, as **one** edit |
| `eraseStroke(state, cells)` | The same, erasing |
| `undo` / `redo` | With `canUndo` / `canRedo` |
| `line` / `box` / `outline` | Two corners into a set of cells |
| `cellFromHit(point, normal)` | Where a click means |
| `setPlacement` / `removePlacement` / `addPlacement` | One piece, by index - the inspector rather than the brush |
| `addEntity` / `setEntity` / `removeEntity` / `rotateEntity` | Things, off the lattice |
| `addMark` / `setMark` / `removeMark` | The facts a capability is checked against |
| `addTrigger` / `setTrigger` / `removeTrigger` | Rules on a blueprint |
| `addVerb` / `setVerb` / `removeVerb` | What a rule does |
| `setPlayerRole` | The body, the avatar's socket, the weapon |
| `setWorld` | `floorY` and `ground` |
| `addScript` / `setScript` / `renameScript` / `removeScript` | JavaScript, by name |

**By index, not by cell, for everything that is a selection.** `place` is the
brush and a cell is the right address for it. Everything above takes a position
in a list, because two pieces may share an anchor and addressing by cell would
take whichever came first rather than the one somebody is looking at.

### Five decisions worth knowing

**A refusal returns `null`, it does not throw.** A model that is not in the
catalogue and a document at its limit are both things a *person* did, and the
answer to a person is a message rather than a stack trace. `null` means nothing
changed and the caller should say why.

**Replacement is by anchor, not by occupied cells.** A wall fills four cells, so
"what is here" has two meanings and only one is useful: clicking a wall should
select that wall, and dragging a new one across it should replace it rather than
leave two overlapping.

**Placing the same thing again is not an edit.** Without that, dragging back and
forth over one cell fills the undo stack with identical steps.

**A drag is one edit.** `stroke` exists so undoing a forty-cell wall is one
press rather than forty. Calling `place` in a loop is the version that feels
right while writing it and wrong while using it.

**Undo holds whole documents, not inverse operations.** An inverse-operation
undo is a second implementation of every edit - written once, exercised rarely,
and wrong in exactly the cases nobody tried. Whole documents cost a copied array
per edit, which is well inside what a browser does without noticing. The stack
is bounded at 50, and the bound is about *forgetting*, not memory: nobody undoes
a hundred steps, and the people who try wanted the file they saved.

### Where a click lands

`cellFromHit` is the lobby's interaction, unchanged: the highlight sits
*against* the face you point at, so clicking the top of a block puts the next
one on top and clicking a side puts one beside it. `{ inside: true }` targets
the block itself, which is what erasing means.

The normal is rounded rather than trusted. A renderer hands back `0.9999` now
and then, and flooring that is a cell in the wrong place - once in a while,
unreproducibly.

### The property that matters most

**An edited document still parses.** There is a test that draws a floor and four
walls, serialises the result and feeds it back through `parseXp`. An editor that
can produce a document its own parser refuses is an editor that can save a file
it cannot open.

### The screen

`/xp/<id>/edit`. A rail on the left, the world on the right.

| Control | |
|---|---|
| **Place / Erase / Line / Fill / Room** | What a drag does |
| **Level**, `Q` / `W` | Which height you are working at |
| **Turn**, `R` | The rotation new pieces get |
| **Model** | Search over the catalogue; the tile shows its size |
| **Undo / Redo**, `⌘Z` / `⇧⌘Z` | |
| **Copy / Cut / Paste**, `⌘C` / `⌘X` / `⌘V` | A piece, a thing or a mark, one cell along |
| **Delete**, `⌫` | Takes the selection away. It does not copy - that is `⌘X` |
| **Save** | Downloads `<id>.xp.json` |

**Select is the default tool, and Select never builds.** The first thing anybody
does with a level they already have is click something to find out what it is.
An accidental select is free; an accidental wall is an undo you have to notice
you need - and for a while there was one on every stray click, because the
working plane took every press and laid a piece on release whatever tool was on.

**Place hands you back to Select, holding what it just put down.** The gesture is
"put one of these there", and the next thing anybody does is nudge it, turn it
or look at what it is - none of which Place can do. Draw does not do this, which
is the whole reason the two are separate tools: a brush that stopped being a
brush after one stroke would be useless for the thing it exists for.

**A model can be dragged out of the picker.** Into the viewport, where it lands
at the point you let go - on top of a floor, against a wall, or on the working
plane where there is nothing under the cursor - or into the Scene panel, which
has no position of its own and puts it where the pointer last was. Clicking a
tile still picks the brush; dragging one is the other intention, and picking a
tile up selects it either way.

A drop always lands somewhere. A ray that meets nothing, a camera looking along
the horizon, a point past the edge of the world: each falls back rather than
refusing, because the gesture visibly happened and a gesture with no result is
indistinguishable from an editor that is broken.

**The handles are three icons in the corner of the viewport** - move `G`, turn
`T`, size `Y` - and they appear only when something is selected. Turn shows one
ring and it is the Y one, because `rotation` is yaw and yaw is what nearly
everything in a level uses - it is the turn that keeps a collision box
axis-aligned.

`pitch`, `roll` and the three `stretch` multipliers are typed in the inspector
beside `turn` rather than dragged. A three-ring trackball is a fortnight of work
and a control most people fight; five fields that work today beat a gizmo that is
coming, and the way to look at the result is to press **Try**.

Drag on the grid to draw. Left-drag away from it to orbit, right-drag to pan.

### What the panels are for

| Panel | |
|---|---|
| **Scene** | Things by name, architecture folded by model, the marks, and the player |
| **Rules** | A blueprint's triggers, as rows. See below |
| **Models** | The catalogue, searchable |
| **Tools** | What a drag does, which level, the turn, and whether there is ground |
| **Document** | The counts, the capabilities, and what the parser would say |
| **Scripts** | JavaScript, by name, and which blueprints run it |

**Marks are selectable in the viewport and have a form.** They are the one part
of a document the *product* reads rather than the player - `capabilityProblems`
decides from them whether this XP can be a match - so an editor that could place
walls and not marks was an editor that could build a pitch nobody can schedule a
game on. A new one lands under the pointer rather than at the origin, because
four marks at 0,0 is a pile somebody then has to drag apart.

**The Rules panel is a form, not a language.** That is the whole reason it fits
on a panel: the vocabulary is closed and typed - four events, six comparisons,
eight verbs, and a condition that is one property against one number - so every
control is a `select` over a constant and there is nothing anybody can write that
fails at runtime. A rule that genuinely needs to *compute* is a script, one panel
over, and keeping those apart is what keeps this a form.

Two things it deliberately does not offer, because the edit layer refuses them
and a refusal arrives as "nothing happened": the last verb has no remove button
(a rule with nothing to do is one the parser sends back), and a `spawn` can only
name a blueprint that exists.

**The pointer casts against a plane at the current level, not against the
geometry.** That is the opposite of the lobby, and deliberate: casting against
geometry means you cannot place anything where nothing already is, so laying a
floor needs something to lean the first tile against, and the height of what you
place depends on what happens to be under the cursor rather than on what you
chose. `cellFromHit` is still in `@kxb/xp/edit` for the day the *runtime* wants
in-world building.

**Pointing at something uses its height instead.** The geometry is a raycast
target as well as scenery, so putting a piece on top of a wall does not mean
finding the right number on the level slider first - the slider is the fallback
for the empty parts of the world, where there is nothing to point at. That is the
other half of coming off the lattice: where a thing goes follows what is under
the cursor, and the level answers when nothing is.

**A drag previews, then commits.** The ghost cubes show which cells a stroke
would fill; the document only changes on release. That is what makes a wall one
undo step, and what lets a drag be abandoned by pulling back to where it
started. The preview is cubes rather than the real model on purpose - forty
cells of a four-cell wall drawn properly is a solid block that hides the level
underneath.

**Save downloads a file; the draft lives in `localStorage`.** There is no table
and no server round trip: you put the file in `public/xp/xps/` yourself, which
is also how you decide it is finished. The draft autosaves on every edit,
because losing an afternoon's building to a refresh is the one unforgivable bug
a builder can have - and it is unforgivable precisely because the work is not
anywhere else yet. "Discard the draft" goes back to what is on disk.

The editor is loaded with `ssr: false`, which is the truth rather than a
workaround: it is a WebGL canvas and a `localStorage` draft, and neither exists
on a server.

### The window and its panels

A macOS-shaped frame around a docked layout: **Viewport**, **Tools**, **Models**,
**Scene**, **Document**, **Rules** and **Scripts**, which you can drag, split,
stack into tabs and resize. The layout
saves itself on every rearrangement and comes back on reload; a saved layout
that no longer parses falls back to the default rather than to an empty window.

`dockview` does the docking - splitters, drop zones, tab groups, serialisation -
for the same reason `TransformControls` does the gizmo. One trap worth knowing:
version 7 split the React bindings into **`dockview-react`**, and the parent
package still installs and type-checks because it re-exports `dockview-core`, so
`DockviewReact` goes missing with an error that reads like removal rather than a
move.

**Panels read a context; they are not given props.** Dockview keeps panel
components alive across drags, so passing live editor state through `params`
would tear them down and rebuild them every time the mouse moved over the
viewport. The dock renders once.

The frame is opaque on purpose. A blurred chrome over a 3D viewport composites
the scene through a backdrop filter every frame - real GPU work for an effect
nobody looks at, which over a dark scene mostly reads as grey. Its inner radius
is the outer one minus the padding, or the two curves pinch at the corner.

---

## 10. Checking your work

The runtime **cannot be watched in the Browser pane** - the pane is always
`document.hidden`, so `requestAnimationFrame` never fires and the canvas stays
black. That is not a bug to chase. Four things replace looking:

| Command | Answers |
|---|---|
| `bun test packages` | Does it parse, rasterise, can you walk it, and do the scripts run |
| `bun run xp:shot <id>` | Does it *look* right - draws the document with the software rasteriser, through the same transform the renderer uses |
| `bun run xp:bench` | Will it hold |
| `bun run xp:arbiter` | Do the server-decided rules hold - three real sign-ins against the local stack, because `auth.uid()` is the whole design and a check holding the service key would check nothing. Local-only by construction |

Two tests exist because a person found the bug and the suite did not, and both
are worth knowing about:

- **the example room has a route you can climb** - stairs were a wall for three
  separate reasons and only walking caught the third.
- **no prop is buried inside another placement** - which found a workbench sunk
  into a wall and a weapon rack inside a stack of crates.
- **every shipped document's scripts compile and survive five seconds** - the
  counterpart to walking every room. A demo whose code quietly stopped working
  would otherwise be found by opening it, in a browser, where the canvas cannot
  be watched at all.

Other useful commands:

| Command | Does |
|---|---|
| `bun run xp:catalogue` | Re-reads `public/xp/packs`, measures every model, writes the catalogue |
| `bun run xp:thumbs` | Redraws the picker's thumbnails |
| `bun run xp:measure <pack>` | Prints every model's size and which are pivoted at their middle |
| `bun run xp:bench` | Re-measures the limits in §3 |

---

## 11. Where things live

| | |
|---|---|
| `packages/xp/` | The engine. `@kxb/xp`, `/engine`, `/catalogue`, `/packs`, `/host`, `/store`, `/edit`, `/script` |
| `src/app/xp/` | The host |
| `public/xp/packs/` | The art, its own copy |
| `public/xp/thumbs/` | Picker thumbnails |
| `public/xp/xps/` | The documents |

Inside the host, three folders and two files:

| | |
|---|---|
| `page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx` | The only three routes. `/xp`, play, edit |
| `gate.ts` | Who may open it — a backoffice admin, and everybody in development |
| `_runtime/` | Playing: the scene, the frame loop, the instancers, the HUD, the player |
| `_editor/` | Building: the window, the panels, the viewport |
| `_hosts/` | What the engine asks for — `local.ts` (two tabs), `scripting.ts` (the wasm) |

**The underscores are load-bearing.** Every file under `src/app` is in the route
tree's namespace, so a component whose filename Next has claimed *becomes* that
thing — which already happened once: a panel called `layout.tsx` was read as the
route's layout, and the error said a default export was missing, which reads like
a mistake in the file rather than a name that was already taken. A `_folder` is
opted out of routing entirely, and Next's own docs give "avoiding potential
naming conflicts with future file conventions" as the reason to use one.

You can check it: `/xp/_runtime` is a 404, and so are the other two.

Two boundaries are enforced by lint rather than by convention, and both are
explained in xp-creator.md §1.2:

- **`packages/xp` does not import the app.** No React, no three, no Supabase, no
  browser globals. It talks to the outside through `@kxb/xp/host`.
- **`src/app/xp` does not import the lounge.** Copy a component in and own it -
  the lounge is live and this is a prototype, and a shared module means one of
  them drags the other around.
