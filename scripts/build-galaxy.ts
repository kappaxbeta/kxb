/**
 * Authors `public/xo/cosmos/galaxy.glb` - a galaxy you can summon into a room.
 *
 *     bun run scripts/build-galaxy.ts
 *
 * Run it after changing the texture or any of the numbers below. The output is
 * checked in, exactly as the render scripts' output is.
 *
 * ---------------------------------------------------------------------------
 * Why the file is written rather than modelled
 * ---------------------------------------------------------------------------
 * Every other model we ship was drawn by somebody in Blender and downloaded
 * from itch.io. This one is a disc, a lens and thirty specks, and all three of
 * those are twenty lines of arithmetic - so the modelling step would be a
 * binary in the repo that nobody can diff, review or re-derive when the texture
 * changes. Written by a script, the thing that gets reviewed is the *shape*:
 * the tilt is a number with a comment on it, and a pull request that widens the
 * arms shows up as a widened arm rather than as "galaxy.glb changed".
 *
 * It is also the only way the three effects stay together. A galaxy that glowed
 * because the lounge special-cased its model id, sparkled because a React
 * component drew points next to it, and popped because the summon path knew its
 * name would be three features that each work in exactly one screen. Baked into
 * the glTF, the glow is `emissiveStrength`, the sparkles are geometry and the
 * plop is a clip - which every surface that can draw a model already reads: the
 * lounge, the builder, the thumbnail renderer, the studio, an exported XP.
 *
 * ---------------------------------------------------------------------------
 * Why it is hand-written glTF and not `GLTFExporter`
 * ---------------------------------------------------------------------------
 * three.js ships an exporter and it is the obvious tool. It also wants a DOM -
 * `Blob`, `FileReader`, an `ImageBitmap` to get the texture in - so using it
 * here means either a headless browser in the build or a set of shims standing
 * in for four browser APIs, both of which are more moving parts than the format
 * itself has. glTF is JSON with a buffer stapled to it; what follows is that
 * JSON, and the only fiddly parts (four-byte alignment, the min/max every
 * POSITION accessor owes) are in `Gltf` below rather than in the shapes.
 */

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  comic,
  cutBlack,
  monochrome,
  pixelate,
  type Plate,
  readPlate,
  writePlate,
} from './galaxy-textures'

const ROOT = path.join(import.meta.dir, '..')
const DIR = path.join(ROOT, 'public', 'xo', 'cosmos')

/**
 * The one file nothing here derives: the galaxy plate as it came out of the
 * Sketchfab model, black background and all. Everything else in the folder is
 * written by this script, so replacing this one and re-running is the whole of
 * "use a different galaxy".
 */
const SOURCE = path.join(DIR, 'galaxy-original.png')

/**
 * Every galaxy this pack ships, as a style and a colour.
 *
 * ---------------------------------------------------------------------------
 * Why the colours are models and not a setting
 * ---------------------------------------------------------------------------
 * There are two places a galaxy gets put and only one of them has a panel. In
 * the studio a colour can be a control, and it is - see `BlockSpec.tint`. In a
 * *world* - summoned into a room, placed by the builder - there is nothing to
 * put a colour picker on: a placement is a model id, a cell and a scale, and
 * that is a shape shared by all 1,394 models. So the id carries the colour, and
 * the picker somebody already uses to choose a thing is the picker they use to
 * choose a green one.
 *
 * They are cheap because the pixels are shared. Each of these is a few hundred
 * bytes of geometry pointing at a plate next door by URI, rather than a copy of
 * a 300K texture - which is what made a dozen variants a reasonable idea in the
 * first place.
 */
interface Variant {
  /** The id, after `cosmos/`. */
  name: string
  /** Which plate it draws with. */
  plate: string
  /** Multiplied over the plate, or null to leave its own colours alone. */
  tint: [number, number, number] | null
  /** How hard the disc emits. The flatter styles need less. */
  glow: number
}

/**
 * The tints, as linear multipliers.
 *
 * Chosen away from the primaries on purpose: a galaxy at pure `[1, 0, 0]` has
 * no blue or green left anywhere in it, so the dust lanes and the core go the
 * same flat red as the arms and the whole spiral disappears. Every one of these
 * keeps two channels alive, which is what lets the structure survive the tint.
 */
