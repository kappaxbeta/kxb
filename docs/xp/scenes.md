# Scenes, timelines and saves

How one document holds more than one place, how a place can play itself, and
where a game's memory lives.

This is a **proposal**. Nothing in it is built. [xp-manual.md](manual.md) is
what the code does today and stays right where the two disagree;
[xp-creator.md](creator.md) is the plan the engine was built from, and
[xp-backend.md](backend.md) is where a project is stored and who owns it.

**It changes `packages/xp/src/document/format.ts`, which is shared ground.**
[xp-two-sessions.md](two-sessions.md) is explicit: a change to the document
format touches every lane, so it is announced first and landed on its own rather
than inside a feature commit. Read that before starting, not after.

---

## 0. The answer to the question that started this

*Can the document have a jsonb so I can create nested scenes?*

**Nested scenes yes; a jsonb no.** The nesting is worth having and the whole of
§1 is what it should look like. An untyped blob is not, and the reason is one
line in `format.ts`'s own header: `parseXp` is the boundary, and everything past
it is trusted. A freeform section the engine reads is unvalidated data reaching
the runtime — a model id that never went through the catalogue check, a
coordinate outside the lattice, a number where a string was expected, each one
surfacing as a crash in front of a player rather than a problem listed on the
page that refuses to open the document.

So scenes get a **typed** nested structure. It is stored as `jsonb` — the whole
document already is, per [xp-backend.md](backend.md) §6 — but the column
being `jsonb` is a storage fact and says nothing about whether the parser knows
the shape. It does.

**If you want to park something experimental today, you already can.** The
parser keeps unknown *top-level* keys rather than rejecting them, precisely so a
document written against a later version still loads. Nothing reads them, which
is the point: they survive a round trip through the editor and cannot break a
level. That is the escape hatch, and it costs no format change.

---

## 1. The scene tree

### 1.1 What a scene is

**A scene is a place you can be in.** It has what the document root has today —
a world of placements, entities, a spawn, marks — and it has a name.

A document today *is* one scene; it just does not say so. So:

```jsonc
{
  "format": "xp/2",
  "id": "night-arcade",
  "scenes": {
    "lobby": {
      "name": "The lobby",
      "world": { "placements": [] },
      "entities": [],
      "spawn": { "x": 0, "y": 1, "z": 2, "facing": 180 },
      "children": ["cabinet-1", "cabinet-2", "back-room"]
    },
    "cabinet-1": { "name": "Asteroids, sort of", "world": {}, "entities": [] },
    "back-room": {
      "name": "The back room",
      "world": {},
      "entities": [],
      "flow": "sequence",
      "children": ["beat-1", "beat-2", "beat-3"]
    }
  },
  "enter": "lobby"
}
```

`enter` names where a player arrives. `children` is a list of scene names, and
that is the whole of the nesting.

### 1.2 What the nesting is *not*

**It is not spatial.** A child scene is not drawn inside its parent at an
offset, and this is worth being blunt about because "nested" invites exactly
that reading.

Placing one bundle of things inside another, several times, at different
transforms, is **what blueprints already are**. A blueprint has `Part`
composition, sockets and parenting, all of which exist and are tested — a
building whose floors are parts, whose rooms are parts, is a blueprint tree, and
it is the right tool because those pieces render together and collide together
and are one object in the world.

A scene is the opposite: it is a place you are *in*, and you are in exactly one
at a time. If two things are visible at once they belong to one scene, and if
they are a repeated unit they are one blueprint.

Keeping that line is what stops "scene" meaning three things. A format where one
word means a level, a prefab and a story beat is one nobody can explain to the
person who has to author it.

### 1.3 What the nesting *is*

Two things, and they are the same tree read two ways.

**Structure, for whoever is building it.** A game with thirty scenes is
unnavigable as a flat list. The tree is how the editor's scene panel is
organised, how a group is renamed or duplicated, and how "everything in the back
room" is a thing you can select.

**Flow, for whoever is playing it.** A parent declares how its children relate:

| `flow` | Means | For |
|---|---|---|
| `hub` (default) | The children are places, in no order. You reach them by doors. | An arcade, a world with rooms, a level select |
| `sequence` | The children are in order. Finishing one enters the next. | A story, a campaign, a movie, a tutorial |

That is why "sub-levels you can load" and "beats can be sequential" are one
feature rather than two. The difference between an arcade and a story is one
field on the parent.

`sequence` gives the engine one thing it does not have: **what "next" means.**
Today a level ends and nothing follows it. With an order, `{ op: 'load', scene:
'next' }` resolves against the parent, and a chapter of five beats needs no
hand-wired doors between them — which also means reordering beats in the editor
does not mean rewiring five triggers.

