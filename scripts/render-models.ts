#!/usr/bin/env bun
/**
 * Shoots every model in the builder's catalogue to a WebP thumbnail.
 *
 *     bun run models:thumbs           # everything that has no picture yet
 *     bun run models:thumbs --all     # redraw all 1,308, even the ones that exist
 *     bun run models:thumbs park      # one pack
 *
 * Writes `public/thumbs/builder/<pack>/<name>.webp`.
 *
 * ---------------------------------------------------------------------------
 * Why these are files and not drawn in the browser
 * ---------------------------------------------------------------------------
 * The builder's model picker used to draw its own tiles: a hidden WebGL
 * context, a queue, and one glTF downloaded and parsed per tile as it scrolled
 * into view. It is a careful piece of work and it was the right call when the
 * only other option was fetching a few hundred megabytes of geometry up front -
 * but what it costs is a *download and a parse per tile*, which is why opening
 * the picker and scrolling feels like waiting rather than like browsing.
 *
 * These files cost two or three kilobytes each, are cached by the browser
 * across sessions, and are the same for everybody - so the picker draws
 * instantly and pays nothing. It is exactly the argument
 * `scripts/render-props.ts` makes for the lounge's 58 blocks, and it applies
 * with 1,308 times the force.
 *
 * The renderer is the software rasterizer in ./gltf-raster.ts, so this needs no
 * browser and no GPU: `bun run models:thumbs` on any machine produces the same
 * bytes.
 *
 * Re-run after adding a pack. The live renderer is still in the picker as the
 * fallback for anything with no file, so a missing thumbnail is a slow tile
 * rather than a hole.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { CATALOGUE } from '../src/domain/builder/catalogue'
import { builderUrl } from '../src/domain/builder/packs'
import { loadTriangles, render, type Vec3 } from './gltf-raster'

const ROOT = path.join(import.meta.dir, '..')
const PUBLIC = path.join(ROOT, 'public')
const OUT = path.join(PUBLIC, 'thumbs', 'builder')

/** Delivered size. The picker's tiles are ~96px, so this survives a retina screen. */
const SIZE = 192

/** The same three-quarter camera the other thumbnail scripts use, so the packs match. */
const EYE: Vec3 = [4.2, 3.4, 4.2]
const FOV_DEG = 30

/**
 * How much of the frame a thumbnail fills.
 *
 * Fitted rather than at true scale, for the reason render-props gives: the
 * catalogue runs from a teacup to a house, and at true scale the teacup is one
 * pixel. A picker is a list of *what* things are, and each tile gets the whole
 * frame to say it.
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

  const source = path.join(PUBLIC, builderUrl(entry.id).replace(/^\//, ''))

  try {
    const triangles = loadTriangles(source)
    if (triangles.length === 0) {
      broken.push(entry.id)
      continue
    }

    const image = render(triangles, {
      size: SIZE,
      eye: EYE,
      fov: FOV_DEG,
      frame: { mode: 'fit', extent: FRAME_EXTENT },
    })

    const webp = await sharp(Buffer.from(image.data), {
      raw: { width: image.width, height: image.height, channels: 4 },
    })
      // Lossless, like the block thumbnails: these are flat-shaded colour on
      // transparency, which is the one thing lossy WebP is bad at - and they
      // come out smaller this way anyway.
      .webp({ lossless: true, effort: 6 })
      .toBuffer()

    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, webp)
    written += 1

    if (written % 100 === 0) console.log(`  ${written} drawn…`)
  } catch (error) {
    // A pack we ship but cannot parse is worth naming rather than crashing on:
    // the picker falls back to drawing that one in the browser.
    broken.push(`${entry.id} (${error instanceof Error ? error.message : 'unknown'})`)
  }
}

console.log(`\n  ${written} drawn, ${skipped} already there → public/thumbs/builder/`)
if (broken.length > 0) {
  console.log(`  ${broken.length} could not be drawn:`)
  for (const id of broken.slice(0, 20)) console.log(`    ${id}`)
}
