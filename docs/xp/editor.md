# The editor, and visual scripting

What is clumsy about the XP editor today, taken apart — the picker, composition
that exists but cannot be found, the icon rail, a preview route — and the three
different things "a visual script editor" can mean.

Split out of [xp-backlog.md](backlog.md), which keeps the short entry and
the gating. Nothing here is built. Section numbers in cross-references are the
backlog's unless stated otherwise.

---

## 1. The editor

**State:** shipped and in use; the next round is not written down yet.
**Size:** unknown until the list below exists. **Blocks everything.**

The editor is where the next stretch of work goes. Everything below assumes
somebody can build a level comfortably, and that assumption is the one worth
being sure of first.

The complaint is that it feels clumsy and that nothing is organised. Below is
that, taken apart. **Each panel carries its argument in a header comment and
several are deliberate refusals rather than gaps** — so where an item answers a
comment, it says which.

### 1.1 The picker — done

**Built.** `searchTiles` in [catalogue.ts](../../packages/xp/src/assets/catalogue.ts) and
the rewritten [picker.tsx](../../src/app/xp/_editor/panels/picker.tsx). What follows is
the argument it was built from, kept because the decision it records — colour
stays four model ids — is one the code now assumes.

The grid is **241 tiles** rather than 611, and the shape of the collapse is the
part worth knowing: the key is the name with its colour suffix removed, and
`platformer-neutral` is folded in as a fifth colour rather than left as its own
group. Sixteen of its 53 pieces are the same shape as a `_blue` and a `_red`, so
a neutral group beside a collapsed one would have listed those sixteen twice;
the other 37 — the spikes, the chains, the bomb — are simply tiles with one
colour, and a tile with one colour draws no swatches.

Two controls landed with it. The **colour** the platformer tiles show is a
swatch row on the panel: a preference, not a filter, so choosing red does not
hide the spikes that have no red. It follows the held model until somebody
chooses, which is derived at render rather than synced in an effect. And **tile
size** is the settings affordance the panel wanted — 2/3/4/6 columns rather than
pixels, because the panel is dockable and its width is the user's. The name
drops out at the small steps; **the measurement never does**, because two tiles
that draw identically and behave differently are told apart by the number alone.

Tags are still worth having, and now they are a question about 241 genuinely
different things rather than 611 mostly-duplicates.

<details>
<summary>The argument it was built from</summary>

[picker.tsx](../../src/app/xp/_editor/panels/picker.tsx) opens with its own design
premise: *"Eighty-six models is small enough that the whole list can be on
screen and large enough that scrolling it is worse than typing two letters, so
it is a search box over a grid rather than a tree, tabs or a dropdown."*

**That was true and is not any more.** Counted from
`catalogue.generated.ts` today:

| Pack | Entries |
|---|---:|
| proto | 85 |
| dummy | 1 |
| platformer-neutral | 53 |
| platformer-blue / green / red / yellow | 118 each |
| **Total** | **611** |

A flat search box over 611 tiles is the clumsiness. But **the fix is not tags or
folders, and this is the part worth getting right**: the four platformer colour
packs are *the same 118 shapes*, four times over — stripped of their colour
suffix the sets overlap completely. So 472 of the 611 tiles are 118 shapes
wearing four coats, and only ~257 distinct shapes exist at all.

Tagging that does not help much and foldering it actively hurts: grouped by
colour, one shape lands in four folders, and grouped by shape, colour has
nowhere to live. **The fix is to collapse a variant set into one tile with a
colour control**, which takes the picker from 611 tiles to ~257 — back inside
the range its own premise was written for, and without a tree.

Whether colour then becomes a property on the placement or stays four model ids
behind one tile is a real decision with a format consequence, and it should be
made deliberately rather than fallen into. The cheap version is presentational
only; the honest version probably is not.

Two smaller things on the same panel, both plain gaps rather than refusals:
**thumbnail size** should be adjustable (or simply smaller — 611 tiles at the
current size is a lot of scrolling for a grid that opens instantly), and the
panel wants **a settings affordance** to hang that off. Tags are still worth
having *after* the variant collapse, when what is left is genuinely 257
different things.

</details>

### 1.2 Composition already exists, and nobody can find it — done

