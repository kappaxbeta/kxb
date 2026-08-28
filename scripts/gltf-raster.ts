/**
 * A small software renderer for the asset packs.
 *
 * three.js needs a GPU context, and the only WebGL available here is inside a
 * browser — which makes generating art from the models a manual "open this page
 * and wait" step that nobody remembers to redo when a pack changes. The packs
 * are flat-shaded low-poly models with one texture atlas each, so the subset of
 * a renderer they actually need is small enough to just write: a z-buffered
 * triangle rasterizer with nearest-neighbour texture lookup and two directional
 * lights. That fits in this file and runs anywhere `bun` does.
 *
 * Used by `render-blocks.ts` (landing-page block art) and `render-props.ts`
 * (palette thumbnails for the café and the house).
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { decodePng, type Image } from './png'

export type Vec3 = [number, number, number]
type Mat4 = number[]

// ---------------------------------------------------------------------------
// Small vector / matrix helpers. Column-major 4x4, same convention as glTF.
// ---------------------------------------------------------------------------

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[r] * b[c * 4] +
        a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] +
        a[12 + r] * b[c * 4 + 3]
    }
  }
  return out
}

function fromTRS(t: number[], r: number[], s: number[]): Mat4 {
  const [x, y, z, w] = r
  const x2 = x + x
  const y2 = y + y
  const z2 = z + z
  const xx = x * x2
  const xy = x * y2
  const xz = x * z2
  const yy = y * y2
  const yz = y * z2
  const zz = z * z2
  const wx = w * x2
  const wy = w * y2
  const wz = w * z2

  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ]
}

function applyPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ]
}

function applyDir(m: Mat4, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2],
  ]
}

/** View matrix for a camera at `eye` looking at the origin. */
function lookAt(eye: Vec3): Mat4 {
  const z = normalize(eye)
  const up: Vec3 = [0, 1, 0]
  const x = normalize([
    up[1] * z[2] - up[2] * z[1],
    up[2] * z[0] - up[0] * z[2],
    up[0] * z[1] - up[1] * z[0],
  ])
  const y: Vec3 = [
    z[1] * x[2] - z[2] * x[1],
    z[2] * x[0] - z[0] * x[2],
    z[0] * x[1] - z[1] * x[0],
  ]
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]),
    1,
  ]
}

function perspective(fovDeg: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 360)
  return [
    f, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]
}

// ---------------------------------------------------------------------------
// glTF
// ---------------------------------------------------------------------------

/** One material's texture and tint, resolved to something the shader can use. */
export interface Surface {
  texture: Image
  /** `baseColorFactor`, or white. Multiplied over the texel. */
  factor: [number, number, number, number]
  /**
   * The far end of a colour ramp, if the surface has one.
   *
   * When set, `factor` is the colour at `t = 0` and this is the colour at
   * `t = 1`, with the triangle's own `t` deciding where each pixel falls. Set
   * by nothing that reads a glTF - the packs have flat materials - and used by
   * the generated shapes, where a ramp down the height of an object is what
   * makes a moulded plastic thing look moulded rather than filled in.
   *
   * Linear space, like `factor`, so the interpolation happens where the light
   * maths already is and a mid-tone does not go muddy.
   */
  factorB?: [number, number, number, number]
  /**
   * `emissiveFactor`: light the surface makes rather than receives.
   *
   * Added on top of the lit colour rather than replacing it, which is what glTF
   * says and what three does. A material with an emissive equal to its base
   * colour therefore reads as that colour whatever the lighting is, which is the
   * whole point of it on the shapes pack: a mark on the floor is *paint*, and
   * paint that goes dark in a dark level is a mark you cannot use.
   *
   * Read here because this script's contract is that it draws what the running
   * scene draws. Every pack we ship has a zero emissive, so this was invisible
   * until something in the catalogue set one.
   */
  emissive?: [number, number, number]
}

export interface Triangle {
  p: [Vec3, Vec3, Vec3]
  uv: [number, number][]
  n: [Vec3, Vec3, Vec3]
  surface: Surface
  /**
   * Per-vertex position along `surface`'s colour ramp, 0 to 1.
   *
   * Absent means 0 throughout, which is "just use `factor`" - so every existing
   * caller keeps its flat colour without knowing this field exists.
   */
  t?: [number, number, number]
}

