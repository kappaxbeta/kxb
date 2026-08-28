/**
 * Generates a heap of abstract 3D primitives and shoots it to a PNG.
 *
 *     bun run scripts/render-shapes.ts            # every heap
 *     bun run scripts/render-shapes.ts play       # just one
 *
 * Writes `public/xo/shapes/<name>.png` — transparent background, one
 * three-quarter camera, same as `render-pile.ts`.
 *
 * ---------------------------------------------------------------------------
 * Why generated rather than downloaded
 * ---------------------------------------------------------------------------
 * The look being chased - fluted spheres, coils, jacks, open frames, ribbed
 * cylinders, all in a tight violet/coral palette - is a whole genre, and every
 * good example of it belongs to whoever rendered it. Lifting one onto a
 * commercial page is infringement whatever folder it lands in, and the free
 * "3D shape pack" sites are mostly the same problem with a licence file that
 * does not survive being read.
 *
 * The saving grace is that every shape in that genre is a *procedure*. A fluted
 * sphere is a sphere whose radius wobbles with longitude. A jack is three
 * cylinders through one point. None of it is sculpted, so none of it has to be
 * acquired - it can just be written, which is what this file is. The payoff
 * beyond the licence is that the palette is a constant at the top rather than
 * baked into somebody's PNG: the heap can be recoloured to match a page in one
 * edit.
 *
 * ---------------------------------------------------------------------------
 * How it draws
 * ---------------------------------------------------------------------------
 * `gltf-raster.ts` does the rasterizing, exactly as it does for the block piles.
 * It wants `Triangle`s - position, uv, normal, and a `Surface` of a texture
 * times a colour factor - and nothing about it cares whether those came out of
 * a glTF file. So the generators below build triangles directly against a 1x1
 * white texture, and the colour lives entirely in the factor.
 *
 * Normals are the one thing worth getting right rather than approximating. The
 * shader is Lambert with two directional lights and no specular, so a curved
 * surface only reads as curved if its normals are the *analytic* ones rather
 * than per-face. Every generator below hands back true normals for its own
 * surface; the boxes are the only things shaded flat, and they are flat.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  type Lighting,
  loadTriangles,
  normalize,
  render,
  type Surface,
  type Triangle,
  type Vec3,
} from './gltf-raster'
import { encodePng, type Image } from './png'

const OUT_DIR = path.join(import.meta.dir, '..', 'public', 'xo', 'shapes')
const GLTF_DIR = path.join(import.meta.dir, '..', 'public', 'xo', 'bb10', 'gltf')

/**
 * A real block from the palette, as triangles, ready to go in a heap.
 *
 * The one seam between this file and `render-pile.ts`, and it only exists for
 * the mixed heap. A block arrives with its own texture and material, so it
 * ignores `paint` and `ramp` entirely - `ramp` will stamp a `t` onto it and
 * nothing will read it, because the block's surface has no `factorB`. That is
 * the intended no-op rather than an accident: it means blocks and generated
 * shapes can go through the same `place` without either knowing about the
 * other.
 *
 * They do pick up the plastic light rig, which is the point of mixing them -
 * under the same key, fill and rim, a crate and a fluted sphere read as two
 * objects on one table rather than as a collage.
 */
function block(model: string): Triangle[] {
  return loadTriangles(path.join(GLTF_DIR, `${model}.gltf`))
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * One white texel, which every shape here samples.
 *
 * The rasterizer multiplies texture by factor, so a white texture makes the
 * factor the colour outright. Cheaper than teaching it a texture-less path, and
 * it keeps this file from having to know anything about how it shades.
 */
const WHITE: Image = { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) }