**Built**, as naming and affordance in the two panels rather than as a feature.
Three lines and one link:

- **Models** says what a drag out of it makes — *scenery: cells in the level, no
  name, nothing happens to it* — and under the grid, the signpost: several models
  joined is one blueprint with **parts**, with a link that opens the Blueprints
  panel. It sits there and not in the Blueprints panel because "how do I combine
  two models" is a question somebody has while looking at models, not while
  looking at a list of blueprints they have not made yet.
- **Blueprints** says the counterpart in the same words — *a thing: named, with
  properties, and something can happen to it.*
- The **Parts** empty state names composition and says how parts hang off each
  other, which is the sentence that was missing.

The link is `showWindow`, not `toggleWindow`: a link that says "Blueprints →"
and *closes* the panel because it happened to be open behind another tab does
the opposite of what it says. It reaches the panels through a second context —
the dock's own furniture, separate from `EditorApi`, so a layout library's type
stays out of the signature of everything that renders a panel, and it defaults
to a no-op so a panel rendered outside a dock still draws.

<details>
<summary>The report it was built from</summary>

*"I don't see how to build a composition from more models together"* — it is
there. `Blueprint.parts` is exactly that: parts with `parent`, `socket`, their
own `sockets`, position, rotation and scale, so a turret is a base with a barrel
with a muzzle on the end of it that moves when the barrel elevates. The panel
has `onPartAdd` / `onPartChange` / `onPartRemove` today.

**So this is a discoverability bug, and the code already knows.**
[blueprints.tsx](../../src/app/xp/_editor/panels/blueprints.tsx) says it in its own
header: *"That the two gestures look identical and produce different kinds of
thing is the one genuinely confusing part of this editor."* Dragging a model
lays down a placement; dragging a blueprint makes an entity; the panels look
alike and the split underneath is real.

Being already-identified in a comment does not make it fixed — it makes it a
known defect with a mitigation (the named drop) that has now been measured
against a user and found insufficient. Treat it as a naming and affordance
problem in the two panels, not as a feature to build.

</details>

### 1.3 Chrome: real icons on the rail, and a second zone

**Decided: build it now**, ahead of the destinations it will point at. The
concern was that an empty frame is the wrong order; it was raised and overruled,
and this paragraph is the record so nobody re-argues it.

The rail already exists. [rail.tsx](../../src/app/xp/_editor/shell/rail.tsx) is an
`IconRail` of lit/unlit toggles, and it refuses pictograms on purpose: *"Four
tool windows do not need an icon language: a pictogram for 'Models' is a guess
the reader has to decode, and a picture of a cube says nothing that 'M' does
not."*

**That refusal was conditional on the number, and the number has moved.**
`TOOL_WINDOWS` in [dock.tsx](../../src/app/xp/_editor/shell/dock.tsx) is eight, not four
— Scene, Properties, Models, Blueprints, Tools, Document, Behaviour, Scripts.
And the letter scheme has already broken down under its own weight: Behaviour is
`R`, a leftover from when the panel was called Rules and explained by the
comment directly above it, and Scripts is `J` because `S` was taken by Scene.
**Two of eight marks already do not say what they mean**, which is exactly the
decoding cost the comment was written to avoid. Add project settings, the movie
editor and publishing and it is eleven.

So this is not "the user prefers icons over letters" — it is the same shape as
§1.1, a premise that was true at four and is not at eleven. Update the comment
when the change lands rather than leaving it contradicting the code.

**The harder half is that the new items are not toggles.** The rail's stated
purpose is that *"closing something is undoable by clicking the same icon"* —
every existing item is a reversible view toggle with a lit state. Project
settings is a destination, the movie editor is a destination, and publishing is
an action with consequences outside the editor. **Publishing is not undoable by
clicking it again**, and putting it one pixel from a panel toggle in an
identical button is how somebody publishes a draft.

Two zones on one rail, separated visually and structurally: toggles keep their
lit state, destinations and actions get a different treatment and publishing
gets a confirmation. Do not let them share a component just because they share
an edge.

**Icons: inline SVG, no dependency.** The original comment's *"no icon
dependency for four buttons"* is still the right instinct at eleven — a handful
of hand-drawn paths beats a package, and the repo has no icon set to be
consistent with.