const COMPONENT_SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const TYPE_COUNT: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

/**
 * The slice of glTF this reads.
 *
 * Typed loosely on purpose: the spec is enormous, the packs use a corner of it,
 * and a full set of interfaces here would be a lot of lines describing fields
 * nothing looks at.
 */
interface Gltf {
  scene?: number
  scenes: { nodes: number[] }[]
  nodes: {
    name?: string
    mesh?: number
    children?: number[]
    matrix?: number[]
    translation?: number[]
    rotation?: number[]
    scale?: number[]
  }[]
  meshes: {
    primitives: {
      mode?: number
      indices?: number
      material?: number
      attributes: Record<string, number>
    }[]
  }[]
  materials?: {
    pbrMetallicRoughness?: {
      baseColorFactor?: number[]
      baseColorTexture?: { index: number }
    }
    emissiveFactor?: number[]
  }[]
  textures?: { source: number }[]
  images?: { uri: string }[]
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number; type: string }[]
  bufferViews: { byteOffset?: number; byteStride?: number }[]
  buffers: { uri: string }[]
}

/** Decoded texture atlases, keyed by file path. The packs share a few. */
const textureCache = new Map<string, Image>()

/** A 1x1 white stand-in, so a material without a texture still draws. */
const BLANK: Image = { width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) }

function loadTexture(file: string): Image {
  const cached = textureCache.get(file)
  if (cached) return cached
  const image = decodePng(file)
  textureCache.set(file, image)
  return image
}

/** Reads one accessor into a flat array, honouring the bufferView's stride. */
function readAccessor(gltf: Gltf, bin: Buffer, index: number): number[] {
  const accessor = gltf.accessors[index]
  const view = gltf.bufferViews[accessor.bufferView]
  const components = TYPE_COUNT[accessor.type]
  const size = COMPONENT_SIZE[accessor.componentType]
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  const stride = view.byteStride ?? components * size

  const out: number[] = []
  for (let i = 0; i < accessor.count; i++) {
    const at = base + i * stride
    for (let c = 0; c < components; c++) {
      const o = at + c * size
      switch (accessor.componentType) {
        case 5126: out.push(bin.readFloatLE(o)); break
        case 5125: out.push(bin.readUInt32LE(o)); break
        case 5123: out.push(bin.readUInt16LE(o)); break
        case 5121: out.push(bin.readUInt8(o)); break
        case 5122: out.push(bin.readInt16LE(o)); break
        default: out.push(bin.readInt8(o))
      }
    }
  }
  return out
}

/** How to place a model inside a composition. Matches the catalogs' `extras`. */
export interface Placement {
  x?: number
  y?: number
  z?: number
  rotY?: number
  scale?: number
  /**
   * Per-axis multipliers on top of `scale`, absent meaning one.
   *
   * Applied in the model's own frame, before the rotation, which is the order
   * `THREE.Matrix4.compose` uses and therefore the one the running scene has -
   * a stretch that happened after the turn would make a squashed tile lean
   * rather than stay flat.
   */
  stretch?: { x?: number; y?: number; z?: number }
}

/** Flattens a model's node hierarchy into world-space triangles. */
/**
 * A `.glb`, unpacked into the two halves a `.gltf` keeps in separate files.
 *
 * The container is trivial and worth supporting rather than working around: a
 * 12-byte header, then chunks of `[length, type, bytes]`, of which the first is
 * the JSON that would otherwise be the `.gltf` file and the second is the
 * buffer that would otherwise sit beside it. Everything downstream then works
 * unchanged.
 *
 * The peeps are the pack that needs it - they ship one binary each - and they
 * are also the pack it would be silliest to leave out, since they are the
 * characters. Before this they were the 24 models in the builder's picker that
 * still had to be drawn in the browser.
 */
function readGlb(file: string): { gltf: Gltf; bin: Buffer } {
  const bytes = readFileSync(file)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  let gltf: Gltf | null = null
  let bin: Buffer | null = null

  // Past the 12-byte header: magic, version, total length.
  let at = 12
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at, true)
    const type = view.getUint32(at + 4, true)
    const body = bytes.subarray(at + 8, at + 8 + length)

    // 0x4E4F534A is 'JSON', 0x004E4942 is 'BIN\0'.
    if (type === 0x4e4f534a) gltf = JSON.parse(new TextDecoder().decode(body)) as Gltf
    else if (type === 0x004e4942) bin = Buffer.from(body)

    // Chunks are padded to four bytes.
    at += 8 + length + ((4 - (length % 4)) % 4)
  }

  if (!gltf) throw new Error(`${file} has no JSON chunk`)
  return { gltf, bin: bin ?? Buffer.alloc(0) }
}

