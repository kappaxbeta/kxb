/**
 * What a camera can say about a hand: which fingers are up, and where it is.
 *
 * Hand mode reads five bits off a keyboard, and this is the same five bits read
 * off a picture instead. Everything downstream - the alphabet, the signer, the
 * phrasebook - is untouched by it, and that is the point of keeping this one
 * module pure: a webcam is a third way to *make a pose*, not a second way to
 * say something. See `hand-camera.tsx` for the loop that feeds it.
 *
 * ## Two things come out, and only one of them is a letter
 *
 * A pose is what you are saying. A **drift** is where your hand is - across the
 * picture, how near, and which way it is turned - and it says nothing at all.
 * It is there so the hand on screen can move with the one in front of the lens
 * rather than sitting in a corner like a diagram: you lean, it leans; you come
 * closer, it fills the space. Nothing reads it, nothing sends it, and losing it
 * costs nobody a word.
 *
 * ## Angles, not pixels
 *
 * Every test below is a ratio or an angle between landmarks, and never a
 * coordinate. A hand held high in the frame, at arm's length, upside down, or
 * belonging to somebody with shorter fingers has to spell the same letter - and
 * the moment a threshold is written in picture coordinates, it stops doing
 * that. `sight.test.ts` builds a hand, turns it over and checks the reading
 * survives, which is the only way to know this stayed true.
 *
 * MediaPipe hands over two sets of the same 21 points: normalised picture
 * coordinates, and `worldLandmarks` in metres around the hand's own centre. The
 * pose is read from the **world** set, because that one is already free of
 * where the hand is and how far away; the drift comes from the picture set,
 * because where it is in the picture is exactly what the drift is about.
 *
 * ## The mirror
 *
 * The preview is mirrored, the way every video call mirrors a self-view - raise
 * your right hand and it appears on the right. So the drift is mirrored too,
 * here, once, rather than by whoever draws it: `x` is negated, and so is the
 * `x` of the axis. A drawn hand that flowed the opposite way from the picture
 * it was measured in would be unusable, and a mirror applied in two places is a
 * mirror applied nowhere.
 */

import { FINGERS, type Pose, withFinger } from '@/app/world/_hand/fingers'

/** A landmark, in whichever of the two spaces the caller is holding. */
export interface Point {
  x: number
  y: number
  z: number
}

/** How many points a hand is. A frame with fewer is a frame to drop. */
export const HAND_POINTS = 21

/**
 * The landmarks this file uses, by the index MediaPipe gives them.
 *
 * Six of the twenty-one, named, because every threshold below reads as a
 * sentence about a hand and would otherwise read as arithmetic on a diagram
 * nobody has open. The fingers themselves are in `CHAINS`, as triples, because
 * what is wanted there is the shape of the chain rather than its name.
 */
export const HL = {
  wrist: 0,
  thumbIp: 3,
  thumbTip: 4,
  indexMcp: 5,
  middleMcp: 9,
  pinkyMcp: 17,
} as const

/**
 * The three joints each finger is judged by: knuckle, middle joint, tip.
 *
 * The dip joint is skipped deliberately. It bends with the one above it and
 * almost never against it, so including it buys a third decimal place on a
 * decision that only has two outcomes.
 */
const CHAINS: [mcp: number, pip: number, tip: number][] = [
  [5, 6, 8],
  [9, 10, 12],
  [13, 14, 16],
  [17, 18, 20],
]

/**
 * How straight a finger has to be to count as up: the cosine of the angle
 * between the knuckle bone and the one carrying the tip.
 *
 * Not a small number, and not a large one. A finger held straight reads about
 * `0.97`, a finger folded into the palm reads below zero, and the whole of the
 * useful ambiguity is the half-curled finger somebody has not decided about
 * yet. Sitting at `0.45` puts the line at roughly sixty degrees of bend, which
 * is past "resting" and short of "curled".
 */
const STRAIGHT = 0.45

/**
 * How far the thumb has to reach to count as out, as a ratio.
 *
 * The thumb cannot be judged by bend: it folds by swinging *across* the palm
 * while staying nearly straight, so the test that works for four fingers calls
 * a fist's thumb raised. What actually changes is where the tip ends up - out
 * to the side, or lying over the knuckles - so this measures the tip against
 * the joint behind it, both from the far corner of the palm. Out, the tip is
 * the further of the two; tucked, it has crossed inside its own joint.
 */