const TINTS: Record<string, [number, number, number]> = {
  gold: [1, 0.66, 0.16],
  rose: [1, 0.3, 0.52],
  jade: [0.2, 1, 0.58],
  violet: [0.52, 0.3, 1],
}

// ---------------------------------------------------------------------------
// The shape, as numbers somebody can argue with
// ---------------------------------------------------------------------------

/** How wide the disc is, in cells. One, so it fills the cell it is put in. */
const RADIUS = 0.5

/**
 * How far off the floor its middle sits, in cells.
 *
 * Half a cell, so a galaxy summoned onto the ground hangs in the middle of its
 * own cell rather than lying on the floor like a rug. This is the model's own
 * offset rather than the pack's `lift`, because `lift` is multiplied by the
 * placement's scale - a galaxy scaled to 4 would float two cells up, which is
 * not what "a bit off the ground" means.
 */
const HOVER = 0.5

/**
 * How far the disc is tipped towards the camera, in radians.
 *
 * Twenty-two degrees, which is the angle at which it still reads as a spiral
 * from standing height and no longer reads as a sticker on the floor. Flat
 * would be the honest astronomy and is the one angle that makes it vanish when
 * you walk up to it.
 */
const TILT = (22 * Math.PI) / 180

/** And a little roll, so the bar is not square to the world. */
const ROLL = (-9 * Math.PI) / 180

/**
 * How much the disc bulges in the middle, in cells.
 *
 * A real galaxy is a lens rather than a sheet, and here it does a second job:
 * a flat quad seen edge-on is one pixel tall, and this is what keeps something
 * on screen when somebody walks around to the side of it. Small - a twelfth of
 * the radius - because past that the texture visibly stretches over the dome.
 */
const BULGE = 0.075

/** How many quads across the disc grid is. Enough to make the bulge smooth. */
const SEGMENTS = 28

/** The core: a flattened lens inside the disc, which is what actually glows. */
const CORE_RADIUS = 0.072
const CORE_FLATTEN = 0.42

/** How bright the surfaces emit. See `KHR_materials_emissive_strength`. */
const DISC_GLOW = 2.4
const CORE_GLOW = 3.4
const SPARK_GLOW = 5

/** How long a full turn takes, in seconds, and how long the plop takes. */
const SPIN_SECONDS = 24
const PLOP_SECONDS = 0.62

// ---------------------------------------------------------------------------
// A very small glTF writer
// ---------------------------------------------------------------------------

const FLOAT = 5126
const USHORT = 5123
const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963

interface Mesh {
  positions: number[]
  normals: number[]
  uvs?: number[]
  indices: number[]
}

class Gltf {
  readonly json: Record<string, unknown> = {}
  private readonly blobs: Buffer[] = []
  private length = 0

  readonly bufferViews: Record<string, unknown>[] = []
  readonly accessors: Record<string, unknown>[] = []

  /**
   * Appends bytes and returns the bufferView that covers them.
   *
   * Every view starts on a four-byte boundary. The spec only requires it of
   * views an accessor reads, but a padded image view costs three bytes and
   * removes the one class of bug in this file that would produce a valid-looking
   * GLB that renders as garbage on some loaders and fine on others.
   */
  private view(bytes: Buffer, target?: number): number {
    const pad = (4 - (this.length % 4)) % 4
    if (pad > 0) {
      this.blobs.push(Buffer.alloc(pad))
      this.length += pad
    }
    const index = this.bufferViews.length
    this.bufferViews.push({
      buffer: 0,
      byteOffset: this.length,
      byteLength: bytes.length,
      ...(target === undefined ? {} : { target }),
    })
    this.blobs.push(bytes)
    this.length += bytes.length
    return index
  }

  /** Raw bytes with no accessor over them - which is only ever an image. */
  bytes(bytes: Buffer): number {
    return this.view(bytes)
  }