### 1.4 An `xp/1` document is a one-scene game

The migration has to be free, because there are five documents on disk and one
of them is hand-written as a test that hand-writing works.

`parseXp` reads a document with no `scenes` block as a document with exactly one
scene, named `main`, whose world, entities and spawn are the ones at the root.
Nothing about `xp/1` stops parsing and nothing about it needs editing. The
editor writes `xp/2` only once a second scene exists — so a level that is one
place stays a file a person can read.

### 1.5 Who a load takes with it

`load` today swaps the level **for everybody in the room, together**, and the
comment on the verb defends that at length: a half-swapped room is people who
cannot see each other with nothing saying why.

That is right for a hub world and wrong for a story game, where one person
walking into the back room should not take the room with them. So the *load*
carries who moves, rather than the scene declaring it — three answers, and the
editor offers them as three choices on the trigger:

```jsonc
{ "op": "load", "scene": "back-room", "who": "room" }   // everyone here — the default, today's behaviour
{ "op": "load", "scene": "back-room", "who": "self" }   // just whoever set it off
{ "op": "load", "scene": "back-room", "who": "@team" }  // a named party the level built
```

**The third one is why the players need to be a list you can reach.** A verb
row cannot express "whoever is on red, plus anyone standing on the pad", so
`@name` refers to a **party** — a set of players a script assembled and gave a
name:

```js
const near = players().filter((p) => p.distanceTo(pad) < 3)
party('team', near)
```

`players()` is the addition to the script API. It returns everybody in the
instance — id, name, team, position — which is the list the editor's picker also
draws from, so "program who to take" and "pick from a list of people" are the
same mechanism at two levels of effort. A party that resolves to nobody is a
load that does nothing, reported to the author rather than thrown, because a
party is a *query* and an empty result is an ordinary Tuesday.

Parties are scoped to the instance and forgotten when it ends. They are not
teams: `rules.teams` is a fact about the match that the score reads, and a party
is a handful of people some trigger cared about for a second.

### 1.6 The room id carries the scene, and it makes the hard part easy

**A room is `<roomId>/<scene>`.**

This is the change that pays for §1.5, and it deserves to be stated as a
correction: an earlier draft of this document called per-player scenes "a week,
not an afternoon" because presence would have to learn to filter — peers fanned
out only to others in the same scene, nameplates and health bars filtered, a
shot in the lobby unable to hit somebody in the back room. That was the wrong
shape. Filtering a stream everybody is on is work; **not being on it is free.**

Presence is a Realtime topic. Put the scene in the topic and two people in
different scenes are in different topics, so they do not see each other because
nothing is sent, not because something is filtered. Switching scenes is leaving
one and joining another, which the client already knows how to do because it is
what joining a room is.

Three things fall out, and the third is the one worth having:

- **`who: "self"` costs nothing structurally.** It is one client changing which
  topic it is on.
- **A party load is one broadcast on the parent topic** naming who should move;
  each client checks whether it is named and re-subscribes. The parent room
  stays the place announcements happen, which is what stops a party load from
  needing point-to-point messaging.
- **Big rooms get cheaper, not more expensive.** [xp-manual.md](manual.md) §3
  measures room traffic growing with the *square* of the room. Twenty-five
  people in one topic is 625; the same twenty-five across five scenes is five
  lots of 25, which is 125. Splitting a world into places is *the* interest
  management, arriving as a side effect of a story feature rather than as a
  project.

Two costs, said plainly. A scene switch is a topic leave and join, so it has
join latency — a moment of not seeing anybody, which the loading screen already
covers. And the tenant rate ceiling is per tenant across every topic, so this
reduces what each client sends and receives without raising the total the space
may spend.

**`roomId` stays the unit of a session.** One instance, one set of players, one
document; the scene is which room of it you are standing in. That is why the
scene goes after the slash rather than becoming its own id: `abc123/back-room`
and `abc123/lobby` are one game, and anything that reports on a session — a
match result, a finished run, an analytics event — keys on the part before the
slash.

---

## 2. A scene that plays itself

### 2.1 Movies are scenes with a timeline

A scene may carry a **timeline**: keyframed properties over time, plus a
duration.

A scene with a timeline and no player input is a **shot**. A `sequence` of shots
is a **movie**. Nothing else is needed — no separate movie document, no second
runtime, no export mode. That unification is worth taking seriously, because the
alternative on offer was a story format, a cutscene format and a movie format
which would each be 80% of the other two.

It also means the useful in-between cases exist for free: a cutscene is a shot
between two playable scenes; an intro is a shot the sequence starts with; a
looping backdrop is a shot a hub sits inside.

