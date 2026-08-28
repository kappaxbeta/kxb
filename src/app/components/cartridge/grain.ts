import * as THREE from 'three'

/**
 * The moulded-plastic surface, as two small textures.
 *
 * ---------------------------------------------------------------------------
 * Why roughness alone was not enough
 * ---------------------------------------------------------------------------
 * A cartridge shell is injection-moulded ABS with a fine spark-eroded texture
 * on the tool, which is why a real one has no reflection you can see yourself
 * in and yet is not flat either - it *sparkles* slightly as it turns. A single
 * high roughness number gets the first half and loses the second: the shell
 * goes matte and dead, and reads as untextured grey rather than as plastic.
 *
 * So there are two maps off one noise field. The roughness map varies how
 * polished each speck is; the normal map tilts each speck a fraction of a
 * degree. Together they are what makes the light crawl when a cartridge tips
 * toward the pointer, which is the whole reason the shelf moves at all.
 *
 * ---------------------------------------------------------------------------
 * Generated rather than shipped
 * ---------------------------------------------------------------------------
 * 128² of value noise is about 64KB of GPU memory and a millisecond of CPU,
 * built once for the document and shared by every cartridge on every shelf. A
 * checked-in PNG would be a request, a decode, and a file somebody has to know
 * not to delete - for something whose whole content is "noise".
 *
 * The field is smoothed once before the normals are taken. Raw white noise
 * differentiates into a normal map of pure salt-and-pepper, which at grazing
 * angles is not grain, it is static.
 */

/** Texels per side. Tiled hard, so this never has to be big. */
const SIZE = 128

/** How many times the field repeats across the shell. */
export const GRAIN_REPEAT = 7

/** How far the roughness map may polish a speck below fully rough. */
const POLISH = 0.24

/** Height of the grain, in the arbitrary units the gradient is taken in. */
const RELIEF = 0.5

let cached: { roughness: THREE.DataTexture; normal: THREE.DataTexture } | null = null
let rust: THREE.DataTexture | null = null

/**
 * A deterministic value-noise field.
 *
 * Deterministic because a shelf that regenerated its plastic on every reload
 * would be a diff nobody could reason about in a screenshot test - and because
 * `Math.random()` in module scope is the kind of thing that quietly breaks a
 * server render.
 */
function field(): Float32Array {
  const raw = new Float32Array(SIZE * SIZE)

  // A cheap integer hash. Two rounds of xorshift is more than enough decorrelation
  // for something that is about to be blurred anyway.
  for (let index = 0; index < raw.length; index += 1) {
    let hash = index * 2654435761
    hash ^= hash >>> 13
    hash = Math.imul(hash, 1274126177)
    hash ^= hash >>> 16
    raw[index] = (hash >>> 0) / 4294967295
  }

  // One box blur, wrapping - the tile has to be seamless or the repeat shows as
  // a grid of hairlines across the shell.
  const smooth = new Float32Array(raw.length)
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      let sum = 0
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const sx = (x + dx + SIZE) % SIZE
          const sy = (y + dy + SIZE) % SIZE
          sum += raw[sy * SIZE + sx]
        }
      }
      smooth[y * SIZE + x] = sum / 9
    }
  }

  return smooth
}

/**
 * Oxidised steel, as a colour map.
 *
 * The same noise field at two frequencies: the coarse one decides where the
 * rust has taken hold and the fine one is the pitting inside it, so the result
 * has patches rather than an even speckle. Rust is a *map* rather than a flat
 * colour because that is the whole difference between rusted and merely brown -
 * the metal shows through in places, and where it does not, it does so
 * unevenly.
 */
export function rustMottle(): THREE.DataTexture {
  if (rust) return rust

  const height = field()
  const at = (x: number, y: number) =>
    height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)]

  const data = new Uint8Array(SIZE * SIZE * 4)

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = (y * SIZE + x) * 4

      // Coarse: the same field read at a quarter of the frequency, which is a
      // second octave for free.
      const patch = at(Math.floor(x / 4), Math.floor(y / 4))
      const pit = at(x, y)
      const bite = Math.min(1, Math.max(0, (patch - 0.42) * 3.4 + (pit - 0.5) * 0.7))

      // Bare steel where nothing took hold, through orange, to the dark brown
      // scale that flakes off.
      const steel = [0.36, 0.36, 0.38]
      const orange = [0.55, 0.24, 0.07]
      const scale = [0.22, 0.11, 0.06]
      const to = bite < 0.6 ? orange : scale
      const mix = bite < 0.6 ? bite / 0.6 : (bite - 0.6) / 0.4
      const from = bite < 0.6 ? steel : orange

      for (let channel = 0; channel < 3; channel += 1) {
        data[index + channel] = Math.round((from[channel] + (to[channel] - from[channel]) * mix) * 255)
      }
      data[index + 3] = 255
    }
  }

  rust = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)
  rust.colorSpace = THREE.SRGBColorSpace
  rust.wrapS = THREE.RepeatWrapping
  rust.wrapT = THREE.RepeatWrapping
  rust.repeat.set(3, 3)
  rust.magFilter = THREE.LinearFilter
  rust.minFilter = THREE.LinearMipmapLinearFilter
  rust.anisotropy = 4
  rust.needsUpdate = true
  return rust
}

export function plasticGrain(): { roughness: THREE.DataTexture; normal: THREE.DataTexture } {
  if (cached) return cached

  const height = field()
  const at = (x: number, y: number) =>
    height[((y + SIZE) % SIZE) * SIZE + ((x + SIZE) % SIZE)]

  const roughData = new Uint8Array(SIZE * SIZE * 4)
  const normalData = new Uint8Array(SIZE * SIZE * 4)

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const index = (y * SIZE + x) * 4

      /*
       * The green channel, because that is the one `MeshStandardMaterial` reads
       * for roughness - and because the map *multiplies* the material's own
       * number, the material is set fully rough and this only ever polishes.
       */
      const polish = Math.round((1 - POLISH * at(x, y)) * 255)
      roughData[index] = polish
      roughData[index + 1] = polish
      roughData[index + 2] = polish
      roughData[index + 3] = 255

      // Central differences, in tangent space: +X right, +Y up, +Z out.
      const dx = (at(x + 1, y) - at(x - 1, y)) * RELIEF
      const dy = (at(x, y + 1) - at(x, y - 1)) * RELIEF
      const length = Math.hypot(dx, dy, 1)
      normalData[index] = Math.round(((-dx / length) * 0.5 + 0.5) * 255)
      normalData[index + 1] = Math.round(((-dy / length) * 0.5 + 0.5) * 255)
      normalData[index + 2] = Math.round((1 / length) * 0.5 * 255 + 127.5)
      normalData[index + 3] = 255
    }
  }

  const build = (data: Uint8Array, colorSpace: THREE.ColorSpace) => {
    const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)
    texture.colorSpace = colorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(GRAIN_REPEAT, GRAIN_REPEAT)
    texture.magFilter = THREE.LinearFilter
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.generateMipmaps = true
    // Grain seen at a grazing angle is exactly where anisotropy earns its keep,
    // and a shelf tips its cartridges on purpose.
    texture.anisotropy = 4
    texture.needsUpdate = true
    return texture
  }

  cached = {
    // Both are data, not colour: a roughness or a normal read through sRGB is a
    // surface that is subtly the wrong shape everywhere.
    roughness: build(roughData, THREE.NoColorSpace),
    normal: build(normalData, THREE.NoColorSpace),
  }

  return cached
}