  /**
   * A float accessor of `size` components.
   *
   * `min`/`max` are written for every one of them rather than only for POSITION
   * where the spec demands it: they are three lines here and they are what lets
   * a loader compute a bounding box without walking the buffer, which is how
   * `measure` in the lounge sizes a carry box.
   */
  floats(values: number[], size: number, target?: number): number {
    const bytes = Buffer.alloc(values.length * 4)
    values.forEach((value, i) => bytes.writeFloatLE(value, i * 4))

    const min = Array.from({ length: size }, () => Infinity)
    const max = Array.from({ length: size }, () => -Infinity)
    for (let i = 0; i < values.length; i += 1) {
      const lane = i % size
      min[lane] = Math.min(min[lane], values[i])
      max[lane] = Math.max(max[lane], values[i])
    }

    const index = this.accessors.length
    this.accessors.push({
      bufferView: this.view(bytes, target),
      componentType: FLOAT,
      count: values.length / size,
      type: ['SCALAR', 'VEC2', 'VEC3', 'VEC4'][size - 1],
      min,
      max,
    })
    return index
  }

  /** An unsigned-short index accessor. Every mesh here is far under 65k verts. */
  indices(values: number[]): number {
    const bytes = Buffer.alloc(values.length * 2)
    values.forEach((value, i) => bytes.writeUInt16LE(value, i * 2))
    const index = this.accessors.length
    this.accessors.push({
      bufferView: this.view(bytes, ELEMENT_ARRAY_BUFFER),
      componentType: USHORT,
      count: values.length,
      type: 'SCALAR',
      min: [Math.min(...values)],
      max: [Math.max(...values)],
    })
    return index
  }

  /** The whole thing, as the two chunks a GLB is. */
  pack(): Buffer {
    const bin = Buffer.concat(this.blobs)
    const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)])

    this.json.buffers = [{ byteLength: binPadded.length }]
    this.json.bufferViews = this.bufferViews
    this.json.accessors = this.accessors

    const raw = Buffer.from(JSON.stringify(this.json), 'utf8')
    // JSON is padded with spaces rather than zeros - a NUL inside the chunk is
    // legal but trips validators that hand the chunk straight to a parser.
    const jsonPadded = Buffer.concat([raw, Buffer.alloc((4 - (raw.length % 4)) % 4, 0x20)])

    const header = Buffer.alloc(12)
    header.write('glTF', 0, 'ascii')
    header.writeUInt32LE(2, 4)
    header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binPadded.length, 8)

    const jsonHeader = Buffer.alloc(8)
    jsonHeader.writeUInt32LE(jsonPadded.length, 0)
    jsonHeader.writeUInt32LE(0x4e4f534a, 4)

    const binHeader = Buffer.alloc(8)
    binHeader.writeUInt32LE(binPadded.length, 0)
    binHeader.writeUInt32LE(0x004e4942, 4)

    return Buffer.concat([header, jsonHeader, jsonPadded, binHeader, binPadded])
  }
}

// ---------------------------------------------------------------------------
// The shapes
// ---------------------------------------------------------------------------

/**
 * The disc: a square grid, domed in the middle, with the texture stretched
 * across it corner to corner.
 *
 * Square rather than a fan of triangles in a circle, and that is the texture's
 * doing: the galaxy is already round *in its alpha*, fading to nothing well
 * before the edge of the image. A circular mesh would have to guess where that
 * fade ends and would clip the outer haze the moment it guessed low. A square
 * carries the whole image and lets the alpha decide what a galaxy is - which is
 * also why the corners cost nothing: they are transparent.
 */
function disc(): Mesh {
  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  // How fast the dome falls away. Two-fifths of the radius puts the whole bulge
  // inside the bright middle of the texture, where a real one is.
  const sigma = RADIUS * 0.4

  for (let row = 0; row <= SEGMENTS; row += 1) {
    for (let col = 0; col <= SEGMENTS; col += 1) {
      const u = col / SEGMENTS
      const v = row / SEGMENTS
      const x = (u - 0.5) * 2 * RADIUS
      const z = (v - 0.5) * 2 * RADIUS

      const falloff = Math.exp(-((x * x + z * z) / (sigma * sigma)))
      positions.push(x, BULGE * falloff, z)

      // The dome's own normal, differentiated rather than guessed: dy/dx is
      // -2x/sigma^2 times the height, and the surface normal is (-dy/dx, 1,
      // -dy/dz) normalised. Straight up would light the dome as if it were flat
      // and lose the shading that makes it read as a lens at all.
      const dx = (-2 * x) / (sigma * sigma) * BULGE * falloff
      const dz = (-2 * z) / (sigma * sigma) * BULGE * falloff
      const len = Math.hypot(-dx, 1, -dz)
      normals.push(-dx / len, 1 / len, -dz / len)

      uvs.push(u, v)
    }
  }

  const stride = SEGMENTS + 1
  for (let row = 0; row < SEGMENTS; row += 1) {
    for (let col = 0; col < SEGMENTS; col += 1) {
      const a = row * stride + col
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1)
    }
  }

  return { positions, normals, uvs, indices }
}

