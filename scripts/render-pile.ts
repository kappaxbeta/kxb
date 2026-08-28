/**
 * Shoots a sculptural pile of blocks to a PNG, for the marketing pages.
 *
 *     bun run scripts/render-pile.ts            # every pile
 *     bun run scripts/render-pile.ts play       # just one
 *
 * Reads `public/xo/bb10/gltf/<model>.gltf` and writes
 * `public/xo/piles/<pile>.png` — transparent background, one three-quarter
 * camera, so the pile can be dropped onto any of the page backgrounds without
 * carrying a rectangle of its own sky with it.
 *
 * ---------------------------------------------------------------------------
 * Why this exists rather than a stock 3D render
 * ---------------------------------------------------------------------------
 * The look being chased is a heap of chunky 3D primitives, which is a genre with
 * a lot of very good work in it - and all of that work belongs to whoever made
 * it. Lifting one onto a commercial page is infringement whatever the folder it
 * ends up in, and the "free 3D blob pack" sites are mostly the same problem with
 * a licence file that does not survive being read.
 *
 * It also would not be *ours*. The whole pile in the reference is cylinders,
 * coils and ridged spheres - and this product already owns fifty-eight chunky
 * low-poly models that people actually place in the world. Stacking those is
 * both original and the more honest picture: PRODUCT.md's rule is that every
 * marketing image is a real frame of the real product, and a crate in one of
 * these piles is the same crate you get by pressing E in the lounge.
 *
 * ---------------------------------------------------------------------------
 * Software rendering, like its two neighbours
 * ---------------------------------------------------------------------------
 * `gltf-raster.ts` does the drawing, for the reason its own header gives: a
 * browser render would mean a manual "open this page and wait" step that nobody
 * redoes when a pack changes. `loadTriangles` returns *world-space* triangles,
 * so composing a pile is concatenating several models' worth of them and handing
 * the lot to one `render()` call - the depth buffer sorts out what is in front
 * of what, with no scene graph needed.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadTriangles, render, type Triangle, type Vec3 } from './gltf-raster'
import { encodePng } from './png'

const GLTF_DIR = path.join(import.meta.dir, '..', 'public', 'xo', 'bb10', 'gltf')
const OUT_DIR = path.join(import.meta.dir, '..', 'public', 'xo', 'piles')

/**
 * Three-quarter and slightly above, which is the angle the reference piles are
 * all shot from and the one that shows a stack as a stack.
 *
 * Higher than `render-blocks.ts`'s camera on purpose: that one frames a single
 * block for a picker, where looking down on it is wrong. A heap wants the eye
 * above the top of it so the far side of the base is visible and the thing
 * reads as standing on ground rather than as a flat sticker.
 */
const EYE: Vec3 = [5.6, 4.4, 6.2]
const FOV_DEG = 30

/** One block in a pile. Positions are in model units; a block is about 2. */
interface Piece {
  model: string
  x: number
  y: number
  z: number
  /** Radians. Odd angles on purpose - see the note on `PILES`. */
  rotY?: number
  scale?: number
}

/**
 * The piles.
 *
 * ---------------------------------------------------------------------------
 * What makes a heap read as sculpture rather than as a mess
 * ---------------------------------------------------------------------------
 * Three rules, and they are the whole of the art direction here:
 *
 * 1. **A silhouette that tapers.** Wide at the base, narrowing, with one or two
 *    pieces breaking the outline near the top. A column of even width reads as
 *    a tower somebody built; a taper reads as a pile that landed.
 * 2. **No two neighbours at the same angle.** Every `rotY` is an odd fraction
 *    rather than a right angle, because a stack of cubes all facing the camera
 *    is a wall. This is the single cheapest thing that makes it look 3D.
 * 3. **A few pieces floating clear.** Two or three off the stack with air under
 *    them. The reference does it and it is what stops the pile reading as a
 *    solid lump with a jagged top edge.
 *
 * Each page gets its own so the three do not look like one image reused, and
 * each is built out of blocks that mean something on that page: things you
 * play with, things you build with, things you send.
 */