/** sRGB byte to linear, because `factor` is multiplied in linear space. */
function toLinear(byte: number): number {
  const c = byte / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

type Rgba = [number, number, number, number]

function linearOf(hex: string): Rgba {
  const n = parseInt(hex.replace('#', ''), 16)
  return [toLinear((n >> 16) & 255), toLinear((n >> 8) & 255), toLinear(n & 255), 1]
}

/**
 * A surface from one or two hex colours.
 *
 * With two, the shape gets a ramp from the first at its base to the second at
 * its top - which is the thing that stops a moulded plastic object looking
 * like a flat fill with a highlight stuck on. Real injection-moulded plastic
 * picks up the room: lighter where it faces the ceiling, deeper in the well of
 * itself, and a Lambert term alone does not produce that because it only knows
 * about the light, not about where on the object it is.
 *
 * The ramp is applied along each shape's *own* local Y before it is placed, so
 * a piece that ends up rotated on its side still shades from its own base to
 * its own top rather than from the bottom of the picture.
 */
function paint(hex: string, toHex?: string): Surface {
  return {
    texture: WHITE,
    factor: linearOf(hex),
    factorB: toHex ? linearOf(toHex) : undefined,
  }
}

/**
 * Stamps the gradient parameter onto a shape, from its own bounding box.
 *
 * Run after a generator and before `place`, so `t` follows the object's local
 * up-axis. Cheap, and it means no generator has to know that ramps exist - they
 * emit geometry, this decides how it is coloured.
 */
function ramp(triangles: Triangle[]): Triangle[] {
  let min = Infinity
  let max = -Infinity
  for (const t of triangles) {
    for (const p of t.p) {
      if (p[1] < min) min = p[1]
      if (p[1] > max) max = p[1]
    }
  }
  const span = max - min || 1
  return triangles.map((t) => ({
    ...t,
    t: t.p.map((p) => (p[1] - min) / span) as [number, number, number],
  }))
}

/**
 * The palette, read off the reference.
 *
 * Deliberately narrow - six hues and no more. What makes a heap of twenty
 * objects read as one composition rather than as a toybox is that they are all
 * cut from the same six colours, and the moment a seventh appears the whole
 * thing looks like a screenshot of an asset browser.
 *
 * `deep` and `ink` are the anchors: without two genuinely dark pieces the pile
 * has no depth and floats. `coral` is the single warm accent and appears once
 * or twice at most, which is what makes it an accent.
 */
const C = {
  violet: paint('#5B3FC4', '#8E70F0'),
  deep: paint('#3A2596', '#6244D6'),
  ink: paint('#1E1550', '#3B2C7E'),
  lilac: paint('#9067D8', '#C4A6F5'),
  pink: paint('#D97BAE', '#F3B4D3'),
  blush: paint('#E39685', '#F8C7B6'),
  cream: paint('#EDC4AE', '#FBE6D8'),
  coral: paint('#CE3A22', '#F4714F'),
  sky: paint('#2E8ED4', '#78C6F5'),
} as const

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

type P = Vec3

function add(a: P, b: P): P {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function scale3(v: P, s: number): P {
  return [v[0] * s, v[1] * s, v[2] * s]
}

function cross(a: P, b: P): P {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function sub(a: P, b: P): P {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

/** One triangle with per-vertex normals supplied. */
function tri(p: [P, P, P], n: [P, P, P], surface: Surface): Triangle {
  return { p, n, uv: [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5]], surface }
}

/** One triangle shaded flat, normal computed from the winding. */
function flat(a: P, b: P, c: P, surface: Surface): Triangle {
  const n = normalize(cross(sub(b, a), sub(c, a)))
  return tri([a, b, c], [n, n, n], surface)
}

/** A quad as two triangles, with per-corner normals. */
function quad(
  p: [P, P, P, P],
  n: [P, P, P, P],
  surface: Surface,
): Triangle[] {
  return [
    tri([p[0], p[1], p[2]], [n[0], n[1], n[2]], surface),
    tri([p[0], p[2], p[3]], [n[0], n[2], n[3]], surface),
  ]
}

/** A quad shaded flat. */
function flatQuad(a: P, b: P, c: P, d: P, surface: Surface): Triangle[] {
  return [flat(a, b, c, surface), flat(a, c, d, surface)]
}

/**
 * How a shape is placed once it is generated.
 *
 * Rotation is XYZ Euler in radians and applied in that order. Enough for a
 * heap: nothing here needs a quaternion, and three readable numbers per piece
 * is what makes the compositions below editable by eye.
 */
interface Place {
  at?: P
  rot?: P
  size?: number
}

function rotatePoint(v: P, r: P): P {
  const [rx, ry, rz] = r
  let [x, y, z] = v
  // X
  let c = Math.cos(rx)
  let s = Math.sin(rx)
  ;[y, z] = [y * c - z * s, y * s + z * c]
  // Y
  c = Math.cos(ry)
  s = Math.sin(ry)
  ;[x, z] = [x * c + z * s, -x * s + z * c]
  // Z
  c = Math.cos(rz)
  s = Math.sin(rz)
  ;[x, y] = [x * c - y * s, x * s + y * c]
  return [x, y, z]
}

/**
 * The two knobs that decide whether a heap reads as a heap.
 *
 * `SPREAD` multiplies every position and `BULK` multiplies every size, so
 * together they set the one thing that actually matters in a composition like
 * this: how big each piece is *relative to the gaps between them*. The camera
 * fits whatever bounding box it is given, so scaling both equally changes
 * nothing at all — it is the ratio that does the work.
 *
 * At 1.0/1.0 the first draft looked like a dozen objects that happened to be
 * near each other. Pulling the positions in and the sizes up makes them
 * overlap and interlock, which is what the reference is doing and what makes a
 * pile look like one object rather than a scatter.
 *
 * Tuned by eye against the rendered PNG, which is the only way to tune it.
 */
const SPREAD = 0.8
const BULK = 1.18

/**
 * Applies a placement, untouched by the composition knobs.
 *
 * This is the one a *shape* uses to assemble itself out of parts - `jack()`
 * builds three crossed bars and six end caps with it. Those offsets are the
 * shape's own anatomy, and running them through `SPREAD` would push a jack's
 * arms out of its hub.
 */
function placeRaw(
  triangles: Triangle[],
  { at = [0, 0, 0], rot = [0, 0, 0], size = 1 }: Place,
): Triangle[] {
  return triangles.map((t) => ({
    ...t,
    p: t.p.map((p) => add(rotatePoint(scale3(p, size), rot), at)) as [P, P, P],
    // Normals rotate but must not scale - a uniform scale leaves them
    // unchanged in direction, which is the only reason `size` can be a scalar.
    n: t.n.map((n) => rotatePoint(n, rot)) as [P, P, P],
  }))
}

/**
 * Applies a placement *within a heap*, through the composition knobs above.
 *
 * `ramp` runs first, on the shape as generated - before it is rotated or moved
 * - so the colour ramp follows the object's own up-axis. A jack lying on its
 * side still shades from its own base to its own tip.
 */
function place(triangles: Triangle[], { at = [0, 0, 0], rot, size = 1 }: Place): Triangle[] {
  return placeRaw(ramp(triangles), { at: scale3(at, SPREAD), rot, size: size * BULK })
}

// ---------------------------------------------------------------------------
// The shapes
// ---------------------------------------------------------------------------

/**
 * A sphere whose radius ripples with longitude — the pleated ball that is the
 * single most recognisable object in this genre.
 *
 * `flutes` is how many ridges go round; `depth` is how deep they cut, as a
 * fraction of the radius. At depth 0 this is an ordinary sphere, which is what
 * `ball()` below asks for.
 *
 * The normals are computed from the two surface tangents rather than from the
 * position, which is the difference between ridges you can see and a sphere
 * with a pattern painted on it: on a fluted surface the normal leans sideways
 * out of the groove, and the position vector does not.
 */
function flutedSphere(surface: Surface, flutes = 12, depth = 0.18, seg = 48): Triangle[] {
  const radius = (u: number, v: number) => 1 + depth * Math.cos(flutes * u) * Math.sin(v)

  const at = (u: number, v: number): P => {
    const r = radius(u, v)
    return [r * Math.sin(v) * Math.cos(u), r * Math.cos(v), r * Math.sin(v) * Math.sin(u)]
  }

  const normalAt = (u: number, v: number): P => {
    const e = 0.001
    const du = sub(at(u + e, v), at(u - e, v))
    const dv = sub(at(u, v + e), at(u, v - e))
    const n = normalize(cross(dv, du))
    // Keep them pointing outwards; the cross product's sign flips across the
    // poles otherwise and the top of the ball lights as a hole.
    const p = at(u, v)
    return n[0] * p[0] + n[1] * p[1] + n[2] * p[2] < 0 ? scale3(n, -1) : n
  }

  const out: Triangle[] = []
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < seg / 2; j++) {
      const u0 = (i / seg) * Math.PI * 2
      const u1 = ((i + 1) / seg) * Math.PI * 2
      const v0 = (j / (seg / 2)) * Math.PI
      const v1 = ((j + 1) / (seg / 2)) * Math.PI
      out.push(
        ...quad(
          [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)],
          [normalAt(u0, v0), normalAt(u1, v0), normalAt(u1, v1), normalAt(u0, v1)],
          surface,
        ),
      )
    }
  }
  return out
}