/** The core, as a sphere squashed flat. What the glow actually comes off. */
function core(): Mesh {
  const rings = 12
  const sectors = 20
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []

  for (let ring = 0; ring <= rings; ring += 1) {
    const phi = (ring / rings) * Math.PI
    for (let sector = 0; sector <= sectors; sector += 1) {
      const theta = (sector / sectors) * Math.PI * 2
      const nx = Math.sin(phi) * Math.cos(theta)
      const ny = Math.cos(phi)
      const nz = Math.sin(phi) * Math.sin(theta)
      positions.push(nx * CORE_RADIUS, ny * CORE_RADIUS * CORE_FLATTEN, nz * CORE_RADIUS)
      // Flattening the positions tilts the normals the other way, so they are
      // scaled by the inverse - the standard trick, and without it a squashed
      // sphere lights like a round one and looks like a ball.
      const len = Math.hypot(nx, ny / CORE_FLATTEN, nz)
      normals.push(nx / len, ny / CORE_FLATTEN / len, nz / len)
    }
  }

  const stride = sectors + 1
  for (let ring = 0; ring < rings; ring += 1) {
    for (let sector = 0; sector < sectors; sector += 1) {
      const a = ring * stride + sector
      indices.push(a, a + stride, a + 1, a + 1, a + stride, a + stride + 1)
    }
  }

  return { positions, normals, indices }
}

/**
 * A handful of sparks, as octahedra scattered in a band around the disc.
 *
 * Solid little shapes rather than a POINTS primitive, which is what "sparkles"
 * would suggest and is the one thing glTF cannot promise: point size is a
 * renderer setting, three.js draws them a pixel across at any distance, and a
 * sparkle you cannot see is not one. Eight triangles each is nothing, and it
 * catches the light and turns with the thing for free.
 *
 * Scattered from a fixed sequence rather than `Math.random`, so re-running this
 * script does not produce a different file for no reason - the same argument
 * `CarryBox` makes for seeding its stars off the model id.
 */
