#!/usr/bin/env bun
/**
 * Lists every model the XP creator ships, so its picker can offer all of them.
 *
 *     bun run xp:catalogue
 *
 * Run it after adding or removing an XP asset pack. The output is checked in.
 *
 * ---------------------------------------------------------------------------
 * Its own script, not a flag on build-catalogue.ts
 * ---------------------------------------------------------------------------
 * Provenance: copied from scripts/build-catalogue.ts. The obvious alternative
 * was one script emitting both files, and it is the wrong shape: the two walk
 * different directories, from different pack tables, into different generated
 * files, and the only thing they share is thirty lines of `readdir` and
 * `JSON.stringify`. Sharing those would put the XP creator's asset pipeline
 * inside the builder's, which is exactly the coupling this whole domain exists
 * to avoid - a change to how XP packs are laid out would then be a change to
 * the tool that draws the marketing worlds.
 *
 * ---------------------------------------------------------------------------
 * Why this is generated and not read at runtime
 * ---------------------------------------------------------------------------
 * A route handler doing `readdir` would be shorter and never go stale. It
 * would also be a server surface whose answer depends on the filesystem of
 * whichever container served it, and the creator needs the list in the browser
 * - to search it, to group it, to draw a thumbnail of each one - so a runtime
 * read means a fetch, a loading state and an error state for a list that only
 * changes when somebody adds a pack.
 *
 * Checked in, the list is a plain import and a diff in the pull request shows
 * exactly which models arrived. The staleness risk is real and the test beside
 * the generated file is the answer to it: it walks `public/xp/packs` and fails
 * if the two disagree.
 */

import { readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { PACK_ORDER, PACKS } from '@kxb/xp/packs'
import { listDrawnNodes, loadTriangles } from './gltf-raster'
import { voxelise, type VoxelMask } from './voxelise'

const ROOT = path.join(import.meta.dir, '..')
const PUBLIC = path.join(ROOT, 'public')
const OUT = path.join(ROOT, 'packages', 'xp', 'src', 'assets', 'catalogue.generated.ts')

/**
 * A model, and how big it is in its own authored units.
 *
 * The measurement is here rather than in a separate table because everything
 * downstream needs it and none of it can afford to read geometry at runtime:
 *
 *  - the picker prints the footprint, which is the only way to tell
 *    `Primitive_Wall` from `Primitive_Wall_Half` in a square tile;
 *  - `y0` below zero means the model is pivoted at its middle rather than stood
 *    on the floor, which decides whether a blueprint made from it needs
 *    lifting;
 *  - auto-collision is a box from exactly these numbers.
 *
 * That last one is the reason this is measured at build time and checked in.
 * Deriving a collider at runtime means parsing a glTF to answer "can I walk
 * here", in the frame where the answer is needed.
 */
export interface ModelEntry {
  name: string
  /**
   * The box's minimum corner, in authored units, relative to the model's own
   * origin.
   *
   * Not derivable from the size, which is why it is stored. The prototype kit
   * centres most things horizontally (a four-wide wall runs -2..2) but not all
   * of them: a door is hinged, so it runs 0..1.6 and swings about its edge.
   * Assuming the centre would put every door half a metre into the wall beside
   * it, and a collision box in the wrong place is worse than none.
   */
  x0: number
  y0: number
  z0: number
  /** Bounding box in authored units, before the pack's scale. */
  w: number
  h: number
  d: number
  /**
   * Which cells the geometry actually fills, when that is not simply the box.
   *
   * Absent for the majority - a crate fills its box, a wall fills its box - and
   * present for the pieces whose shape is the point: stairs, doorways, slopes,
   * anything with a hole in it. See ./voxelise for why a box was not enough.
   */
  mask?: VoxelMask
  /**
   * The mesh-bearing nodes inside this model's own `.glb`, when there is more
   * than one.
   *
   * Absent for the overwhelming majority - one mesh, one node - and present
   * for the handful built as a single file with moving parts inside it: a fan,
   * a valve, a turret modelled whole rather than as `Part`s. This is what lets
   * a blueprint's `spin` name one of them without the editor ever opening a
   * `.glb` itself - see `scripts/gltf-raster.ts`'s `listDrawnNodes`.
   */
  nodes?: string[]
}

/** Three decimals: enough to tell 0.456 from 0.463, small enough to read. */
const round = (v: number) => Math.round(v * 1000) / 1000

/** One model's bounds and shape, from its world-space triangles. */
function measure(file: string, scale: number): Omit<ModelEntry, 'name'> | null {
  const triangles = loadTriangles(file)
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const tri of triangles) {
    for (const p of tri.p) {
      for (let i = 0; i < 3; i++) {
        if (p[i] < min[i]) min[i] = p[i]
        if (p[i] > max[i]) max[i] = p[i]
      }
    }
  }
  if (!Number.isFinite(min[0])) return null

  const bounds = {
    x0: round(min[0]),
    y0: round(min[1]),
    z0: round(min[2]),
    w: round(max[0] - min[0]),
    h: round(max[1] - min[1]),
    d: round(max[2] - min[2]),
  }

  const mask = voxelise(triangles, bounds, scale)
  const nodes = listDrawnNodes(file)
  return {
    ...bounds,
    ...(mask ? { mask } : {}),
    ...(nodes.length > 1 ? { nodes } : {}),
  }
}

