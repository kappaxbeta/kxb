/**
 * Shoots the lounge's block models to PNGs for the landing page.
 *
 *     bun run scripts/render-blocks.ts <model> [model…]
 *
 * Reads `public/xo/bb10/gltf/<model>.gltf` and writes
 * `public/xo/blocks/<model>.png` — transparent background, same three-quarter
 * camera the in-app block picker uses, so a block on the landing page is the
 * same object you place in the lounge.
 *
 * The output is deliberately close to `block-thumbnails.ts` (same camera, same
 * light rig) but not pixel-identical to it, and does not need to be: one draws
 * 128px icons in a palette, this draws 512px art for a marketing page. The
 * renderer itself lives in `gltf-raster.ts`, which explains why it exists.
 */

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { loadTriangles, render, type Vec3 } from './gltf-raster'
import { encodePng } from './png'

const GLTF_DIR = path.join(import.meta.dir, '..', 'public', 'xo', 'bb10', 'gltf')
const OUT_DIR = path.join(import.meta.dir, '..', 'public', 'xo', 'blocks')

/** Camera, matching the block picker's. */
const EYE: Vec3 = [4.2, 3.4, 4.2]
const FOV_DEG = 30

/**
 * Nothing bigger than this is allowed to fill the frame.
 *
 * Blocks are 2 units cubed and the camera is framed for them, so this is a
 * no-op for almost everything. It exists for the few props (the tree) that are
 * taller than a cell and would otherwise have their tops cropped off — those
 * shrink to fit, and everything else keeps its true relative size.
 */
const MAX_EXTENT = 2.4

const MODELS = process.argv.slice(2)
if (MODELS.length === 0) {
  console.error('usage: bun run scripts/render-blocks.ts <model> [model…]')
  process.exit(1)
}

for (const model of MODELS) {
  const triangles = loadTriangles(path.join(GLTF_DIR, `${model}.gltf`))
  const image = render(triangles, {
    size: 512,
    eye: EYE,
    fov: FOV_DEG,
    frame: { mode: 'cap', extent: MAX_EXTENT },
  })
  const out = path.join(OUT_DIR, `${model}.png`)
  writeFileSync(out, encodePng(image))
  const covered = image.data.filter((_, i) => i % 4 === 3 && image.data[i] > 0).length
  console.log(`${model}: ${triangles.length} tris → ${path.basename(out)} (${covered} px covered)`)
}