/**
 * Matches three.js's `PropertyBinding.sanitizeNodeName`, which strips these
 * characters from a node's name the moment a `.glb` loads in the browser -
 * see the note on the same gotcha in `_editor/animator/rig.ts`. Applied here
 * so a name recorded at build time is the name `node.name` actually is at
 * runtime, rather than one that only matches in this file.
 */
export function sanitizeNodeName(name: string): string {
  return name.replace(/[.[\]/:]/g, '')
}

/**
 * The name of every node with a mesh, in traversal order.
 *
 * Not every node - a mesh-less group is nothing a picker needs a name for,
 * because there is nothing on it to spin. Two nodes sharing a sanitized name
 * make it impossible to say which one a picker means, so the second is
 * dropped rather than guessed at.
 */
export function listDrawnNodes(file: string): string[] {
  const packed = file.toLowerCase().endsWith('.glb')
  const gltf = packed ? readGlb(file).gltf : (JSON.parse(readFileSync(file, 'utf8')) as Gltf)

  const seen = new Set<string>()
  const names: string[] = []

  const walk = (nodeIndex: number) => {
    const node = gltf.nodes[nodeIndex]
    if (node.mesh !== undefined && node.name) {
      const name = sanitizeNodeName(node.name)
      if (!seen.has(name)) {
        seen.add(name)
        names.push(name)
      }
    }
    for (const child of node.children ?? []) walk(child)
  }

  for (const node of gltf.scenes[gltf.scene ?? 0].nodes) walk(node)
  return names
}

export function loadTriangles(file: string, placement: Placement = {}): Triangle[] {
  const dir = path.dirname(file)

  // A `.glb` carries its buffer inside it; a `.gltf` names a file next door.
  const packed = file.toLowerCase().endsWith('.glb')
  const gltf = packed ? readGlb(file).gltf : (JSON.parse(readFileSync(file, 'utf8')) as Gltf)
  const bin = packed
    ? readGlb(file).bin
    : readFileSync(path.join(dir, decodeURIComponent(gltf.buffers[0].uri)))

  const surfaceFor = (material?: number): Surface => {
    const entry = material === undefined ? undefined : gltf.materials?.[material]
    const pbr = entry?.pbrMetallicRoughness
    const source = pbr?.baseColorTexture ? gltf.textures?.[pbr.baseColorTexture.index]?.source : undefined
    const uri = source === undefined ? undefined : gltf.images?.[source]?.uri
    const factor = (pbr?.baseColorFactor ?? [1, 1, 1, 1]) as [number, number, number, number]
    const emissive = entry?.emissiveFactor as [number, number, number] | undefined
    return {
      texture: uri ? loadTexture(path.join(dir, decodeURIComponent(uri))) : BLANK,
      factor,
      ...(emissive && emissive.some((c) => c > 0) ? { emissive } : {}),
    }
  }

  const scale = placement.scale ?? 1
  const angle = placement.rotY ?? 0
  const root = fromTRS(
    [placement.x ?? 0, placement.y ?? 0, placement.z ?? 0],
    [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)],
    [
      scale * (placement.stretch?.x ?? 1),
      scale * (placement.stretch?.y ?? 1),
      scale * (placement.stretch?.z ?? 1),
    ],
  )

  const triangles: Triangle[] = []

  const walk = (nodeIndex: number, parent: Mat4) => {
    const node = gltf.nodes[nodeIndex]
    const local = node.matrix
      ? (node.matrix as Mat4)
      : fromTRS(node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1])
    const world = multiply(parent, local)

    if (node.mesh !== undefined) {
      for (const prim of gltf.meshes[node.mesh].primitives) {
        // Mode 4 is TRIANGLES; the packs have nothing else, and silently drawing
        // a strip as a list would be worse than skipping it.
        if (prim.mode !== undefined && prim.mode !== 4) continue

        const surface = surfaceFor(prim.material)
        const pos = readAccessor(gltf, bin, prim.attributes.POSITION)
        const uv = prim.attributes.TEXCOORD_0 !== undefined
          ? readAccessor(gltf, bin, prim.attributes.TEXCOORD_0)
          : null
        const nor = prim.attributes.NORMAL !== undefined
          ? readAccessor(gltf, bin, prim.attributes.NORMAL)
          : null
        const idx = prim.indices !== undefined
          ? readAccessor(gltf, bin, prim.indices)
          : pos.map((_, i) => i / 3).filter((n) => Number.isInteger(n))

        for (let i = 0; i < idx.length; i += 3) {
          const corner = [idx[i], idx[i + 1], idx[i + 2]]
          const p = corner.map((v) => applyPoint(world, [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]))
          const n = corner.map((v) =>
            nor ? normalize(applyDir(world, [nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]])) : ([0, 1, 0] as Vec3),
          )
          const t = corner.map((v) => (uv ? [uv[v * 2], uv[v * 2 + 1]] : [0, 0]))
          triangles.push({
            p: p as [Vec3, Vec3, Vec3],
            n: n as [Vec3, Vec3, Vec3],
            uv: t as [number, number][],
            surface,
          })
        }
      }
    }

    for (const child of node.children ?? []) walk(child, world)
  }

  for (const node of gltf.scenes[gltf.scene ?? 0].nodes) walk(node, root)
  return triangles
}

