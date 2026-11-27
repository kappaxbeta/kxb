import { wrap } from '@/app/components/ink/ink-fish'
import type { Ink } from '@/app/components/ink/ink-gl'
import { palette } from '@/app/components/ink/ink-palettes'
import type { InkSettings } from '@/app/components/ink/ink-settings'

/**
 * The turtles.
 *
 * A turtle does not flow, it jumps: a stroke of the flippers throws it
 * forward and it coasts, slowing, until the next one. So the motion is the
 * jellyfish's - an impulse and a drag - but sharper and more often, with a
 * shorter glide, and the heading turns mostly *between* strokes, the way a
 * turtle lines itself up and then goes. Each stroke shoves the water too, so
 * a turtle leaves a row of little vortex rings behind it.
 *
 * One body, no chain: a shell, a head, four flippers, all placed from the
 * position and heading by ./ink-turtle-draw, which also knows where in the
 * stroke the flippers are from `stroke`.
 *
 * Positions are in height units with y up, as in ./ink-fish. The size comes
 * from the radius setting - the shell is a couple of heads wide.
 */

export type Turtle = {
  x: number
  y: number
  vx: number
  vy: number
  heading: number
  /** Shell radius (the long way), in height units. */
  radius: number
  /** Where in the stroke cycle it is, 0..1; the stroke lands near 0. */
  stroke: number
  /** Seconds between strokes. */
  period: number
  hue: number
  phase: number
}

export type Turtles = {
  set(settings: InkSettings): void
  tick(t: number, dt: number): void
  turtles(): readonly Turtle[]
}

/** How much bigger a shell is than a fish's head, and how far one stroke throws it. */
const SHELL = 2.0
const THROW = 0.7

export function createTurtles(ink: Ink, initial: InkSettings): Turtles {
  let settings = initial
  const turtles: Turtle[] = []

  const spawn = (aspect: number): Turtle => ({
    x: (0.15 + Math.random() * 0.7) * aspect,
    y: 0.2 + Math.random() * 0.6,
    vx: 0,
    vy: 0,
    heading: Math.random() * Math.PI * 2,
    radius: settings.radius * SHELL,
    stroke: Math.random(),
    period: 1.1 + Math.random() * 0.9,
    hue: Math.random(),
    phase: Math.random() * 100,
  })

  return {
    set(next) {
      settings = next
    },

    turtles: () => turtles,

    tick(t, dt) {
      const aspect = ink.aspect()
      while (turtles.length < settings.turtles) turtles.push(spawn(aspect))
      if (turtles.length > settings.turtles) turtles.length = settings.turtles
      if (turtles.length === 0 || dt <= 0) return

      const colours = palette(settings.mode)

      for (const u of turtles) {
        u.radius = settings.radius * SHELL

        // Lining up: the heading wanders while it coasts and holds during the
        // stroke, and the walls turn it back toward the middle.
        const gliding = u.stroke > 0.3
        let turn = gliding ? 0.9 * Math.sin(t * 0.5 + u.phase) + 0.5 * Math.sin(t * 1.7 + u.phase * 2) : 0
        const margin = 0.12 + u.radius * 2
        const near = Math.max(margin - u.x, u.x - (aspect - margin), margin - u.y, u.y - (1 - margin), 0)
        if (near > 0) {
          const want = Math.atan2(0.5 - u.y, aspect / 2 - u.x)
          turn += wrap(want - u.heading) * Math.min(1, near / margin) * 6
        }
        u.heading += turn * dt

        // The stroke: at the top of the cycle, a throw along the heading and
        // the same given to the water.
        const was = u.stroke
        u.stroke = (u.stroke + dt / u.period) % 1
        if (u.stroke < was) {
          const kick = THROW * (0.85 + Math.random() * 0.3) * (0.6 + settings.speed * 2)
          u.vx += Math.cos(u.heading) * kick
          u.vy += Math.sin(u.heading) * kick
          const ux = u.x / aspect
          ink.push(ux, u.y, (Math.cos(u.heading) * kick * 0.7) / aspect, Math.sin(u.heading) * kick * 0.7, u.radius * 0.7)
          ink.ink(ux, u.y, colours.patch('deep', u.hue + t * 0.006), 0.3, u.radius * 0.5)
        }

        // Coast. A heavier drag than the jellyfish's: a turtle stops sooner.
        const drag = Math.pow(0.05, dt)
        u.vx *= drag
        u.vy *= drag
        u.x = Math.min(aspect, Math.max(0, u.x + u.vx * dt))
        u.y = Math.min(1, Math.max(0, u.y + u.vy * dt))
      }
    },
  }
}