**One caveat that survives the decision:** publishing is
[xp-backend.md](backend.md)'s territory, and a button that implies a
publishing model that document has not agreed to is worse than no button. Wire
the slot; check that doc before wiring the behaviour.

### 1.4 A preview route

Two things, costing differently:

- **Preview while editing — done.** `Try` in the title bar; the level as a
  player, over the top of the editor, Escape to stop. See below.
- **Preview per device — the frame is done; the headset is not.** Two chips in
  the overlay, desktop and phone. See "One overlay, two frames" below.
- **Three at once, and a headset among them** — side by side. That is the
  visible half of §6 and is gated behind §4 with the rest of it. Still open.

**It is an overlay, not a route**, and that is the decision worth recording
because "a preview route" is what this section was called. A route means leaving
the editor: the dock unmounts, an unsaved document has to travel somehow — a
query parameter it will not fit in, or `localStorage`, which is the autosave and
would make trying a level a *write* — and coming back is a page load. The
overlay keeps the editor mounted behind it, so trying the level costs nothing
and changes nothing, which is the whole point of the entry.

What it runs is `XpScene`, **the same component the play route mounts**, given
the document as it stands. A preview that is not the real runtime is one that
agrees with the editor and disagrees with the game, which is the one thing it
must never do. Solo, with no `room`: no channel is opened, so it tells nobody
and costs nothing. The multiplayer version stays refused for the reason
[backend.md](backend.md) gives — trying an XP with other people is loading it
into a place or a battle, both of which already have people, an invite and an
ending.

Two details that are not obvious and are load-bearing:

- **The document is a snapshot**, taken when the button is pressed. `XpScene`
  re-seeds only when the document *id* changes, so a live prop would have been
  silently ignored; the copy says which of the two that is.
- **The editor's keyboard shortcuts are off while it is up.** `W` walks forward
  in the runtime and raises the build level in the editor, so without this a
  person who tried their level came back to a different floor selected and a
  rotation they never asked for. `Escape` is the one key that still means
  something, and it means stop.

The cost is two live WebGL contexts for as long as the preview is up, which is
the price of keeping a dock layout somebody arranged. A preview *panel* tabbed
beside the viewport would have avoided that and run the whole runtime, physics
and all, every second somebody was building rather than playing.

#### One overlay, two frames

**A phone is a narrower box, and that is the whole feature.** The runtime
already sizes itself to whatever container it is handed — the camera's aspect,
the HUD's wrapping and where the thumbstick sits are all derived from it — so
the frame is a `div` at 9:19.5 and nothing downstream of it changed. Measured
rather than assumed: the scene's drawing buffer goes 1438px → 363px and back
when the chips are pressed, which is a real resize rather than a CSS scale of
a desktop-shaped render.

**The one thing the box cannot say is that there is no keyboard.** `useIsTouch`
asks `(pointer: coarse)`, and the honest answer on the machine running the
editor is *no* — so a phone frame without an override is a phone-shaped window
with `WASD` in it, which answers a question nobody asked. Hence a `touch` prop
on `XpScene` and an optional argument on the hook: absent, the device decides,
exactly as before; set, the preview decides. The hook still subscribes either
way, so a real device change mid-preview is not missed.

**Two frames rather than three, and no headset chip.** A headset is a second
input model rather than a narrower rectangle (§6), and a chip that produced a
desktop render in a stereo-shaped box would be the kind of preview that agrees
with the editor and disagrees with the game — the one thing §1.4 says this must
never do. Side by side is the same refusal at a different scale: it needs the
transport work §4 gates, because two of the three run on hardware the author
cannot check.

**`key={device}` on the scene**, so switching remounts. R3F resizes a canvas
happily, but the runtime derives its input scheme when it mounts; remounting is
one line where making every derived thing follow a changing box would be many,
and a try-out has nothing to preserve across the switch anyway.

**Verified by driving it in a real Chrome**, which is the only way this could be
verified at all — the Browser pane is always `document.hidden`, so a canvas in
it never draws. Fifteen checks: the editor mounts, the Models legend and the
signpost are there, the picker shows 241 tiles, the link brings Blueprints
forward, `Try` mounts the runtime with its own canvas over the top, `Escape`
takes it away and leaves the editor behind it.

