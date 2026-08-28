#!/usr/bin/env bun
/**
 * Shoots every model in the XP catalogue to a WebP thumbnail.
 *
 *     bun run xp:thumbs           # everything that has no picture yet
 *     bun run xp:thumbs --all     # redraw all of them
 *     bun run xp:thumbs proto     # one pack
 *
 * Writes `public/xp/thumbs/<pack>/<name>.webp`.
 *
 * Provenance: copied from scripts/render-models.ts, which does the same job for
 * the world builder. Its own copy for the same reason the pack table is:
 * framing and camera are judgement calls about *this* picker, and the two
 * pickers show different things. The builder's runs from a teacup to a house
 * and fits every tile to the frame; this one is mostly walls and floors at one
 * scale, so capping rather than fitting keeps a half wall visibly half.
 *
 * The renderer is the software rasterizer in ./gltf-raster.ts, so this needs no
 * browser and no GPU: it produces the same bytes on any machine.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { CATALOGUE } from '@kxb/xp/catalogue'
import { modelUrl } from '@kxb/xp/packs'
import { loadTriangles, render, type Vec3 } from './gltf-raster'

const ROOT = path.join(import.meta.dir, '..')
const PUBLIC = path.join(ROOT, 'public')
const OUT = path.join(PUBLIC, 'xp', 'thumbs')

/** Delivered size. The picker's tiles are ~96px, so this survives a retina screen. */
const SIZE = 192

/** A three-quarter camera, the same one every thumbnail script in here uses. */
const EYE: Vec3 = [4.2, 3.4, 4.2]
const FOV_DEG = 30

/**
 * Nearly overhead, for the models that have no height.
 *
 * The three-quarter camera exists to show a thing's *shape*, and it does that
 * by seeing three of its faces. A model with one face and no thickness has no
 * three faces to see, so all that view does is foreshorten it: the shapes pack
 * came out with its square drawn as a diamond and its diamond drawn as a
 * lopsided trapezoid, which is a picker lying about what you are about to
 * place.
 *
 * Not *exactly* overhead, because `lookAt` builds its basis by crossing a
 * hard-coded `[0, 1, 0]` with the eye direction and a camera straight above the
 * origin makes that cross product zero. The nine degrees off vertical costs
 * about one and a half percent of the width and keeps the matrix real.
 *
 * It is not only the shapes pack. `size.h` is clamped to a centimetre by
 * `extent`, so this catches everything that measured flat or nearly so - the
 * board game kit's 74 playing cards and tiles, the prototype kit's floor
 * indicators, a handful of forest and medieval decals - and every one of those
 * is a thing whose whole content is printed on one face.
 */
const FLAT_EYE: Vec3 = [0, 5.4, 0.9]

/** The floor `extent` clamps to, which is what "measured no height at all" reads as. */
const FLAT = 0.01

/**
 * How much of the frame a thumbnail fills.
 *
 * `fit`, so every tile fills its frame.
 *
 * This was `cap` at first, on the argument that a construction set wants true
 * relative scale: `Primitive_Wall` and `Primitive_Wall_Half` are the same wall
 * at two sizes, and fitting each to the frame draws them identically, which is
 * a picker showing two tiles that look the same and behave differently.
 *
 * The argument is right and capping is the wrong instrument for it. This pack
 * runs from a 0.2-unit bullet to a 4-unit cube - a twentyfold range - so a
 * frame wide enough for the cube draws the bullet at a handful of pixels, and
 * the first render came out as eighty-odd near-empty tiles. Scale information
 * is worth having and it is not worth paying for with legibility.
 *
 * So the size is written on the tile instead, out of the measured bounds the
 * catalogue now carries. Type says "2 x 4 x 1" more precisely than a picture
 * ever could, and the picture gets the whole frame to say what the thing *is*.
 */
const FRAME_EXTENT = 2.6

const args = process.argv.slice(2)
const all = args.includes('--all')
const packs = new Set(args.filter((arg) => !arg.startsWith('--')))

let written = 0
let skipped = 0
const broken: string[] = []

for (const entry of CATALOGUE) {
  if (packs.size > 0 && !packs.has(entry.packId)) continue

  const file = path.join(OUT, entry.packId, `${entry.name}.webp`)
  if (!all && existsSync(file)) {
    skipped += 1
    continue
  }

  const source = path.join(PUBLIC, modelUrl(entry.id).replace(/^\//, ''))

  try {
    const triangles = loadTriangles(source)
    if (triangles.length === 0) {
      broken.push(entry.id)
      continue
    }

    const image = render(triangles, {
      size: SIZE,
      eye: entry.size.h <= FLAT ? FLAT_EYE : EYE,
      fov: FOV_DEG,
      frame: { mode: 'fit', extent: FRAME_EXTENT },
    })

    const webp = await sharp(Buffer.from(image.data), {
      raw: { width: image.width, height: image.height, channels: 4 },
    })
      // Lossless: these are flat-shaded colour on transparency, which is the
      // one thing lossy WebP is bad at - and they come out smaller this way.
      .webp({ lossless: true, effort: 6 })
      .toBuffer()

    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, webp)
    written += 1
  } catch (err) {
    broken.push(`${entry.id} (${(err as Error).message})`)
  }
}

console.log(`\n  ${written} drawn, ${skipped} already there → ${path.relative(ROOT, OUT)}/`)
if (broken.length > 0) {
  console.log(`  ${broken.length} could not be drawn:`)
  for (const id of broken) console.log(`    ${id}`)
}