const REACH = 1.05

/**
 * The palm at a comfortable arm's length, as a fraction of the picture's width,
 * and how much wider it gets on the way to the lens.
 *
 * Both are honest guesses rather than measurements, and they only set how much
 * the drawn hand swims towards the viewer. Being wrong about them makes the
 * flow shallow or eager, never wrong.
 */
const REST_SPAN = 0.13
const SPAN_RANGE = 0.1

/** Where the hand is and which way it is turned. Nothing here is a letter. */
export interface Drift {
  /** Across the picture and up it, -1 to 1, mirrored. Zero is the middle. */
  x: number
  y: number
  /** How near the lens: 0 at arm's length, 1 up against it, -1 far off. */
  near: number
  /**
   * Wrist towards the middle knuckle: the way the fingers point, in the drawn
   * hand's own axes.
   *
   * One axis, not a frame, and that is a decision rather than a shortcut. A
   * hand offers a second axis honestly - the palm running from the little
   * finger to the index one - and following it would let the drawn hand *twist*
   * with your wrist. Two things are wrong with that. A hand twisted edge-on to
   * the reader is five tubes in a line whichever letter it is holding, and this
   * is a hand somebody is being asked to read. And the twist is the one axis
   * where a left hand and a right hand disagree: palm out, their knuckles run
   * opposite ways, so following it would draw one of the two turned around for
   * its whole session.
   *
   * Leaning, pointing and rolling all survive, because all three of them are
   * this axis moving. Only the wrist twist is dropped. See `flow` in
   * `neon-hand.tsx`, which is the only thing that reads it.
   */
  up: [number, number, number]
}

/**
 * Which fingers are up, from the metric landmarks.
 *
 * `null` when the frame is not a hand - too few points - rather than a fist,
 * because a fist is a thing somebody is doing and this is the absence of one.
 * The caller decides what a missing hand means; see `hand-camera.tsx`, where it
 * means the hand is falling shut.
 */
export function poseOf(world: readonly Point[]): Pose | null {
  if (world.length < HAND_POINTS) return null

  let pose = 0
  for (const [index, [mcp, pip, tip]] of CHAINS.entries()) {
    // +1 because the thumb is the first finger in `FINGERS` and is judged
    // separately below.
    pose = withFinger(pose, FINGERS[index + 1], straightness(world, mcp, pip, tip) > STRAIGHT)
  }
  return withFinger(pose, 'thumb', thumbIsOut(world))
}

/**
 * Where the hand sits in the picture, and how it is held.
 *
 * Takes both sets: the picture one for the position, the metric one for the
 * axes. They are the same hand and always arrive together, so asking for them
 * together is cheaper than asking the caller to remember which is which.
 */
export function driftOf(picture: readonly Point[], world: readonly Point[]): Drift | null {
  if (picture.length < HAND_POINTS || world.length < HAND_POINTS) return null

  // The middle of the palm rather than the wrist. A wrist swings through a
  // wide arc as you turn your hand over, and a drawn hand anchored to one
  // would slide across the screen while you stand perfectly still.
  const centre = middle(picture[HL.wrist], picture[HL.indexMcp], picture[HL.pinkyMcp])
  // Flat, on purpose. The picture set's `z` is a guess at depth relative to the
  // wrist, in units nobody promises match `x`, and folding it into a width
  // would make the hand swim towards the viewer every time it turned.
  const span = Math.hypot(
    picture[HL.indexMcp].x - picture[HL.pinkyMcp].x,
    picture[HL.indexMcp].y - picture[HL.pinkyMcp].y,
  )

  return {
    x: clamp((0.5 - centre.x) * 2, -1, 1),
    y: clamp((0.5 - centre.y) * 2, -1, 1),
    near: clamp((span - REST_SPAN) / SPAN_RANGE, -1, 1),
    up: axis(world[HL.wrist], world[HL.middleMcp]),
  }
}

/**
 * Both readings of one frame, which is what a caller almost always wants.
 *
 * A convenience, and a place to say that the two are read from the same hand:
 * `numHands` is one, so `landmarks[0]` and `worldLandmarks[0]` are the same
 * fingers twice. Asking for a pose from one hand and a drift from another would
 * be a bug with no symptom until two hands are in shot.
 */
