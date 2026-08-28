# @kxb/boxing

A two-player boxing match built on the XP SDK's ports — its own rules, wire
format and art, in one package that could be lifted out.

The interesting part is [`src/net/`](src/net): the game asks an authority for
exactly one thing (see [`arbiter.ts`](src/net/arbiter.ts)), and each client is
authoritative over its own corner's health. Everything else is derived. A
friendly match with no authority at all still works — that is what `localHost`
is for.

## The art is not in this repository

This repository does not bundle third-party art. See
[docs/assets.md](../../docs/assets.md) for the whole story; this file is the
part specific to boxing.

`packages/boxing/assets/` is the source the build reads, and it holds three
things, none of them ours:

| | What it is |
|---|---|
| `boxer.png` | Sprite atlas for the **blue corner**, built from *Pixel Art Boxer Character and Template Pack* |
| `hitman.png` | Sprite atlas for the **red corner**, built from *Pixel Art Hitman Stance Boxer Character — v1.1* |
| `stadium/*.obj` | Ring, floor, lights and seats — five pieces cut out of a 689 MB voxel boxing package |

Both character packs are pixel-art sprite sets published on **[itch.io](https://itch.io)**;
search them there by the titles above. They are downloaded, not vendored, and
`scripts/boxing-assets.ts` expects them unpacked in `~/Downloads` under exactly
those folder names — including the vendor's own `charater` typo in the Hitman
pack, which is deliberately not corrected on disk.

## Rebuilding the atlases

```bash
bun run boxing:assets     # rebuild from the source packs, then publish
bun run boxing:publish     # publish only — no source packs needed
```

`--measure` walks the alpha channel and prints where the figure sits inside its
cell, which is how the numbers in [`src/art/characters.ts`](src/art/characters.ts)
were found. Re-run it whenever a pack is updated and paste what it says back
into that file:

```bash
bun run scripts/boxing-assets.ts --measure
```

The atlas **row order is ours**, not the packs'. Both ship a combined sheet and
neither states which row is which animation, so reading one means guessing an
order and finding out about it as a boxer who throws a hook when you press
block. `characters.ts` is the order; the build writes it and the renderer reads
the same list, so a row index is derived in both places rather than counted by
hand in either.

## Without the art

The rules and the netcode are pure and fully tested — `bun test packages/boxing`
passes with nothing downloaded. It is only the pixels that are missing.

## Licence

The code is MIT, with the rest of this repository. The art is each pack
author's, under each pack's own terms — check the licence in the download, and
please support the people who drew it.