/** A plain sphere. The fluted one with the ripple turned off. */
function ball(surface: Surface, seg = 40): Triangle[] {
  return flutedSphere(surface, 1, 0, seg)
}

/**
 * A sphere banded into stacked rings — the other ball in the reference, the one
 * that looks turned on a lathe.
 *
 * The ripple runs with latitude instead of longitude, so the same function
 * would do it, except that the ridges want hard shoulders rather than a smooth
 * wobble. Hence the step: the radius is quantised into `rings` bands, and the
 * normals come out per-face, which is what gives each band its own flat tone.
 */
function ribbedSphere(surface: Surface, rings = 9, seg = 44): Triangle[] {
  const at = (u: number, v: number): P => {
    const band = Math.floor((v / Math.PI) * rings) + 0.5
    const bandV = (band / rings) * Math.PI
    const r = Math.sin(bandV) * 1.0
    return [r * Math.cos(u), Math.cos(v), r * Math.sin(u)]
  }

  const out: Triangle[] = []
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rings * 3; j++) {
      const u0 = (i / seg) * Math.PI * 2
      const u1 = ((i + 1) / seg) * Math.PI * 2
      const v0 = (j / (rings * 3)) * Math.PI
      const v1 = ((j + 1) / (rings * 3)) * Math.PI
      out.push(
        ...flatQuad(at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1), surface),
      )
    }
  }
  return out
}

