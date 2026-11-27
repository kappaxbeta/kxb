import type { Ink } from '@/app/components/ink/ink-gl'
import { palette, type PatchKind, type RGB } from '@/app/components/ink/ink-palettes'
import type { InkSettings } from '@/app/components/ink/ink-settings'

/**
 * The fish.
 *
 * A fish is a chain of circles. The head wanders - a heading that sways,
 * steers back from the walls, keeps its distance from the other fish, and
 * wags - and every joint behind it is pulled along on a short leash: kept
 * one spacing from the joint ahead, and never allowed to bend more than its
 * form allows from the segment in front of it. That one constraint is the
 * whole animal. Turn the head and the turn runs down the body a joint at a
 * time, which is what a spine does, and the wag at the head arrives at the
 * tail as a beat.
 *
 * No two are built alike. A fish is born with a *form* - how many joints,
 * where its belly is, how sharply it tapers, how far its fins reach, how long
 * its tail runs, how stiff its spine is - and a *pattern*, runs of light, deep
 * and dark patches down the body, with two hues of its own for the palette
 * to colour them (./ink-palettes). The circles are drawn on top of the water
 * by ./ink-fish-draw; here they also *touch* the water - each joint dabs ink
 * in its own patch's colour and shoves the fluid with its own velocity, so a
 * fish drags a wake in its own colours and the wake twists the tint.
 *
 * Positions are uv with y up, but the chain is solved in height units - x
 * multiplied by the aspect - so a circle is a circle on a wide screen.
 */

export type Joint = { x: number; y: number; vx: number; vy: number }

export type Form = {
  /** Radius of each joint as a multiple of the head radius; head first. */
  profile: readonly number[]
  /** Distance between joints, in head radii. */
  spacing: number
  /** The most a joint may bend from the segment ahead, in radians. */
  bend: number
  /** Which joint the pectoral fins hang from. */
  finJoint: number
  /** Fin length in that joint's radii, and how far back it sweeps, in radians. */
  finLength: number
  finSweep: number
  /** Tail fin length in head radii, and how wide its lobes open. */
  tailLength: number
  tailSpread: number
  /** Whether a fin runs along the back. */
  dorsal: boolean
  /** How quickly it wags at a given speed. */
  wagRate: number
  /** How big this one is against the radius setting. */
  size: number
  /** And how big its eyes are against the eye setting, for the scatter. */
  eye: number
  /** Black eyes rather than white ones, for the scatter. */
  eyeDark: boolean
}

export type Fish = {
  /** Head first, in height units (x already multiplied by the aspect). */
  joints: Joint[]
  form: Form
  /** One patch per joint. */
  pattern: PatchKind[]
  /** Two hues: one for the light patches, one for the deep. */
  hueA: number
  hueB: number
  heading: number
  phase: number
  wag: number
  /** A minnow: one of the shoal of small fish that keep together. */
  small: boolean
  /** Head radius in height units, as of the last tick. */
  radius: number
}

export type School = {
  set(settings: InkSettings): void
  tick(t: number, dt: number): void
  /** The current fish, for drawing. Do not keep the array. */
  fish(): readonly Fish[]
}

