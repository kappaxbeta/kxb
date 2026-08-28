/**
 * Which cells does a model's geometry actually occupy?
 *
 * ---------------------------------------------------------------------------
 * Why a bounding box was not enough
 * ---------------------------------------------------------------------------
 * The first collision pass gave every model one axis-aligned box, which is
 * right for a wall and a crate and wrong for exactly the pieces a level is
 * interesting because of. `Primitive_Stairs` is four cells on a side, so its
 * box is a four-cell cube: stairs you cannot climb, standing in a room, looking
 * like stairs. `Primitive_Doorway` is a wall with a hole cut in it, and its box
 * is a wall - an opening you can see through and not walk through.
 *
 * Both are the same failure and it is the worst kind an editor can have: the
 * level *looks* correct. Nothing is missing, nothing is misplaced, and the
 * thing simply does not behave the way its own picture promises.
 *
 * So the shape is measured rather than approximated: every triangle is tested
 * against every cell it might touch, and what comes out is a mask of the cells
 * the model really fills. Stairs become steps. The doorway gets its hole. A
 * slope becomes a ramp you can walk up.
 *
 * ---------------------------------------------------------------------------
 * Measured once, at build time
 * ---------------------------------------------------------------------------
 * This runs in `xp-catalogue.ts` and the result is checked in, for the same
 * reason the sizes are: the alternative is parsing glTF in the browser to
 * answer "can I walk here", in the frame that needs the answer.
 *
 * ---------------------------------------------------------------------------
 * A surface test, then a fill
 * ---------------------------------------------------------------------------
 * Marking the cells a triangle passes through gives the model's *shell*, and a
 * shell is not a solid. The first version stopped there, and the staircase came
 * out with a hole in the middle of its own mass - a cell no triangle happened
 * to cross, sitting inside four cells of stone. On the grid that is a gap you
 * can fall into halfway up a flight of stairs.
 *
 * So the shell is flooded from outside afterwards: anything the flood cannot
 * reach is interior, and interior is solid. What makes this safe for a
 * staircase - where filling the wrong thing would hand back a plain cube - is
 * that the space *above* each step is connected to the outside air, so the
 * flood reaches it and it stays empty.
 */

import type { Triangle } from './gltf-raster'

/** A model's occupancy, in cells, in its own frame. */
export interface VoxelMask {
  /** Size of the grid, in cells. */
  nx: number
  ny: number
  nz: number
  /** Where cell (0,0,0) sits, in the model's own units. */
  x0: number
  y0: number
  z0: number
  /**
   * One bit per cell, `x + nx * (y + ny * z)`, as hex.
   *
   * Hex rather than an array of booleans because this is checked in and read by
   * a human in a diff: a 4x4x4 stair is sixteen characters, and an array of 64
   * `true`/`false` is sixteen lines.
   */
  bits: string
}

/**
 * Does a triangle touch an axis-aligned box?
 *
 * The separating axis theorem, in the form Akenine-Möller gives it: thirteen
 * axes, and the box and the triangle are apart if any one of them separates
 * them. Written out rather than approximated by sampling points on the
 * triangle, because sampling misses a triangle that cuts a corner of a cell
 * without any sample landing in it - which shows up as a hole in a wall, at one
 * cell, in one level, and is miserable to track down.
 */
function triangleHitsBox(
  a: readonly number[],
  b: readonly number[],
  c: readonly number[],
  centre: readonly number[],
  /** Per-axis, because the probe is not a cube at the edges of the grid. */
  half: readonly number[],
): boolean {
  // Triangle relative to the box's centre.
  const v0 = [a[0] - centre[0], a[1] - centre[1], a[2] - centre[2]]
  const v1 = [b[0] - centre[0], b[1] - centre[1], b[2] - centre[2]]
  const v2 = [c[0] - centre[0], c[1] - centre[1], c[2] - centre[2]]

  // Three axis-aligned axes: the triangle's own bounding box against the cell.
  for (let i = 0; i < 3; i++) {
    const min = Math.min(v0[i], v1[i], v2[i])
    const max = Math.max(v0[i], v1[i], v2[i])
    if (min > half[i] || max < -half[i]) return false
  }

  // The triangle's plane against the box.
  const e0 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]]
  const e1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]]
  const normal = [
    e0[1] * e1[2] - e0[2] * e1[1],
    e0[2] * e1[0] - e0[0] * e1[2],
    e0[0] * e1[1] - e0[1] * e1[0],
  ]
  const d = normal[0] * v0[0] + normal[1] * v0[1] + normal[2] * v0[2]
  const radius =
    half[0] * Math.abs(normal[0]) +
    half[1] * Math.abs(normal[1]) +
    half[2] * Math.abs(normal[2])
  if (Math.abs(d) > radius) return false

  // Nine cross-product axes: each triangle edge against each box axis.
  const e2 = [v0[0] - v2[0], v0[1] - v2[1], v0[2] - v2[2]]
  const edges = [e0, e1, e2]
  const verts = [v0, v1, v2]

  for (const e of edges) {
    // axis = boxAxis x edge, for each of the three box axes.
    const axes = [
      [0, -e[2], e[1]],
      [e[2], 0, -e[0]],
      [-e[1], e[0], 0],
    ]
    for (const axis of axes) {
      let min = Infinity
      let max = -Infinity
      for (const v of verts) {
        const p = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2]
        if (p < min) min = p
        if (p > max) max = p
      }
      const r =
        half[0] * Math.abs(axis[0]) +
        half[1] * Math.abs(axis[1]) +
        half[2] * Math.abs(axis[2])
      if (min > r || max < -r) return false
    }
  }

  return true
}

