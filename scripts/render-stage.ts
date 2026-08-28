/**
 * Renders the hero's holographic podium to a PNG.
 *
 *     bun run scripts/render-stage.ts
 *
 * Writes `public/xo/stage.png`: three stacked neon slabs seen from the hero's
 * camera, transparent background, glow baked in. The landing page had a CSS
 * approximation of this - an ellipse over three border-radius capsules - and
 * it always read as UI pretending to be an object. This is the object.
 *
 * Same reasoning as `render-blocks.ts` for doing it offline in software: the
 * only WebGL here lives in a browser, and a build asset should not depend on
 * one being open. The geometry is procedural (a stadium-shaped prism, three
 * times), the material is emissive vertex colour - it is a hologram, nothing
 * about it wants a light rig - and the glow is a real bloom pass: threshold,
 * separable blur, add. That is the part CSS could never fake: bloom hugs the
 * projected silhouette, including the ellipse's far edge.
 */

import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { encodePng, type Image } from './png'

const OUT = path.join(import.meta.dir, '..', 'public', 'xo', 'stage.png')

/** Delivered size. Wide: the podium is a landscape object. */
const WIDTH = 1200
const HEIGHT = 640
/** Supersampling factor for the geometry pass. */
const SS = 2

/** Camera: centred, a little above, looking slightly down at the podium. */
const EYE: Vec3 = [0, 2.4, 8.6]
const TARGET: Vec3 = [0, -0.52, 0]
const FOV_DEG = 26

// ---------------------------------------------------------------------------
// The podium
// ---------------------------------------------------------------------------

/** Stadium cross-section: a rectangle with fully rounded ends. */
const STADIUM_W = 4.4
const STADIUM_D = 2.4
const CORNER_R = 1.0
/** Segments per 90° corner arc. */
const ARC_SEGS = 12

const SLAB_HEIGHT = 0.3
const SLAB_GAP = 0.1

/**
 * One slab per entry, top to bottom: fuchsia to cyan, the theme's two poles
 * with violet between them. `grow` widens the lower slabs so each one's top
 * face peeks out from under the slab above as a lit ring.
 */
const SLABS = [
  { rim: [1.0, 0.62, 0.98], side: [0.5, 0.19, 0.6], grow: 1.0 },
  { rim: [0.68, 0.56, 1.0], side: [0.3, 0.19, 0.64], grow: 1.045 },
  { rim: [0.42, 0.85, 1.0], side: [0.12, 0.38, 0.62], grow: 1.09 },
] as const

/** The top surface: a soft violet pool, brightest in the middle. */
const TOP_CENTRE = [0.74, 0.44, 0.88] as const
const TOP_EDGE = [0.48, 0.23, 0.68] as const

// ---------------------------------------------------------------------------

type Vec3 = [number, number, number]
type Colour = readonly [number, number, number]

interface Vertex {
  p: Vec3
  c: Colour
}

type Triangle = [Vertex, Vertex, Vertex]

/** The stadium outline, counter-clockwise, y = 0. */
function stadiumOutline(scale: number): [number, number][] {
  const hw = (STADIUM_W / 2 - CORNER_R) * scale
  const hd = (STADIUM_D / 2 - CORNER_R) * scale
  const r = CORNER_R * scale

  const corners: [number, number, number][] = [
    [hw, hd, 0],
    [-hw, hd, 90],
    [-hw, -hd, 180],
    [hw, -hd, 270],
  ]

  const points: [number, number][] = []
  for (const [cx, cz, startDeg] of corners) {
    for (let s = 0; s <= ARC_SEGS; s++) {
      const a = ((startDeg + (s / ARC_SEGS) * 90) * Math.PI) / 180
      points.push([cx + r * Math.cos(a), cz + r * Math.sin(a)])
    }
  }
  return points
}

/**
 * Builds every triangle of the podium, vertex-coloured.
 *
 * Each slab is a wall of quads around the outline plus a fan for the top face.
 * The wall is split into a thin bright band at the top - the neon edge the
 * bloom pass will pick up - and the darker body below it. Faces the camera
 * never sees (bottoms, the backs the z-buffer culls anyway) are still emitted;
 * at this triangle count, code to skip them would cost more than they do.
 */
