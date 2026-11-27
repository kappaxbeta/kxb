/**
 * The sparkle: what comes off the fingers that are up.
 *
 * A hand made of glowing tubes is legible but inert, and inert is the wrong
 * feeling for something that is supposed to be *speaking*. The sparks are the
 * difference. They only ever leave the fingertips that are **raised**, which
 * means the pose is readable twice over - once in the shape and once in where
 * the light is coming from - and it means a hand at rest goes quiet instead of
 * sitting there glittering at nobody.
 *
 * A fixed pool, recycled oldest-first, mutated in place. No spark is ever
 * allocated after the field is made: this runs every frame beside a whole room,
 * and a particle system that allocates is a particle system that stutters every
 * few seconds when the collector runs.
 *
 * Brightness carries everything - the fade, the twinkle, the death. That works
 * because the points are drawn **additively**, where black is not a colour but
 * an absence, so a spark that has finished simply stops contributing and needs
 * no separate alpha, no sorting and no removal from the buffer. It is the same
 * trick `_ink/neon.ts` and the flares use, for the same reason.
 */

/** How many sparks exist at once. Beyond this the oldest is reused. */
export const POOL = 220

/** Seconds a spark lives, and the spread either side of that. */
const LIFE = 0.85
const LIFE_SPREAD = 0.45

/** Sparks per second, per raised finger. */
export const RATE = 34

/** How fast a spark drifts, in hand units per second. */
const DRIFT = 0.55
const RISE = 0.34

/** How fast a spark twinkles, in radians per second. */
const TWINKLE = 11

export interface Field {
  /** Three floats per spark: the position buffer, handed straight to the GPU. */
  positions: Float32Array
  /** Three floats per spark: the colour buffer, which is also the fade. */
  colors: Float32Array
  velocities: Float32Array
  ages: Float32Array
  lives: Float32Array
  phases: Float32Array
  /** The hue each spark burns, in degrees. */
  hues: Float32Array
  /** Where the next spark is written. */
  next: number
  /** Sparks owed but not yet spawned, carried between frames. */
  owed: number
}

export function createField(): Field {
  const field: Field = {
    positions: new Float32Array(POOL * 3),
    colors: new Float32Array(POOL * 3),
    velocities: new Float32Array(POOL * 3),
    ages: new Float32Array(POOL),
    lives: new Float32Array(POOL),
    phases: new Float32Array(POOL),
    hues: new Float32Array(POOL),
    next: 0,
    owed: 0,
  }
  // Everything starts finished, so the first frame draws an empty hand rather
  // than a flash of two hundred sparks sitting at the origin.
  field.ages.fill(1)
  field.lives.fill(1)
  return field
}

/**
 * Move every spark on, and throw a few new ones off the lit fingertips.
 *
 * `dt` is clamped by the caller, not here: this function is honest about time
 * and a tab that was in the background for a minute is the caller's problem.
 */
export function stepField(
  field: Field,
  dt: number,
  tips: readonly (readonly [number, number, number])[],
  hue: number,
  time: number,
): void {
  for (let index = 0; index < POOL; index++) {
    if (field.ages[index] >= field.lives[index]) {
      // Finished. Left where it is with no colour, which draws nothing.
      field.colors[index * 3] = 0
      field.colors[index * 3 + 1] = 0
      field.colors[index * 3 + 2] = 0
      continue
    }

    field.ages[index] += dt
    const at = index * 3
    field.positions[at] += field.velocities[at] * dt
    field.positions[at + 1] += field.velocities[at + 1] * dt
    field.positions[at + 2] += field.velocities[at + 2] * dt

    const life = Math.min(1, field.ages[index] / field.lives[index])
    // Bright at birth, gone at the end, twinkling on the way. The square is
    // what makes a spark flare and then linger rather than fade evenly.
    const fade = (1 - life) * (1 - life)
    const twinkle = 0.55 + 0.45 * Math.sin(field.phases[index] + time * TWINKLE)
    writeColour(field, index, field.hues[index], fade * twinkle)
  }

  if (tips.length === 0) {
    field.owed = 0
    return
  }

  field.owed += dt * RATE * tips.length
  const spawning = Math.floor(field.owed)
  field.owed -= spawning

  for (let born = 0; born < spawning; born++) {
    spawn(field, tips[born % tips.length], hue)
  }
}

function spawn(field: Field, tip: readonly [number, number, number], hue: number): void {
  const index = field.next
  field.next = (field.next + 1) % POOL
  const at = index * 3

  // A little scatter at the fingertip, so sparks come off a *finger* rather
  // than out of a single point in space.
  field.positions[at] = tip[0] + (Math.random() - 0.5) * 0.07
  field.positions[at + 1] = tip[1] + (Math.random() - 0.5) * 0.07
  field.positions[at + 2] = tip[2] + (Math.random() - 0.5) * 0.07

  field.velocities[at] = (Math.random() - 0.5) * DRIFT
  field.velocities[at + 1] = RISE + Math.random() * DRIFT * 0.5
  field.velocities[at + 2] = (Math.random() - 0.5) * DRIFT

  field.ages[index] = 0
  field.lives[index] = LIFE + (Math.random() - 0.5) * LIFE_SPREAD
  field.phases[index] = Math.random() * Math.PI * 2
  // Each spark takes its own hue near the hand's, which is what stops a cloud
  // of them reading as one flat colour.
  field.hues[index] = hue + (Math.random() - 0.5) * 26
  writeColour(field, index, field.hues[index], 1)
}

function writeColour(field: Field, index: number, hue: number, brightness: number): void {
  const [r, g, b] = hueRgb(hue)
  field.colors[index * 3] = r * brightness
  field.colors[index * 3 + 1] = g * brightness
  field.colors[index * 3 + 2] = b * brightness
}

/**
 * A hue in degrees as full-brightness RGB.
 *
 * Written out rather than borrowed from `THREE.Color`, which would do the same
 * job, because this file is the one part of the sparkle that can be tested and
 * a dependency on a WebGL library is exactly what stops it being.
 */
export function hueRgb(hue: number): [number, number, number] {
  const h = (((hue % 360) + 360) % 360) / 60
  const x = 1 - Math.abs((h % 2) - 1)
  if (h < 1) return [1, x, 0]
  if (h < 2) return [x, 1, 0]
  if (h < 3) return [0, 1, x]
  if (h < 4) return [0, x, 1]
  if (h < 5) return [x, 0, 1]
  return [1, 0, x]
}