/**
 * How many cells across a model may be before it is left as a plain box.
 *
 * A guard, not a judgement. A mask is `nx * ny * nz` bits and everything in the
 * prototype kit is four cells or under; something a hundred cells across would
 * be a megabyte of hex in a checked-in file, and whatever it is, it is not a
 * piece of architecture.
 */
export const MAX_MASK_EDGE = 16

/**
 * A model's occupancy mask, or null if it is not worth one.
 *
 * Null for anything that fills its own box anyway - a crate, a floor tile, a
 * plain wall. That is most of the catalogue, and skipping them keeps the
 * generated file readable and the runtime on the cheap path: a mask costs a bit
 * lookup per cell, a box costs nothing.
 */
export function voxelise(
  triangles: readonly Triangle[],
  bounds: { x0: number; y0: number; z0: number; w: number; h: number; d: number },
  scale: number,
): VoxelMask | null {
  // The grid is in *cells*, so the model's units go through the pack's scale
  // first - a pack drawn at half scale has half as many cells across.
  const cell = 1 / scale

  const nx = Math.max(1, Math.round(bounds.w * scale))
  const ny = Math.max(1, Math.round(bounds.h * scale))
  const nz = Math.max(1, Math.round(bounds.d * scale))

  if (nx > MAX_MASK_EDGE || ny > MAX_MASK_EDGE || nz > MAX_MASK_EDGE) return null
  // One cell in every direction is a box by definition.
  if (nx * ny * nz <= 1) return null

  const total = nx * ny * nz
  const filled = new Uint8Array(total)

  /**
   * A hair under half a cell, and the hair matters.
   *
   * A step's top face sits exactly on a cell boundary - that is what makes it a
   * step - and a test at exactly half a cell counts touching as overlapping, so
   * the cell *above* every step came out solid. Each step was then a cell taller
   * than it looks, which made the bottom one two cells high and the whole
   * staircase unclimbable. It also had every flat floor tile filling the cell
   * above itself.
   *
   * Shrinking the probe means a face lying on a boundary belongs to the cell
   * below it, which is the same half-open convention the character controller
   * uses for the player's own box.
   */
  const nudge = 1e-4

  /**
   * The probe, per axis, and why it is not a cube at the edges.
   *
   * The shrink above is about handing a boundary face to *one* of the two cells
   * that share it. At the outside of the model's own bounding box there is no
   * second cell to hand it to - and shrinking there threw the face away
   * entirely, which is a bug with a very specific signature: a model whose
   * height is a whole number of cells lost its top and bottom faces, leaving
   * four walls and an empty middle. The flood fill could not save it either,
   * because a one-layer grid has no enclosed interior to find.
   *
   * What it looked like from the outside: a platform you fall through the centre
   * of. It is not new and not the platformer kit's fault - the two large
   * prototype cubes have been hollow the whole time - but the platformer kit is
   * where it stops being an oddity, because `platform_*` is the piece the whole
   * pack is *for* and every one of them is a whole number of cells tall.
   *
   * So: shrink at an interior boundary, and grow by the same hair at the outside
   * one. Growing rather than sitting exactly on the bound is not fussiness -
   * the probe's half-extent is derived by halving a difference, so a face lying
   * exactly on it loses a comparison to floating point about half the time. The
   * 4x4x2 platform is where that showed: its floor came back solid and its lid
   * did not.
   */
  const span = (index: number, n: number, origin: number) => {
    const lo = origin + index * cell + (index === 0 ? -nudge : nudge)
    const hi = origin + (index + 1) * cell + (index === n - 1 ? nudge : -nudge)
    return { centre: (lo + hi) / 2, half: (hi - lo) / 2 }
  }

  for (const tri of triangles) {
    const [a, b, c] = tri.p

    // Only the cells this triangle's own bounds could reach.
    const lo = [0, 0, 0]
    const hi = [0, 0, 0]
    for (let i = 0; i < 3; i++) {
      const min = Math.min(a[i], b[i], c[i])
      const max = Math.max(a[i], b[i], c[i])
      const origin = i === 0 ? bounds.x0 : i === 1 ? bounds.y0 : bounds.z0
      const n = i === 0 ? nx : i === 1 ? ny : nz
      /**
       * Both ends clamped into the grid, and `lo` is the one that matters.
       *
       * A face lying exactly on the grid's far bound divides to exactly `n`, so
       * `lo` came out one past the last cell while `hi` was clamped back to it -
       * and `for (x = lo; x <= hi)` then ran zero times. The face was skipped
       * before any probe box got a chance to catch it, which is why widening the
       * probe alone fixed the low faces of a cube and left the high ones open.
       */
      lo[i] = Math.min(n - 1, Math.max(0, Math.floor((min - origin) / cell)))
      hi[i] = Math.min(n - 1, Math.max(0, Math.floor((max - origin) / cell)))
    }

    for (let x = lo[0]; x <= hi[0]; x++) {
      for (let y = lo[1]; y <= hi[1]; y++) {
        for (let z = lo[2]; z <= hi[2]; z++) {
          const index = x + nx * (y + ny * z)
          if (filled[index]) continue
          const sx = span(x, nx, bounds.x0)
          const sy = span(y, ny, bounds.y0)
          const sz = span(z, nz, bounds.z0)
          const centre = [sx.centre, sy.centre, sz.centre]
          const half = [sx.half, sy.half, sz.half]
          if (triangleHitsBox(a, b, c, centre, half)) filled[index] = 1
        }
      }
    }
  }

  /**
   * Fill the inside.
   *
   * Six-connected flood from every empty cell on the boundary. What it reaches
   * is outside air; what it does not is enclosed by the shell, which means it
   * is inside the model.
   *
   * The queue is a plain array used as a stack - order does not matter for a
   * fill, and the grids here are at most sixteen cells a side.
   */
  const outside = new Uint8Array(total)
  const stack: number[] = []

  const push = (x: number, y: number, z: number) => {
    if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return
    const i = x + nx * (y + ny * z)
    if (filled[i] || outside[i]) return
    outside[i] = 1
    stack.push(i)
  }

  for (let x = 0; x < nx; x++) {
    for (let y = 0; y < ny; y++) {
      push(x, y, 0)
      push(x, y, nz - 1)
    }
  }
  for (let x = 0; x < nx; x++) {
    for (let z = 0; z < nz; z++) {
      push(x, 0, z)
      push(x, ny - 1, z)
    }
  }
  for (let y = 0; y < ny; y++) {
    for (let z = 0; z < nz; z++) {
      push(0, y, z)
      push(nx - 1, y, z)
    }
  }

  while (stack.length > 0) {
    const i = stack.pop() as number
    const x = i % nx
    const y = Math.floor(i / nx) % ny
    const z = Math.floor(i / (nx * ny))
    push(x - 1, y, z)
    push(x + 1, y, z)
    push(x, y - 1, z)
    push(x, y + 1, z)
    push(x, y, z - 1)
    push(x, y, z + 1)
  }

  for (let i = 0; i < total; i++) {
    if (!filled[i] && !outside[i]) filled[i] = 1
  }

  let count = 0
  for (const bit of filled) count += bit

  /**
   * A model that fills its whole box does not need a mask.
   *
   * The common case by a wide margin - crates, floors, walls, pillars - and
   * the point of checking is that the runtime then takes the box path, which is
   * a range loop rather than a bit test per cell.
   */
  if (count === total) return null

  // Nothing hit at all means geometry thinner than a cell in every direction,
  // which a box describes better than an empty mask would.
  if (count === 0) return null

  let bits = ''
  for (let i = 0; i < total; i += 4) {
    let nibble = 0
    for (let j = 0; j < 4 && i + j < total; j++) {
      if (filled[i + j]) nibble |= 1 << j
    }
    bits += nibble.toString(16)
  }

  return {
    nx,
    ny,
    nz,
    x0: bounds.x0,
    y0: bounds.y0,
    z0: bounds.z0,
    bits,
  }
}
