import { describe, expect, test } from 'bun:test'

import { FIST, OPEN, parsePose, poseName } from './fingers'
import { createSteady, driftOf, HAND_POINTS, type Point, poseOf, SETTLE } from './sight'

/**
 * A hand made of numbers, so the reading can be checked without a camera.
 *
 * This is the only honest way to test `sight.ts`. The alternative is a fixture
 * of landmarks recorded off somebody's webcam, which tests that *that hand* on
 * *that day* still reads the same and says nothing about the next one - and
 * which nobody can edit when a threshold moves, because nobody can look at 21
 * triples and tell what they are a picture of.
 *
 * Built as a right hand in metres, wrist at the origin, fingers up `+Y`, palm
 * in the `XY` plane and the thumb out towards `-X`. The proportions are rough;
 * what matters is that a folded finger is folded by the amount a folded finger
 * is folded by, because that is the number the thresholds are about.
 */

const MCPS: [number, number, number][] = [
  [-0.025, 0.09, 0],
  [-0.005, 0.095, 0],
  [0.015, 0.09, 0],
  [0.035, 0.08, 0],
]

/** Knuckle, middle and tip bone lengths, per finger. */
const BONES: [number, number, number][] = [
  [0.04, 0.026, 0.021],
  [0.045, 0.029, 0.022],
  [0.041, 0.027, 0.02],
  [0.032, 0.02, 0.018],
]

/** How far a folded finger bends at each of its two joints, in radians. */
const FOLD = [1.4, 1.6]

function hand(spelling: string): Point[] {
  const pose = parsePose(spelling)
  if (pose === null) throw new Error(`${spelling} is not a hand`)
  const up = (index: number) => (pose & (1 << index)) !== 0

  const points: Point[] = [{ x: 0, y: 0, z: 0 }]

  // The thumb, which is the odd one: out to the side, or laid across the palm.
  points.push({ x: -0.02, y: 0.02, z: 0 })
  points.push({ x: -0.045, y: 0.045, z: 0 })
  points.push({ x: -0.065, y: 0.07, z: 0 })
  points.push(up(0) ? { x: -0.085, y: 0.095, z: 0 } : { x: -0.01, y: 0.07, z: 0.012 })

  for (const [finger, root] of MCPS.entries()) {
    const bend = up(finger + 1) ? [0, 0] : FOLD
    let angle = 0
    // The fingers bend in the plane of the palm's normal, so only two of the
    // three move: `x` is where the knuckle is and stays there.
    const x = root[0]
    let [, y, z] = root
    points.push({ x, y, z })

    for (const [joint, length] of BONES[finger].entries()) {
      // The two joints that bend are the knuckle and the middle one; the last
      // bone follows whatever the middle joint did, which is what a finger does.
      angle += bend[Math.min(joint, bend.length - 1)]
      y += Math.cos(angle) * length
      z += Math.sin(angle) * length
      points.push({ x, y, z })
    }
  }
  return points
}

/** The same hand, turned. Yaw about Y, then pitch about X, then roll about Z. */
function turned(points: Point[], yaw: number, pitch: number, roll: number): Point[] {
  return points.map(({ x, y, z }) => {
    let [a, b, c] = [x, y, z]
    ;[a, c] = [a * Math.cos(yaw) + c * Math.sin(yaw), -a * Math.sin(yaw) + c * Math.cos(yaw)]
    ;[b, c] = [b * Math.cos(pitch) - c * Math.sin(pitch), b * Math.sin(pitch) + c * Math.cos(pitch)]
    ;[a, b] = [a * Math.cos(roll) - b * Math.sin(roll), a * Math.sin(roll) + b * Math.cos(roll)]
    return { x: a, y: b, z: c }
  })
}

/**
 * The same hand in MediaPipe's world convention: metres, `y` down the picture
 * and `z` away from the camera.
 *
 * The pose reading cannot tell the difference - every measure in it is an angle
 * or a ratio - but the drift can, because turning that convention into the
 * drawn hand's is half of what the drift does. So the axes are checked against
 * a hand in the shape the model actually hands over.
 */
function metric(points: Point[]): Point[] {
  return points.map(({ x, y, z }) => ({ x, y: -y, z: -z }))
}

/** The same hand again, in picture coordinates: `y` down, and somewhere. */
function framed(points: Point[], at: { x: number; y: number }, scale: number): Point[] {
  return points.map(({ x, y, z }) => ({
    x: at.x + x * scale,
    y: at.y - y * scale,
    z: z * scale,
  }))
}

