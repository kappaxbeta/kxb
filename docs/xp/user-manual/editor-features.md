# Editor features — detailed list

A working inventory of everything the xp editor can do today, organized by
feature area. This is source material for the user manual, not the manual
itself — it leans toward completeness over prose. Where something has a
keyboard shortcut or an exact on-screen label, it's noted. Where the source
comments explain a constraint, that's noted too.

Read against the actual code (`src/app/xp/_editor/`) if anything here goes
stale — this is a snapshot, not a spec.

---

## 1. Editor shell

- **Window chrome** — the editor renders inside a fake desktop-app frame:
  rounded corners, decorative macOS-style traffic-light dots, a title bar
  showing the XP's name and a `N placements · M entities` subtitle, and a
  toolbar strip below it.
- **Title bar actions**:
  - **Undo / Redo** — disabled when there's nothing to undo/redo.
  - **Save** — label switches to "Saving…" mid-flight. A "saved" badge fades
    in after success. A refused save shows the server's exact error inline
    (e.g. "Somebody else has this project open").
  - **Export** — only shown when the page has a real save destination (i.e.
    not the standalone/operator route, where Save itself just downloads).
  - **Draft indicator** — when a local unsaved draft is loaded, a small
    "draft" link appears to discard it and revert to what's on disk.
