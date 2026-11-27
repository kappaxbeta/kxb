import { wrap, type Joint } from '@/app/components/ink/ink-fish'
import type { Ink } from '@/app/components/ink/ink-gl'
import { palette } from '@/app/components/ink/ink-palettes'
import type { InkSettings } from '@/app/components/ink/ink-settings'

/**
 * The jellyfish.
 *
 * A jellyfish is a bell and some tentacles, and it does not swim so much as
 * cough. The bell contracts on a slow cycle; at the contraction it shoves
 * itself forward and the water backward, and then it drifts, slowing, until
 * the next one. The shove is exactly the impulse a bloom is made of - one
 * push and one dab at the same spot - so every beat of a bell leaves a small
 * vortex ring behind it in the ink, which is what the jellyfish in the
 * projection this piece is after actually *were*.
 *
 * The tentacles are chains like the fish's spine, hung from the rim of the
 * bell and pulled along behind it with a loose bend limit, so they trail,
 * swing on the turn and settle when the bell stops. Each is a little
 * different in length and each hangs from its own point on the rim.
 *
 * Positions are in height units with y up, as in ./ink-fish. The drawing is
 * ./ink-jelly-draw. Size comes from the fish radius setting, scaled up - a
 * bell is a bigger thing than a head.
 */

export type Jelly = {
  x: number
  y: number
  vx: number
  vy: number
  heading: number
  /** Bell radius, in height units. */
  radius: number
  /** Where in the pulse cycle it is, 0..1; the contraction is near 0. */
  beat: number
  /** Seconds one full pulse takes. */
  period: number
  hue: number
  tentacles: Joint[][]
  /** Where on the rim each tentacle hangs, as an angle from the heading. */
  anchors: number[]
  phase: number
}

export type Bloom = {
  x: number
  y: number
  vx: number
  vy: number
  hue: number
}

export type Jellies = {
  set(settings: InkSettings): void
  tick(t: number, dt: number): void
  jellies(): readonly Jelly[]
}

/** How much bigger a bell is than a fish's head, and how fast a pulse moves it. */
const BELL = 1.8
const KICK = 0.55
/** Tentacle joints, and their spacing in bell radii. */
const TENTACLE_JOINTS = 12
const TENTACLE_SPACING = 0.22

export function createJellies(ink: Ink, initial: InkSettings): Jellies {
  let settings = initial
  const jellies: Jelly[] = []

  const spawn = (aspect: number): Jelly => {
    const radius = settings.radius * BELL
    const heading = Math.PI / 2 + (Math.random() - 0.5) * 1.2
    const x = (0.15 + Math.random() * 0.7) * aspect
    const y = 0.15 + Math.random() * 0.5
    const count = 4 + Math.floor(Math.random() * 4)
    const anchors: number[] = []
    const tentacles: Joint[][] = []
    for (let i = 0; i < count; i++) {
      const a = Math.PI + ((i + 0.5) / count - 0.5) * 1.6
      anchors.push(a)
      const joints = Math.floor(TENTACLE_JOINTS * (0.6 + Math.random() * 0.6))
      const chain: Joint[] = []
      for (let k = 0; k < joints; k++) {
        chain.push({
          x: x + Math.cos(heading + a) * radius - Math.cos(heading) * radius * TENTACLE_SPACING * k,
          y: y + Math.sin(heading + a) * radius - Math.sin(heading) * radius * TENTACLE_SPACING * k,
          vx: 0,
          vy: 0,
        })
      }
      tentacles.push(chain)
    }
    return {
      x,
      y,
      vx: 0,
      vy: 0,
      heading,
      radius,
      beat: Math.random(),
      period: 2.2 + Math.random() * 1.8,
      hue: Math.random(),
      tentacles,
      anchors,
      phase: Math.random() * 100,
    }
  }

  return {
    set(next) {
      settings = next
    },

    jellies: () => jellies,

    tick(t, dt) {
      const aspect = ink.aspect()
      while (jellies.length < settings.jellies) jellies.push(spawn(aspect))
      if (jellies.length > settings.jellies) jellies.length = settings.jellies
      if (jellies.length === 0 || dt <= 0) return

      const colours = palette(settings.mode)

      for (const j of jellies) {
        j.radius = settings.radius * BELL

        // The heading drifts, and leans back toward up and toward the middle
        // when it strays - a jellyfish is a thing that mostly rises.
        let turn = 0.5 * Math.sin(t * 0.23 + j.phase) + 0.3 * Math.sin(t * 0.9 + j.phase * 1.7)
        const margin = 0.12 + j.radius * 2
        const near = Math.max(margin - j.x, j.x - (aspect - margin), margin - j.y, j.y - (1 - margin), 0)
        if (near > 0) {
          const want = Math.atan2(0.5 - j.y, aspect / 2 - j.x)
          turn += wrap(want - j.heading) * Math.min(1, near / margin) * 4
        } else {
          turn += wrap(Math.PI / 2 - j.heading) * 0.15
        }
        j.heading += turn * dt

        // The pulse. Crossing the top of the cycle is the contraction: a
        // kick along the heading, and the same kick given to the water.
        const was = j.beat
        j.beat = (j.beat + dt / j.period) % 1
        if (j.beat < was) {
          const kick = KICK * (0.8 + Math.random() * 0.4)
          j.vx += Math.cos(j.heading) * kick
          j.vy += Math.sin(j.heading) * kick
          const ux = j.x / aspect
          const colour = colours.patch('light', j.hue + t * 0.006)
          ink.push(ux, j.y, (Math.cos(j.heading) * kick * 0.9) / aspect, Math.sin(j.heading) * kick * 0.9, j.radius * 0.8)
          ink.ink(ux, j.y, colour, 0.35, j.radius * 0.7)
        }

        // Then the glide: drag brings it to a near-stop before the next beat.
        const drag = Math.pow(0.12, dt)
        j.vx *= drag
        j.vy *= drag
        j.x = Math.min(aspect, Math.max(0, j.x + j.vx * dt))
        j.y = Math.min(1, Math.max(0, j.y + j.vy * dt))

        // Tentacles hang from the rim and follow it on their leashes, with a
        // soft bend so they swing rather than snap.
        const spacing = j.radius * TENTACLE_SPACING
        for (let k = 0; k < j.tentacles.length; k++) {
          const chain = j.tentacles[k]!
          const anchor = j.anchors[k]!
          const root = chain[0]!
          const rx = j.x + Math.cos(j.heading + anchor) * j.radius * 0.85
          const ry = j.y + Math.sin(j.heading + anchor) * j.radius * 0.85
          root.vx = (rx - root.x) / dt
          root.vy = (ry - root.y) / dt
          root.x = rx
          root.y = ry
          let ahead = j.heading
          for (let i = 1; i < chain.length; i++) {
            const prev = chain[i - 1]!
            const joint = chain[i]!
            const back = ahead + Math.PI
            const bend = wrap(Math.atan2(joint.y - prev.y, joint.x - prev.x) - back)
            const angle = back + Math.max(-0.35, Math.min(0.35, bend))
            const x = prev.x + Math.cos(angle) * spacing
            const y = prev.y + Math.sin(angle) * spacing
            joint.vx = (x - joint.x) / dt
            joint.vy = (y - joint.y) / dt
            joint.x = x
            joint.y = y
            ahead = angle + Math.PI
          }
        }

        // A faint trace from the bell itself between beats, so the water
        // remembers a jellyfish passed even when it was only drifting.
        const colour = colours.patch('light', j.hue + t * 0.006)
        ink.ink(j.x / aspect, j.y, colour, 0.12 * dt, j.radius * 0.6)
      }
    },
  }
}