export function createSchool(ink: Ink, initial: InkSettings): School {
  let settings = initial
  const fish: Fish[] = []

  const spawn = (aspect: number, small: boolean): Fish => {
    const form = grow(small)
    const heading = Math.random() * Math.PI * 2
    const x = (0.2 + Math.random() * 0.6) * aspect
    const y = 0.3 + Math.random() * 0.5
    const radius = settings.radius * form.size
    const spacing = radius * form.spacing
    // Laid out straight behind the head, so it does not start folded.
    const joints = form.profile.map((_, i) => ({
      x: x - Math.cos(heading) * spacing * i,
      y: y - Math.sin(heading) * spacing * i,
      vx: 0,
      vy: 0,
    }))
    const hueA = Math.random()
    return {
      joints,
      form,
      pattern: markings(joints.length),
      hueA,
      hueB: hueA + 0.3 + Math.random() * 0.4,
      heading,
      phase: Math.random() * 100,
      wag: Math.random() * 100,
      small,
      radius,
    }
  }

  const count = (small: boolean) => fish.filter((f) => f.small === small).length

  return {
    set(next) {
      settings = next
    },

    fish: () => fish,

    tick(t, dt) {
      const aspect = ink.aspect()
      while (count(false) < settings.count) fish.push(spawn(aspect, false))
      while (count(true) < settings.minnows) fish.push(spawn(aspect, true))
      for (const small of [false, true]) {
        const want = small ? settings.minnows : settings.count
        while (count(small) > want) {
          let i = fish.length - 1
          while (i >= 0 && fish[i]!.small !== small) i--
          fish.splice(i, 1)
        }
      }
      if (fish.length === 0 || dt <= 0) return

      const colours = palette(settings.mode)

      // Where the big fish are, on average, for the swirl; and where the
      // minnows are and which way they face, for the shoal.
      const big = fish.filter((f) => !f.small)
      const shoal = fish.filter((f) => f.small)
      const centre = mean(big)
      const shoalCentre = mean(shoal)
      const shoalHeading = shoal.length
        ? Math.atan2(
            shoal.reduce((a, f) => a + Math.sin(f.heading), 0),
            shoal.reduce((a, f) => a + Math.cos(f.heading), 0),
          )
        : 0

      for (const f of fish) {
        const head = f.joints[0]!
        const { form } = f
        const radius = settings.radius * form.size
        f.radius = radius
        const speed = settings.speed * (f.small ? 1.7 : 1) * (0.8 + 0.4 / form.size)
        const spacing = radius * form.spacing

        // Wander: a slow sway and a quicker jitter, in radians per second,
        // plus the wag, which is the swimming itself.
        f.wag += dt * (form.wagRate + speed * 10)
        let turn =
          1.1 * Math.sin(t * 0.37 + f.phase) +
          0.6 * Math.sin(t * 1.9 + f.phase * 2.3) +
          Math.sin(f.wag) * 1.3

        // Swirl: the big fish go round their own centre. The heading is
        // steered toward the tangent - a quarter turn off the line to the
        // middle - and pulled in a little when far out, pushed out when
        // close, so they circle one another instead of the same spot.
        if (settings.swirl && !f.small && big.length > 1) {
          const dx = centre[0] - head.x
          const dy = centre[1] - head.y
          const d = Math.hypot(dx, dy)
          const ring = radius * 5
          const toCentre = Math.atan2(dy, dx)
          const want = toCentre + (Math.PI / 2) * (d > ring ? 0.6 : 1.1)
          turn += wrap(want - f.heading) * 3
        }

        // The shoal: a minnow keeps toward the others and swims their way,
        // which is the whole of what makes it a shoal rather than a scatter.
        if (f.small && shoal.length > 1) {
          const dx = shoalCentre[0] - head.x
          const dy = shoalCentre[1] - head.y
          const d = Math.hypot(dx, dy)
          if (d > radius * 4) turn += wrap(Math.atan2(dy, dx) - f.heading) * Math.min(2, d * 4)
          turn += wrap(shoalHeading - f.heading) * 1.5
        }

        // The walls push back, harder the closer they get, and only on the
        // side that is near - a fish in the corner turns toward the middle.
        const margin = 0.16 + radius * 3
        const near = Math.max(
          margin - head.x,
          head.x - (aspect - margin),
          margin - head.y,
          head.y - (1 - margin),
          0,
        )
        if (near > 0) {
          const want = Math.atan2(0.5 - head.y, aspect / 2 - head.x)
          turn += wrap(want - f.heading) * Math.min(1, near / margin) * 8
        }

        // And so do the others: inside a few radii a fish turns away from
        // the nearest head, which keeps the school a school and not a knot.
        // Minnows only mind their own kind, and mind it less.
        for (const other of fish) {
          if (other === f || (f.small && !other.small)) continue
          const o = other.joints[0]!
          const dx = head.x - o.x
          const dy = head.y - o.y
          const d = Math.hypot(dx, dy)
          const room = (radius + other.radius) * (f.small ? 1.6 : 3)
          if (d < room && d > 0) {
            const away = Math.atan2(dy, dx)
            turn += wrap(away - f.heading) * (1 - d / room) * (f.small ? 3 : 4)
          }
        }

        f.heading += turn * dt

        // The head swims; the body follows on its leashes.
        const nx = head.x + Math.cos(f.heading) * speed * dt
        const ny = head.y + Math.sin(f.heading) * speed * dt
        head.vx = (nx - head.x) / dt
        head.vy = (ny - head.y) / dt
        head.x = Math.min(aspect, Math.max(0, nx))
        head.y = Math.min(1, Math.max(0, ny))

        let ahead = f.heading
        for (let i = 1; i < f.joints.length; i++) {
          const prev = f.joints[i - 1]!
          const j = f.joints[i]!
          // Where this joint would like to hang: straight back from the
          // previous one along the line between them - then bent no further
          // than the limit from the segment ahead of that.
          const back = ahead + Math.PI
          const bend = wrap(Math.atan2(j.y - prev.y, j.x - prev.x) - back)
          const angle = back + Math.max(-form.bend, Math.min(form.bend, bend))
          const x = prev.x + Math.cos(angle) * spacing
          const y = prev.y + Math.sin(angle) * spacing
          j.vx = (x - j.x) / dt
          j.vy = (y - j.y) / dt
          j.x = x
          j.y = y
          ahead = angle + Math.PI
        }

        // Touch the water: ink from every joint in its own colour, most from
        // the head, and a push with the joint's own motion so the wake
        // follows the body. Lightly - the body is drawn on top, the water
        // only needs enough to remember where it went.
        for (let i = 0; i < f.joints.length; i++) {
          const j = f.joints[i]!
          const r = radius * form.profile[i]!
          const x = j.x / aspect
          const kind = f.pattern[i]!
          const colour = patchColour(f, i, t, colours.patch, colours.drift)
          const amount = kind === 'dark' ? 0.25 : 1
          ink.ink(x, j.y, colour, (i === 0 ? 0.45 : 0.12) * dt * amount * form.profile[i]! * form.size, r * 0.8)
          ink.push(x, j.y, (j.vx * 0.8) / aspect, j.vy * 0.8, r * 1.3)
        }
      }
    },
  }
}