**One thing that turned up in the doing, and is not a bug here.** In `next dev`
the preview logs `Cannot read properties of null (reading 'addEventListener')`
from inside R3F's `Canvas`: it connects its events to its container from an
`async` block in a layout effect, and Strict Mode's simulated remount detaches
that ref between the two. It does not happen with Strict Mode off — which is
every build — and it costs nothing when it does, because every input this
runtime takes is bound to `window` rather than to R3F's event layer. Deferring
the mount by a frame was tried and does not help; the window is inside React's
remount, not inside layout. Written down because the next person to open this in
dev will see it and wonder.

### 1.5 Routed elsewhere

Asked for with the above, but they belong to entries that already own the
argument:

| Asked for | Where |
|---|---|
| Script panel: autocomplete, keeping variables, preview | §2c — and it is the concrete case that expires that refusal |
| Scenes openable and addable in the editor | [xp-scenes.md](scenes.md) — proposed, unbuilt; this is a request to build it |
| Movie mode, with key mapping | §8 |
| Storyteller mode | §3 |

---

## 2. Visual scripting

**State:** asked for; needs deciding which of three things it means.
**Size:** half a session to a project, depending which.

### 2a. Grow the verb form — cheap, and already the direction

[behaviour.tsx](../../src/app/xp/_editor/panels/behaviour.tsx) **is** a visual script
editor: rules as rows, every control a `select` over a constant, nothing anybody
can write that fails at runtime. §10 is explicit that this is the point — *the
verbs are for what should be readable*, and *the level that needs no script is
the better level.*

So the cheapest version of the ask is making more levels expressible without
leaving that panel: more events, conditions richer than one property against one
number, verbs covering what people keep dropping into JS for.

**Do this first regardless of what else gets decided**, because it tells you
what is actually missing. Whatever people still write scripts for after the
verbs grow is the real requirement for 2b.

### 2b. A node graph over JS — reopens a closed decision

§17 lists *a visual node graph for scripts* under **not planned at all**. This
entry does not overturn that; it records that somebody wants to, and what
overturning it would have to argue.

The refusal got *stronger* since it was written, by way of 2a. `behaviour.tsx`
works — small, safe, no parser, no evaluation-order story — **because the
vocabulary is closed**. A node graph over the QuickJS layer has an open
vocabulary by definition, so it gives up the exact property that makes the
existing visual layer cheap, and buys a second authoring language to keep in
step with the first forever. To reopen it: a concrete list of things people
could not express after 2a, and why a graph beats either more verbs or thirty
lines of JS.

### 2c. A better JS panel — a decision with an expiry date

[scripts.tsx](../../src/app/xp/_editor/panels/scripts.tsx) is a textarea on purpose:
CodeMirror or Monaco is 300 KB to 5 MB for a panel in an operator tool where a
script is thirty lines and the author has a real editor on the other monitor. It
spends the budget on error reporting at the line instead, running the real
interpreter.

Sound, and **scoped to an operator tool**. The day the editor is in front of
creators, the second half stops being true — a creator does not have a real
editor on the other monitor. Revisit then, and revisit the bundle number too.

**§1 supplied the concrete asks that expire it**, and they are worth separating
because two of the three are cheap and do not need a code editor at all:

- **Autocomplete** over what is actually in scope — `self`, `world`, `log`,
  `getEntityByName` from [script-api.ts](../../packages/xp/src/rules/script-api.ts), plus
  this document's own entity and blueprint names. That is a closed, known list,
  which makes it a suggestion popup over a textarea rather than a language
  server. Cheap, and worth more than highlighting: the errors people actually
  hit are a misspelled entity name, not a missing brace.
- **A preview / run affordance** — run the script against the document without
  starting a session. The interpreter is already wired into the panel for error
  reporting, so this is reach rather than new machinery.
Only after those two fail to be enough is the CodeMirror question live again.

> **Correction.** "Keep the vars" was filed here and does not belong here. It
> means keeping *variables* — declaring whether an XP's variables are space-wide
> or reachable from outside — which is a scope question, not an editor one. It
> now lives in §7.5. Left visible rather than silently deleted because the wrong
> reading was plausible enough that somebody will make it again.

---