- **Autosave / drafts** — every edit autosaves to `localStorage`, keyed by
  the XP id and tagged with the version it was saved against. Reopening
  restores a newer local draft over what's on disk, but silently drops a
  draft older than the current server version (so it can't clobber someone
  else's newer save). Pre-versioning drafts are restored on trust.
- **Bottom status bar** — breadcrumb on the left (`xp › <id> › <selection
  name or "y = <level>">`); on the right, current tool, placement count,
  entity count, and on-disk/draft state.
- **Docked, rearrangeable layout** (via `dockview-react`) — every panel can
  be dragged, split, and tabbed together. Layout persists to `localStorage`
  per XP id; a layout that fails to parse falls back to the default rather
  than an empty window. Default layout: Scene/Models/Blueprints tabbed left,
  Scripts/Behaviour/Properties tabbed right, Document/Tools tabbed below the
  viewport. Reopening a closed panel rejoins whichever column it last lived
  in.

## 2. Left rail — panel toggles

Nine dockable tool windows toggle from the left icon rail, each lit violet
when open:

1. Scene
2. Properties
3. Models
4. Blueprints
5. Tools
6. Document
7. Behaviour
8. Data
9. Scripts
10. Animator (full-screen tool, not a side panel)

Below a divider sits **Try** (play icon) — not a toggle, it launches
Preview mode.

## 3. Try it / Preview mode

- Overlays the real runtime (the same component the live "play" route uses)
  full-screen over the editor, using a frozen snapshot of the current
  document — edits made after pressing Try aren't reflected until reopened.
- Solo, no multiplayer room — free to try repeatedly, nobody else involved.
- **Desktop / phone toggle** — switches the preview frame to a letterboxed
  9:19.5 mobile aspect ratio and remounts the runtime with `touch` input.
- **Log button** — toggles a transcript panel at the bottom: pickups,
  script `log()` calls, refused rules, newest last, capped with an "oldest
  dropped past N" note.
- **Stop (Esc)** — exits back to the editor. All editor keyboard shortcuts
  are suppressed while previewing, except Escape.

## 4. Toolbar — placement tools

Eight tools, each a hand-drawn icon button with a tooltip showing its key:

| Tool | Key | Behaviour |
|---|---|---|
| Select | — | Default tool. Only tool that can click things without building. |
| Hand | — | Pans the camera; left-drag pans instead of orbiting. Does not select or build. |
| Place | `B` | Lays exactly one cell/piece per click; ignores drag. |
| Draw | `B` | Brush that follows the drag, filling every cell the pointer crosses. Shares the `B` key with Place — pressing it toggles between the two. |
| Erase | `E` | Removes placements under the dragged path. |
| Line | — | Draws a straight run between two points. |
| Fill | — | Fills a rectangle between two corners. |
| Room | — | Draws the outline/walls of a rectangle with a gap left for a doorway. |

- **Place hands control back to Select**, holding the piece just placed —
  the natural next step is to nudge, turn, or inspect it. Draw deliberately
  does not do this, since a one-stroke brush would be useless.
- **Rotation (`R`)** — cycles the "held" placement rotation in 90° steps
  before placing.
- **Working plane / level (`Q` / `W`)** — editing happens against an
  invisible working-height plane, so empty space is always buildable.
  `Q`/`W` (or +/− in the Tools panel) raise/lower it. Pointing at existing
  geometry places on top of it instead.
- **Snap** (Tools panel) — how far a gizmo handle moves per stop: off
  (free), 0.1, 0.5, or 1 cell. Marks always snap to whole cells regardless
  of this setting.

## 5. Gizmo (move / turn / size)

Appears as three icon buttons top-left of the viewport, only while
something is selected. Built on drei's `TransformControls`.

| Mode | Key |
|---|---|
| Move | `G` |
| Turn | `T` |
| Size | `Y` |

- **Turn is yaw-only** (single ring) — the engine stores a single Y-axis
  rotation number. Tilt (pitch/roll) is only reachable via typed fields in
  Properties.
- **Size is a single uniform scale number**, not 3-axis, via the gizmo;
  per-axis "stretch" is typed-only.
- **Pivot** — "Turn around" control in Properties (Centre vs Origin):
  rotate around the object's own centre, or around its model-authored
  origin (e.g. a door on its hinge).
- Orbit camera is disabled automatically while a gizmo handle is grabbed,
  and re-enabled on release/unmount/selection change/delete.

## 6. Placing entities and placements

- **Drag from Models panel** → drops a **placement**: bulk, unnamed
  scenery, rasterized into the 1-metre cell grid.
- **Drag from Blueprints panel** → drops a named **entity** with
  properties and behaviour, positioned in free (non-grid) world units.
- Both show a translucent rainbow-Fresnel "ghost" preview at the exact
  footprint/rotation the piece will occupy, snapping to the surface under
  the cursor (or the working plane if nothing is there).
- New drops select the created item automatically.
- **"Make it a blueprint"** button (on a selected placement) — converts it
  into a named entity/blueprint in place, consuming the placement, and
  jumps to the Blueprints panel with the new blueprint open.

## 7. Selection and clipboard

- **Select** (click) picks placements, entities, marks, or the player body
  (clickable even though it's a placeholder).
- **Viewport navigation**: right-drag always pans; left-drag orbits except
  with Hand tool (pans); middle-mouse/wheel dollies/zooms.
- **Copy / Cut / Paste** — `⌘C` / `⌘X` / `⌘V`, on whatever is selected
  (entity, placement, or mark). The player can't be copied/cut/deleted —
  there's exactly one.
- **Delete / Backspace** — removes the selection.
- Paste offsets by one cell diagonally, so repeated pastes walk across the
  floor instead of stacking. Pasting an entity drops its old name (names
  must stay unique) and renumbers its save-point "order" if it was a
  checkpoint.
- `Escape` — deselect.

## 8. Scene panel

- **Things** — named entities, indented under parents with a `⤷ socket`
  marker for parented entities.
- **Built** — placements grouped/folded by model (e.g.
  `Primitive_Wall × 24`), expandable to individual cell rows.
- **Marks** — 5 kinds: spawn, red, blue, start, finish. Added via buttons,
  land under the pointer.
- **Player** — the single player row.

## 9. Properties panel

Shows the form for whatever's selected:

- **Player** — spawn x/y/z + 2D drag pad + facing + body/keys/weapon.
- **Mark** — kind, x/y/z, facing, width/height, team.
- **Placement** — x/y/z, drag pad, turn, scale, tilt/stretch, collider
  mode.
- **Entity** — name, x/y/z, drag pad, turn, scale, tilt/stretch, save-point
  order (if applicable), "Hangs from" parent/socket picker.

Shared bits:

- **2D drag pad** — touch-friendly, moves things on the x/z floor plane by
  dragging. Shift = finer rate.
- **Collider control** (Placement) — "measured shape" (auto, voxelized at
  build time), "walk through" (none), or a read-only view of a "drawn"
  hand-authored box list (can leave that mode from the UI, but not create
  one).
- **Entity parenting ("Hangs from")** — an entity can be parented to
  another named entity, optionally at one of its declared sockets; its own
  x/y/z/turn become relative to the parent.
- **Save Point / "order"** — shown only for entities whose blueprint saves
  progress (checkpoint-type). Numbered automatically as placed; editable,
  must be a positive whole number.

## 10. Behaviour panel (rules)

Blueprint-scoped list of "rules" — form-based over a **closed vocabulary**,
no free scripting here, so nothing typed can fail to save.

- **Rule shape**: an event (`on:`), an optional condition (`when:
  <self/other/world>.<prop> <comparison> <value>`), and one or more verbs
  (`do:`).
- **Events** include `pressed` (needs a bound key, offered from the level's
  custom key bindings, plus optional proximity in cells) and `finished`
  (warns if the level has no scoring mode, since it would never fire).
- **Verbs**: `damage`, `heal`, `setProp`, `addProp`, `despawn`,
  `deactivate`, `activate`, `carry`, `drop`, `unhand`, `disarm`, `arm`,
  `stun`, `teleport`, `checkpoint`, `load` (go to another XP), `spawn` (a
  blueprint, with dx/dy/dz offset), `score`, `emit` (custom event name),
  `sound` (from a closed sound list).
- **Verb targets**: `self`, `other`, and — for `setProp`/`addProp` only —
  `world`, writing to a declared Data field.
- **Teleport destination picker** offers named entities and unique
  mark-kind shortcuts (e.g. `finish`), plus a "type a name not placed yet"
  escape hatch for forward references.
- The last verb in a rule can't be removed — a rule must always do
  something.

## 11. Scripts panel

Named JavaScript-ish scripts (QuickJS-backed), each attachable to one
blueprint.

- **Editor** — a plain `<textarea>` (deliberately no CodeMirror/Monaco),
  with syntax highlighting painted behind the transparent textarea via a
  hand-rolled lossless tokenizer (comments, strings, numbers, keywords, the
  4 API globals, `.member` access each get separate colors).
- **Autocomplete** (Tab/Enter to accept, arrows to navigate, Escape to
  dismiss) offers: the 4 globals (`self`, `world`, `log`,
  `getEntityByName`), the 3 lifecycle hooks (`onSpawn`, `onTick`,
  `onTrigger`), entity members (`x`, `y`, `z`, `rotation`, `scale`,
  `intensity`, `range`, `colour`, `alive`, `get`/`set`/`add`, `damage`,
  `heal`, `despawn`, `spawn`, `score`, `emit`, `distanceTo`,
  `flatDistanceTo`, `moveTo`, `moveBy`), `world` members (`tick`, `time`,
  `seed`, `random`, `randomInt`, `roll`, `pick`), and live entity-name
  suggestions inside `getEntityByName('...')` strings.
- **Compile checking** — 400ms after typing stops, the real QuickJS
  interpreter runs against the document and problems are shown inline,
  tagged to the offending script.
- **"one second" Dry Run** — runs the script(s) for 60 simulated ticks (1
  second at 60fps) with no renderer/player/room, showing `log()` output and
  runtime failures. Answers "did my script actually run," not "does it feel
  right" (that's Try). Warns if the script isn't attached to anything.
- **Runs on** — chips per blueprint to attach/detach the script; attaching
  to a blueprint already running a different script warns it will replace
  it.
- **Rename / Delete** — delete auto-detaches.
- Max script length shown as `chars / MAX`.

## 12. Data panel

Declares named fields ("what this level keeps") that persist beyond a
session — e.g. coins collected.

- **Scope**: `player`, `space`, or `shared` — semantics explained in-panel.
- **Starting value** — number only.
- Inline rename (commits on blur) and delete (armed two-step "×"/"sure?").
- Name validation matches the parser's own alphabet (lowercase
  letters/digits/dashes), with a live error for bad or duplicate names.
- A max field count (`MAX_DATA_FIELDS`), with a note that exceeding it
  usually means "one state pretending to be many flags."
- Fields aren't edited here — rules read/write them elsewhere (Behaviour,
  target `world`).