function sparks(count: number, seed: number, band: [number, number]): Mesh {
  let state = seed >>> 0
  const next = (): number => {
    // xorshift32: three lines, no dependency, and the same numbers on every
    // machine - which is the whole point of not using Math.random here.
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 100000) / 100000
  }

  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []

  for (let i = 0; i < count; i += 1) {
    const angle = next() * Math.PI * 2
    const radius = band[0] + next() * (band[1] - band[0])
    // Thinner vertically than it is wide, so the sparks sit *in* the disc's
    // plane rather than in a ball around it - a galaxy's dust does.
    const height = (next() - 0.5) * 0.16
    const size = 0.0035 + next() * 0.005

    const cx = Math.cos(angle) * radius
    const cy = height
    const cz = Math.sin(angle) * radius

    const base = positions.length / 3
    const points = [
      [size, 0, 0], [-size, 0, 0],
      [0, size, 0], [0, -size, 0],
      [0, 0, size], [0, 0, -size],
    ]
    for (const [x, y, z] of points) {
      positions.push(cx + x, cy + y, cz + z)
      const len = Math.hypot(x, y, z)
      normals.push(x / len, y / len, z / len)
    }

    // The eight faces of an octahedron, wound outwards.
    const faces = [
      [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
      [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5],
    ]
    for (const face of faces) indices.push(base + face[0], base + face[1], base + face[2])
  }

  return { positions, normals, indices }
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

/**
 * The plop, as a scale curve.
 *
 * ---------------------------------------------------------------------------
 * Why it overshoots and squashes rather than easing in
 * ---------------------------------------------------------------------------
 * A thing that scales 0 to 1 on an ease-out arrives, and that is all it does.
 * The reading somebody means by "plops out" is that it arrived *with force* -
 * which is a curve that goes past its size, is caught, and settles. So this
 * peaks at 1.16 a quarter of the way through, and the wide moments are also the
 * flat ones: at the peak it is 1.16 across and 0.86 tall, which is a thing
 * landing, and at the rebound it is narrow and tall.
 *
 * Baked as keys rather than written as a spring, because glTF has no springs
 * and CUBICSPLINE would need tangents computed for the same curve anyway.
 * Sixty samples a second of something this short is 38 keys and half a
 * kilobyte, and linear interpolation between them is exactly what the curve
 * already looked like.
 */
function plopKeys(): { times: number[]; scales: number[] } {
  const times: number[] = []
  const scales: number[] = []
  const steps = Math.round(PLOP_SECONDS * 60)

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps

    // A damped overshoot, settling on 1. The frequency and decay are picked so
    // it crosses 1 at about a fifth of the way in and is inside a percent of it
    // by the end - a curve still visibly moving when the clip stops would pop.
    const swell = 1 - Math.exp(-4.6 * t) * Math.cos(9.4 * t)

    // Volume is roughly kept: what it gains across it loses in height. Not
    // exactly - a true 1/sqrt would make the first frames a needle - so the
    // squash is damped to a third of the stretch.
    const squash = 1 - (swell - 1) * 0.8

    times.push(Number((t * PLOP_SECONDS).toFixed(5)))
    scales.push(
      Number(swell.toFixed(5)),
      Number(squash.toFixed(5)),
      Number(swell.toFixed(5)),
    )
  }

  // It starts at nothing, which the curve above does not quite do.
  scales[0] = 0
  scales[1] = 0
  scales[2] = 0

  return { times, scales }
}

/**
 * Hovering: the whole thing rising and falling where it stands.
 *
 * ---------------------------------------------------------------------------
 * Why it is a translation and not also a sway
 * ---------------------------------------------------------------------------
 * A tilt would read better still, and it cannot go here: the root node already
 * carries the galaxy's tilt as a static rotation, and a rotation *channel* on
 * that node replaces it rather than adding to it - so a sway of five degrees
 * would silently throw the 22-degree tilt away and lay the galaxy flat for the
 * whole clip. Composing the two would mean multiplying every key by the tilt
 * quaternion, which is real arithmetic in service of an effect nobody would
 * name. Rising and falling is what "floating" means anyway.
 *
 * A whole number of cycles per loop, like the turns: the last key has to equal
 * the first or the galaxy jumps back down every time the clip repeats.
 */
function hoverKeys(cycles: number, seconds: number, height: number): {
  times: number[]
  offsets: number[]
} {
  const perCycle = 12
  const steps = cycles * perCycle
  const times: number[] = []
  const offsets: number[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    times.push(Number((t * seconds).toFixed(5)))
    offsets.push(0, Number((HOVER + Math.sin(t * cycles * Math.PI * 2) * height).toFixed(5)), 0)
  }
  return { times, offsets }
}

/**
 * A turn about the up axis, as quaternion keys.
 *
 * Every 90 degrees rather than at the two ends, because linear interpolation
 * between two quaternions takes the shorter way round: a single key pair a full
 * turn apart is a pair that is *identical*, and the thing would stand still.
 * Anything up to 180 is unambiguous, and a quarter turn is also close enough
 * that the slerp-as-lerp a loader does looks like constant speed.
 */
function turnKeys(turns: number, seconds: number): { times: number[]; quats: number[] } {
  const steps = Math.max(4, Math.abs(turns) * 4)
  const times: number[] = []
  const quats: number[] = []
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * turns * Math.PI * 2
    times.push(Number(((i / steps) * seconds).toFixed(5)))
    quats.push(0, Number(Math.sin(angle / 2).toFixed(6)), 0, Number(Math.cos(angle / 2).toFixed(6)))
  }
  return { times, quats }
}