// ---------------------------------------------------------------------------
// Rasterizer
// ---------------------------------------------------------------------------

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

/** One directional light. `tint` multiplies its contribution per channel. */
export interface Light {
  dir: Vec3
  intensity: number
  tint?: Vec3
}

/**
 * How a frame is lit and how its surfaces respond.
 *
 * Optional on `RenderOptions`, and `DEFAULT_LIGHTING` below is exactly the rig
 * this file had hard-coded before it was a parameter - so `render-blocks.ts`,
 * `render-props.ts` and `render-pile.ts` are byte-for-byte unaffected by it
 * existing. That is the whole reason it is a default rather than a required
 * field: the block art is checked in, and a lighting change that silently
 * re-lit fifty PNGs the next time anybody regenerated one would be a diff
 * nobody asked for.
 *
 * `specular` is the part that is genuinely new. Everything the packs contain is
 * matte and looked right under pure Lambert; the abstract shapes in
 * `render-shapes.ts` are meant to read as moulded plastic, and plastic is
 * exactly Lambert plus a tight white highlight that does *not* take the
 * surface's colour. Hence a single white term added after the diffuse rather
 * than a full metallic model - the one thing that separates plastic from clay
 * is that the highlight stays white.
 */
export interface Lighting {
  ambient: number
  lights: Light[]
  specular?: {
    /** Blinn-Phong exponent. Higher is a smaller, harder highlight. */
    power: number
    intensity: number
  }
}

export const DEFAULT_LIGHTING: Lighting = {
  ambient: 0.45,
  lights: [
    { dir: normalize([3, 5, 4]), intensity: 0.62 },
    { dir: normalize([-4, 1, -3]), intensity: 0.2, tint: [0.87, 0.9, 1] },
  ],
}

/** Texels this transparent are treated as holes rather than blended. */
const ALPHA_CUTOFF = 0.5

export interface RenderOptions {
  /** Final image size, in pixels. Square. */
  size: number
  /** Supersampling factor. Rendered at size*ss and box-filtered down. */
  supersample?: number
  /** Camera position. It always looks at the origin. */
  eye: Vec3
  fov: number
  /**
   * The size the frame is drawn for, in model units.
   *
   * `cap` only shrinks what is bigger than this, so a pack of same-sized blocks
   * keeps its relative scale and only the odd tall one is pulled in. `fit`
   * scales everything to fill the frame, which is what a palette of a teddy
   * bear and a double bed needs — at true scale the teddy is four pixels.
   */
  frame: { mode: 'cap' | 'fit'; extent: number }
  /** Omitted is `DEFAULT_LIGHTING`, which is what this file always did. */
  lighting?: Lighting
}