## 13. Camera panel (in-game camera)

Lives in the Document/Output panel, under "Mode." Three kinds, with only
the relevant fields shown per kind:

- **follow** — third-person over-the-shoulder. Fields: stand-off distance,
  behind/above/beside offsets, lens° (FOV), draw distance, "aimed one way"
  toggle (fixed yaw/pitch vs. auto-watching the player).
- **side-on** — 2.5D/side-scroller. Fields: which axis it runs along
  (x/z), cells-tall (vertical span), lens°, draw distance.
- **fixed** — stationary camera. Fields: x/y/z (auto-seeded a few cells
  behind/above spawn when first chosen), optional aim (yaw/pitch) or
  "watches the player."

Numeric fields show the effective default as a placeholder rather than
baking it into the file.

## 14. Editor viewport camera

Separate from the in-game camera above — this is how you look around while
building:

- Left-drag orbits (or pans, with Hand tool active).
- Right-drag always pans.
- Middle-mouse/wheel dollies.
- Orbit disables automatically while a gizmo handle is grabbed, and
  re-enables robustly on release/unmount/selection change/delete.

## 15. Animator

A full-screen tool for posing/animating the built-in rigged "dummy" and
exporting a `.glb` clip. Byte-for-byte copy of the internal backoffice
animator (not shared code, by design — the two can diverge).