### 2.2 It copies the studio's keys, and does not invent a second model

`src/domain/studio/keys.ts` is already generic keyframing of any numeric
property of any node: `Key`, `Tracks = Record<string, Key[]>`, three eases,
`sampleKeys`, and an `ANIMATABLE` table saying which properties a kind of node
has. Its header records why it is generic — three hand-written tracks were the
right shape for the first three animated things and the wrong one for the
fourth.

That is the model. **Copied, not imported**, per [xp-creator.md](creator.md)
§1.2 and the lint rule that enforces it — `packages/xp` may not import the app.

Two of its decisions are load-bearing and should survive the copy rather than
being rediscovered:

- **A key holds after the last one and does not extrapolate.** Past the final
  key the value is where it was left.
- **Before the first key the value is the node's own.** A key at 0.3 means "be
  different from 0.3 onwards", not "be different for the whole shot". The
  comment in `keys.ts` explains why the other way round is a trap that needs a
  second key nobody was told about.

What does **not** come across is `action` — the studio's other half, which
chooses a walk clip from a speed and keeps feet on the ground. The XP runtime
has no skinning yet (`task.md` §A records the half that was built), so there is
nothing for it to drive. When
skinning lands, actions are the second half of this and the split is already
drawn.

### 2.3 What a timeline may address

Nodes in the scene, by name — the same names `getEntityByName` already resolves,
which is why naming came before scripting. Plus the camera, because a shot that
cannot move the camera is not a shot.

Not: anything outside the scene, anything in another document, or a property the
`ANIMATABLE` table does not list for that kind of node. A timeline is a set of
overrides on things that exist, and a key on a name that resolves to nothing is
a parse problem rather than a silent no-op.

---

## 3. Saves — where a game's memory lives

This is the "live worlds" half, and it is the `persistence` port
[xp-creator.md](creator.md) §11 already declared and left unimplemented:
`get(key)`, `put(key, value)`, and an optional `append(stream, event)` for
durable outcomes. What follows is that port, with the one thing it was missing —
**who a save belongs to**.

### 3.1 Three scopes

| Scope | Belongs to | Read by | Written by | For |
|---|---|---|---|---|
| `player` | One account, in one XP | Only them | Only them | Your progress, your inventory, where you left off |
| `space` | One space, in one XP | Every member of the space | Every member | The live world — a shared town everyone in a space is building |
| `global` | The XP | Anybody playing it | Anybody playing it | A leaderboard, a persistent shared world, a wall people write on |

`player` is the "persistent memory for just them" — and note it is scoped to the
XP as well as the account. Somebody's progress in your arcade game is not
readable by the next XP they open, which is not a nicety: it is the difference
between a save system and a tracking surface that every game on the platform can
read.

### 3.2 What makes `global` different, and dangerous

The other two are bounded by a membership that already exists. `global` is not:
it is **a store any stranger can write to and every other player reads**, inside
a document a stranger wrote, running script a stranger wrote.

The QuickJS sandbox's whole promise is that a level somebody else wrote is a
level you can safely open — no DOM, no `fetch`, fuel and memory ceilings. A
global save is the first hole in that wall, because it is an outbound channel:
whatever a script puts there, other people's browsers will fetch and render.

So `global` carries what the others do not:

- **A byte cap per XP**, not per write, so a busy game cannot grow without
  bound.
- **A rate limit per player**, because a script in a loop is the normal failure
  mode long before anybody is malicious.
- **Values are data, never markup.** Whatever the runtime does with a save, it
  renders it as text. A nameplate is the obvious case and it is exactly the SVG
  argument from `src/lib/uploads.ts` in a different costume.
- **It is moderatable.** A published XP whose global store is full of something
  it should not be is a take-down (`XpUnpublished`) and a sweep, and the
  backoffice has to be able to see the store to make that call.

The honest framing: `player` and `space` are a save system; `global` is
user-generated content on our origin, and it inherits every rule
[xp-backend.md](backend.md) §5 wrote for uploads.

### 3.3 A row, not a stream

Saves are the one part of this that does **not** go in the event log, and the
line is worth drawing carefully because this codebase's instinct is the other
way.

The log is the record of *what the platform did* — a project was created, a
version was saved, a space published something. A player's coin count in
somebody's arcade game is not that. It changes several times a second, it has no
audit value, and appending it forever produces a stream that must be folded from
the beginning to answer "how many coins" — the exact cost
`src/es/store.ts`'s own comment says snapshotting exists to avoid.

