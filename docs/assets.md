# The art, and where to get it

This repository ships **the world's own art and a starter cast**, and nothing
more. Everything else the world is drawn and played with comes from four
people who publish it themselves, and this document is how you fetch it.

## What ships in the clone

Enough to clone, `bun install`, `bun run dev` and walk around a furnished
lounge as somebody:

| | |
|---|---|
| `public/xo/` | the whole lounge — the bb10, proto and restaurant kits, the block and pile icons, the cosmos, fireworks, the companions (Telly, kappa and the Gridbots), the twenty-four peeps and their stills |
| `public/xp/packs/dummy` | KayKit's dummy — the body a player is before they are anybody |
| `public/xp/packs/animation` | the `Rig_Medium` clips the dummy, Gnash and every rigged skin walk with |
| `public/xp/packs/kappa` | Gnash and Definitely Gnash (`Monster.glb`, `MonsterCostume.glb`) |
| `public/xp/packs/peepz` | three of Kenney's animals as characters: bunny, pig and tiger |
| `public/xp/packs/platformer` | KayKit's platformer kit, all five colourways |
| `packages/boxing/assets` | the boxing ring and its two fighters; `bun run boxing:publish` copies them to `public/boxing` |

Every pack in it is **CC0**, and so is everything under `public/xo` that is
ours. The rest stays out on purpose rather than for licensing reasons:

- it is another two hundred megabytes of somebody else's work, and a git clone
  is a bad way to distribute it;
- the authors version, document and improve these kits, and a copy taken once
  goes stale silently;
- itch.io and kenney.nl are the addresses the authors want people sent to, and
  a few of them sell EXTRA and SOURCE tiers that fund the free ones.

The pack tables in [`packages/xp/src/assets/packs.ts`](../packages/xp/src/assets/packs.ts)
and [`src/domain/builder/packs.ts`](../src/domain/builder/packs.ts) are the
source of truth: each entry carries its author, its licence and its source URL,
and the application reads provenance from there rather than from this file.

## Where each author's work goes

| Author | Get it from | Unpack into |
|---|---|---|
| **Kay Lousberg** — KayKit | [kaylousberg.itch.io](https://kaylousberg.itch.io/) | `public/xp/packs/`, `public/xo/bb10`, `public/xo/proto`, `public/xo/restaunt` |
| **Kenney** | [kenney.nl](https://kenney.nl/) · [kenney.itch.io](https://kenney.itch.io/) | `public/xp/packs/`, `public/xo/peeps`, `public/audio/` |
| **Isa Lousberg** — Tiny Treats | [tinytreats.itch.io](https://tinytreats.itch.io/) | `public/tinyXO/` |
| **kxb** | this repository | `public/xp/packs/shapes` — generated, see below |

## The directories

Thirty-six pack directories, fifty-one packs once colourways are counted.

**Kay Lousberg** (KayKit) — `xp/packs/`: `adventure`, `boardgame`, `city`,
`dummy`, `dungeon`, `forest` (9 colourways), `furniture`, `halloween`,
`holiday`, `medieval` (4), `platformer` (5), `proto`, `resources`, `space`,
`tools`, `weapons`. Plus `xo/bb10`, `xo/proto`, `xo/restaunt`.

**Kenney** — `xp/packs/`: `blaster`, `cars`, `minigolf`, `peepz`,
`proto-kenny`, `space-station`. Plus `xo/peeps` and every pack under
`public/audio/`.

**Isa Lousberg** (Tiny Treats) — `public/tinyXO/`: `bakerygoods`, `bathroom`,
`bedroom`, `cafe`, `house`, `kitchen`, `livingroom`, `park`, `plants`.

Two kits are drawn to different scales; `scale` and `lift` on each pack entry
record what was measured, and the notes beside them explain why. Kenney's kits
in particular are **not** authored to one shared unit — a blaster is a hand prop
and a space-station wall is a doorway, in the same download.

## The dummy

`public/xp/packs/dummy/Dummy.glb` and `public/xo/pda/dummy/Dummy.glb` are
KayKit's, and ship. [`tools/make-dummy.ts`](../tools/make-dummy.ts) still draws
the boxes-only stand-in this repository used to carry — the twenty-one nodes of
[`src/domain/animator/rig.ts`](../src/domain/animator/rig.ts), rigidly skinned —
if you ever want a body with no art behind it at all:

```bash
bun run tools/make-dummy.ts
```

## What is generated rather than fetched

| | |
|---|---|
| `public/xp/packs/shapes` | `bun run xp:shapes` — ours, CC0, drawn by [`scripts/xp-shapes.ts`](../scripts/xp-shapes.ts) |
| `public/xp/thumbs/` | `bun run xp:thumbs` — model thumbnails, rendered from the packs |
| `public/thumbs/` | `bun run models:thumbs` — the builder's thumbnails |
| `packages/xp/src/assets/catalogue.generated.ts` | `bun run xp:catalogue` — the model index the editor reads |
| `public/xp/vendor/p5.min.js` | `bun run xp:vendor` — the p5.js runtime, copied out of the `p5` package `bun install` already fetched |

Run those **after** the packs are in place. `bun run xp:pack` walks a directory
and reports what it found, which is the quickest way to check an unpack landed
where the tables expect it.

`xp:vendor` is the one that is not about art, and the one whose absence is
quietest. A p5.js XP — see [the sketch cartridge](xp/sketch.md) — runs inside a
sandboxed iframe that loads the runtime from `/xp/vendor/p5.min.js`. Without
that file the container comes up, the page looks right, and the sketch simply
never draws: there is no error worth reading, because nothing threw. It is not
committed here for the same reason the packs are not — it is somebody else's
work, LGPL and minified without its licence header, and the `p5` entry in
`package.json` is a better place to fetch it from than a git mirror.

## Running without the rest of the art

The app starts and the lounge draws. The level editor's model picker offers
only the packs above, and anything a level names from a pack you have not
fetched does not draw — everything else (spaces, membership, chat, the event log, the netcode)
works, because none of it depends on a mesh.

The test suite tells you the same thing, precisely:

```bash
bun test src packages
```

Close to seven thousand tests pass with no database and no art. The ones that
fail all live in thirteen files, and every one is an asset-integrity test —
catalogues checked against disk, rigs read out of `.glb` files, sound files
resolved by name. They are not broken; they are correctly reporting that the art
is not here. Fetch the packs, regenerate the catalogue, and they pass.

`bun run test:core` is the same suite with those thirteen files left out, which
is what CI runs.
