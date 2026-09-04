# The sketch cartridge — p5.js in a container

An XP whose content is **code the document carries**, run in a container the
host builds. The third kind of document, next to a level (a world this format
describes) and a cartridge (`frame`, a game the host already ships).

Built 2026-08-30. The format half is `packages/xp/src/document/sketch.ts`;
the runtime half is split across two places since the native app needed to
reach it too: the host-agnostic string and pure functions — the SDK
(`packages/xp/src/sketch/sdk.ts`), the postMessage protocol
(`packages/xp/src/sketch/protocol.ts`) and the flow driver
(`packages/xp/src/sketch/flow-driver.ts`), all re-exported from `@kxb/xp` —
live in the package, next to `parseXp` and the engine; what is web-specific —
the `<iframe srcdoc>` builder (`src/app/xp/_sketch/srcdoc.ts`) and the React
stage that wires it to a socket (`src/app/xp/_sketch/stage.tsx`) — stays in
the app. The one runtime fork is `isSketch` in `_runtime/scene.tsx`, beside
`isFramed` — so the store, the wizard, the match room and the XP rooms all
open one without having changed.

## The trust story, because it is the whole design

backend.md §1.2 refuses `.js` files in a project folder — a stranger's
script served from our origin is stored XSS — and names the escape hatch: an
opaque origin and a sandboxed iframe. That is exactly what this is, and the
folder rules did not move:

- **Sources are strings inside the JSON document**, the same way `scripts`
  has always carried QuickJS sources. Nothing stores or serves a script
  file.
- **The container** (`_sketch/srcdoc.ts`, web-specific) is an
  `<iframe srcdoc>` with `sandbox="allow-scripts"` and **no**
  `allow-same-origin`: an opaque origin, our cookies unreachable,
  `postMessage` the only door.
- **The CSP inside** is `default-src 'none'`, opened for inline script, our
  origin (p5 at `/xp/vendor/p5.min.js`, pack pictures, sounds — CORS for
  those three directories is in `next.config.ts`) and data/blob. A sketch
  cannot phone home.
- **Everything the frame says is validated** (`@kxb/xp`'s
  `packages/xp/src/sketch/protocol.ts`) and rate-limited (`xp.send` 20/s,
  8 kB; state 4 kB) on the stage's side of the membrane, because the other
  side is the code being limited.

## What a sketch is handed — `window.xp`

The SDK (`packages/xp/src/sketch/sdk.ts`, inlined into the container) gives ordinary p5
global-mode code a multiplayer game's worth of platform, without netcode:

| | |
|---|---|
| `xp.me`, `xp.players`, `on('join'/'leave')` | the roster, off the room's socket |
| `xp.avatar` / `player.avatar` | a position everybody sees; yours written in `draw()`, theirs arriving smoothed (10 Hz out, eased in) |
| `xp.input` / `player.input` | one axis per device the config allows: arrows + WASD, and the thumbstick when `sketch.stick` is true |
| `xp.pressed`, `on('press'/'release')` | the document's `player.keys` — keyboard here, buttons on a phone, the wire for everybody else |
| `xp.object('ball', {…})`, `.claim()`, `.mine` | one writer, everybody watching — `owning.ts`'s lowest-id election with claim-beats handover |
| `xp.phase`, `on('phase')`, `xp.emit(name)` | the document's `flow`, driven by the platform (below) |
| `xp.send` / `on('message')` | whatever the rest is not |
| `xp.match` | the host lobby's `{ started, timeLimit, scoreLimit }` — `FrameProps.match`'s contract; nulls mean the sketch decides |
| `xp.t('sentence')` | the document's `words` block, resolved for this reader's locale on the stage; draw it, never compare against it |
| `xp.load.image(id)`, `xp.load.model(id)`, `xp.load.sound(name)` | pack art loaded: images as stable handles (`.ready`/`.image` — p5 2.x returns Promises, 1.x images, the handle hides which), the *model itself* for WEBGL mode (a small glTF reader in the SDK: mesh + node TRS + base-colour texture, `.draw()` when `.ready` — a prop, no skinning/animation), and a take-cycling sound player; `xp.imageUrl`/`xp.soundUrl` for raw URLs — CORS for the asset dirs is in `next.config.ts` |
| `xp.file(path)`, `xp.timeline` | a carried (non-`.js`) project file — `.frag`/`.vert`/`.glsl` for `createShader` — and the document's declared pass length |

p5 itself is untouched — `keyIsDown`, `mouseX`, WEBGL mode all work; the
stage forwards key edges it hears and the SDK replays them as real events.

## The flow, honoured in the shape a sketch can

`packages/xp/src/sketch/flow-driver.ts` (pure, tested) drives phases, `says`, `allow`,
`after` timers, `on` events, `rounds` and the two reserved destinations. The
lowest id in the roster drives and broadcasts; newest `seq` wins. Steps with
`when` never hold here and `does` fires nothing — a sketch's world is inside
code the platform cannot read, the same excusal `parseXp` makes for its
missing world. The stage draws the strip: round, phase, countdown, the
authored `says` line.

## Where you meet one

- **Play**: anywhere an XP opens. Shipped examples:
  `neon-pond.xp.json` (2D, flow, rounds), `conways-gambit.xp.json` (two
  players taking turns: one client holds the position in an `xp.object`
  whose every field is a *string*, because the SDK eases numeric ones
  towards the owner's value and half a turn is not a turn) and
  `cube-yard.xp.json` (WEBGL —
  p5 reads OBJ/STL, not our `.glb`, so its third dimension is p5 geometry;
  a GLB→OBJ conversion is the path if pack models are ever wanted inside).
- **Create**: the `p5` template (`templates.ts`) — the new-project form
  badges it `p5.js` so the two kinds of project cannot be mistaken.
- **Edit**: the project view (`_sketch/editor/`), forked into
  `/xp/[id]/edit`, `/xp/new/p5` and the space studio (same claim, same
  save, same rename as the 3D editor). Files, a painted-textarea code pane
  (`highlight.ts`, copy-owned, no CodeMirror — the scripts panel's argument
  stands), config (blurb, keys, stick, `backend.needs`), and the container
  itself running beside a console. One pane at a time below `lg`.

## Checking work

`bun test packages src` covers the format, the protocol, the flow driver
and the srcdoc armour. The container cannot be watched in an agent's
browser pane (no rAF); the check that proves it runs is headless Chrome
reaching *into* the srcdoc frame — puppeteer's `page.frames()` crosses the
opaque origin, so a probe can wait for `window.frameCount` to move and read
`window.xp` directly. The multiplayer surface was proven the same way the
level runtime's was: two headless browsers, one minted anon session each,
one room — roster, avatar sync, ball handover, per-player presses and one
agreed flow, asserted from inside both containers.