function buildPodium(): Triangle[] {
  const triangles: Triangle[] = []

  let yTop = 0
  SLABS.forEach((slab, index) => {
    const yBot = yTop - SLAB_HEIGHT
    const yBand = yTop - SLAB_HEIGHT * 0.32
    const outline = stadiumOutline(slab.grow)

    /** Depth cue: the far side of each wall sits a register darker. */
    const shade = (c: Colour, z: number): Colour => {
      const f = 0.7 + 0.3 * ((z + STADIUM_D / 2) / STADIUM_D)
      return [c[0] * f, c[1] * f, c[2] * f]
    }

    for (let i = 0; i < outline.length; i++) {
      const [x0, z0] = outline[i]
      const [x1, z1] = outline[(i + 1) % outline.length]

      // The bright rim band.
      const rim00: Vertex = { p: [x0, yTop, z0], c: shade(slab.rim, z0) }
      const rim10: Vertex = { p: [x1, yTop, z1], c: shade(slab.rim, z1) }
      const rim01: Vertex = { p: [x0, yBand, z0], c: shade(slab.rim, z0) }
      const rim11: Vertex = { p: [x1, yBand, z1], c: shade(slab.rim, z1) }
      triangles.push([rim00, rim10, rim11], [rim00, rim11, rim01])

      // The body below it, fading darker towards the bottom.
      const dim: Colour = [slab.side[0] * 0.55, slab.side[1] * 0.55, slab.side[2] * 0.55]
      const body00: Vertex = { p: [x0, yBand, z0], c: shade(slab.side, z0) }
      const body10: Vertex = { p: [x1, yBand, z1], c: shade(slab.side, z1) }
      const body01: Vertex = { p: [x0, yBot, z0], c: shade(dim, z0) }
      const body11: Vertex = { p: [x1, yBot, z1], c: shade(dim, z1) }
      triangles.push([body00, body10, body11], [body00, body11, body01])
    }

    // Top face. The first slab's is the stage floor; the lower ones only show
    // as the ring their `grow` leaves uncovered, in their own rim colour.
    const centre: Vertex = {
      p: [0, yTop, 0],
      c: index === 0 ? TOP_CENTRE : slab.rim,
    }
    const edgeColour: Colour =
      index === 0 ? TOP_EDGE : [slab.rim[0] * 0.75, slab.rim[1] * 0.75, slab.rim[2] * 0.75]
    for (let i = 0; i < outline.length; i++) {
      const [x0, z0] = outline[i]
      const [x1, z1] = outline[(i + 1) % outline.length]
      triangles.push([
        centre,
        { p: [x0, yTop, z0], c: edgeColour },
        { p: [x1, yTop, z1], c: edgeColour },
      ])
    }

    yTop = yBot - SLAB_GAP
  })

  return triangles
}

// ---------------------------------------------------------------------------
// Rasterizer. Positions via lookAt/perspective, colours interpolated affinely -
// at this depth range the perspective error in a colour is invisible.
// ---------------------------------------------------------------------------

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}

function render(triangles: Triangle[]): Image {
  const w = WIDTH * SS
  const h = HEIGHT * SS
  const aspect = w / h

  // Basis of a camera at EYE looking at TARGET.
  const back = normalize([EYE[0] - TARGET[0], EYE[1] - TARGET[1], EYE[2] - TARGET[2]])
  const right = normalize([back[2], 0, -back[0]])
  const up: Vec3 = [
    back[1] * right[2] - back[2] * right[1],
    back[2] * right[0] - back[0] * right[2],
    back[0] * right[1] - back[1] * right[0],
  ]
  const f = 1 / Math.tan((FOV_DEG * Math.PI) / 360)

  const project = (p: Vec3) => {
    const d: Vec3 = [p[0] - EYE[0], p[1] - EYE[1], p[2] - EYE[2]]
    const cx = d[0] * right[0] + d[1] * right[1] + d[2] * right[2]
    const cy = d[0] * up[0] + d[1] * up[1] + d[2] * up[2]
    const cz = d[0] * back[0] + d[1] * back[1] + d[2] * back[2]
    // cz is negative in front of the camera.
    const invZ = -1 / cz
    return {
      x: ((cx * f) / aspect) * invZ * 0.5 * w + w / 2,
      y: h / 2 - cy * f * invZ * 0.5 * h,
      z: -cz,
    }
  }

  const colour = new Float32Array(w * h * 3)
  const alpha = new Float32Array(w * h)
  const depth = new Float32Array(w * h).fill(Infinity)

  for (const tri of triangles) {
    const s = tri.map((v) => project(v.p))
    if (s.some((v) => v.z <= 0.01)) continue

    const area = (s[1].x - s[0].x) * (s[2].y - s[0].y) - (s[2].x - s[0].x) * (s[1].y - s[0].y)
    if (area === 0) continue

    const x0 = Math.max(0, Math.floor(Math.min(s[0].x, s[1].x, s[2].x)))
    const x1 = Math.min(w - 1, Math.ceil(Math.max(s[0].x, s[1].x, s[2].x)))
    const y0 = Math.max(0, Math.floor(Math.min(s[0].y, s[1].y, s[2].y)))
    const y1 = Math.min(h - 1, Math.ceil(Math.max(s[0].y, s[1].y, s[2].y)))

    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const cx = px + 0.5
        const cy = py + 0.5
        const w0 = ((s[1].x - cx) * (s[2].y - cy) - (s[2].x - cx) * (s[1].y - cy)) / area
        const w1 = ((s[2].x - cx) * (s[0].y - cy) - (s[0].x - cx) * (s[2].y - cy)) / area
        const w2 = 1 - w0 - w1
        if (w0 < 0 || w1 < 0 || w2 < 0) continue

        const z = w0 * s[0].z + w1 * s[1].z + w2 * s[2].z
        const at = py * w + px
        if (z >= depth[at]) continue

        for (let c = 0; c < 3; c++) {
          colour[at * 3 + c] =
            w0 * tri[0].c[c] + w1 * tri[1].c[c] + w2 * tri[2].c[c]
        }
        alpha[at] = 1
        depth[at] = z
      }
    }
  }

  // Downsample to the delivered size.
  const outColour = new Float32Array(WIDTH * HEIGHT * 3)
  const outAlpha = new Float32Array(WIDTH * HEIGHT)
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const at = (y * SS + sy) * w + x * SS + sx
          r += colour[at * 3] * alpha[at]
          g += colour[at * 3 + 1] * alpha[at]
          b += colour[at * 3 + 2] * alpha[at]
          a += alpha[at]
        }
      }
      const at = y * WIDTH + x
      const n = SS * SS
      outColour[at * 3] = a > 0 ? r / a : 0
      outColour[at * 3 + 1] = a > 0 ? g / a : 0
      outColour[at * 3 + 2] = a > 0 ? b / a : 0
      outAlpha[at] = a / n
    }
  }

  return bloom(outColour, outAlpha)
}