### Viewport

- 3D stage with the dummy, orbit camera (zoom-to-cursor).
- Optional floor grid toggle.
- **Look toggle** — hands one-finger touch control to the camera (touch has
  no separate mouse buttons; one finger poses, two fingers pinch/pan).

### Posing (rig/IK)

- Drag any of ~20 labeled dot handles on the body (hips, spine, chest,
  head, shoulders/elbows/wrists/hands ×2, hips/knees/feet/toes ×2) to pose
  via inverse kinematics (cyclic coordinate descent up the chain,
  joint-limited so knees/elbows bend only the anatomically correct way).
- **Shift-drag** slides a handle along the floor plane instead of the
  camera-facing plane.
- **Hips** is the one handle that translates the whole body rather than
  rotating a joint.
- Selected bone gets exact numeric **Pitch / Turn / Roll sliders**, plus a
  "Straighten <bone>" reset button.
- **Pinning** — the four limb-end handles (both hands, both feet) can be
  pinned: a pin remembers the world point where it was pinned, and IK
  re-solves the limb to keep that point fixed even as the hips move (so
  lowering the hips reads as a crouch, not sinking through the floor).

### Timeline / keyframes

- Video-editor-style strip: click to scrub, drag the playhead, drag a
  diamond to re-time a key.
- **Auto-key is on by default** — moving a handle records a keyframe at the
  playhead automatically.
- Manual controls: Key/Re-key, Delete key, jump to previous/next key, step
  ±1 frame, Home, Play/Pause, Loop toggle.
- Each key has an **ease** (linear / smooth / hold) controlling the blend
  leaving it, editable from an "ease out of the key under the playhead"
  picker.

### Clip settings

Name, FPS (6–60), Length/duration (up to a max) — all editable.

### Moves (presets)

One-click canned motions, stamped from the current playhead position and
speed-scaled by a Speed slider (0.25×–3×):

- Walk
- Run
- Arm swing
- Wave
- Dance
- Idle
- Jump

Presets only touch the bones they name (e.g. Walk = legs only), so they
layer — stamping Walk then Arm swing doesn't erase either.

### Pose tools

- **Copy key / Paste key** — whole key including easing (useful for
  closing a loop: copy frame 0, scrub to the end, paste).
- **Back to the rest pose.**

### Save / Export

- **Download .glb** — bakes the posed clip into the dummy model as a real
  animation clip, ready to drop in `public/xo` and play by name. Cannot yet
  be saved *into* the XP document itself (no assets block exists yet), so
  this is a standalone download, separate from the level's Save.
