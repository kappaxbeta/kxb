#!/usr/bin/env bun
/**
 * Authors `public/xo/companion/telly.glb` - the companion you call with the pen -
 * and `kappa.glb`, his red twin, called with `/buddy kappa`.
 *
 *     bun run scripts/build-telly.ts
 *
 * A pink box of a monster: a square head with a row of teeth and two big blue
 * eyes, violet spikes along the top, and an old television where its belly
 * should be. Ours, drawn from blocks in this file, in the same low-poly hand as
 * the peeps it walks beside - not a copy of anybody's model.
 *
 * ---------------------------------------------------------------------------
 * Built like a peep, on purpose
 * ---------------------------------------------------------------------------
 * The peeps are unskinned: a handful of nodes, animated by transform. So is
 * this. Four nodes - `body`, `head`, `leg-left`, `leg-right` - under one root,
 * and four clips under the names the lounge already drives a peep with
 * (`idle`, `walk`, `run`, `dance`, see `AVATAR_CLIPS`). Nothing that plays it
 * has to learn a new rig, and `clone(true)` is enough to put two of them in a
 * room, for the reason `AvatarModel` gives.
 *
 * Flat colours on flat faces, one material per colour, each node one mesh with
 * a primitive per colour. No texture, so nothing to embed and nothing to 404.
 *
 * It faces +Z and stands on y = 0, like every animal in the pack, and the root
 * scales it to a peep's height (~1.55) so it reads as a companion beside you
 * rather than a pet at your ankles or a building behind you.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ARRAY_BUFFER, Gltf } from './gltf-write'

const ROOT = path.join(import.meta.dir, '..')
const DIR = path.join(ROOT, 'public', 'xo', 'companion')

/** Drawn at about two metres, scaled to a peep. */
const SCALE = 0.8

// --- the palette ------------------------------------------------------------

/**
 * The colours that change between the two of them. Everything else - the
 * eyes, the teeth, the television - is the same set, painted once.
 */
interface Coat {
  /** The file, under public/xo/companion. */
  file: string
  main: number
  deep: number
  legs: number
  spikes: number
  bezel: number
}

/**
 * Telly is the pink one, after the picture. Kappa is his red twin: the same
 * body in red, with gold spikes so the two can be told apart at a glance from
 * across a room and not only up close.
 */
const COATS: Coat[] = [
  { file: 'telly.glb', main: 0xe04bb8, deep: 0xc23aa2, legs: 0x8e2a86, spikes: 0x7656e6, bezel: 0x9e2b92 },
  { file: 'kappa.glb', main: 0xe0353f, deep: 0xbb2431, legs: 0x7e1622, spikes: 0xffb02e, bezel: 0x8f1c27 },
]
const MOUTH = 0x3a0f3a
const TOOTH = 0xfaf4ff
const EYE_WHITE = 0xffffff
const IRIS = 0x2fb6e0
const PUPIL = 0x0d0a14
const SCREEN = 0xe9e4f5
const STATIC = 0xa9c3ea