So: `xp_store`, keyed `(xp_id, scope, owner_id)` with a `jsonb` value and
last-write-wins. `owner_id` is the account for `player`, the tenant for `space`,
and null for `global`.

**When a game genuinely wants history, that is `append` on the port** — a
different call, deliberately, so that "record this outcome forever" is a thing an
author chooses rather than a thing every `put` accidentally does.

**Finished sessions landed elsewhere, and the difference is who is recording.**
This paragraph used to say they would arrive through `append`, because
[xp-creator.md](creator.md) §18 asks that of the present and `append` is the
call that means "forever". They are in `xp_sessions` instead: `append` is a port
an *author's script* reaches for to record something their game decided, and a
session ending is the runtime's own bookkeeping about play the author never sees.
Putting it on the port would have made every level's history and the platform's
ledger the same stream, readable and writable by whoever the port was handed to.
§18.6 has the rest of it.

### 3.4 The privacy half, which is not optional

A `player` save is personal data belonging to one account, held inside content
somebody else owns. Three consequences, all of which are cheaper now than after
the first one exists:

- **`/datenschutz` describes it** before the first save is written, not after.
  The page already describes how storage and deletion work here and this is a
  new category of it.
- **Deleting an account sweeps them.** `events` cascades on `auth.users`
  already; `xp_store` must too.
- **An XP's owner cannot read a `player` save.** They own the game, not the
  people playing it. The runtime can read it because the player's own session is
  what fetched it; there is no owner-facing dump of who saved what.

---

## 4. What this makes possible, and what it does not

The list this design came from, answered honestly.

| Asked for | Answer |
|---|---|
| Sub-levels you can load | §1. Scenes in one document, `load` by name. |
| Groups you drop in | Already blueprints. Not scenes — §1.2. |
| Sequential beats | §1.3, `flow: "sequence"`. |
| Movies, for a composer | §2. A scene with a timeline; a sequence of them is a film. |
| Images | The renders pipeline already draws a document (`src/domain/renders/`). A shot is a scene at a time, which is the same call. |
| Story games | §1.3 plus §2 plus `player` saves. |
| Arcade | A hub of scenes, `global` scores. |
| Solo | `who: "self"` on load — §1.5. Cheap, once the scene is in the topic. |
| Multiplayer | Works today, and `who: "room"` keeps it working. |
| Live worlds | `space` saves — §3.1. |
| **MMO** | **No, and not later on this path.** |

**On MMO, plainly.** [xp-manual.md](manual.md) §3 measures the ceiling: the
Realtime tenant limit is 5 000 events/s, at 8 Hz that is about 25 people in one
instance, and room traffic grows with the *square* of the room. Past that is not
a bigger number, it is a different architecture — interest management, sharding,
and an authoritative server, which [xp-creator.md](creator.md) §17 rules out
of the plan entirely.

The nearest honest thing, and it is worth wanting: **many small instances
sharing one persistent world through `space` and `global` saves.** Twenty people
in a room, a thousand people in a town whose state they all change and all see
next time they load. That is not an MMO and it is most of what an MMO is for.

---

## 5. Limits

Guesses, and marked as such — [xp-manual.md](manual.md) §3's numbers are
measured and these cannot be until there is something to measure.

| Limit | Value | Why |
|---|---|---|
| Scenes per document | **64** | A document is still one file somebody can open. Past this the answer is a second XP and a door. |
| Tree depth | **4** | Chapter → scene → beat is three. Four is one spare; five is an outline, not a game. |
| Placements, entities | **Per scene**, at [xp-manual.md](manual.md) §3's numbers | The cost is what is loaded, and one scene is loaded. |
| Total document | **2 MB** | Unchanged from [xp-backend.md](backend.md) §1.1. Sixty-four scenes of hand-written JSON will hit this first, which is the correct thing to hit. |
| Timeline duration | **10 minutes** | A shot, not a feature film. A film is a sequence of shots. |
| Keys per track | **512** | The studio's timeline is unusable long before this. |
| `player` save | **256 kB** | Generous for progress; not a place to put a level. |
| `space` save | **4 MB** | A shared world's state. Counts against the space's bytes. |
| `global` save | **4 MB per XP** | §3.2. The cap is the moderation budget as much as the storage one. |
| Save writes | **1/s per player per scope** | A script in a loop is the normal failure, not the rare one. |

---

## 6. Order to build

**S0 — one scene, named. ✅ Built.** `scenes` and `enter`; a document with
neither is a one-scene game called `main` (§1.4). Landed alone and announced, as
this said it must be.

