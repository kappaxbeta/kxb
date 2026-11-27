/**
 * Five fingers, each either up or down.
 *
 * That is the whole model, and the smallness of it is the point. A hand can do
 * far more than thirty-two things - it can hook, cross, touch, tilt and press -
 * and every one of those is something we would have to *draw*, recognise and
 * teach. Up or down is the one distinction that survives being rendered as a
 * few glowing tubes, read at a glance across a room, and made by somebody who
 * has never done it before. Everything else is a shape the model cannot say,
 * and a shape the model cannot say is a letter nobody can send.
 *
 * A pose is five bits in a number rather than an object with five booleans,
 * because the alphabet is a *table* and a table wants a key. Thirty-two keys
 * that compare with `===` and print as `IMRP` is a table you can read; thirty-two
 * object literals is a table nobody checks.
 *
 * The letters used to spell a pose are initials - **T**humb, **I**ndex,
 * **M**iddle, **R**ing, **P**inky - always in that order, thumb first, so there
 * is exactly one spelling of each hand. `parsePose` insists on that order for
 * the same reason: `'PI'` and `'IP'` naming one pose would mean the alphabet
 * table could hold the same hand twice without ever looking like it did.
 */

export const FINGERS = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const

export type Finger = (typeof FINGERS)[number]

/** The initial each finger is written with, in the order a pose spells them. */
export const INITIALS = ['T', 'I', 'M', 'R', 'P'] as const

/**
 * Five bits: thumb is 1, index 2, middle 4, ring 8, pinky 16.
 *
 * Deliberately a plain `number` and not a branded type. It is an index into a
 * thirty-two entry table and it is used as one - by the chart, by the reader,
 * by the model that draws it - and a brand would buy nothing but casts at every
 * one of those doors.
 */
export type Pose = number

/** The closed hand. Not a letter: see `alphabet.ts`. */
export const FIST: Pose = 0

/** Every finger up. Also not a letter - it is the space between words. */
export const OPEN: Pose = 0b11111

export function isRaised(pose: Pose, finger: Finger): boolean {
  return (pose & (1 << FINGERS.indexOf(finger))) !== 0
}

export function withFinger(pose: Pose, finger: Finger, up: boolean): Pose {
  const bit = 1 << FINGERS.indexOf(finger)
  return up ? pose | bit : pose & ~bit
}

/** `0b10011` becomes `'TIP'`, and the fist becomes `'-'`. */
export function poseName(pose: Pose): string {
  const up = INITIALS.filter((_, index) => (pose & (1 << index)) !== 0)
  return up.length === 0 ? '-' : up.join('')
}

/**
 * `'TIP'` becomes `0b10011`, and anything else becomes `null`.
 *
 * Strict about order and about repeats because it is what guards the alphabet:
 * the table is written by hand in initials, and the test that walks it is only
 * worth having if a mistyped hand comes back as `null` rather than as some
 * other letter's hand.
 */
export function parsePose(spelling: string): Pose | null {
  if (spelling === '-') return FIST

  let pose = FIST
  let last = -1
  for (const character of spelling) {
    const index = (INITIALS as readonly string[]).indexOf(character)
    if (index < 0 || index <= last) return null
    pose = withFinger(pose, FINGERS[index], true)
    last = index
  }
  return pose === FIST ? null : pose
}

/**
 * How hard this hand is to make, roughly, in units of "awkward".
 *
 * Not decoration - this is what ranks the alphabet, so the letters people send
 * most often are the hands people can actually hold. The model is one
 * observation: **neighbouring fingers share tendons**. A hand is easy when the
 * raised ones sit together, and it gets harder with every place along the row
 * where an up finger stands next to a down one.
 *
 * Two things are worse than the count suggests, and both are the same thing -
 * a finger disagreeing with *both* its neighbours. For the ring finger that is
 * the famously near-impossible one, so it is weighted heaviest. The thumb is
 * outside all of this because it is genuinely independent; it costs a little
 * only when it has to tuck under a raised hand.
 *
 * `costOf` deliberately knows nothing about culture. Two of the hands it calls
 * expensive - the horns and the V - are ones half the world can make without
 * thinking, and `alphabet.ts` overrules it for exactly those. Keeping the
 * anatomy honest here and the exceptions visible there is better than a scoring
 * function quietly tuned until it agreed with a table somebody had already
 * written.
 */
export function costOf(pose: Pose): number {
  const up = FINGERS.map((finger) => isRaised(pose, finger))
  const [thumb, index, middle, ring, pinky] = up

  let cost = 0
  if (index !== middle) cost += 1
  if (middle !== ring) cost += 1
  if (ring !== pinky) cost += 1
  if (middle !== index && middle !== ring) cost += 1
  if (ring !== middle && ring !== pinky) cost += 2
  if (!thumb && (index || middle || ring || pinky)) cost += 0.25
  return cost
}

/** Every pose, fist first, in counting order. */
export const POSES: Pose[] = Array.from({ length: 32 }, (_, index) => index)