/**
 * A torus. The coil in the reference is a stretched one of these, and a ring is
 * the shape a heap most needs: it is the only primitive here you can see
 * *through*, which is what stops a pile reading as a solid mass.
 */
function torus(surface: Surface, thickness = 0.34, major = 24, minor = 16): Triangle[] {
  const at = (u: number, v: number): P => [
    (1 + thickness * Math.cos(v)) * Math.cos(u),
    thickness * Math.sin(v),
    (1 + thickness * Math.cos(v)) * Math.sin(u),
  ]
  // The tube's own centre line, which is what the normal points away from.
  const nAt = (u: number, v: number): P =>
    normalize([Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u)])

  const out: Triangle[] = []
  for (let i = 0; i < major; i++) {
    for (let j = 0; j < minor; j++) {
      const u0 = (i / major) * Math.PI * 2
      const u1 = ((i + 1) / major) * Math.PI * 2
      const v0 = (j / minor) * Math.PI * 2
      const v1 = ((j + 1) / minor) * Math.PI * 2
      out.push(
        ...quad(
          [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)],
          [nAt(u0, v0), nAt(u1, v0), nAt(u1, v1), nAt(u0, v1)],
          surface,
        ),
      )
    }
  }
  return out
}

/** A capped cylinder, along Y. `ribs` cuts flutes into the wall. */
function cylinder(surface: Surface, radius = 0.5, height = 2, ribs = 0, seg = 40): Triangle[] {
  const r = (u: number) => (ribs > 0 ? radius * (1 + 0.12 * Math.cos(ribs * u)) : radius)
  const at = (u: number, y: number): P => [r(u) * Math.cos(u), y, r(u) * Math.sin(u)]
  const nAt = (u: number): P => {
    const e = 0.001
    const t = sub(at(u + e, 0), at(u - e, 0))
    return normalize([t[2], 0, -t[0]])
  }

  const out: Triangle[] = []
  const top = height / 2
  const bottom = -height / 2
  for (let i = 0; i < seg; i++) {
    const u0 = (i / seg) * Math.PI * 2
    const u1 = ((i + 1) / seg) * Math.PI * 2
    out.push(
      ...quad(
        [at(u0, bottom), at(u1, bottom), at(u1, top), at(u0, top)],
        [nAt(u0), nAt(u1), nAt(u1), nAt(u0)],
        surface,
      ),
    )
    out.push(flat(at(u0, top), at(u1, top), [0, top, 0], surface))
    out.push(flat(at(u1, bottom), at(u0, bottom), [0, bottom, 0], surface))
  }
  return out
}

