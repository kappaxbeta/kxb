#!/usr/bin/env bun
/**
 * Draws an XP document to a PNG, without a browser.
 *
 *     bun run xp:shot first-room                 # from above, the whole level
 *     bun run xp:shot first-room --eye           # from the spawn, looking where it faces
 *     bun run xp:shot first-room --fast          # grainy and quick
 *     bun run xp:shot first-room --out /tmp/a.png
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 * The runtime cannot be looked at where it is developed. The Browser pane is
 * always `document.hidden`, so `requestAnimationFrame` never fires, so a canvas
 * in it stays black and a game loop never ticks - which means "does the level
 * look right" is a question the usual tools cannot answer at all.
 *
 * `bun test` covers whether the world is *walkable*: the document parses, the
 * cells rasterise, the spawn is clear, the walls stop you. This covers the
 * other half, which no assertion is going to catch - a wall facing the wrong
 * way, a barrel buried in the floor, a room that is a corridor because two
 * pieces overlap.
 *
 * It draws through the same transform the renderer uses - the pack's scale, the
 * pack's lift times the placement's own scale and its y stretch, the rotation in
 * degrees, the per-axis stretch - so a disagreement between this picture and the
 * running scene is a bug in one of them rather than two implementations
 * drifting. That is also why it reads the real document and the real catalogue
 * rather than taking a fixture.
 *
 * The stretch was the one that had drifted, and it drifted the way the paragraph
 * above says it would: `instances.tsx` had squashed and stretched pieces since
 * the field arrived and this had never heard of it, so a tile flattened to a
 * decal was drawn as the slab it was authored as - a picture confidently saying
 * the level was wrong about the one thing it was right about.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { describeProblems, parseXp, type XpDocument } from '@kxb/xp'
import { floorOffset } from '@kxb/xp/catalogue'
import { drawList, spawnEntities } from '@kxb/xp/engine'
import { modelUrl, splitModel } from '@kxb/xp/packs'
import { EYE_HEIGHT } from '@kxb/xp/engine'
import { loadTriangles, render, type Triangle, type Vec3 } from './gltf-raster'

const ROOT = path.join(import.meta.dir, '..')
const PUBLIC = path.join(ROOT, 'public')
const XPS = path.join(PUBLIC, 'xp', 'xps')

const args = process.argv.slice(2)
const id = args.find((a) => !a.startsWith('--')) ?? 'first-room'
const fromEye = args.includes('--eye')
/** Grainy and quick, for checking a level rather than showing it. */
const fast = args.includes('--fast')
const outFlag = args.indexOf('--out')
const out =
  outFlag >= 0 && args[outFlag + 1]
    ? args[outFlag + 1]
    : path.join(PUBLIC, 'xp', 'shots', `${id}${fromEye ? '-eye' : ''}.png`)

const file = path.join(XPS, `${id}.xp.json`)
if (!existsSync(file)) {
  console.error(`No such XP: ${path.relative(ROOT, file)}`)
  process.exit(1)
}

const parsed = parseXp(JSON.parse(readFileSync(file, 'utf8')))
if (!parsed.ok) {
  console.error(`${id} was refused:\n${describeProblems(parsed.problems)}`)
  process.exit(1)
}

const xp: XpDocument = parsed.document

/**
 * Every placement and every entity, flattened into world-space triangles.
 *
 * The two go through the same transform because they *are* the same transform -
 * the only difference is that an entity's position is fractional. A shot that
 * drew only the architecture would be a shot that could not show a crate in the
 * wrong place, which is most of what goes wrong in a level.
 */
const triangles: Triangle[] = []
let missing = 0

const entities = drawList(spawnEntities(xp), xp.blueprints).map((entity) => ({
  model: entity.model,
  x: entity.x,
  y: entity.y,
  z: entity.z,
  rotation: entity.rotation,
  scale: entity.scale,
  ...(entity.stretch ? { stretch: entity.stretch } : {}),
}))

for (const placement of [...xp.world.placements, ...entities]) {
  const pack = splitModel(placement.model)?.pack
  if (!pack) {
    missing += 1
    continue
  }
  const source = path.join(PUBLIC, modelUrl(placement.model).replace(/^\//, ''))
  triangles.push(
    ...loadTriangles(source, {
      x: placement.x,
      // The lift scales with the placement, not with the pack - the same rule
      // the instanced renderer follows, and the reason it is spelled out in
      // both places rather than shared: they are different implementations of
      // one convention, and the convention is what has to agree.
      //
      // Through the y stretch too, for the same reason `instances.tsx` puts it
      // there: the lift is a fraction of the model's own height, so a piece
      // squashed flat is lifted by proportionally less.
      y:
        placement.y +
        (pack.lift + floorOffset(placement.model)) *
          placement.scale *
          (placement.stretch?.y ?? 1),
      z: placement.z,
      rotY: (placement.rotation * Math.PI) / 180,
      scale: pack.scale * placement.scale,
      ...(placement.stretch ? { stretch: placement.stretch } : {}),
    }),
  )
}

/** How far the level reaches, for framing. */
let reach = 4
for (const placement of xp.world.placements) {
  reach = Math.max(reach, Math.abs(placement.x), Math.abs(placement.z))
}

const eye: Vec3 = fromEye
  ? /**
     * Standing at the spawn.
     *
     * Not a true first-person view - `render` always looks at the origin - but
     * near enough to answer what a player sees on arrival, which is the thing
     * worth checking before anybody walks in.
     */
    [xp.spawn.x, xp.spawn.y + EYE_HEIGHT, xp.spawn.z]
  : /**
     * High and steep, on purpose.
     *
     * The first framing sat level with the tops of the walls, which looks
     * pleasant and hides half the level: the near wall occludes everything in
     * the front row, so a barrel that is not being drawn and a barrel behind a
     * wall are the same picture. Looking down over the walls is what makes this
     * a check rather than a photograph.
     */
    [reach * 1.5, reach * 3.2, reach * 1.8]

const image = render(triangles, {
  size: fast ? 500 : 900,
  // Three samples a pixel is what the thumbnail scripts use and it is slow: a
  // 900px shot is a 2700px raster in software, which is a minute and a half for
  // a room. One is grainy and takes seconds, which is the right trade while
  // iterating on a level.
  supersample: fast ? 1 : 3,
  eye,
  fov: fromEye ? 75 : 34,
  // True scale, not fitted: a piece drawn at the wrong size is exactly what
  // this is here to catch, and fitting the frame would hide it.
  frame: { mode: 'cap', extent: reach * 3 },
})

mkdirSync(path.dirname(out), { recursive: true })
const png = await sharp(Buffer.from(image.data), {
  raw: { width: image.width, height: image.height, channels: 4 },
})
  // DESIGN.md's `sky` token, the same background the running scene uses, so a
  // shot and a screenshot are comparable.
  .flatten({ background: '#02000b' })
  .png()
  .toBuffer()
writeFileSync(out, png)

console.log(
  `${xp.name}: ${xp.world.placements.length} placements, ${entities.length} entities, ` +
    `${triangles.length} triangles` +
    `${missing > 0 ? `, ${missing} missing` : ''} -> ${path.relative(ROOT, out)}`,
)
