#!/usr/bin/env bun
/**
 * Draw a stand-in character, so that a fresh clone has a body in it.
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 * This repository bundles no art (docs/assets.md), and of everything that is
 * left out, the character is the one that hurts. A world with no props is a bare
 * room; a world with no *body* is a game you cannot see yourself in, and the
 * animator - which is a rig editor - has nothing at all to open.
 *
 * So this writes one. It is not a substitute for KayKit's dummy, and it is not
 * trying to be: it is boxes. What it is, is a body with the *right skeleton* -
 * the twenty-two bones of `src/domain/animator/rig.ts`, spelled exactly as that
 * file's `glb` fields spell them, in the hierarchy the editor's handles assume.
 * Everything downstream keys off those names, so a placeholder that gets them
 * right is a placeholder you can actually pose, animate and walk around.
 *
 * Original work, released CC0 along with the rest of `shapes`. No third party's
 * geometry is involved, which is the other reason it can live in the repository
 * when the packs it stands in for cannot.
 *
 * ---------------------------------------------------------------------------
 * Rigid skinning, deliberately
 * ---------------------------------------------------------------------------
 * Every vertex is bound to exactly one joint at weight 1. Real characters blend
 * two or three across a joint so the elbow creases instead of tearing, and that
 * is why this looks like a marionette rather than a person. It is also why it
 * is a hundred lines instead of a thousand, and a marionette is an honest
 * placeholder in a way that a badly-weighted human is not.
 *
 *   bun run tools/make-dummy.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// The skeleton
// ---------------------------------------------------------------------------
// `glb` is the name written into the file, and it must match the `glb` field in
// src/domain/animator/rig.ts exactly - dots and all. The loader strips the dot
// on the way in, which is the bug rig.test.ts exists to catch; the file keeps
// it. Translations are parent-relative, in the same units as the rest of the
// lattice: one unit is one cell.
//
// Two rest rotations are not zero, and both are copied from the measurements in
// rig.ts rather than invented here: the elbows rest a little bent (mirrored
// left to right) and the knees rest a little bent (the same sign on both,
// because a knee only folds one way).
type Bone = { glb: string; parent: string | null; t: [number, number, number]; r?: [number, number, number, number] }

/** A quaternion for a rotation of `rad` about one axis. */
const q = (axis: 'x' | 'y' | 'z', rad: number): [number, number, number, number] => {
  const s = Math.sin(rad / 2)
  const c = Math.cos(rad / 2)
  return axis === 'x' ? [s, 0, 0, c] : axis === 'y' ? [0, s, 0, c] : [0, 0, s, c]
}

const ELBOW = 0.055 // radians about Z, mirrored
const KNEE = 0.106 // radians about X, same sign both sides

const BONES: Bone[] = [
  { glb: 'root', parent: null, t: [0, 0, 0] },
  { glb: 'hips', parent: 'root', t: [0, 1.28, 0] },

  { glb: 'spine', parent: 'hips', t: [0, 0.17, 0] },
  { glb: 'chest', parent: 'spine', t: [0, 0.21, 0] },
  { glb: 'head', parent: 'chest', t: [0, 0.35, 0] },

  { glb: 'upperarm.l', parent: 'chest', t: [0.23, 0.21, 0], r: q('z', -ELBOW) },
  { glb: 'lowerarm.l', parent: 'upperarm.l', t: [0, -0.40, 0], r: q('z', -ELBOW) },
  { glb: 'wrist.l', parent: 'lowerarm.l', t: [0, -0.36, 0] },
  { glb: 'hand.l', parent: 'wrist.l', t: [0, -0.05, 0] },

  { glb: 'upperarm.r', parent: 'chest', t: [-0.23, 0.21, 0], r: q('z', ELBOW) },
  { glb: 'lowerarm.r', parent: 'upperarm.r', t: [0, -0.40, 0], r: q('z', ELBOW) },
  { glb: 'wrist.r', parent: 'lowerarm.r', t: [0, -0.36, 0] },
  { glb: 'hand.r', parent: 'wrist.r', t: [0, -0.05, 0] },

  { glb: 'upperleg.l', parent: 'hips', t: [0.13, -0.06, 0], r: q('x', KNEE) },
  { glb: 'lowerleg.l', parent: 'upperleg.l', t: [0, -0.56, 0], r: q('x', -KNEE) },
  { glb: 'foot.l', parent: 'lowerleg.l', t: [0, -0.54, 0] },
  { glb: 'toes.l', parent: 'foot.l', t: [0, -0.07, 0.11] },

  { glb: 'upperleg.r', parent: 'hips', t: [-0.13, -0.06, 0], r: q('x', KNEE) },
  { glb: 'lowerleg.r', parent: 'upperleg.r', t: [0, -0.56, 0], r: q('x', -KNEE) },
  { glb: 'foot.r', parent: 'lowerleg.r', t: [0, -0.54, 0] },
  { glb: 'toes.r', parent: 'foot.r', t: [0, -0.07, 0.11] },
]