// ---------------------------------------------------------------------------
// Bloom: threshold, blur, add. The blur is three box passes per axis, which
// converges on a gaussian without ever computing one.
// ---------------------------------------------------------------------------

const BLOOM_THRESHOLD = 0.55
const BLOOM_RADIUS = 7
const BLOOM_STRENGTH = 0.9

function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  const n = radius * 2 + 1

  // Horizontal, per channel, running sum.
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0
      for (let x = -radius; x <= radius; x++) {
        sum += src[(y * w + Math.min(w - 1, Math.max(0, x))) * 3 + c]
      }
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 3 + c] = sum / n
        const drop = Math.max(0, x - radius)
        const add = Math.min(w - 1, x + radius + 1)
        sum += src[(y * w + add) * 3 + c] - src[(y * w + drop) * 3 + c]
      }
    }
  }

  // Vertical.
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0
      for (let y = -radius; y <= radius; y++) {
        sum += tmp[(Math.min(h - 1, Math.max(0, y)) * w + x) * 3 + c]
      }
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 3 + c] = sum / n
        const drop = Math.max(0, y - radius)
        const add = Math.min(h - 1, y + radius + 1)
        sum += tmp[(add * w + x) * 3 + c] - tmp[(drop * w + x) * 3 + c]
      }
    }
  }

  return out
}

function bloom(colour: Float32Array, alpha: Float32Array): Image {
  const count = WIDTH * HEIGHT

  // Bright pass: what is left above the threshold, silhouette only.
  let bright: Float32Array = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    if (alpha[i] === 0) continue
    for (let c = 0; c < 3; c++) {
      bright[i * 3 + c] = Math.max(0, colour[i * 3 + c] - BLOOM_THRESHOLD)
    }
  }

  for (let pass = 0; pass < 3; pass++) {
    bright = boxBlur(bright, WIDTH, HEIGHT, BLOOM_RADIUS)
  }

  const data = new Uint8Array(count * 4)
  for (let i = 0; i < count; i++) {
    const glow = Math.min(
      1,
      (bright[i * 3] + bright[i * 3 + 1] + bright[i * 3 + 2]) * BLOOM_STRENGTH,
    )
    // The glow extends the silhouette: outside the podium the bloom IS the
    // pixel, scaled into alpha so it fades over whatever the page puts behind.
    const a = Math.min(1, alpha[i] + glow)
    if (a <= 0) continue

    for (let c = 0; c < 3; c++) {
      const lit = colour[i * 3 + c] * alpha[i] + bright[i * 3 + c] * BLOOM_STRENGTH
      // Un-premultiply so the faded fringe keeps its hue.
      data[i * 4 + c] = Math.round(Math.min(1, lit / a) * 255)
    }
    data[i * 4 + 3] = Math.round(a * 255)
  }

  return { width: WIDTH, height: HEIGHT, data }
}

/**
 * Trims the transparent margins, keeping a little padding for the glow's tail.
 *
 * The camera leaves generous margins so nothing is ever clipped mid-bloom;
 * cropping afterwards means the CSS that places this image can treat "width of
 * the image" and "width of the podium" as the same thing.
 */
function autoCrop(image: Image, pad: number): Image {
  let minX = image.width
  let minY = image.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] === 0) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(image.width - 1, maxX + pad)
  maxY = Math.min(image.height - 1, maxY + pad)

  const w = maxX - minX + 1
  const h = maxY - minY + 1
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const from = ((y + minY) * image.width + minX) * 4
    data.set(image.data.subarray(from, from + w * 4), y * w * 4)
  }
  return { width: w, height: h, data }
}

// ---------------------------------------------------------------------------

const triangles = buildPodium()
const image = autoCrop(render(triangles), 12)
writeFileSync(OUT, encodePng(image))
console.log(
  `stage: ${triangles.length} tris → ${path.relative(process.cwd(), OUT)} (${image.width}x${image.height})`,
)