/**
 * The twinkle: a scale that breathes, a whole number of times per loop.
 *
 * Whole, so the last key equals the first and the clip can loop without the
 * sparks jumping - the same reason the turns above are whole turns.
 */
function twinkleKeys(cycles: number, seconds: number, depth: number, phase: number): {
  times: number[]
  scales: number[]
} {
  const perCycle = 8
  const steps = cycles * perCycle
  const times: number[] = []
  const scales: number[] = []
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const pulse = 1 + Math.sin((t * cycles + phase) * Math.PI * 2) * depth
    times.push(Number((t * seconds).toFixed(5)))
    scales.push(Number(pulse.toFixed(5)), Number(pulse.toFixed(5)), Number(pulse.toFixed(5)))
  }
  return { times, scales }
}

// ---------------------------------------------------------------------------
// Putting it together
// ---------------------------------------------------------------------------

function buildVariant(variant: Variant): Buffer {
  const gltf = new Gltf()

  const meshes: Record<string, unknown>[] = []
  const addMesh = (mesh: Mesh, material: number, name: string): number => {
    const attributes: Record<string, number> = {
      POSITION: gltf.floats(mesh.positions, 3, ARRAY_BUFFER),
      NORMAL: gltf.floats(mesh.normals, 3, ARRAY_BUFFER),
    }
    if (mesh.uvs) attributes.TEXCOORD_0 = gltf.floats(mesh.uvs, 2, ARRAY_BUFFER)
    const index = meshes.length
    meshes.push({ name, primitives: [{ attributes, indices: gltf.indices(mesh.indices), material }] })
    return index
  }

  // The plate is named rather than embedded - see `Variant`. A GLB is allowed
  // an external image and three resolves it against the model's own URL, which
  // is what lets eight galaxies share one 300K texture instead of carrying
  // eight of them.

  // --- materials -----------------------------------------------------------
  const materials: Record<string, unknown>[] = [
    {
      name: 'galaxy',
      pbrMetallicRoughness: {
        baseColorTexture: { index: 0 },
        // The tint, multiplied over the plate. `1,1,1` for the styles that keep
        // their own colours, which is the same as not being tinted at all.
        baseColorFactor: [...(variant.tint ?? [1, 1, 1]), 1],
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      // The same image again as the emissive map, which is what makes the arms
      // light themselves: base colour alone would leave the galaxy as dark as
      // whatever room it was summoned into, and a galaxy is a light source.
      emissiveTexture: { index: 0 },
      // Tinted here too, and it has to be both: the base colour is what the
      // room's lights land on and the emissive is what the galaxy makes by
      // itself. Tinting only one gives a green galaxy that turns white in the
      // dark, or a white one that turns green.
      emissiveFactor: variant.tint ?? [1, 1, 1],
      extensions: { KHR_materials_emissive_strength: { emissiveStrength: variant.glow } },
      // BLEND rather than MASK: the whole point of the alpha here is the haze
      // at the edge, and a cutout would round every one of those pixels to on
      // or off and give the disc a hard rim.
      alphaMode: 'BLEND',
      // Seen from underneath as often as from above - it hangs at chest height.
      doubleSided: true,
    },
    {
      name: 'galaxy_core',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 0.94, 0.82, 1],
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      // The core keeps a little of its own warmth through a tint rather than
      // taking it whole: a nucleus exactly the colour of the arms around it is
      // a nucleus you cannot see.
      emissiveFactor: variant.tint
        ? [(1 + variant.tint[0]) / 2, (0.88 + variant.tint[1]) / 2, (0.68 + variant.tint[2]) / 2]
        : [1, 0.88, 0.68],
      extensions: { KHR_materials_emissive_strength: { emissiveStrength: CORE_GLOW } },
    },
    {
      name: 'galaxy_spark',
      pbrMetallicRoughness: {
        baseColorFactor: [0.85, 0.93, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 1,
      },
      emissiveFactor: [0.8, 0.9, 1],
      extensions: { KHR_materials_emissive_strength: { emissiveStrength: SPARK_GLOW } },
    },
  ]

  const discMesh = addMesh(disc(), 0, 'disc')
  const coreMesh = addMesh(core(), 1, 'core')
  const sparkMeshes = [
    addMesh(sparks(22, 0x9e3779b9, [0.28, 0.46]), 2, 'sparks_inner'),
    addMesh(sparks(20, 0x517cc1b7, [0.40, 0.60]), 2, 'sparks_middle'),
    addMesh(sparks(16, 0x2545f491, [0.54, 0.74]), 2, 'sparks_outer'),
  ]

  // --- nodes ---------------------------------------------------------------
  //
  // The tilt lives on the root and the spin on the children, which is the only
  // arrangement that turns the galaxy about *its own* axis: a spin applied over
  // the tilt would wobble it like a coin going down a drain.
  const half = TILT / 2
  const halfRoll = ROLL / 2
  const tilt = [
    Math.sin(half) * Math.cos(halfRoll),
    0,
    Math.cos(half) * Math.sin(halfRoll),
    Math.cos(half) * Math.cos(halfRoll),
  ]

  const nodes: Record<string, unknown>[] = [
    {
      name: 'Galaxy',
      translation: [0, HOVER, 0],
      rotation: tilt.map((n) => Number(n.toFixed(6))),
      children: [1, 2, 3, 4, 5],
    },
    { name: 'Disc', mesh: discMesh },
    { name: 'Core', mesh: coreMesh },
    { name: 'Sparks_A', mesh: sparkMeshes[0] },
    { name: 'Sparks_B', mesh: sparkMeshes[1] },
    { name: 'Sparks_C', mesh: sparkMeshes[2] },
  ]

  // --- animations ----------------------------------------------------------
  const animations: Record<string, unknown>[] = []

  const clip = (
    name: string,
    channels: { node: number; path: string; times: number[]; values: number[]; size: number }[],
  ): void => {
    animations.push({
      name,
      samplers: channels.map((channel) => ({
        input: gltf.floats(channel.times, 1),
        output: gltf.floats(channel.values, channel.size),
        interpolation: 'LINEAR',
      })),
      channels: channels.map((channel, i) => ({
        sampler: i,
        target: { node: channel.node, path: channel.path },
      })),
    })
  }

  const plop = plopKeys()
  clip('plop', [
    { node: 0, path: 'scale', times: plop.times, values: plop.scales, size: 3 },
  ])

  // The turns are whole and the twinkles are whole, so `spin` loops seamlessly.
  // The three bands go at different speeds and one goes backwards, which is
  // what stops thirty specks reading as one rotating object.
  const discTurn = turnKeys(1, SPIN_SECONDS)
  const turnA = turnKeys(2, SPIN_SECONDS)
  const turnB = turnKeys(-1, SPIN_SECONDS)
  const turnC = turnKeys(3, SPIN_SECONDS)
  const twinkleA = twinkleKeys(12, SPIN_SECONDS, 0.45, 0)
  const twinkleB = twinkleKeys(8, SPIN_SECONDS, 0.55, 0.33)
  const twinkleC = twinkleKeys(16, SPIN_SECONDS, 0.4, 0.66)

  // Six rises and falls over the loop, which is one every four seconds - slow
  // enough to read as floating rather than as bobbing on water.
  const hover = hoverKeys(6, SPIN_SECONDS, 0.055)

  // On its own, for a blueprint that wants the drift without the turn.
  clip('hover', [
    { node: 0, path: 'translation', times: hover.times, values: hover.offsets, size: 3 },
  ])

  clip('spin', [
    { node: 0, path: 'translation', times: hover.times, values: hover.offsets, size: 3 },
    { node: 1, path: 'rotation', times: discTurn.times, values: discTurn.quats, size: 4 },
    { node: 3, path: 'rotation', times: turnA.times, values: turnA.quats, size: 4 },
    { node: 4, path: 'rotation', times: turnB.times, values: turnB.quats, size: 4 },
    { node: 5, path: 'rotation', times: turnC.times, values: turnC.quats, size: 4 },
    { node: 3, path: 'scale', times: twinkleA.times, values: twinkleA.scales, size: 3 },
    { node: 4, path: 'scale', times: twinkleB.times, values: twinkleB.scales, size: 3 },
    { node: 5, path: 'scale', times: twinkleC.times, values: twinkleC.scales, size: 3 },
  ])

  // `idle` is the same clip under the name the rest of the catalogue uses, so a
  // blueprint that says `clip: 'idle'` out of habit finds something. Two names
  // for one performance is cheap; a galaxy that stands still because somebody
  // guessed the wrong word is not.
  clip('idle', [
    { node: 0, path: 'translation', times: hover.times, values: hover.offsets, size: 3 },
    { node: 1, path: 'rotation', times: discTurn.times, values: discTurn.quats, size: 4 },
    { node: 3, path: 'rotation', times: turnA.times, values: turnA.quats, size: 4 },
    { node: 4, path: 'rotation', times: turnB.times, values: turnB.quats, size: 4 },
    { node: 5, path: 'rotation', times: turnC.times, values: turnC.quats, size: 4 },
    { node: 3, path: 'scale', times: twinkleA.times, values: twinkleA.scales, size: 3 },
    { node: 4, path: 'scale', times: twinkleB.times, values: twinkleB.scales, size: 3 },
    { node: 5, path: 'scale', times: twinkleC.times, values: twinkleC.scales, size: 3 },
  ])

  gltf.json.asset = {
    version: '2.0',
    generator: 'unkown.t scripts/build-galaxy.ts',
  }
  gltf.json.extensionsUsed = ['KHR_materials_emissive_strength']
  gltf.json.images = [{ uri: variant.plate, mimeType: 'image/png', name: 'galaxy' }]
  gltf.json.samplers = [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }]
  gltf.json.textures = [{ source: 0, sampler: 0 }]
  gltf.json.materials = materials
  gltf.json.meshes = meshes
  gltf.json.nodes = nodes
  gltf.json.animations = animations
  gltf.json.scene = 0
  gltf.json.scenes = [{ name: 'Scene', nodes: [0] }]

  return gltf.pack()
}