// ---------------------------------------------------------------------------
// The body
// ---------------------------------------------------------------------------
// One box per bone, given in that bone's own space, so a box follows its joint
// with no weighting maths at all. `c` is a shade index into PALETTE.
type Box = { bone: string; size: [number, number, number]; at: [number, number, number]; c: number }

const SHELL = 0 // the suit
const JOINT = 1 // shoulders, elbows, knees - the darker pieces
const SKIN = 2 // head and hands

const BOXES: Box[] = [
  { bone: 'hips', size: [0.40, 0.22, 0.24], at: [0, -0.02, 0], c: SHELL },
  { bone: 'spine', size: [0.38, 0.20, 0.23], at: [0, 0.08, 0], c: SHELL },
  { bone: 'chest', size: [0.44, 0.30, 0.26], at: [0, 0.14, 0], c: SHELL },
  { bone: 'head', size: [0.30, 0.30, 0.30], at: [0, 0.15, 0], c: SKIN },
  // A snout, so the figure has a front. Without it you cannot tell which way a
  // placeholder is facing, and "which way am I facing" is the single thing the
  // lounge camera work is most often debugging.
  { bone: 'head', size: [0.12, 0.10, 0.10], at: [0, 0.13, 0.17], c: JOINT },

  ...(['l', 'r'] as const).flatMap((s) => {
    const x = s === 'l' ? 1 : -1
    return [
      { bone: `upperarm.${s}`, size: [0.15, 0.15, 0.15] as [number, number, number], at: [0, 0, 0] as [number, number, number], c: JOINT },
      { bone: `upperarm.${s}`, size: [0.13, 0.34, 0.13] as [number, number, number], at: [0, -0.21, 0] as [number, number, number], c: SHELL },
      { bone: `lowerarm.${s}`, size: [0.13, 0.13, 0.13] as [number, number, number], at: [0, 0, 0] as [number, number, number], c: JOINT },
      { bone: `lowerarm.${s}`, size: [0.11, 0.30, 0.11] as [number, number, number], at: [0, -0.19, 0] as [number, number, number], c: SHELL },
      { bone: `hand.${s}`, size: [0.13, 0.15, 0.13] as [number, number, number], at: [0, -0.06, 0] as [number, number, number], c: SKIN },

      { bone: `upperleg.${s}`, size: [0.19, 0.19, 0.19] as [number, number, number], at: [0, 0, 0] as [number, number, number], c: JOINT },
      { bone: `upperleg.${s}`, size: [0.17, 0.46, 0.17] as [number, number, number], at: [0, -0.29, 0] as [number, number, number], c: SHELL },
      { bone: `lowerleg.${s}`, size: [0.16, 0.16, 0.16] as [number, number, number], at: [0, 0, 0] as [number, number, number], c: JOINT },
      { bone: `lowerleg.${s}`, size: [0.14, 0.44, 0.14] as [number, number, number], at: [0, -0.28, 0] as [number, number, number], c: SHELL },
      { bone: `foot.${s}`, size: [0.16, 0.12, 0.18] as [number, number, number], at: [0, -0.05, 0.02] as [number, number, number], c: JOINT },
      { bone: `toes.${s}`, size: [0.15, 0.08, 0.12] as [number, number, number], at: [0, 0, 0.03] as [number, number, number], c: JOINT },
      // A flash of colour on one shoulder only, so left and right are telling
      // apart at a glance. Same reason as the snout.
      ...(s === 'l'
        ? [{ bone: 'upperarm.l', size: [0.16, 0.06, 0.16] as [number, number, number], at: [0, 0.06, 0] as [number, number, number], c: 3 }]
        : []),
      { bone: `wrist.${s}`, size: [0.10, 0.06, 0.10] as [number, number, number], at: [0, -0.02, 0] as [number, number, number], c: JOINT },
    ].map((b) => ({ ...b, at: [b.at[0] * x, b.at[1], b.at[2]] as [number, number, number] }))
  }),
]

const PALETTE: [number, number, number][] = [
  [0.36, 0.40, 0.62], // shell - indigo, the app's own
  [0.20, 0.22, 0.34], // joint - near-black
  [0.94, 0.78, 0.62], // skin
  [0.94, 0.44, 0.78], // the marker shoulder - the accent pink
]

// ---------------------------------------------------------------------------
// Enough linear algebra to place a joint
// ---------------------------------------------------------------------------
// Column-major 4x4, which is what glTF stores and what three.js expects, so
// there is no transpose anywhere in this file.
type M4 = number[]