- **Save work** — downloads the editable `.animation.json` working file
  (keys, easing, timing, format version). A GLB can't be reopened for
  editing, so this is the "source" file to keep.
- **Open** — file picker to reload a `.json` working file.
- **Paste an animation…** — collapsible textarea to paste JSON text
  directly instead of a file.
- Opening a newer-format file than the editor understands is allowed with a
  warning, not refused outright.
- Autosaves the working document to `localStorage` continuously (separate
  key from the level draft).
- **Undo/redo**, 5 steps deep, with intelligent coalescing (dragging one
  slider is one undo step, not one per pixel).

### Animator keyboard shortcuts

| Key | Action |
|---|---|
| Space | Play/pause |
| `K` | Key now |
| Delete/Backspace | Remove key |
| `←` / `→` | Step one frame |
| `↑` / `↓` | Next/previous key |
| Home | Jump to start |
| `C` / `V` | Copy/paste key |
| `⌘Z` / `⇧⌘Z` | Undo/redo |
| Shift-drag | Slide handle along floor |

Also listed in an in-app "Shortcuts" panel.

## 16. Models panel (Picker)

Search box over a thumbnail grid of every raw model in the packs the
document has declared — ~3,892 models across 31 shippable packs
(Prototype, Characters, Adventure, Board Game, City, Dungeon, Furniture,
Halloween, Holiday, Resources, Space, Tools, Weapons, plus multiple
Platformer color variants, several Forest color variants, and Medieval
variant packs).

Dragging/clicking a tile makes it the active "brush" for Place / Draw /
Line / Fill / Room — lays down anonymous, unnamed **placements**.

- **Search box**, tile-size control (L/M/S/XS), colour-swatch filter for
  platformer variant tiles (collapses many color variants into one tile +
  swatch picker).
- **Packs drawer** — expandable list of all 31 packs, add/remove toggle per
  pack, size count, "in use · N" indicator when the level already depends
  on it (blocks removal), 4-thumbnail previews per pack. Clicking a preview
  both adds the pack (if not yet declared) and selects that model.
- Groups over 48 tiles fold with a "+N more — show them all" expander.
- Declared packs (`document.packs`) are a real document field, not just a
  UI filter — opening someone's level shows only the kits it actually
  uses.

## 17. Blueprints panel

Lists "kinds of thing" the document has defined (crate, turret, checkpoint,
etc.) — distinct from raw models. Dragging a row into the viewport creates
a named **entity**.

Per-blueprint fields:

- **Model** — via the same Picker, or a composition of multiple models via
  **Parts**: sub-models each with their own name, parent/socket hierarchy,
  offset, rotation, scale (e.g. a turret's base + barrel, a lamp's post +
  light).
- **Seen at play** toggle — drawn vs. "a place only" (invisible empty node
  — still named, moveable, targetable by rules; e.g. a teleport
  destination or waypoint).
- **Pose** — for rigged (skinned) models only: pick a rest/idle animation
  clip from the runtime's loaded clip list.
- **Light** — on/off, colour (native colour picker), brightness, reach (in
  cells, 0 = unlimited); each individually script-controllable at runtime
  (`self.intensity`, `self.range`, `self.colour`), capped at `MAX_LIGHTS`
  simultaneously-drawn lights.
- **Collides as** — auto (measured box), none (walk-through), or box
  (typed w/h/d).
- **Tags** — free-text, comma-separated labels a rule can match on (not an
  enum; the engine never reads them itself).
- **Properties** — named numeric starting values (hp, ammo, etc.),
  add/remove inline.
- **Rename / Delete** — delete is blocked while any entity or reference
  still uses the blueprint, listing the blockers.

### Starters

One-press ready-made blueprints. Currently one: **"+ save point"** —
creates a fully working checkpoint blueprint (flag model, walk-through
collider, `enter → checkpoint(other)` rule) in a single undo step,
auto-suffixing the name if "checkpoint" is taken.

### Placement vs. entity