Three corrections to the paragraph above, made while building it. **There is no
`xp/2`** — both fields are optional and additive, so every document on disk
parses untouched and a version whose only job is to announce a field you can see
is a second thing to keep true. **`scenes` was already taken**, by the link
table of backlog §0.5, and the two now share it: a string is a door out, an
object is a place here, and `load` does not care which. **A scene holds no
entities yet** — the entity checks are document-wide, and teaching them which
scene they are asking about is S1's job, so an S0 scene is a room with furniture
and no actors, and the parser says so rather than dropping them.

**S1 — more than one, as a hub. ✅ Built.** `load` by scene name, `who: "room"`,
and the room topic becoming `<roomId>/<scene>` (§1.6) — which landed here rather
than later because it is a topic-naming decision and retrofitting it means every
client changing what it subscribes to at once. *Ends with:* an arcade — a lobby
with four doors and four games behind them, in one file.

Four corrections to the paragraph above, made while building it. **There are two
topics, not one** — the instance carries the door and the greeting, the scene
carries the bodies, because the repair for a missed door cannot live on the
stream it exists to repair; §1.6's single topic per scene breaks on the joiner
who arrives in `enter` and finds nobody there to tell them the room has moved.
**Standing in a scene is a projection in the runtime**, not something the parser
does, for the reason S0 gives about `enter`: the editor writes a parsed document
straight back out, so a save would put one room's world where the root's was.
**A scene holds its entities after all** — the S0 note above was a scope line
and this is where it moved, and the checks did not have to weaken: they were
questions about *a place* all along, so each one was handed a room instead of a
document and two rooms may now each have a `door`. **And `load` grew a second
kind of destination rather than a smarter one**: `xp` names a document and
`scene` names a room here, because a bare string cannot tell them apart and
`main` — the way *back* — is the one name that is never in the `scenes` table.

`who` is parsed and has one value. `self` and `@party` are refused by name
rather than ignored, so an author who read §1.5 is told the word is real and the
behaviour is S6 — silence there is a door meant for one person taking the whole
room through it.

**S2 — the tree, and sequence.** `children`, `flow`, and `load next`. *Ends
with:* a story with beats that can be reordered in the editor without rewiring a
trigger.

**S3 — saves, `player` and `space`.** The port, `xp_store`, the caps, the
`/datenschutz` paragraph. Not `global` — it is a different risk and it should
not ride in on the same commit. *Ends with:* a game you can come back to, and a
space with a world it is building together.

**S4 — timelines.** Keys copied from `src/domain/studio/keys.ts`, a duration, a
camera track, and the editor's timeline panel. *Ends with:* a cutscene between
two scenes, and therefore a movie.

**S5 — `global`, with its guards.** Caps, rate limit, text-only rendering, and
a backoffice view of the store. *Ends with:* a leaderboard that is not a
liability.

**S6 — `who: "self"` and parties.** `players()` in the script API, `party()`,
the editor's picker, and the party broadcast on the parent topic. Cheap, because
§1.6 did the structural half at S1 — this is a subscription change and a list,
not an interest-management layer.

S0 blocks everything. S3 is independent of S1–S2 and of S4 — saves do not care
how many scenes there are — so it can run in parallel with the scene work if two
people are on this. The topic change in S1 is the one thing that is painful to
move later, because it is a thing every client has to agree on at the same
moment.

---

## 7. Open

**7.1 Does a scene switch keep the player's entity state?** Walking through a
door holding a gun should keep the gun; restarting a beat should not keep the
damage. *Recommendation: `load` carries `keep: "player" | "nothing"`, default
`player`, because the door is the common case and the restart is the deliberate
one.*

**7.2 Can a child scene be a different document?** `scenes` today maps a name to
another document's id or an https URL, and §1 replaces that with inline scenes.
Both are useful — inline for a game's own rooms, external for somebody else's.
*Recommendation: a child is a name or a target, and the parser tells them apart
the way `resolveScene` already does. The external prompt rules do not change.*

**7.3 Is `enter` per player or per room?** With `who: "player"` a returning
player might resume where they left off, which is a `player` save rather than a
format field. *Recommendation: `enter` is where a level starts; resuming is a
game's own business and a thing it does with §3.*

**7.4 Does a timeline block input, or run under it?** A cutscene wants input
locked; a moving platform does not. *Recommendation: a scene-level `interactive:
false` rather than a property of the timeline, because the question is about the
scene and a moving platform is a timeline nobody wants to lock anything for.*

**7.5 Who pays for a `global` save?** It is one store for an XP played by
strangers, so it is not obviously the home space's bytes. *Recommendation: it
counts against the owner's space, same as 12.4 in
[xp-backend.md](backend.md), and revisit if an XP is ever popular enough for
the answer to matter.*