const identity = (): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function compose(t: [number, number, number], r: [number, number, number, number]): M4 {
  const [x, y, z, w] = r
  const [x2, y2, z2] = [x + x, y + y, z + z]
  const [xx, xy, xz] = [x * x2, x * y2, x * z2]
  const [yy, yz, zz] = [y * y2, y * z2, z * z2]
  const [wx, wy, wz] = [w * x2, w * y2, w * z2]
  return [
    1 - (yy + zz), xy + wz, xz - wy, 0,
    xy - wz, 1 - (xx + zz), yz + wx, 0,
    xz + wy, yz - wx, 1 - (xx + yy), 0,
    t[0], t[1], t[2], 1,
  ]
}

function multiply(a: M4, b: M4): M4 {
  const out = new Array(16).fill(0)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return out
}

/**
 * Invert a rigid transform - rotation and translation only, no scale.
 *
 * The general 4x4 inverse is a page of cofactors and every bone here is rigid,
 * so this takes the shortcut: transpose the rotation, and negate the
 * translation through it.
 */
function invertRigid(m: M4): M4 {
  const r = [m[0], m[4], m[8], 0, m[1], m[5], m[9], 0, m[2], m[6], m[10], 0, 0, 0, 0, 1]
  const [x, y, z] = [m[12], m[13], m[14]]
  r[12] = -(r[0] * x + r[4] * y + r[8] * z)
  r[13] = -(r[1] * x + r[5] * y + r[9] * z)
  r[14] = -(r[2] * x + r[6] * y + r[10] * z)
  return r
}

const apply = (m: M4, p: [number, number, number]): [number, number, number] => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
]

// World transform of every bone, in declaration order (parents always precede
// children above, which is also what glTF's node list wants).
const index = new Map(BONES.map((b, i) => [b.glb, i]))
const world: M4[] = []
BONES.forEach((b, i) => {
  const local = compose(b.t, b.r ?? [0, 0, 0, 1])
  world[i] = b.parent === null ? local : multiply(world[index.get(b.parent)!], local)
})

// ---------------------------------------------------------------------------
// The mesh
// ---------------------------------------------------------------------------
// Boxes are built in bone space and then baked into bind pose, because a skin
// wants vertices in the same space the inverse bind matrices undo. Each box
// contributes 24 vertices rather than 8: a cube with shared corners has to
// average its normals there, and the result is a sphere-ish shading that hides
// exactly the edges a blocky figure is made of.
const positions: number[] = []
const normals: number[] = []
const colours: number[] = []
const joints: number[] = []
const weights: number[] = []
const indices: number[] = []

const FACES: { n: [number, number, number]; corners: [number, number, number][] }[] = [
  { n: [0, 0, 1], corners: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], corners: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { n: [1, 0, 0], corners: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], corners: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], corners: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], corners: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
]