const PILES: Record<string, Piece[]> = {
  /**
   * /play - the loud one. Crates and barrels to knock about, a melon and an
   * apple because the café serves them, dynamite near the top because a heap
   * with a joke in it is a heap somebody looks at twice.
   */
  play: [
    { model: 'stone', x: -1.1, y: -2.2, z: 0.6, rotY: 0.31 },
    { model: 'bricks_A', x: 1.0, y: -2.2, z: -0.5, rotY: -0.22 },
    { model: 'crate', x: 0.2, y: -2.2, z: 1.9, rotY: 0.74, scale: 0.92 },
    { model: 'barrel', x: -1.4, y: -0.3, z: -0.2, rotY: 0.52, scale: 1.05 },
    { model: 'colored_block_red', x: 0.7, y: -0.35, z: 0.9, rotY: -0.61 },
    { model: 'hay_bale', x: 1.9, y: -0.4, z: -1.4, rotY: 0.18, scale: 0.85 },
    { model: 'striped_block_yellow', x: -0.3, y: 1.5, z: 0.1, rotY: 0.95, scale: 0.9 },
    { model: 'melon', x: 1.3, y: 1.4, z: 1.1, rotY: -0.4, scale: 0.72 },
    { model: 'apple', x: -1.9, y: 1.6, z: 1.4, rotY: 0.66, scale: 0.6 },
    // The three that float. Small, high, and well clear of the stack.
    { model: 'dynamite', x: 0.1, y: 3.2, z: -0.4, rotY: 1.2, scale: 0.66 },
    { model: 'colored_block_blue', x: 2.4, y: 2.6, z: 0.8, rotY: -0.85, scale: 0.5 },
    { model: 'gift', x: -2.3, y: 3.4, z: -0.9, rotY: 0.42, scale: 0.55 },
  ],

  /**
   * /create - the workshop. Ground and building material at the base, the
   * things you make with above it, and a tree on top because it is the one
   * model in the pack with an organic outline and it breaks the geometry up.
   */
  create: [
    { model: 'dirt_with_grass', x: -1.2, y: -2.2, z: 0.4, rotY: 0.14 },
    { model: 'gravel', x: 0.9, y: -2.2, z: -0.7, rotY: -0.37 },
    { model: 'wood', x: 0.1, y: -2.2, z: 1.8, rotY: 0.63, scale: 0.95 },
    { model: 'metalframe', x: -1.5, y: -0.3, z: -0.4, rotY: 0.48 },
    { model: 'prototype', x: 0.8, y: -0.35, z: 0.8, rotY: -0.71, scale: 1.02 },
    { model: 'pipe', x: 2.0, y: -0.4, z: -1.5, rotY: 0.88, scale: 0.9 },
    { model: 'computer', x: -0.4, y: 1.5, z: 0.2, rotY: 0.24, scale: 0.88 },
    { model: 'books_A', x: 1.4, y: 1.4, z: 1.0, rotY: -0.55, scale: 0.78 },
    { model: 'tree', x: -2.0, y: 1.8, z: 1.2, rotY: 0.33, scale: 0.7 },
    { model: 'anvil', x: 0.2, y: 3.1, z: -0.5, rotY: 1.05, scale: 0.62 },
    { model: 'decorative_block_green', x: 2.5, y: 2.7, z: 0.7, rotY: -0.9, scale: 0.48 },
    { model: 'battery', x: -2.4, y: 3.3, z: -0.8, rotY: 0.58, scale: 0.5 },
  ],

  /**
   * /share - the things you hand somebody. A chest and a vault at the base
   * because they are the two models that read as "kept", gifts above them,
   * and glass near the top for the one translucent piece in the pack.
   */
  share: [
    { model: 'stone_dark', x: -1.15, y: -2.2, z: 0.5, rotY: -0.28 },
    { model: 'chest', x: 1.0, y: -2.2, z: -0.6, rotY: 0.41, scale: 0.95 },
    { model: 'bricks_B', x: 0.15, y: -2.2, z: 1.85, rotY: 0.69 },
    { model: 'vault', x: -1.45, y: -0.3, z: -0.3, rotY: 0.56, scale: 0.98 },
    { model: 'gift', x: 0.75, y: -0.35, z: 0.85, rotY: -0.64, scale: 1.0 },
    { model: 'stone_with_gold', x: 1.95, y: -0.4, z: -1.45, rotY: 0.2, scale: 0.88 },
    { model: 'decorative_block_blue', x: -0.35, y: 1.5, z: 0.15, rotY: 0.91, scale: 0.9 },
    { model: 'glass', x: 1.35, y: 1.45, z: 1.05, rotY: -0.44, scale: 0.85 },
    { model: 'books_B', x: -1.95, y: 1.6, z: 1.3, rotY: 0.6, scale: 0.72 },
    { model: 'gift', x: 0.15, y: 3.2, z: -0.45, rotY: 1.15, scale: 0.6 },
    { model: 'stone_with_silver', x: 2.45, y: 2.6, z: 0.75, rotY: -0.8, scale: 0.5 },
    { model: 'battery', x: -2.35, y: 3.35, z: -0.85, rotY: 0.46, scale: 0.52 },
  ],
}

/**
 * How much of the frame the pile fills.
 *
 * `fit` rather than `cap`: unlike a palette of blocks, where relative size is
 * the information, a pile is one object and wants to fill its picture. The
 * number is the extent it is scaled to, and 2.6 leaves a margin so the glow the
 * page puts behind it is not cropped by the image's own edge.
 */
const FRAME = { mode: 'fit', extent: 2.6 } as const

const requested = process.argv.slice(2)
const names = requested.length > 0 ? requested : Object.keys(PILES)

mkdirSync(OUT_DIR, { recursive: true })

for (const name of names) {
  const pieces = PILES[name]
  if (!pieces) {
    console.error(`no pile called "${name}" — try: ${Object.keys(PILES).join(', ')}`)
    process.exit(1)
  }

  // One flat list of world-space triangles for the whole heap. The z-buffer in
  // `render` is what resolves the overlaps, so nothing here has to be sorted.
  const triangles: Triangle[] = []
  for (const piece of pieces) {
    triangles.push(
      ...loadTriangles(path.join(GLTF_DIR, `${piece.model}.gltf`), {
        x: piece.x,
        y: piece.y,
        z: piece.z,
        rotY: piece.rotY,
        scale: piece.scale,
      }),
    )
  }

  const image = render(triangles, {
    size: 1024,
    // Four rather than the default three: the piece edges are the whole read of
    // a low-poly heap, and at 1024 a three-tap box filter still leaves a visible
    // stair on the long diagonals.
    supersample: 4,
    eye: EYE,
    fov: FOV_DEG,
    frame: FRAME,
  })

  const out = path.join(OUT_DIR, `${name}.png`)
  writeFileSync(out, encodePng(image))

  const covered = image.data.filter((_, i) => i % 4 === 3 && image.data[i] > 0).length
  const fill = ((covered / (image.width * image.height)) * 100).toFixed(1)
  console.log(
    `${name}: ${pieces.length} pieces, ${triangles.length} tris → ${path.basename(out)} (${fill}% covered)`,
  )
}
