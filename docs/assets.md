# The art, and where to get it

This repository ships **no 3D models and no audio**. Everything the world is
drawn and played with comes from four people who publish it themselves, and
this document is how you fetch it.

That is a deliberate choice rather than a licensing one. Every pack below is
**CC0** — public domain, free for commercial use, no attribution required — so
mirroring it here would be perfectly legal. It is not done because:

- it is 237 MB of somebody else's work, and a git clone is a bad way to
  distribute it;
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

## The one body that is included

`public/xo/pda/dummy/Dummy.glb` — and its copy under `public/xp/packs/dummy/` —
is **ours**, drawn by [`tools/make-dummy.ts`](../tools/make-dummy.ts), CC0 with
the rest of `shapes`.

It exists because of everything above. A world with no props is a bare room; a
world with no *body* is a game you cannot see yourself in, and the animator —
which is a rig editor — has nothing at all to open. So there is a stand-in.

It is boxes, and it is not pretending to be KayKit's dummy. What it gets right
is the thing everything downstream keys off: the **twenty-one nodes of
[`src/domain/animator/rig.ts`](../src/domain/animator/rig.ts)**, spelled exactly
as that file's `glb` fields spell them, in the hierarchy the editor's handles
assume, carrying the two rest rotations that file measured (elbows bent a
little, mirrored; knees bent a little, the same sign on both). So it poses,
animates and walks like the real one.

Every vertex is bound to one joint at weight 1 — rigid skinning, which is why it
reads as a marionette rather than a person. That is deliberate: a marionette is
an honest placeholder in a way a badly-weighted human is not.

```bash
bun run tools/make-dummy.ts
```

Replace it whenever you like — fetch KayKit's characters into
`public/xp/packs/dummy/` and nothing else has to change.

## What is generated rather than fetched

| | |
|---|---|
| `public/xp/packs/shapes` | `bun run xp:shapes` — ours, CC0, drawn by [`scripts/xp-shapes.ts`](../scripts/xp-shapes.ts) |
| `public/xp/thumbs/` | `bun run xp:thumbs` — model thumbnails, rendered from the packs |
| `public/thumbs/` | `bun run models:thumbs` — the builder's thumbnails |
| `packages/xp/src/assets/catalogue.generated.ts` | `bun run xp:catalogue` — the model index the editor reads |

Run those **after** the packs are in place. `bun run xp:pack` walks a directory
and reports what it found, which is the quickest way to check an unpack landed
where the tables expect it.

## Running without the art

The app starts. The world does not draw, and the level editor's model picker is
empty — everything else (spaces, membership, chat, the event log, the netcode)
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