export function render(triangles: Triangle[], options: RenderOptions): Image {
  const { size, eye, fov, frame } = options
  const { ambient, lights, specular } = options.lighting ?? DEFAULT_LIGHTING
  const ss = options.supersample ?? 3
  const dim = size * ss

  // Centre on the origin, then scale to the framing rule.
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const tri of triangles) {
    for (const p of tri.p) {
      for (let i = 0; i < 3; i++) {
        if (p[i] < min[i]) min[i] = p[i]
        if (p[i] > max[i]) max[i] = p[i]
      }
    }
  }
  const centre: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1
  const scale =
    frame.mode === 'fit' || extent > frame.extent ? frame.extent / extent : 1

  const viewProjection = multiply(perspective(fov, 0.1, 100), lookAt(eye))
  const toEye = normalize(eye)

  const colour = new Float32Array(dim * dim * 4)
  const depth = new Float32Array(dim * dim).fill(Infinity)

  for (const tri of triangles) {
    const clip = tri.p.map((p) => {
      const local: Vec3 = [
        (p[0] - centre[0]) * scale,
        (p[1] - centre[1]) * scale,
        (p[2] - centre[2]) * scale,
      ]
      const x = viewProjection[0] * local[0] + viewProjection[4] * local[1] + viewProjection[8] * local[2] + viewProjection[12]
      const y = viewProjection[1] * local[0] + viewProjection[5] * local[1] + viewProjection[9] * local[2] + viewProjection[13]
      const z = viewProjection[2] * local[0] + viewProjection[6] * local[1] + viewProjection[10] * local[2] + viewProjection[14]
      const w = viewProjection[3] * local[0] + viewProjection[7] * local[1] + viewProjection[11] * local[2] + viewProjection[15]
      return { x, y, z, w }
    })

    // Anything crossing the near plane is off-frame anyway at this framing;
    // clipping it properly would be code with no picture to show for it.
    if (clip.some((c) => c.w <= 0.001)) continue

    const screen = clip.map((c) => ({
      x: (c.x / c.w * 0.5 + 0.5) * dim,
      y: (1 - (c.y / c.w * 0.5 + 0.5)) * dim,
      z: c.z / c.w,
      invW: 1 / c.w,
    }))

    const area =
      (screen[1].x - screen[0].x) * (screen[2].y - screen[0].y) -
      (screen[2].x - screen[0].x) * (screen[1].y - screen[0].y)
    if (area === 0) continue

    const x0 = Math.max(0, Math.floor(Math.min(screen[0].x, screen[1].x, screen[2].x)))
    const x1 = Math.min(dim - 1, Math.ceil(Math.max(screen[0].x, screen[1].x, screen[2].x)))
    const y0 = Math.max(0, Math.floor(Math.min(screen[0].y, screen[1].y, screen[2].y)))
    const y1 = Math.min(dim - 1, Math.ceil(Math.max(screen[0].y, screen[1].y, screen[2].y)))

    const texture = tri.surface.texture
    const factor = tri.surface.factor

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const cx = px + 0.5
        const cy = py + 0.5

        const w0 = ((screen[1].x - cx) * (screen[2].y - cy) - (screen[2].x - cx) * (screen[1].y - cy)) / area
        const w1 = ((screen[2].x - cx) * (screen[0].y - cy) - (screen[0].x - cx) * (screen[2].y - cy)) / area
        const w2 = 1 - w0 - w1
        if (w0 < 0 || w1 < 0 || w2 < 0) continue

        const z = w0 * screen[0].z + w1 * screen[1].z + w2 * screen[2].z
        const at = py * dim + px
        if (z >= depth[at]) continue

        // Perspective-correct the attributes.
        const invW = w0 * screen[0].invW + w1 * screen[1].invW + w2 * screen[2].invW
        const b0 = (w0 * screen[0].invW) / invW
        const b1 = (w1 * screen[1].invW) / invW
        const b2 = (w2 * screen[2].invW) / invW

        const u = b0 * tri.uv[0][0] + b1 * tri.uv[1][0] + b2 * tri.uv[2][0]
        const v = b0 * tri.uv[0][1] + b1 * tri.uv[1][1] + b2 * tri.uv[2][1]

        // Nearest, not bilinear: every face is a few texels of a shared atlas,
        // so filtering mostly blends in the neighbouring model's colours.
        const tx = Math.min(texture.width - 1, Math.max(0, Math.floor(u * texture.width)))
        const ty = Math.min(texture.height - 1, Math.max(0, Math.floor(v * texture.height)))
        const ti = (ty * texture.width + tx) * 4

        // Cut out rather than blend. The only transparent materials in the
        // packs are glass and leaves, and both read better as holes than as a
        // wash over whatever the depth buffer happened to keep.
        if ((texture.data[ti + 3] / 255) * factor[3] < ALPHA_CUTOFF) continue

        let n: Vec3 = normalize([
          b0 * tri.n[0][0] + b1 * tri.n[1][0] + b2 * tri.n[2][0],
          b0 * tri.n[0][1] + b1 * tri.n[1][1] + b2 * tri.n[2][1],
          b0 * tri.n[0][2] + b1 * tri.n[1][2] + b2 * tri.n[2][2],
        ])
        // Faces authored inside-out would otherwise light as pure shadow.
        if (n[0] * toEye[0] + n[1] * toEye[1] + n[2] * toEye[2] < 0) n = [-n[0], -n[1], -n[2]]

        // Diffuse, one term per light, accumulated per channel so a tinted
        // fill actually tints. `spec` is white and stays out of the loop -
        // see the note on `Lighting.specular`.
        const diffuse: Vec3 = [ambient, ambient, ambient]
        let spec = 0
        for (const light of lights) {
          const lambert = Math.max(0, n[0] * light.dir[0] + n[1] * light.dir[1] + n[2] * light.dir[2])
          if (lambert <= 0) continue
          const tint = light.tint
          const contribution = lambert * light.intensity
          diffuse[0] += contribution * (tint ? tint[0] : 1)
          diffuse[1] += contribution * (tint ? tint[1] : 1)
          diffuse[2] += contribution * (tint ? tint[2] : 1)

          if (specular) {
            // Blinn-Phong. The eye direction is treated as constant across the
            // frame, which is wrong for a perspective camera and invisible at
            // this field of view - the alternative is a normalize per pixel per
            // light for a highlight that moves by a pixel or two.
            const half = normalize([
              light.dir[0] + toEye[0],
              light.dir[1] + toEye[1],
              light.dir[2] + toEye[2],
            ])
            const nh = Math.max(0, n[0] * half[0] + n[1] * half[1] + n[2] * half[2])
            spec += nh ** specular.power * specular.intensity * light.intensity
          }
        }

        // Where this pixel sits on the surface's colour ramp. Flat surfaces
        // have no `t` and no `factorB`, and skip the lerp entirely.
        const ramp = tri.t
          ? b0 * tri.t[0] + b1 * tri.t[1] + b2 * tri.t[2]
          : 0
        const factorB = tri.surface.factorB

        // Light in linear space, then go back to sRGB — shading a gamma-encoded
        // colour directly turns the shadowed faces muddy.
        const emissive = tri.surface.emissive
        for (let c = 0; c < 3; c++) {
          const tone = factorB ? factor[c] + (factorB[c] - factor[c]) * ramp : factor[c]
          const base = toLinear(texture.data[ti + c] / 255) * tone
          const lit = base * diffuse[c] + spec + (emissive ? emissive[c] : 0)
          colour[at * 4 + c] = Math.min(1, toSrgb(Math.min(1, lit)))
        }
        // Opaque: whatever survived the cutout is, and only the background
        // should come out clear.
        colour[at * 4 + 3] = 1
        depth[at] = z
      }
    }
  }

  // Box-filter down to the delivered size. This is where the edges get their
  // antialiasing, and where a partly-covered edge pixel gets its alpha.
  const out = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const at = ((y * ss + sy) * size * ss + x * ss + sx) * 4
          const alpha = colour[at + 3]
          r += colour[at] * alpha
          g += colour[at + 1] * alpha
          b += colour[at + 2] * alpha
          a += alpha
        }
      }
      const d = (y * size + x) * 4
      if (a > 0) {
        // Un-premultiply, so a half-covered edge keeps its colour instead of
        // fading towards black.
        out[d] = Math.round((r / a) * 255)
        out[d + 1] = Math.round((g / a) * 255)
        out[d + 2] = Math.round((b / a) * 255)
      }
      out[d + 3] = Math.round((a / (ss * ss)) * 255)
    }
  }

  return { width: size, height: size, data: out }
}
