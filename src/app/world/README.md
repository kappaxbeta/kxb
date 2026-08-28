# The world

Places you walk around in — the lounge, the café, the house — and the kit all
three are built from.

`cafe/`, `home/`, `lounge/`, `shots/`, `render/`, `nearby/` and `perf/` are the
places and the routes. Everything else was thirty-seven files in this directory,
and is now six rooms named for **what a thing is**.

The names are the lounge's, on purpose: `lounge/` has used `_canvas`, `_hud`,
`_sim` and `_hooks` since long before this, and the shared kit should not speak
a different language from its largest consumer. (`xp/` does speak a different
one — `body`, `world`, `match`, `net`, `input`. That is deliberate too. They are
two products, and `eslint.config.mjs` keeps them from importing each other.)

| | |
|---|---|
| **`_canvas/`** | Drawn *in* the world, in three dimensions: the face and the name over a body, its health bar, the ring that says whose side it is on, the party glow, the creatures, the front door. |
| **`_hud/`** | Drawn *over* it, in page space: the HUD kit itself, the emote button and its grid, the creature picker, the autopilot toggle, the party hairline. |
| **`_presence/`** | Other people are here. The parts that are the same in every room, the roster, the bodies and the packets, how a remote body is drawn *between* the packets, and the once-only channel. |
| **`_stores/`** | State published out of a scene for the rail to render, and pressed from the rail back into the scene. Every file in here exists because the two are several components and one layout apart. |
| **`_sim/`** | Rules and numbers with nothing drawn: the third-person rig every place shares, the wandering schedule, and whether a keystroke is somebody typing rather than somebody playing. |
| **`_hooks/`** | The two that are neither: mouse and keyboard for a walkable place, and mirroring what happened locally into the workspace's log. |

`sky.ts` stays at the root, because it is the colour the whole app is painted on
rather than a part of any one of these.

## Why the leading underscore

Folders under `src/app/` are routes. A `_` prefix is what stops Next from
treating one as a URL — so these are private by construction rather than by
convention, and a `page.tsx` accidentally added under one would still not route.