/** A cone, point up. The spinning top in the reference. */
function cone(surface: Surface, radius = 0.7, height = 1.6, seg = 36): Triangle[] {
  const out: Triangle[] = []
  const tip: P = [0, height / 2, 0]
  const base = -height / 2
  for (let i = 0; i < seg; i++) {
    const u0 = (i / seg) * Math.PI * 2
    const u1 = ((i + 1) / seg) * Math.PI * 2
    const a: P = [radius * Math.cos(u0), base, radius * Math.sin(u0)]
    const b: P = [radius * Math.cos(u1), base, radius * Math.sin(u1)]
    out.push(flat(a, b, tip, surface))
    out.push(flat(b, a, [0, base, 0], surface))
  }
  return out
}

/** An axis-aligned box, shaded flat. The building block for the frames. */
function box(surface: Surface, sx: number, sy: number, sz: number, at: P = [0, 0, 0]): Triangle[] {
  const [x, y, z] = [sx / 2, sy / 2, sz / 2]
  const c = (dx: number, dy: number, dz: number): P => [at[0] + dx * x, at[1] + dy * y, at[2] + dz * z]
  return [
    ...flatQuad(c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1), surface),
    ...flatQuad(c(1, -1, -1), c(-1, -1, -1), c(-1, 1, -1), c(1, 1, -1), surface),
    ...flatQuad(c(1, -1, 1), c(1, -1, -1), c(1, 1, -1), c(1, 1, 1), surface),
    ...flatQuad(c(-1, -1, -1), c(-1, -1, 1), c(-1, 1, 1), c(-1, 1, -1), surface),
    ...flatQuad(c(-1, 1, 1), c(1, 1, 1), c(1, 1, -1), c(-1, 1, -1), surface),
    ...flatQuad(c(-1, -1, -1), c(1, -1, -1), c(1, -1, 1), c(-1, -1, 1), surface),
  ]
}

/**
 * A square open frame — four bars round a hole.
 *
 * The most useful shape in the whole set and the least obvious one. A heap made
 * only of solids is a silhouette; one frame in it and the objects behind show
 * through, which is the entire reason the reference reads as deep rather than
 * as a sticker.
 */
function frame(surface: Surface, side = 2, bar = 0.28, depth = 0.4): Triangle[] {
  const arm = side / 2 - bar / 2
  return [
    ...box(surface, side, bar, depth, [0, arm, 0]),
    ...box(surface, side, bar, depth, [0, -arm, 0]),
    ...box(surface, bar, side - bar * 2, depth, [arm, 0, 0]),
    ...box(surface, bar, side - bar * 2, depth, [-arm, 0, 0]),
  ]
}

/**
 * A jack — three cylinders through one point, with rounded caps.
 *
 * The reference has several, and they are what keep the composition from
 * settling: every other shape here is convex and sits still, and a six-armed
 * star pokes out between its neighbours and ties them together.
 */
