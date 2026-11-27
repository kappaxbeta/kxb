/**
 * The shape of the hand, as numbers.
 *
 * Separate from the thing that draws it because these are the only numbers
 * anybody will want to *argue* about - a pinky that is too long, a thumb that
 * folds through the palm - and arguing about them should not mean reading
 * WebGL. It is also the half that can be looked at without a GPU, which on this
 * project matters: the browser pane never runs a frame loop, so a component
 * that mixes its proportions into its rendering is a component nobody can check
 * without a real Chrome.
 *
 * Units are hand-widths, roughly, with the wrist at the origin and the fingers
 * pointing up +Y. Nothing here is anatomy. It is four fingers of three bones
 * and a thumb of two, which is the least a hand can be made of and still read
 * as one from across a room - and a hand that reads from across a room is the
 * entire point of the mode.
 *
 * Curled and straight are stored as two whole sets of joint angles rather than
 * as a single "curl" number, because the joints do not bend by the same amount
 * and a hand where they do looks like a claw. `bendFor` picks between them and
 * `approach` walks there, so a finger going down is a finger *closing* rather
 * than one snapping between two drawings.
 */

import { FINGERS, type Finger, isRaised, type Pose } from '@/app/world/_hand/fingers'

export interface Segment {
  length: number
  radius: number
}

export interface FingerRig {
  finger: Finger
  /** Where the knuckle sits, in hand units. */
  root: [number, number, number]
  /** How far the finger leans away from straight up, in radians about Z. */
  splay: number
  segments: Segment[]
  /**
   * Which way the joints bend.
   *
   * Four fingers close towards the palm, which is a rotation about X. A thumb
   * does not - it swings *across* the palm, about Z - and a thumb that bent
   * like a finger is the single thing that makes a hand read as a claw. One
   * field is cheaper than a second rig type for one finger.
   */
  axis: 'x' | 'z'
  /**
   * Joint angles, root joint first, in radians.
   *
   * Negative, because the fingers must fold *away* from the viewer. Positive X
   * rotation swings a finger towards +Z, which is where the camera is, so a
   * closed hand made of positive angles is five fingers pointing straight down
   * the lens - drawn end-on, it is a blob rather than a fist. Folding backwards
   * puts them behind the palm, which is exactly what the back of a fist looks
   * like.
   */
  straight: number[]
  curled: number[]
}

/** The slab the fingers stand on: width, height, thickness. */
export const PALM: [number, number, number] = [0.66, 0.74, 0.16]

/**
 * The four fingers and the thumb.
 *
 * The thumb is the odd one and is written as one: two bones instead of three,
 * rooted low on the side of the palm, splayed well out, and *curled across the
 * palm* rather than into it. That last part is why its curled angles are so
 * much smaller than a finger's - a thumb that bent as far as an index finger
 * would fold through the hand it belongs to.
 */
export const RIG: FingerRig[] = [
  {
    finger: 'thumb',
    root: [-0.33, -0.2, 0.02],
    splay: 0.75,
    axis: 'z',
    segments: [
      { length: 0.29, radius: 0.075 },
      { length: 0.22, radius: 0.064 },
    ],
    /* Raised, it stands out from the side. Folded, it swings back across the
       palm - so its angles run the other way from a finger's, towards the
       hand rather than behind it. */
    straight: [0.06, 0.06],
    curled: [-1.05, -0.55],
  },
  {
    finger: 'index',
    axis: 'x',
    root: [-0.25, 0.42, -0.02],
    splay: 0.1,
    segments: [
      { length: 0.34, radius: 0.068 },
      { length: 0.24, radius: 0.06 },
      { length: 0.18, radius: 0.052 },
    ],
    straight: [0.04, 0.06, 0.05],
    curled: [-1.5, -1.75, -1.4],
  },
  {
    finger: 'middle',
    axis: 'x',
    root: [-0.085, 0.45, -0.02],
    splay: 0.03,
    segments: [
      { length: 0.38, radius: 0.07 },
      { length: 0.26, radius: 0.062 },
      { length: 0.19, radius: 0.053 },
    ],
    straight: [0.03, 0.05, 0.05],
    curled: [-1.55, -1.8, -1.4],
  },
  {
    finger: 'ring',
    axis: 'x',
    root: [0.08, 0.43, -0.02],
    splay: -0.05,
    segments: [
      { length: 0.34, radius: 0.066 },
      { length: 0.25, radius: 0.058 },
      { length: 0.18, radius: 0.05 },
    ],
    straight: [0.04, 0.06, 0.05],
    curled: [-1.55, -1.8, -1.4],
  },
  {
    finger: 'pinky',
    axis: 'x',
    root: [0.235, 0.37, -0.02],
    splay: -0.16,
    segments: [
      { length: 0.26, radius: 0.056 },
      { length: 0.19, radius: 0.05 },
      { length: 0.15, radius: 0.044 },
    ],
    straight: [0.05, 0.07, 0.05],
    curled: [-1.55, -1.8, -1.4],
  },
]

export function bendFor(rig: FingerRig, up: boolean): number[] {
  return up ? rig.straight : rig.curled
}

/**
 * Where a finger's tip ends up, in hand units, for a pose.
 *
 * Only approximately - it walks the chain with the target angles rather than the
 * ones currently drawn, so a tip is where the finger is *going*. That is what
 * the sparks want: a spark thrown from a finger halfway through opening should
 * already be heading where the fingertip will be, or the trail lags the hand by
 * exactly the length of the easing.
 */
export function tipOf(rig: FingerRig, up: boolean): [number, number, number] {
  const bend = bendFor(rig, up)
  let angle = rig.splay
  let x = rig.root[0]
  let y = rig.root[1]

  for (const [index, segment] of rig.segments.entries()) {
    angle += bend[index]
    x -= Math.sin(angle) * segment.length
    y += Math.cos(angle) * segment.length
  }
  return [x, y, rig.root[2]]
}

/** The tips of the fingers that are up, which is where the sparks come from. */
export function litTips(pose: Pose): [number, number, number][] {
  return RIG.filter((rig) => isRaised(pose, rig.finger)).map((rig) => tipOf(rig, true))
}

/**
 * Frame-rate independent easing towards a value.
 *
 * `rate` is roughly "how much of the remaining distance per second", and the
 * exponential is what makes it the same motion at 30fps and at 144. A plain
 * lerp by `dt * rate` is the version that closes fingers faster on a good
 * machine, which is the sort of bug nobody finds because everybody develops on
 * a good machine.
 */
export function approach(current: number, target: number, dt: number, rate: number): number {
  return target + (current - target) * Math.exp(-rate * dt)
}

/** Every finger, in rig order, so the drawing and the alphabet agree. */
export const ORDER: Finger[] = [...FINGERS]