for (const box of BOXES) {
  const j = index.get(box.bone)
  if (j === undefined) throw new Error(`box on unknown bone: ${box.bone}`)
  const m = world[j]
  const colour = PALETTE[box.c]

  for (const face of FACES) {
    const base = positions.length / 3
    for (const corner of face.corners) {
      const local: [number, number, number] = [
        box.at[0] + (corner[0] * box.size[0]) / 2,
        box.at[1] + (corner[1] * box.size[1]) / 2,
        box.at[2] + (corner[2] * box.size[2]) / 2,
      ]
      positions.push(...apply(m, local))
      // A normal is a direction: rotate it, do not translate it.
      normals.push(
        m[0] * face.n[0] + m[4] * face.n[1] + m[8] * face.n[2],
        m[1] * face.n[0] + m[5] * face.n[1] + m[9] * face.n[2],
        m[2] * face.n[0] + m[6] * face.n[1] + m[10] * face.n[2],
      )
      colours.push(colour[0], colour[1], colour[2], 1)
      joints.push(j, 0, 0, 0)
      weights.push(1, 0, 0, 0)
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
}

// ---------------------------------------------------------------------------
// Write the .glb
// ---------------------------------------------------------------------------
// A binary glTF is a 12-byte header, then a JSON chunk, then a BIN chunk, each
// length-prefixed and padded to four bytes - JSON with spaces, BIN with zeros,
// because a reader is allowed to hand the JSON straight to a parser.
const parts: Buffer[] = []
let offset = 0

/** Append one accessor's worth of bytes and return its bufferView index. */
function view(data: ArrayBufferView, target?: number): number {
  const buf = Buffer.from(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength)
  const pad = (4 - (buf.byteLength % 4)) % 4
  const at = offset
  parts.push(buf)
  if (pad) parts.push(Buffer.alloc(pad))
  offset += buf.byteLength + pad
  views.push({ buffer: 0, byteOffset: at, byteLength: buf.byteLength, ...(target ? { target } : {}) })
  return views.length - 1
}

const views: Record<string, number>[] = []

const min = (n: number) => [0, 1, 2].map((k) => Math.min(...positions.filter((_, i) => i % 3 === k)))
const max = (n: number) => [0, 1, 2].map((k) => Math.max(...positions.filter((_, i) => i % 3 === k)))

// Inverse bind matrices, one per joint, in the skin's joint order.
const ibm = new Float32Array(BONES.length * 16)
world.forEach((m, i) => ibm.set(invertRigid(m), i * 16))

const vPos = view(Float32Array.from(positions), 34962)
const vNrm = view(Float32Array.from(normals), 34962)
const vCol = view(Float32Array.from(colours), 34962)
const vJnt = view(Uint16Array.from(joints), 34962)
const vWgt = view(Float32Array.from(weights), 34962)
const vIdx = view(Uint16Array.from(indices), 34963)
const vIbm = view(ibm)

const count = positions.length / 3
const accessors = [
  { bufferView: vPos, componentType: 5126, count, type: 'VEC3', min: min(0), max: max(0) },
  { bufferView: vNrm, componentType: 5126, count, type: 'VEC3' },
  { bufferView: vCol, componentType: 5126, count, type: 'VEC4' },
  { bufferView: vJnt, componentType: 5123, count, type: 'VEC4' },
  { bufferView: vWgt, componentType: 5126, count, type: 'VEC4' },
  { bufferView: vIdx, componentType: 5123, count: indices.length, type: 'SCALAR' },
  { bufferView: vIbm, componentType: 5126, count: BONES.length, type: 'MAT4' },
]

const nodes: Record<string, unknown>[] = BONES.map((b, i) => {
  const children = BONES.map((c, ci) => (c.parent === b.glb ? ci : -1)).filter((ci) => ci >= 0)
  return {
    name: b.glb,
    translation: b.t,
    ...(b.r ? { rotation: b.r } : {}),
    ...(children.length ? { children } : {}),
  }
})
const meshNode = nodes.length
nodes.push({ name: 'Body', mesh: 0, skin: 0 })

const json = {
  asset: { version: '2.0', generator: 'kxb tools/make-dummy.ts' },
  scene: 0,
  scenes: [{ name: 'Scene', nodes: [index.get('root'), meshNode] }],
  nodes,
  meshes: [
    {
      name: 'Body',
      primitives: [
        {
          attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2, JOINTS_0: 3, WEIGHTS_0: 4 },
          indices: 5,
          material: 0,
        },
      ],
    },
  ],
  skins: [{ name: 'Rig', skeleton: index.get('root'), inverseBindMatrices: 6, joints: BONES.map((_, i) => i) }],
  materials: [
    {
      name: 'Placeholder',
      // COLOR_0 multiplies baseColorFactor, so white here means "use the vertex
      // colour". One material keeps the whole body one draw call.
      pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.75 },
    },
  ],
  accessors,
  bufferViews: views,
  buffers: [{ byteLength: offset }],
}

const bin = Buffer.concat(parts)
const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8')
const jsonPad = Buffer.alloc((4 - (jsonBuf.byteLength % 4)) % 4, 0x20)
const binPad = Buffer.alloc((4 - (bin.byteLength % 4)) % 4, 0)

const chunk = (data: Buffer, type: number) => {
  const head = Buffer.alloc(8)
  head.writeUInt32LE(data.byteLength, 0)
  head.writeUInt32LE(type, 4)
  return Buffer.concat([head, data])
}
const jsonChunk = chunk(Buffer.concat([jsonBuf, jsonPad]), 0x4e4f534a)
const binChunk = chunk(Buffer.concat([bin, binPad]), 0x004e4942)

const header = Buffer.alloc(12)
header.writeUInt32LE(0x46546c67, 0)
header.writeUInt32LE(2, 4)
header.writeUInt32LE(12 + jsonChunk.byteLength + binChunk.byteLength, 8)

const glb = Buffer.concat([header, jsonChunk, binChunk])

// Both addresses the code looks for it at: the animator names the first
// directly (rig.ts DUMMY_URL), the XP pack table names the second.
const OUT = ['public/xo/pda/dummy/Dummy.glb', 'public/xp/packs/dummy/Dummy.glb']
for (const rel of OUT) {
  const file = path.join(import.meta.dir, '..', rel)
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, glb)
}

const height = max(0)[1] - Math.min(...positions.filter((_, i) => i % 3 === 1))
console.log(
  `${BOXES.length} boxes, ${count} vertices, ${BONES.length} joints, ${height.toFixed(3)} cells tall`,
)
for (const rel of OUT) console.log(`  wrote ${rel}  (${(glb.byteLength / 1024).toFixed(1)} kB)`)