/**
 * The models in one pack, sorted and measured.
 *
 * Sorted rather than left in directory order because directory order is the
 * filesystem's business and differs between machines - which would make this
 * file churn in the diff every time somebody regenerated it on another OS.
 */
export function readPack(packId: string): ModelEntry[] {
  const pack = PACKS[packId]
  const dir = path.join(PUBLIC, pack.path)
  const names: string[] = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(pack.ext)) continue
    const bare = entry.name.slice(0, -pack.ext.length)
    if (pack.prefix) {
      if (!bare.startsWith(pack.prefix)) continue
      names.push(bare.slice(pack.prefix.length))
    } else {
      names.push(bare)
    }
  }

  const models: ModelEntry[] = []
  for (const name of names.sort()) {
    const file = path.join(dir, `${pack.prefix ?? ''}${name}${pack.ext}`)
    const bounds = measure(file, pack.scale)
    if (!bounds) {
      console.log(`  !! ${packId}/${name} has no geometry - skipped`)
      continue
    }
    models.push({ name, ...bounds })
  }

  return models
}

/** Every pack's models, in `PACK_ORDER`. Exported so the drift test can reuse it. */
export function readCatalogue(): { packId: string; models: ModelEntry[] }[] {
  return PACK_ORDER.map((packId) => ({ packId: packId as string, models: readPack(packId) }))
}

function main(): void {
  const packs = readCatalogue()
  const total = packs.reduce((sum, pack) => sum + pack.models.length, 0)
  const centred = packs.reduce(
    (sum, pack) => sum + pack.models.filter((m) => m.y0 < -0.01).length,
    0,
  )
  const masked = packs.reduce((sum, pack) => sum + pack.models.filter((m) => m.mask).length, 0)
  const noded = packs.reduce((sum, pack) => sum + pack.models.filter((m) => m.nodes).length, 0)

  const body = packs
    .map(
      ({ packId, models }) =>
        `  ${JSON.stringify(packId)}: [\n${models
          .map((m) => {
            const nodes = m.nodes ? `, nodes: ${JSON.stringify(m.nodes)}` : ''
            const mask = m.mask
              ? `, mask: { nx: ${m.mask.nx}, ny: ${m.mask.ny}, nz: ${m.mask.nz}, ` +
                `x0: ${m.mask.x0}, y0: ${m.mask.y0}, z0: ${m.mask.z0}, ` +
                `bits: ${JSON.stringify(m.mask.bits)} }`
              : ''
            return (
              `    { name: ${JSON.stringify(m.name)}, x0: ${m.x0}, y0: ${m.y0}, z0: ${m.z0}, ` +
              `w: ${m.w}, h: ${m.h}, d: ${m.d}${nodes}${mask} },`
            )
          })
          .join('\n')}\n  ],`,
    )
    .join('\n')

  writeFileSync(
    OUT,
    `// Generated by scripts/xp-catalogue.ts. Do not edit by hand.
//
// ${total} models across ${packs.length} packs, measured in authored units -
// \`modelUrl\` in ./packs.ts turns a pack id and a name into a path, and the
// pack's own \`scale\` puts these numbers onto the one-metre cell.
//
// \`y0\` below zero means the model is drawn around its own centre rather than
// stood on the floor. ${centred} of them are, and they are the things that hang
// off a socket or a wall - the guns, the ammo, the coins, the barrels.

export interface VoxelMask {
  /** Grid size, in cells. */
  nx: number
  ny: number
  nz: number
  /** Where cell (0,0,0) sits, in the model's own units. */
  x0: number
  y0: number
  z0: number
  /** One bit per cell, \`x + nx * (y + ny * z)\`, as hex. */
  bits: string
}

export interface ModelSize {
  name: string
  /** The box's minimum corner, relative to the model's own origin. */
  x0: number
  y0: number
  z0: number
  /** Bounding box in authored units, before the pack's scale. */
  w: number
  h: number
  d: number
  /** The mesh-bearing nodes inside this model's own \`.glb\`, when there is more than one. */
  nodes?: string[]
  /** Cells the geometry really fills, when that is not simply the box. */
  mask?: VoxelMask
}

export const PACK_MODELS: Record<string, readonly ModelSize[]> = {
${body}
}
`,
  )

  for (const { packId, models } of packs) {
    console.log(`${packId.padEnd(14)} ${String(models.length).padStart(5)}`)
  }
  console.log(`${'total'.padEnd(14)} ${String(total).padStart(5)}  ->  ${path.relative(ROOT, OUT)}`)
  console.log(`${'centred'.padEnd(14)} ${String(centred).padStart(5)}  (pivoted at their middle)`)
  console.log(`${'shaped'.padEnd(14)} ${String(masked).padStart(5)}  (a mask, not just a box)`)
  console.log(`${'noded'.padEnd(14)} ${String(noded).padStart(5)}  (more than one drawable node)`)
}

if (import.meta.main) main()