/** sRGB hex to the linear floats glTF stores. Same as the fireworks'. */
function rgb(hex: number): [number, number, number] {
  const channel = (shift: number): number => {
    const value = ((hex >> shift) & 0xff) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return [channel(16), channel(8), channel(0)]
}

// --- geometry -----------------------------------------------------------------

type V3 = [number, number, number]

/** Rotate about X, then Y, then Z, then move. Enough for a spike pointed anywhere. */
interface Place {
  at: V3
  rot?: V3
}

function turn([x, y, z]: V3, [rx, ry, rz]: V3): V3 {
  let a = x
  let b = y * Math.cos(rx) - z * Math.sin(rx)
  let c = y * Math.sin(rx) + z * Math.cos(rx)
  ;[a, c] = [a * Math.cos(ry) + c * Math.sin(ry), -a * Math.sin(ry) + c * Math.cos(ry)]
  ;[a, b] = [a * Math.cos(rz) - b * Math.sin(rz), a * Math.sin(rz) + b * Math.cos(rz)]
  return [a, b, c]
}

/** Every triangle of one colour in one node. */
class Paint {
  positions: number[] = []
  normals: number[] = []
  indices: number[] = []

  constructor(
    readonly colour: number,
    readonly glow = 0,
  ) {}

  private vertex(p: V3, n: V3, place: Place): number {
    const rot = place.rot ?? [0, 0, 0]
    const [x, y, z] = turn(p, rot)
    this.positions.push(x + place.at[0], y + place.at[1], z + place.at[2])
    this.normals.push(...turn(n, rot))
    return this.positions.length / 3 - 1
  }

  /** A flat-shaded quad, wound counter-clockwise seen from `n`. */
  private quad(a: V3, b: V3, c: V3, d: V3, n: V3, place: Place): void {
    const i = [a, b, c, d].map((p) => this.vertex(p, n, place))
    this.indices.push(i[0], i[1], i[2], i[0], i[2], i[3])
  }

  box([w, h, d]: V3, place: Place): this {
    const [x, y, z] = [w / 2, h / 2, d / 2]
    this.quad([-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [0, 0, 1], place)
    this.quad([x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1], place)
    this.quad([x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z], [1, 0, 0], place)
    this.quad([-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z], [-1, 0, 0], place)
    this.quad([-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z], [0, 1, 0], place)
    this.quad([-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z], [0, -1, 0], place)
    return this
  }

  /** A four-sided spike: square base on y = 0, point at y = `tall`. */
  spike(base: number, tall: number, place: Place): this {
    const b = base / 2
    const top: V3 = [0, tall, 0]
    const corners: V3[] = [
      [-b, 0, b],
      [b, 0, b],
      [b, 0, -b],
      [-b, 0, -b],
    ]
    for (let k = 0; k < 4; k++) {
      const p = corners[k]
      const q = corners[(k + 1) % 4]
      // Face normal from the cross product, so the facets catch light like a peep's.
      const u: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]]
      const v: V3 = [top[0] - p[0], top[1] - p[1], top[2] - p[2]]
      const n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
      const len = Math.hypot(...n)
      const unit: V3 = [n[0] / len, n[1] / len, n[2] / len]
      const i = [p, q, top].map((one) => this.vertex(one, unit, place))
      this.indices.push(i[0], i[1], i[2])
    }
    this.quad(corners[3], corners[2], corners[1], corners[0], [0, -1, 0], place)
    return this
  }

  /** A smooth ball. Low-poly, but the eyes are the one round thing it has. */
  ball(radius: number, place: Place, rings = 8, segments = 12): this {
    const start = this.positions.length / 3
    for (let r = 0; r <= rings; r++) {
      const phi = (r / rings) * Math.PI
      for (let s = 0; s <= segments; s++) {
        const theta = (s / segments) * Math.PI * 2
        const n: V3 = [Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)]
        this.vertex([n[0] * radius, n[1] * radius, n[2] * radius], n, place)
      }
    }
    const row = segments + 1
    for (let r = 0; r < rings; r++) {
      for (let s = 0; s < segments; s++) {
        const a = start + r * row + s
        const b = a + row
        this.indices.push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
    return this
  }
}

// --- the parts ------------------------------------------------------------------

/** Where each node hangs from its parent, in the drawn (unscaled) units. */
const HIP_Y = 0.34
const HEAD_ON_BODY = 0.62
const LEG_X = 0.24

function legParts(coat: Coat): Paint[] {
  return [
    new Paint(coat.legs).box([0.26, 0.3, 0.3], { at: [0, -0.15, 0] }),
    new Paint(coat.deep).box([0.32, 0.08, 0.42], { at: [0, -0.3, 0.05] }),
  ]
}

function bodyParts(coat: Coat): Paint[] {
  const pink = new Paint(coat.main).box([0.9, 0.62, 0.7], { at: [0, 0.31, 0] })

  // Fins down both flanks, pointing outward, two a side.
  const violet = new Paint(coat.spikes)
  for (const side of [1, -1]) {
    for (const y of [0.17, 0.43]) {
      violet.spike(0.16, 0.17, { at: [side * 0.45, y, 0], rot: [0, 0, -side * (Math.PI / 2)] })
    }
  }

  // The television: a raised bezel, a pale screen, a little static across it.
  const bezel = new Paint(coat.bezel).box([0.72, 0.5, 0.05], { at: [0, 0.31, 0.37] })
  const screen = new Paint(SCREEN, 0.35).box([0.58, 0.36, 0.02], { at: [0, 0.31, 0.4] })
  const noise = new Paint(STATIC, 0.5)
  for (const [x, y, w] of [
    [-0.1, 0.4, 0.3],
    [0.08, 0.31, 0.38],
    [-0.04, 0.22, 0.32],
  ] as const) {
    noise.box([w, 0.03, 0.01], { at: [x, y, 0.415], rot: [0, 0, 0.18] })
  }
  // Two stubby feet on the bezel, like the set stands on a shelf.
  for (const side of [1, -1]) {
    bezel.box([0.1, 0.06, 0.06], { at: [side * 0.26, 0.04, 0.37] })
  }

  return [pink, violet, bezel, screen, noise]
}

function headParts(coat: Coat): Paint[] {
  const jaw = new Paint(coat.deep).box([0.98, 0.16, 0.84], { at: [0, 0.08, 0.02] })
  const mouth = new Paint(MOUTH).box([0.92, 0.07, 0.8], { at: [0, 0.195, 0.02] })
  const skull = new Paint(coat.main).box([1.1, 0.6, 0.92], { at: [0, 0.53, 0] })

  // A row of teeth hanging off the top lip, and a shorter one standing on the jaw.
  const teeth = new Paint(TOOTH)
  for (let k = 0; k < 7; k++) {
    const x = -0.39 + k * 0.13
    teeth.spike(0.1, 0.1, { at: [x, 0.23, 0.42], rot: [Math.PI, 0, 0] })
  }
  for (let k = 0; k < 4; k++) {
    teeth.spike(0.08, 0.07, { at: [-0.27 + k * 0.18, 0.16, 0.43] })
  }

  // The eyes: a white, a blue iris, a pupil and a spark, stacked toward the viewer.
  const white = new Paint(EYE_WHITE)
  const iris = new Paint(IRIS)
  const pupil = new Paint(PUPIL)
  const spark = new Paint(EYE_WHITE, 1)
  for (const side of [1, -1]) {
    const x = side * 0.29
    white.ball(0.18, { at: [x, 0.55, 0.38] })
    iris.ball(0.13, { at: [x, 0.55, 0.46] })
    pupil.ball(0.085, { at: [x, 0.55, 0.53] })
    spark.ball(0.03, { at: [x - 0.04, 0.6, 0.61] }, 4, 6)
  }

  // Spikes along the crown, leaning back a little, and one at each ear.
  const crest = new Paint(coat.spikes)
  const crown: [number, number, number, number][] = [
    [-0.36, 0.1, 0.22, 0.28],
    [-0.12, -0.05, 0.24, 0.34],
    [0.12, -0.05, 0.24, 0.34],
    [0.36, 0.1, 0.22, 0.28],
  ]
  for (const [x, z, base, tall] of crown) {
    crest.spike(base, tall, { at: [x, 0.83, z], rot: [-0.25, 0, -x * 0.5] })
  }
  for (const side of [1, -1]) {
    crest.spike(0.18, 0.22, { at: [side * 0.55, 0.7, -0.1], rot: [0, 0, -side * 1.0] })
  }

  return [jaw, mouth, skull, teeth, white, iris, pupil, spark, crest]
}

// --- the clips -------------------------------------------------------------------

/** Node indices, fixed by the order `main` writes them. */
const BODY = 1
const HEAD = 2
const LEG_LEFT = 3
const LEG_RIGHT = 4

interface Track {
  node: number
  path: 'rotation' | 'translation'
  times: number[]
  values: number[]
}

interface Clip {
  name: string
  tracks: Track[]
}

/** A quaternion turning `angle` about one axis. */
function quat(axis: 'x' | 'y' | 'z', angle: number): number[] {
  const s = Math.sin(angle / 2)
  return [axis === 'x' ? s : 0, axis === 'y' ? s : 0, axis === 'z' ? s : 0, Math.cos(angle / 2)]
}

/** One full cycle sampled `steps` times, ending where it starts so it loops. */
function cycle(seconds: number, steps: number): number[] {
  return Array.from({ length: steps + 1 }, (_, k) => (k / steps) * seconds)
}

function swing(node: number, axis: 'x' | 'y' | 'z', times: number[], angle: (t: number) => number): Track {
  const span = times[times.length - 1]
  return { node, path: 'rotation', times, values: times.flatMap((t) => quat(axis, angle(t / span))) }
}

function bob(node: number, rest: V3, times: number[], lift: (t: number) => number): Track {
  const span = times[times.length - 1]
  return {
    node,
    path: 'translation',
    times,
    values: times.flatMap((t) => [rest[0], rest[1] + lift(t / span), rest[2]]),
  }
}

const TAU = Math.PI * 2
const BODY_REST: V3 = [0, HIP_Y, 0]
const HEAD_REST: V3 = [0, HEAD_ON_BODY, 0]

/** A gait: legs swinging opposite, the body bobbing twice a stride and rocking once. */
function gait(name: string, seconds: number, legs: number, lift: number, rock: number): Clip {
  const t = cycle(seconds, 16)
  return {
    name,
    tracks: [
      swing(LEG_LEFT, 'x', t, (u) => Math.sin(u * TAU) * legs),
      swing(LEG_RIGHT, 'x', t, (u) => -Math.sin(u * TAU) * legs),
      bob(BODY, BODY_REST, t, (u) => Math.abs(Math.sin(u * TAU)) * lift),
      swing(BODY, 'z', t, (u) => Math.sin(u * TAU) * rock),
      swing(HEAD, 'z', t, (u) => -Math.sin(u * TAU) * rock * 0.6),
    ],
  }
}

function clips(): Clip[] {
  const idle = cycle(2.4, 16)
  const dance = cycle(1.0, 16)
  return [
    {
      name: 'idle',
      tracks: [
        bob(BODY, BODY_REST, idle, (u) => (1 - Math.cos(u * TAU)) * 0.012),
        swing(HEAD, 'z', idle, (u) => Math.sin(u * TAU) * 0.05),
        bob(HEAD, HEAD_REST, idle, (u) => (1 - Math.cos(u * TAU)) * 0.01),
        swing(LEG_LEFT, 'x', idle, () => 0),
        swing(LEG_RIGHT, 'x', idle, () => 0),
      ],
    },
    gait('walk', 0.7, 0.55, 0.05, 0.07),
    gait('run', 0.42, 0.95, 0.1, 0.1),
    {
      name: 'dance',
      tracks: [
        bob(BODY, BODY_REST, dance, (u) => Math.abs(Math.sin(u * TAU)) * 0.12),
        swing(BODY, 'y', dance, (u) => Math.sin(u * TAU) * 0.45),
        swing(HEAD, 'z', dance, (u) => Math.sin(u * TAU * 2) * 0.22),
        swing(LEG_LEFT, 'x', dance, (u) => Math.max(0, Math.sin(u * TAU)) * 0.8),
        swing(LEG_RIGHT, 'x', dance, (u) => Math.max(0, -Math.sin(u * TAU)) * 0.8),
      ],
    },
  ]
}

// --- the file ----------------------------------------------------------------------

function build(coat: Coat): Buffer {
  const gltf = new Gltf()

  const groups: { name: string; paints: Paint[] }[] = [
    { name: 'body', paints: bodyParts(coat) },
    { name: 'head', paints: headParts(coat) },
    { name: 'leg-left', paints: legParts(coat) },
    { name: 'leg-right', paints: legParts(coat) },
  ]

  // One material per colour (and glow), shared across nodes.
  const materials: Record<string, unknown>[] = []
  const materialOf = new Map<string, number>()
  const material = (paint: Paint): number => {
    const key = `${paint.colour}:${paint.glow}`
    const known = materialOf.get(key)
    if (known !== undefined) return known
    const index = materials.length
    materials.push({
      name: `#${paint.colour.toString(16).padStart(6, '0')}`,
      pbrMetallicRoughness: {
        baseColorFactor: [...rgb(paint.colour), 1],
        metallicFactor: 0,
        roughnessFactor: 0.75,
      },
      ...(paint.glow > 0
        ? {
            emissiveFactor: rgb(paint.colour),
            extensions: { KHR_materials_emissive_strength: { emissiveStrength: paint.glow } },
          }
        : {}),
    })
    materialOf.set(key, index)
    return index
  }

  const meshes = groups.map((group) => ({
    name: group.name,
    primitives: group.paints.map((paint) => ({
      attributes: {
        POSITION: gltf.floats(paint.positions, 3, ARRAY_BUFFER),
        NORMAL: gltf.floats(paint.normals, 3, ARRAY_BUFFER),
      },
      indices: gltf.indices(paint.indices),
      material: material(paint),
    })),
  }))

  const nodes = [
    { name: 'telly', children: [BODY, LEG_LEFT, LEG_RIGHT], scale: [SCALE, SCALE, SCALE] },
    { name: 'body', mesh: 0, translation: BODY_REST, children: [HEAD] },
    { name: 'head', mesh: 1, translation: HEAD_REST },
    { name: 'leg-left', mesh: 2, translation: [LEG_X, HIP_Y, 0] },
    { name: 'leg-right', mesh: 3, translation: [-LEG_X, HIP_Y, 0] },
  ]

  const animations = clips().map((clip) => ({
    name: clip.name,
    samplers: clip.tracks.map((track) => ({
      input: gltf.floats(track.times, 1),
      output: gltf.floats(track.values, track.path === 'rotation' ? 4 : 3),
      interpolation: 'LINEAR',
    })),
    channels: clip.tracks.map((track, index) => ({
      sampler: index,
      target: { node: track.node, path: track.path },
    })),
  }))

  gltf.json.asset = { version: '2.0', generator: 'unkown.t scripts/build-telly.ts' }
  gltf.json.extensionsUsed = ['KHR_materials_emissive_strength']
  gltf.json.materials = materials
  gltf.json.meshes = meshes
  gltf.json.nodes = nodes
  gltf.json.animations = animations
  gltf.json.scene = 0
  gltf.json.scenes = [{ name: 'Scene', nodes: [0] }]

  return gltf.pack()
}

function main(): void {
  mkdirSync(DIR, { recursive: true })
  for (const coat of COATS) {
    const bytes = build(coat)
    writeFileSync(path.join(DIR, coat.file), bytes)
    console.log(`  ${coat.file} ${(bytes.length / 1024).toFixed(1)}K`)
  }
}

main()