export function readHand(
  picture: readonly Point[],
  world: readonly Point[],
): { pose: Pose; drift: Drift } | null {
  const pose = poseOf(world)
  const drift = driftOf(picture, world)
  return pose === null || drift === null ? null : { pose, drift }
}

/**
 * How long a finger has to disagree with the hand before the hand changes, in
 * milliseconds.
 *
 * A detector at thirty frames a second flickers, and it flickers hardest at
 * exactly the moment a finger is halfway - which is the moment somebody is
 * changing letter. Without this the pose never sits still long enough for
 * `signing.ts` to call it held, and the reading looks *responsive* while being
 * unable to say a single word.
 *
 * Well under the signer's own `HOLD`, on purpose: this is here to spend a
 * detector's noise, not to add a second delay on top of a deliberate one.
 */
export const SETTLE = 110

export interface Steady {
  /** The pose to believe, given what the camera thinks it sees right now. */
  see: (seen: Pose, atMs: number) => Pose
}

/**
 * A pose that only changes when the change lasts.
 *
 * Per finger rather than per hand, and that is the whole design. A hand-level
 * debounce would make every letter wait for its slowest finger and would throw
 * away the four fingers that were already right; a finger that flickers here
 * costs only itself.
 */
export function createSteady(): Steady {
  // `-1` is "this finger agrees", and it is not zero because zero is a time:
  // `performance.now()` starts there, and a sentinel that is also a valid
  // clock reading would make the first frame of every session a special case.
  const state = { pose: 0, since: FINGERS.map(() => -1) }
  return { see: (seen, atMs) => settle(state, seen, atMs) }
}

function settle(
  state: { pose: Pose; since: number[] },
  seen: Pose,
  atMs: number,
): Pose {
  for (const [index] of FINGERS.entries()) {
    const bit = 1 << index
    if ((seen & bit) === (state.pose & bit)) {
      state.since[index] = -1
      continue
    }
    if (state.since[index] < 0) {
      state.since[index] = atMs
      continue
    }
    if (atMs - state.since[index] >= SETTLE) {
      state.pose ^= bit
      state.since[index] = -1
    }
  }
  return state.pose
}

/**
 * The cosine of the angle between a finger's two halves: 1 is straight out.
 *
 * A cosine rather than an angle because nothing here needs degrees, and a
 * `Math.acos` on four fingers thirty times a second is arithmetic somebody will
 * eventually have to justify.
 */
function straightness(points: readonly Point[], mcp: number, pip: number, tip: number): number {
  const root = direction(points[mcp], points[pip])
  const end = direction(points[pip], points[tip])
  return root[0] * end[0] + root[1] * end[1] + root[2] * end[2]
}

/** See `REACH`: the tip is out when it has not crossed inside its own joint. */
function thumbIsOut(points: readonly Point[]): boolean {
  const corner = points[HL.pinkyMcp]
  return distance(points[HL.thumbTip], corner) > REACH * distance(points[HL.thumbIp], corner)
}

/**
 * A world-space direction, in the drawn hand's axes and mirrored.
 *
 * MediaPipe's `x` runs right across the picture, `y` *down* it and `z` towards
 * the camera negative; the hand is drawn with `+Y` up and `+Z` out of the
 * screen. So `y` and `z` flip to change the convention and `x` flips for the
 * mirror - see the note at the top.
 */
function axis(from: Point, to: Point): [number, number, number] {
  const [x, y, z] = direction(from, to)
  return [-x, -y, -z]
}

function direction(from: Point, to: Point): [number, number, number] {
  const x = to.x - from.x
  const y = to.y - from.y
  const z = to.z - from.z
  const length = Math.hypot(x, y, z) || 1
  return [x / length, y / length, z / length]
}

function distance(from: Point, to: Point): number {
  return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z)
}

function middle(...points: Point[]): Point {
  const sum = points.reduce(
    (total, point) => ({ x: total.x + point.x, y: total.y + point.y, z: total.z + point.z }),
    { x: 0, y: 0, z: 0 },
  )
  return { x: sum.x / points.length, y: sum.y / points.length, z: sum.z / points.length }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}