Called out on-screen in both panels: dragging a **Model** tile makes
unnamed, rule-less bulk scenery on a 1-metre cell grid; dragging a
**Blueprint** row makes a named entity with properties/behaviour,
positioned in free (non-grid) world units.

## 18. Visual effects

- **Ghost/rainbow preview material** — every brush preview (drag stroke,
  drop-target ghost) uses a custom Fresnel "glass" shader: edges glow,
  faces are translucent so the level shows through the piece; hue cycles
  through the spectrum over time and across world position (a travelling
  colour wave, not a synchronized blink), with a gentle "breathing" scale
  pulse phase-shifted by position so a long stroke doesn't pulse in unison.
- **Erase-mode previews** are flat red instead — rose reads as "about to be
  gone" elsewhere in the editor too.
- A flat shadow decal is drawn on the floor under the ghost box, showing
  the footprint even when the box is too tall to read from above.

## 19. Document / Output panel

Read-only-ish summary/dashboard:

- Placement count, distinct-model count (with a note that draw calls
  follow this number, not the raw piece count — a performance hint),
  entity count, blueprint count, mark count, capabilities, declared packs,
  player body.
- Warnings list (amber) — "no marks," "no placements," "unnamed entities a
  rule can't address," etc.
- Embeds the **Mode** and **Camera** panels, since both are document-level
  facts rather than per-selection.

### Mode panel (game type)

- Grid of presets (freestyle, football, competition/race, match, etc.) —
  greyed out with an explanatory reason (e.g. "needs a goal at each end")
  when the level doesn't satisfy the preset's requirements, rather than
  allowing a click that would silently fail to save.
- Score limit / time limit — optional numeric fields; empty means "no
  limit," deliberately distinct from zero.
- **Sides** — all-vs-all / teams / one-vs-all picker (disabled until 2+
  differently-named team spawn marks exist), plus a team-assignment
  strategy picker (shown only for "teams").

## 20. Tools panel

- Working level (`y`) +/- controls with hint text.
- "Ground at y=N" checkbox — solid floor everywhere vs. a 40-cell-down
  catch-plane.
- "Falling starts you over" (respawn) and "Falling kills you" (fatal fall)
  checkboxes — mutually exclusive, only shown when ground is off.
- Background colour field — free text (hex/rgb/named colour, or empty for
  page-transparent), with a live swatch.
- Snap picker (see §4).
- Turn/rotation display + Rotate button.

## 21. Player identity

Scene panel's "Player" row / Properties "Player" form:

- Body blueprint picker (defaults to the built-in dummy).
- Spawn position — x/y/z + drag pad + facing.
- Custom **Keys** — up to `MAX_PLAYER_KEYS` bindings, captured by pressing
  the key (not typed as text), paired with a free-text action name
  (`grab`/`use`/`attack`/`shoot` offered as datalist suggestions).
- **Holding** — weapon blueprint, avatar-at-socket, in-hand socket
  override.
- **Grip** — 6-field numeric adjustment (x/y/z/pitch/yaw/roll/scale offset
  for how a weapon sits in the hand), with a Reset button.

## 22. Editor keyboard shortcuts (main editor)

Active only when not typing in a field and not previewing.

| Key | Action |
|---|---|
| `⌘Z` | Undo |
| `⇧⌘Z` | Redo |
| `⌘C` / `⌘X` / `⌘V` | Copy / cut / paste selection |
| Delete / Backspace | Remove selection |
| `R` | Rotate held rotation 90° |
| `B` | Toggle Place ⇄ Draw |
| `G` / `T` / `Y` | Gizmo mode: translate / rotate / scale |
| `Escape` | Deselect (or exit Preview) |
| `E` | Toggle Erase ⇄ Place |
| `Q` / `W` | Working level down / up |

---

## Open questions for the manual pass

- Confirm exact on-screen copy for panel legends and warnings against the
  live editor before quoting them verbatim.
- Decide whether the manual documents Animator as part of the main editor
  walkthrough or as its own standalone guide (it's a separate full-screen
  tool with its own undo stack and autosave key).
- `editor-guide.md` already covers some of this ground in a terser voice —
  reconcile or fold in once the manual's structure is settled.
