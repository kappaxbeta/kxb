/**
 * Measures every house catalog entry against the square it stands in.
 *
 *     bun run scripts/prop-bounds.ts          # everything
 *     bun run scripts/prop-bounds.ts --loose  # only the ones sitting wrong
 *     bun run scripts/prop-bounds.ts couch    # a few entries
 *
 * This exists because the Tiny Treats pack is modelled to a tidy square but not
 * to a full one. A bookcase is half a unit shallower than its two-unit square,
 * so drawing it centred leaves a gap behind it; a toilet is deeper, so drawing
 * it centred buries its cistern in the wallpaper. Neither is visible in the
 * catalog - both are extremely visible in the house.
 *
 * So rather than eyeballing furniture against walls, this reads the geometry
 * and prints the `nudge.z` each entry wants: the shove that puts its back face
 * on the wall's inner skin. Paste the number into the entry. Re-run after
 * changing an entry's model, extras, depth or width.
 *
 * `over` is the other half of the report - how far the model spills out of its
 * footprint sideways. A little is fine and intended (a sofa's arms overhang by
 * design, and the pack's tables are drawn to the full two units). A lot means
 * the entry has its `depth` and `width` the wrong way round, which is what a
 * sofa reserving the square behind it while hanging over the ones beside it
 * turned out to be.
 */

import path from 'node:path'
import {
  depthOf,
  HOME_PROPS,
  type HomeProp,
  modelUrl,
  WALL_SKIN,
  widthOf,
} from '@/domain/home/catalog'
import { TILE } from '@/domain/world/grid'
import { loadTriangles, type Placement } from './gltf-raster'

const PUBLIC = path.join(import.meta.dir, '..', 'public')

/** The axis-aligned box a whole entry occupies, extras included. */
interface Box {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  maxY: number
}

function boxOf(def: HomeProp): Box {
  const parts: { model: string; placement: Placement }[] = [
    { model: def.model, placement: {} },
    ...(def.extras ?? []).map((extra) => ({
      model: extra.model,
      placement: extra as Placement,
    })),
  ]

  const box: Box = {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
    maxY: -Infinity,
  }

  for (const part of parts) {
    const file = path.join(PUBLIC, modelUrl(part.model))
    for (const triangle of loadTriangles(file, part.placement)) {
      for (const [x, y, z] of triangle.p) {
        box.minX = Math.min(box.minX, x)
        box.maxX = Math.max(box.maxX, x)
        box.minZ = Math.min(box.minZ, z)
        box.maxZ = Math.max(box.maxZ, z)
        box.maxY = Math.max(box.maxY, y)
      }
    }
  }

  return box
}

const wanted = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const looseOnly = process.argv.includes('--loose')

const entries = wanted.length
  ? HOME_PROPS.filter((def) => wanted.includes(def.id))
  : HOME_PROPS

/** Anything under this reads as flush, and a nudge would be noise. */
const SNUG = 0.1

for (const def of entries) {
  const box = boxOf(def)

  // Half the footprint, which is where the model's own space has its edges once
  // `drawOffset` has centred it across whatever squares it covers.
  const halfDeep = (depthOf(def) * TILE) / 2
  const halfWide = (widthOf(def) * TILE) / 2

  // Back face onto the wall's inner skin, measured from wherever it is now.
  const nudge = halfDeep - WALL_SKIN - box.maxZ
  const drift = nudge - (def.nudge?.z ?? 0)
  const over = Math.max(0, box.maxX - halfWide, -box.minX - halfWide)

  if (looseOnly && Math.abs(drift) < SNUG && over < SNUG) continue

  console.log(
    [
      def.id.padEnd(18),
      `${depthOf(def)}x${widthOf(def)}`,
      `deep ${(box.maxZ - box.minZ).toFixed(2)}`.padEnd(10),
      `wide ${(box.maxX - box.minX).toFixed(2)}`.padEnd(10),
      `nudge.z ${nudge >= 0 ? ' ' : ''}${nudge.toFixed(2)}`,
      Math.abs(drift) < SNUG ? '        ' : '  <- set',
      over >= SNUG ? `  over ${over.toFixed(2)}` : '',
    ].join(' '),
  )
}
