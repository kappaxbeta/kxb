import * as THREE from 'three'

/**
 * Something for the shiny finishes to be shiny *of*.
 *
 * ---------------------------------------------------------------------------
 * Why not `RoomEnvironment`
 * ---------------------------------------------------------------------------
 * three ships one, it needs no fetch, and it was the first thing tried here. It
 * is a *white photographer's studio* - and at the intensity its emissive panels
 * are authored at, everything on the shelf went to paper: the matte plastic
 * lost its colour, the metal turned to a white slab, and the covers - actual
 * photographs of actual levels - washed out to nothing. Pulling `envMapIntensity`
 * down far enough to fix that left the metals with nothing to reflect, which was
 * the reason to add an environment at all.
 *
 * The real problem is that it is the wrong room. These cartridges sit on a
 * near-black page under two neon lights, and what should be in a chrome shell is
 * *that* - a dark room with a couple of bright strips in it. So the environment
 * is authored to match the page: almost black, with three lights in it, one of
 * them warm and two of them the product's own violet and cyan.
 *
 * ---------------------------------------------------------------------------
 * How it is built
 * ---------------------------------------------------------------------------
 * An equirectangular byte texture - longitude across, latitude down - handed to
 * `PMREMGenerator`, which pre-blurs it into the mip chain a physical material
 * samples by roughness. 128×64 is plenty: nothing here has a hard edge, and the
 * roughest thing sampling it is a matte shell that will read three or four mip
 * levels down anyway.
 */

const WIDTH = 128
const HEIGHT = 64

/** One soft light: where it hangs, how big, how bright, and what colour. */
interface Lamp {
  /** Longitude and latitude, both 0..1 - latitude 0 is straight up. */
  u: number
  v: number
  /** Angular size, as a fraction of the map. */
  size: number
  strength: number
  colour: [number, number, number]
}

const LAMPS: Lamp[] = [
  // The key, warm and high on the right, which is where the shelf's own
  // directional light comes from - a reflection that disagrees with the shading
  // is the thing that makes a render look composited.
  { u: 0.68, v: 0.2, size: 0.15, strength: 1, colour: [1, 0.95, 0.86] },
  // Fill, cool and low on the left.
  { u: 0.18, v: 0.34, size: 0.22, strength: 0.42, colour: [0.55, 0.7, 1] },
  // And the page's own fuchsia, behind, so a chrome shell has a hint of the
  // site in it rather than being a mirror of nothing.
  { u: 0.95, v: 0.46, size: 0.18, strength: 0.34, colour: [1, 0.35, 0.85] },
]

/** Sky at the zenith, at the horizon, and the ground under it. Near black. */
const ZENITH = [0.1, 0.1, 0.17]
const HORIZON = [0.03, 0.03, 0.06]
const GROUND = [0.015, 0.015, 0.025]

let cached: THREE.DataTexture | null = null

function equirect(): THREE.DataTexture {
  if (cached) return cached

  const data = new Uint8Array(WIDTH * HEIGHT * 4)

  for (let y = 0; y < HEIGHT; y += 1) {
    const v = (y + 0.5) / HEIGHT

    // Sky above the horizon, ground below, with a soft join - a hard line reads
    // as a seam in anything polished enough to show it.
    const sky = Math.min(1, Math.max(0, v / 0.5))
    const above = v <= 0.5
    const base = above
      ? ZENITH.map((top, index) => top + (HORIZON[index] - top) * sky)
      : HORIZON.map((edge, index) => edge + (GROUND[index] - edge) * ((v - 0.5) / 0.5))

    for (let x = 0; x < WIDTH; x += 1) {
      const u = (x + 0.5) / WIDTH
      const colour = [...base]

      for (const lamp of LAMPS) {
        // Wrapped in longitude, so a lamp near the seam is one lamp rather than
        // two half ones.
        const du = Math.min(Math.abs(u - lamp.u), 1 - Math.abs(u - lamp.u))
        const dv = v - lamp.v
        const falloff = Math.exp(-(du * du + dv * dv) / (lamp.size * lamp.size))

        for (let channel = 0; channel < 3; channel += 1) {
          colour[channel] += lamp.colour[channel] * lamp.strength * falloff
        }
      }

      const index = (y * WIDTH + x) * 4
      for (let channel = 0; channel < 3; channel += 1) {
        data[index + channel] = Math.round(Math.min(1, colour[channel]) * 255)
      }
      data[index + 3] = 255
    }
  }

  cached = new THREE.DataTexture(data, WIDTH, HEIGHT, THREE.RGBAFormat)
  cached.mapping = THREE.EquirectangularReflectionMapping
  cached.colorSpace = THREE.SRGBColorSpace
  cached.magFilter = THREE.LinearFilter
  cached.minFilter = THREE.LinearFilter
  cached.needsUpdate = true
  return cached
}

/**
 * The pre-filtered cube map, ready to hang on a scene.
 *
 * The caller owns the result and must dispose it - unlike the equirect above,
 * which is small, immutable and shared by every shelf on the page.
 */
export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const target = pmrem.fromEquirectangular(equirect())
  pmrem.dispose()
  return target.texture
}