async function main(): Promise<void> {
  // --- the plates ----------------------------------------------------------
  const original = await readPlate(SOURCE)
  const natural = cutBlack(original)

  const plates: { file: string; plate: Plate }[] = [
    { file: 'galaxy.png', plate: natural },
    { file: 'galaxy-mono.png', plate: monochrome(natural) },
    { file: 'galaxy-comic.png', plate: comic(natural) },
    // Sixteen-pixel blocks over a 512 plate is a 32-tile galaxy, which is big
    // enough that a tile reads as a *cloud* rather than as a large pixel.
    { file: 'galaxy-pixel.png', plate: pixelate(natural, { block: 12 }) },
  ]
  for (const { file, plate } of plates) await writePlate(plate, path.join(DIR, file))

  // --- the models ----------------------------------------------------------
  const variants: Variant[] = [
    { name: 'galaxy', plate: 'galaxy.png', tint: null, glow: DISC_GLOW },
    // Flatter styles emit less: posterised and pixelated plates are mostly
    // their brightest band, so the same strength that lifts a soft gradient
    // turns a flat one into a white card.
    { name: 'galaxy_comic', plate: 'galaxy-comic.png', tint: null, glow: 1.5 },
    { name: 'galaxy_pixel', plate: 'galaxy-pixel.png', tint: null, glow: 1.6 },
    // Points straight at the source plate rather than at a re-encoded copy of
    // it: they are the same pixels, and writing them twice put 400K in the repo
    // to say what one file already said.
    { name: 'galaxy_original', plate: 'galaxy-original.png', tint: null, glow: DISC_GLOW },
    ...Object.entries(TINTS).map(([colour, tint]) => ({
      name: `galaxy_${colour}`,
      // The mono plate, so a tint lands as the colour it names rather than as
      // that colour mixed with the blue the galaxy already was.
      plate: 'galaxy-mono.png',
      tint,
      glow: DISC_GLOW,
    })),
  ]

  for (const variant of variants) {
    const glb = buildVariant(variant)
    writeFileSync(path.join(DIR, `${variant.name}.glb`), glb)
    console.log(`  ${variant.name.padEnd(18)} ${(glb.length / 1024).toFixed(0)}K  ${variant.plate}`)
  }
  console.log(`\n${variants.length} models, ${plates.length} plates -> public/xo/cosmos/`)
}

await main()