/**
 * A joint's colour: the palette's take on its patch kind and this fish's hue
 * for that kind, walked a little further round the circle for every joint
 * down the body and drifting slowly with time.
 */
export function patchColour(
  f: Fish,
  joint: number,
  t: number,
  patch: (kind: PatchKind, hue: number) => RGB,
  drift: number,
): RGB {
  const kind = f.pattern[joint]!
  const base = kind === 'deep' ? f.hueB : f.hueA
  return patch(kind, base + joint * drift + t * 0.006)
}

/**
 * A body. The profile is a belly curve: it swells from the head to a widest
 * point somewhere in the front third and then tapers to the tail with a
 * power that decides whether the fish is a carp or an eel. Everything else
 * is drawn from ranges wide enough that a school of eight has no two alike
 * and narrow enough that they are all still fish.
 */
function grow(small: boolean): Form {
  const joints = small ? 5 + Math.floor(Math.random() * 3) : 9 + Math.floor(Math.random() * 6)
  const belly = 0.15 + Math.random() * 0.25
  const swell = 1.0 + Math.random() * 0.25
  const taper = 0.8 + Math.random() * 1.0
  const profile: number[] = []
  for (let i = 0; i < joints; i++) {
    const u = i / (joints - 1)
    const r =
      u < belly
        ? 0.88 + (swell - 0.88) * Math.sin(((u / belly) * Math.PI) / 2)
        : 0.1 + (swell - 0.1) * Math.pow(1 - (u - belly) / (1 - belly), taper)
    profile.push(r)
  }
  return {
    profile,
    spacing: 0.65 + Math.random() * 0.3,
    bend: 0.35 + Math.random() * 0.3,
    finJoint: 2 + Math.floor(Math.random() * 2),
    finLength: 2.0 + Math.random() * 1.6,
    finSweep: 1.9 + Math.random() * 0.6,
    tailLength: 2.0 + Math.random() * 2.5,
    tailSpread: 0.35 + Math.random() * 0.6,
    dorsal: Math.random() < 0.5,
    wagRate: 3 + Math.random() * 3,
    // Sizes: the big fish spread from two thirds to nearly one and a half
    // of the setting; a minnow is a third of it, give or take.
    size: small ? 0.25 + Math.random() * 0.15 : 0.65 + Math.random() * 0.8,
    eye: 0.6 + Math.random() * 0.9,
    eyeDark: Math.random() < 0.3,
  }
}

/** The average head position of some fish, in height units. */
function mean(fish: readonly Fish[]): [number, number] {
  if (fish.length === 0) return [0, 0]
  let x = 0
  let y = 0
  for (const f of fish) {
    x += f.joints[0]!.x
    y += f.joints[0]!.y
  }
  return [x / fish.length, y / fish.length]
}

/**
 * Markings: runs of one kind down the body. Mostly light, deep in one or
 * two places, dark rarely and never at the head - the odds a pond would
 * give you, roughly.
 */
function markings(joints: number): PatchKind[] {
  const pattern: PatchKind[] = []
  let kind: PatchKind = Math.random() < 0.6 ? 'light' : 'deep'
  while (pattern.length < joints) {
    const run = 1 + Math.floor(Math.random() * 4)
    for (let i = 0; i < run && pattern.length < joints; i++) pattern.push(kind)
    const roll = Math.random()
    const next: PatchKind = roll < 0.5 ? 'light' : roll < 0.9 ? 'deep' : 'dark'
    kind = next === kind ? (kind === 'light' ? 'deep' : 'light') : next
  }
  if (!pattern.includes('deep')) pattern[2 + Math.floor(Math.random() * 4)] = 'deep'
  return pattern
}

/** An angle folded into -π..π. */
export function wrap(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle))
}