describe('reading a pose off a hand', () => {
  test('an open hand is every finger, and a fist is none', () => {
    expect(poseOf(hand('TIMRP'))).toBe(OPEN)
    expect(poseOf(hand('-'))).toBe(FIST)
  })

  test.each(['T', 'I', 'P', 'TI', 'IM', 'MRP', 'IP', 'IMRP'])('reads %s back', (spelling) => {
    expect(poseName(poseOf(hand(spelling)) ?? -1)).toBe(spelling)
  })

  test('reads the same hand held any way up', () => {
    for (const [yaw, pitch, roll] of [
      [0.6, 0, 0],
      [0, 0.5, 0],
      [0, 0, 2.4],
      [-1.1, 0.4, 3.1],
      [0.9, -0.7, -1.6],
    ]) {
      expect(poseName(poseOf(turned(hand('TI'), yaw, pitch, roll)) ?? -1)).toBe('TI')
      expect(poseOf(turned(hand('-'), yaw, pitch, roll))).toBe(FIST)
    }
  })

  test('is nothing at all when the frame is not a hand', () => {
    expect(poseOf(hand('TIMRP').slice(0, HAND_POINTS - 1))).toBeNull()
  })
})

describe('the drift', () => {
  const seen = (at: { x: number; y: number }, scale = 1.3) =>
    driftOf(framed(hand('TIMRP'), at, scale), metric(hand('TIMRP')))

  test('is mirrored, so a hand on the left of the picture flows right', () => {
    const left = seen({ x: 0.25, y: 0.5 })
    const right = seen({ x: 0.75, y: 0.5 })
    expect(left?.x).toBeGreaterThan(0)
    expect(right?.x).toBeLessThan(0)
  })

  test('is up when the hand is high in the frame', () => {
    expect(seen({ x: 0.5, y: 0.2 })?.y).toBeGreaterThan(0)
    expect(seen({ x: 0.5, y: 0.8 })?.y).toBeLessThan(0)
  })

  test('is nearer the bigger the palm is drawn', () => {
    const close = seen({ x: 0.5, y: 0.5 }, 3)
    const far = seen({ x: 0.5, y: 0.5 }, 0.6)
    expect(close?.near).toBeGreaterThan(far?.near ?? 1)
  })

  test('points its axis the way the fingers do, in the drawn hand’s space', () => {
    // Fingers up the picture, so `up` is `+Y` once the camera's downward `y`
    // has been turned over.
    expect(seen({ x: 0.5, y: 0.5 })?.up[1]).toBeGreaterThan(0.9)
  })

  test('leans the axis over when the hand does', () => {
    // A hand lying on its side, fingers pointing the way the thumb was. The
    // mirror is what makes that `+X` rather than `-X`: see `sight.ts`.
    const sideways = driftOf(
      framed(turned(hand('TIMRP'), 0, 0, Math.PI / 2), { x: 0.5, y: 0.5 }, 1.3),
      metric(turned(hand('TIMRP'), 0, 0, Math.PI / 2)),
    )
    expect(sideways?.up[0]).toBeGreaterThan(0.9)
    expect(Math.abs(sideways?.up[1] ?? 1)).toBeLessThan(0.2)
  })
})

describe('the steadier', () => {
  test('ignores a finger that flickers for one frame', () => {
    const steady = createSteady()
    expect(steady.see(OPEN, 0)).toBe(FIST)
    // Long enough to believe the open hand, then a single frame of noise.
    expect(steady.see(OPEN, SETTLE)).toBe(OPEN)
    expect(steady.see(OPEN & ~1, SETTLE + 33)).toBe(OPEN)
    expect(steady.see(OPEN, SETTLE + 66)).toBe(OPEN)
  })

  test('believes a change that lasts', () => {
    const steady = createSteady()
    steady.see(OPEN, 0)
    expect(steady.see(OPEN, SETTLE)).toBe(OPEN)
    steady.see(FIST, SETTLE + 10)
    expect(steady.see(FIST, SETTLE + 10 + SETTLE)).toBe(FIST)
  })

  test('lets a steady finger through while another one is still arguing', () => {
    const steady = createSteady()
    steady.see(OPEN, 0)
    expect(steady.see(OPEN, SETTLE)).toBe(OPEN)

    // The thumb goes down and stays down; the pinky cannot make up its mind.
    const settled = SETTLE * 2
    steady.see(OPEN & ~0b00001, settled)
    steady.see(OPEN & ~0b10001, settled + 20)
    steady.see(OPEN & ~0b00001, settled + 40)
    expect(steady.see(OPEN & ~0b00001, settled + SETTLE)).toBe(OPEN & ~0b00001)
  })
})