function jack(surface: Surface, arm = 1.1, thick = 0.16): Triangle[] {
  const bar = () => cylinder(surface, thick, arm * 2, 0, 18)
  return [
    ...bar(),
    ...placeRaw(bar(), { rot: [0, 0, Math.PI / 2] }),
    ...placeRaw(bar(), { rot: [Math.PI / 2, 0, 0] }),
    // The hub, so the three do not read as three separate rods crossing.
    ...placeRaw(ball(surface, 16), { size: thick * 1.7 }),
    // Rounded ends, which is what makes it look moulded rather than welded.
    ...([[0, arm, 0], [0, -arm, 0], [arm, 0, 0], [-arm, 0, 0], [0, 0, arm], [0, 0, -arm]] as P[]).flatMap(
      (p) => placeRaw(ball(surface, 14), { at: p, size: thick }),
    ),
  ]
}

/** A coil — a torus swept as a helix, the orange spring in the reference. */
function coil(surface: Surface, turns = 2.5, thickness = 0.2, rise = 0.55, seg = 90): Triangle[] {
  const at = (t: number, v: number): P => {
    const u = t * Math.PI * 2 * turns
    const cx = Math.cos(u)
    const cz = Math.sin(u)
    return [
      (1 + thickness * Math.cos(v)) * cx,
      thickness * Math.sin(v) + (t - 0.5) * rise * turns,
      (1 + thickness * Math.cos(v)) * cz,
    ]
  }
  const nAt = (t: number, v: number): P => {
    const u = t * Math.PI * 2 * turns
    return normalize([Math.cos(v) * Math.cos(u), Math.sin(v), Math.cos(v) * Math.sin(u)])
  }

  const out: Triangle[] = []
  const minor = 14
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < minor; j++) {
      const t0 = i / seg
      const t1 = (i + 1) / seg
      const v0 = (j / minor) * Math.PI * 2
      const v1 = ((j + 1) / minor) * Math.PI * 2
      out.push(
        ...quad(
          [at(t0, v0), at(t1, v0), at(t1, v1), at(t0, v1)],
          [nAt(t0, v0), nAt(t1, v0), nAt(t1, v1), nAt(t0, v1)],
          surface,
        ),
      )
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// The heaps
// ---------------------------------------------------------------------------

/**
 * The compositions.
 *
 * Same three rules as the block piles: a silhouette that tapers, no two
 * neighbours at the same angle, and two or three pieces floating clear of the
 * stack. What changes here is that the shapes interlock - a jack's arms go
 * *between* the balls beside it - so the order they are listed in does not
 * matter at all and the depth buffer does the whole job.
 */
const HEAPS: Record<string, () => Triangle[]> = {
  play: () => [
    ...place(flutedSphere(C.pink, 14, 0.2), { at: [0.9, 0.35, -0.2], size: 1.15, rot: [0.3, 0, 0.4] }),
    ...place(ball(C.violet), { at: [-1.35, -0.5, 0.4], size: 0.85 }),
    ...place(ribbedSphere(C.ink), { at: [1.85, -1.15, 0.5], size: 0.7, rot: [0.2, 0, 0.5] }),
    ...place(cylinder(C.blush, 0.62, 1.9, 0), { at: [-0.55, -1.5, 0.9], rot: [0.35, 0.4, 1.15], size: 0.9 }),
    ...place(frame(C.violet), { at: [-1.75, 0.9, -0.5], rot: [0.15, 0.5, 0.72], size: 0.95 }),
    ...place(jack(C.deep), { at: [0.15, 1.75, 0.6], size: 0.72 }),
    ...place(torus(C.coral, 0.26), { at: [1.55, 1.15, 0.9], rot: [1.1, 0.3, 0.2], size: 0.62 }),
    ...place(cone(C.cream), { at: [-1.3, 1.85, 0.7], rot: [0.1, 0, -0.55], size: 0.72 }),
    ...place(coil(C.blush, 2.2, 0.17), { at: [1.1, 2.35, -0.6], rot: [0.4, 0, 0.25], size: 0.55 }),
    ...place(cylinder(C.ink, 0.2, 3.4, 0), { at: [0.2, 0.9, -1.2], rot: [0.2, 0, 1.25], size: 0.9 }),
    ...place(ball(C.sky), { at: [-2.1, -1.4, 0.2], size: 0.42 }),
    ...place(jack(C.lilac), { at: [-1.9, -2.0, 1.0], size: 0.5 }),
    ...place(flutedSphere(C.lilac, 18, 0.14), { at: [0.55, -2.3, 0.3], size: 0.62 }),
  ],

  create: () => [
    ...place(frame(C.deep), { at: [-0.9, 0.5, 0.1], rot: [0.12, 0.42, 0.35], size: 1.25 }),
    ...place(cylinder(C.blush, 0.7, 2.1, 22), { at: [0.85, -0.7, 0.5], rot: [0.5, 0.2, 1.05], size: 0.95 }),
    ...place(flutedSphere(C.violet, 16, 0.17), { at: [1.5, 0.9, -0.3], size: 0.92, rot: [0.2, 0, 0.3] }),
    ...place(ball(C.cream), { at: [-1.6, -1.3, 0.6], size: 0.72 }),
    ...place(jack(C.sky), { at: [0.6, 1.55, 0.7], size: 0.8 }),
    ...place(torus(C.lilac, 0.3), { at: [-1.5, 1.5, 0.3], rot: [0.9, 0.5, 0.1], size: 0.75 }),
    ...place(ribbedSphere(C.ink), { at: [1.95, -1.4, 0.4], size: 0.66, rot: [0.15, 0, 0.4] }),
    ...place(cone(C.pink), { at: [-0.2, -2.1, 0.9], rot: [0.05, 0, 2.9], size: 0.75 }),
    ...place(coil(C.coral, 2.4, 0.16), { at: [0.1, 2.5, -0.5], rot: [0.35, 0, 0.2], size: 0.5 }),
    ...place(cylinder(C.ink, 0.19, 3.2, 0), { at: [-0.3, 0.4, -1.3], rot: [0.15, 0, 1.35], size: 0.9 }),
    ...place(box(C.violet, 1, 1, 1), { at: [2.15, 1.7, 0.2], rot: [0.4, 0.6, 0.3], size: 0.55 }),
    ...place(ball(C.blush), { at: [-2.2, 0.2, 0.8], size: 0.4 }),
  ],

  /**
   * /share - the mixed one, and the only heap with both kinds of object in it.
   *
   * Half real blocks off the palette, half generated primitives, interlocked.
   * Which is the page's own argument made in pictures: /share is about handing
   * what you built to somebody who has not built it yet, so the heap has the
   * things you made *and* the things nobody has made yet, in the same pile and
   * under the same light.
   *
   * A block is roughly 2 units and the generated shapes are roughly 2 across
   * too, so the two sets sit together at the same `size` without anything
   * having to be fudged. The blocks carry their own textures and skip the
   * gradient - see `block()`.
   */
  share: () => [
    ...place(block('chest'), { at: [-1.0, -1.6, 0.6], rot: [0, 0.5, 0], size: 0.6 }),
    ...place(ball(C.lilac), { at: [-1.1, 0.3, 0.3], size: 1.0 }),
    ...place(block('gift'), { at: [1.25, -0.6, 0.7], rot: [0.15, -0.6, 0.1], size: 0.55 }),
    ...place(flutedSphere(C.pink, 12, 0.22), { at: [1.2, 0.9, 0.1], size: 0.95, rot: [0.35, 0, 0.25] }),
    ...place(torus(C.violet, 0.32), { at: [0.1, 1.9, 0.3], rot: [1.25, 0.2, 0.15], size: 0.9 }),
    ...place(block('vault'), { at: [1.95, -1.8, 0.2], rot: [0, 0.9, 0], size: 0.55 }),
    ...place(frame(C.cream), { at: [2.0, 1.0, -0.4], rot: [0.1, 0.55, 0.62], size: 0.8 }),
    ...place(cylinder(C.deep, 0.6, 1.8, 18), { at: [-1.8, -1.2, 0.7], rot: [0.4, 0.3, 1.2], size: 0.85 }),
    ...place(jack(C.coral), { at: [-0.5, 2.4, 0.5], size: 0.6 }),
    ...place(block('stone_with_gold'), { at: [0.5, -2.3, 0.5], rot: [0, 0.3, 0], size: 0.55 }),
    ...place(ribbedSphere(C.ink), { at: [1.0, -2.1, 0.9], size: 0.6, rot: [0.2, 0, 0.35] }),
    ...place(coil(C.sky, 2.0, 0.18), { at: [-2.0, 1.8, 0.1], rot: [0.5, 0, 0.3], size: 0.52 }),
    ...place(cylinder(C.ink, 0.2, 3.3, 0), { at: [0.4, 0.4, -1.3], rot: [0.2, 0, 1.1], size: 0.85 }),
    ...place(block('glass'), { at: [-2.2, 0.4, 0.9], rot: [0, 0.7, 0], size: 0.45 }),
    ...place(ball(C.violet), { at: [2.4, 2.3, 0.4], size: 0.38 }),
  ],
}

// ---------------------------------------------------------------------------
// Shooting
// ---------------------------------------------------------------------------

/** Matches `render-pile.ts`, so the two sets of art can be swapped one for one. */
const EYE: Vec3 = [5.6, 4.4, 6.2]
const FOV_DEG = 30
const FRAME = { mode: 'fit', extent: 2.6 } as const

/**
 * A studio rig, and the thing that makes these read as plastic.
 *
 * Four lights rather than the default two, arranged the way a product shot
 * actually is:
 *
 * - **Key**, high and camera-left, doing most of the work.
 * - **Fill**, low and opposite, cool, lifting the shadow side off black. The
 *   blue tint is what stops the dark violets going to mud.
 * - **Rim**, behind and above, warm and strong. This is the one that matters
 *   most in a heap: it draws a bright edge along the top of every object and is
 *   the only reason twelve overlapping shapes read as twelve rather than as a
 *   silhouette with colours in it.
 * - **Bounce**, straight up from below, very weak, standing in for light coming
 *   back off the ground.
 *
 * `ambient` is much lower than the default's 0.45. Half the perceived
 * plasticness is contrast, and a high ambient is a flat object.
 *
 * `specular` at power 48 gives a highlight that is tight without being a
 * pinprick - the difference between plastic and glazed ceramic is roughly this
 * number, and the white it adds is deliberately not tinted by the surface,
 * which is what separates plastic from metal.
 */
const PLASTIC: Lighting = {
  ambient: 0.28,
  lights: [
    { dir: normalize([-2.6, 4.2, 3.4]), intensity: 0.72 },
    { dir: normalize([3.4, -0.6, 2.2]), intensity: 0.26, tint: [0.78, 0.85, 1.05] },
    { dir: normalize([1.2, 3.0, -4.0]), intensity: 0.5, tint: [1.05, 0.92, 0.98] },
    { dir: normalize([0, -1, 0.3]), intensity: 0.12, tint: [0.9, 0.86, 1.0] },
  ],
  specular: { power: 48, intensity: 0.34 },
}

const requested = process.argv.slice(2)
const names = requested.length > 0 ? requested : Object.keys(HEAPS)

mkdirSync(OUT_DIR, { recursive: true })

for (const name of names) {
  const build = HEAPS[name]
  if (!build) {
    console.error(`no heap called "${name}" — try: ${Object.keys(HEAPS).join(', ')}`)
    process.exit(1)
  }

  const triangles = build()
  const image = render(triangles, {
    size: 1024,
    supersample: 4,
    eye: EYE,
    fov: FOV_DEG,
    frame: FRAME,
    lighting: PLASTIC,
  })

  const out = path.join(OUT_DIR, `${name}.png`)
  writeFileSync(out, encodePng(image))

  const covered = image.data.filter((_, i) => i % 4 === 3 && image.data[i] > 0).length
  const fill = ((covered / (image.width * image.height)) * 100).toFixed(1)
  console.log(`${name}: ${triangles.length} tris → ${path.basename(out)} (${fill}% covered)`)
}
