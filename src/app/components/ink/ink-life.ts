import { createSchool, type School } from '@/app/components/ink/ink-fish'
import type { Ink } from '@/app/components/ink/ink-gl'
import { createFaces, type Faces } from '@/app/components/ink/ink-face'
import { createJellies, type Jellies } from '@/app/components/ink/ink-jelly'
import { createTurtles, type Turtles } from '@/app/components/ink/ink-turtle'
import { palette, type RGB } from '@/app/components/ink/ink-palettes'
import type { InkSettings } from '@/app/components/ink/ink-settings'

/**
 * What the ink does when nobody is touching it, and what it does when they are.
 *
 * Three habits, drawn from the projection this is after. Red fume seeps in
 * low and slow from a couple of wandering sources and hangs there, which is
 * the bed everything else sits on. Blooms go off every second or two: one
 * hard shove and a dab of ink at a random spot, which the solver turns into a
 * mushroom cap with a pair of trailing vortices. And the creatures - the
 * fish and minnows (./ink-fish), the jellyfish (./ink-jelly), the turtles
 * (./ink-turtle) and whatever faces are haunting it (./ink-face) - as many
 * and as big as the panel on the page says. What colour any of it is comes from the
 * settings' mode, through ./ink-palettes.
 *
 * The blob amount changes the habits: the more blob, the softer and rounder
 * and more frequent the blooms, because a blob picture is made of many soft
 * drops and a smoke picture of a few hard ones.
 *
 * The pointer is a fourth hand: drawing lays a pale ribbon of its own, tapping
 * sets off a bloom. Everything speaks in uv (y up) and seconds; ./ink-gl does
 * the texels.
 */

/**
 * The bloom is what an impulse looks like in a fluid, and its shape is decided
 * entirely by how hard and how wide. Harder makes a longer neck; wider makes a
 * flatter cap. These give a cap about a tenth of the screen across with two
 * curls under it, which is the picture.
 */
const BLOOM_SPEED = [0.35, 0.65] as const
const BLOOM_RADIUS = [0.018, 0.034] as const
const BLOOM_GAP = [0.7, 2.2] as const

export type Life = {
  /** Advance the emitters by `dt` seconds and apply them to the ink. */
  tick(dt: number): void
  /** The pointer moved to (x, y), having been at (px, py) `dt` seconds ago. */
  stroke(x: number, y: number, px: number, py: number, dt: number): void
  /** The pointer came down and went up without travelling. */
  tap(x: number, y: number): void
  /** Change the settings; takes effect on the next tick. */
  set(settings: InkSettings): void
  /** The creatures, for whoever draws them. */
  school(): School
  jellies(): Jellies
  turtles(): Turtles
  faces(): Faces
  /** The life's own clock, in seconds, so the drawing keeps the ink's tint. */
  time(): number
}

export function createLife(ink: Ink, initial: InkSettings, seed = Math.random() * 1000): Life {
  let t = seed
  let settings = initial
  let nextBloom = 0.4
  const school = createSchool(ink, initial)
  const jellies = createJellies(ink, initial)
  const turtles = createTurtles(ink, initial)
  const faces = createFaces(ink, initial)

  const fumes = [
    { phase: 0.0, rate: 1.4 },
    { phase: 2.1, rate: 1.1 },
  ]

  return {
    tick(dt) {
      t += dt
      const colours = palette(settings.mode)
      const blob = settings.blob

      // Fume: two slow sources low in the frame, nudged sideways by a
      // breath of wind so the smoke leans instead of stacking.
      for (const f of fumes) {
        const x = 0.5 + 0.38 * Math.sin(t * 0.07 + f.phase) + 0.05 * Math.sin(t * 0.31 + f.phase * 3)
        const y = 0.12 + 0.08 * Math.sin(t * 0.13 + f.phase * 2)
        const wind = 0.04 * Math.sin(t * 0.23 + f.phase)
        const a = colours.fume[Math.floor(f.phase) % colours.fume.length]!
        const b = colours.fume[(Math.floor(f.phase) + 1) % colours.fume.length]!
        ink.ink(x, y, wobble(a, b, t * 0.2 + f.phase), f.rate * dt * (1 - 0.5 * blob), 0.06 + 0.04 * blob)
        ink.push(x, y, wind * dt * 12, 0.05 * dt * 12, 0.08)
      }

      // Bloom. Softer, rounder and more often the more blob there is.
      nextBloom -= dt
      if (nextBloom <= 0) {
        nextBloom = between(BLOOM_GAP) * (1 - 0.7 * blob)
        const pale = Math.random() < 0.22
        bloom(
          ink,
          0.15 + Math.random() * 0.7,
          0.25 + Math.random() * 0.6,
          Math.random() * Math.PI * 2,
          pale ? colours.patch('light', t * 0.01) : pick(colours.bloom),
          pale ? 0.5 : 1.0,
          blob,
        )
      }

      school.tick(t, dt)
      jellies.tick(t, dt)
      turtles.tick(t, dt)
      faces.tick(t, dt)
    },

    stroke(x, y, px, py, dt) {
      if (dt <= 0) return
      const u = (x - px) / dt
      const v = (y - py) / dt
      const speed = Math.hypot(u, v)
      ink.ink(x, y, palette(settings.mode).patch('light', t * 0.01), Math.min(0.5, speed * 0.6), 0.014)
      ink.push(x, y, u * 0.9, v * 0.9, 0.025)
    },

    tap(x, y) {
      bloom(ink, x, y, Math.random() * Math.PI * 2, pick(palette(settings.mode).bloom), 1.2, settings.blob)
    },

    set(next) {
      settings = next
      school.set(next)
      jellies.set(next)
      turtles.set(next)
      faces.set(next)
    },

    school: () => school,
    jellies: () => jellies,
    turtles: () => turtles,
    faces: () => faces,
    time: () => t,
  }
}

/**
 * One shove and one dab, plus a scatter of droplets thrown clear of it. The
 * blob amount takes the shove down and the dab up: a drop of thick ink
 * spreads, it does not jet.
 */
function bloom(ink: Ink, x: number, y: number, angle: number, colour: RGB, strength: number, blob: number) {
  const speed = between(BLOOM_SPEED) * strength * (1 - 0.7 * blob)
  const radius = between(BLOOM_RADIUS) * (1 + 1.2 * blob)
  const aspect = ink.aspect()
  const u = (Math.cos(angle) * speed) / aspect
  const v = Math.sin(angle) * speed
  ink.push(x, y, u, v, radius)
  ink.ink(x, y, colour, 1.4 * strength * (1 + 0.6 * blob), radius * 0.9)

  const drops = Math.round((4 + Math.floor(Math.random() * 5)) * (1 - 0.5 * blob))
  for (let i = 0; i < drops; i++) {
    const a = angle + (Math.random() - 0.5) * 1.6
    const d = radius * (1.5 + Math.random() * 2.5)
    const dx = (Math.cos(a) * d) / aspect
    const dy = Math.sin(a) * d
    ink.ink(x + dx, y + dy, colour, 0.5 + Math.random() * 0.6, 0.003 + Math.random() * 0.004)
    ink.push(x + dx, y + dy, (Math.cos(a) * speed * 1.4) / aspect, Math.sin(a) * speed * 1.4, 0.006)
  }
}

function between([lo, hi]: readonly [number, number]) {
  return lo + Math.random() * (hi - lo)
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

function wobble(a: RGB, b: RGB, phase: number): RGB {
  const k = 0.5 + 0.5 * Math.sin(phase)
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}
