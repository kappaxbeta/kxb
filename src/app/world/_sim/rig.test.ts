import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import {
  clampAxis,
  DRAG_RATE,
  fovFor,
  LOOK_RATE,
  PITCH_MAX,
  PITCH_MIN,
  turnCamera,
  walkAxes,
} from '@/app/world/_sim/rig'

/**
 * The first tests the shared rig has had.
 *
 * It has been the café's and the house's common ground since the house arrived
 * - its own header says *neither the maths nor the numbers depend on what is
 * being built* - and until now the only way to exercise any of it was to load a
 * place and walk around in one. Both places are behind a login and neither
 * renders without WebGL, so in practice that meant nobody did.
 *
 * `walkAxes` and `turnCamera` moved here from two copies inside two `useFrame`
 * callbacks. The point of the move was this file.
 */

const NO_KEYS: Record<string, boolean> = {}
const STILL = { forward: 0, strafe: 0, sprint: false }

describe('clampAxis', () => {
  test('leaves an ordinary axis alone', () => {
    expect(clampAxis(0)).toBe(0)
    expect(clampAxis(0.4)).toBe(0.4)
    expect(clampAxis(-0.4)).toBe(-0.4)
  })

  test('holds the ends', () => {
    expect(clampAxis(1)).toBe(1)
    expect(clampAxis(-1)).toBe(-1)
  })

  /** The case it exists for: a key and a thumbstick pushed the same way. */
  test('a doubled input is still one', () => {
    expect(clampAxis(2)).toBe(1)
    expect(clampAxis(-2)).toBe(-1)
  })
})

describe('walkAxes', () => {
  test('nothing pressed is nobody walking', () => {
    const walk = walkAxes(NO_KEYS, STILL)
    expect(walk).toEqual({ forward: 0, strafe: 0, sprint: false, evenly: 1, walking: false })
  })

  test('W is forward, S is back', () => {
    expect(walkAxes({ KeyW: true }, STILL).forward).toBe(1)
    expect(walkAxes({ KeyS: true }, STILL).forward).toBe(-1)
  })

  test('D is right, A is left', () => {
    expect(walkAxes({ KeyD: true }, STILL).strafe).toBe(1)
    expect(walkAxes({ KeyA: true }, STILL).strafe).toBe(-1)
  })

  test('opposite keys cancel rather than fight', () => {
    const walk = walkAxes({ KeyW: true, KeyS: true, KeyA: true, KeyD: true }, STILL)
    expect(walk.forward).toBe(0)
    expect(walk.strafe).toBe(0)
    expect(walk.walking).toBe(false)
  })

  /**
   * The reason the two inputs are summed *then* clamped.
   *
   * A hybrid laptop with a touchscreen genuinely does both at once, and the
   * obvious alternative - whichever is larger wins - reads the same in every
   * test but feels wrong the moment somebody nudges the stick while holding W.
   */
  test('a key and a thumbstick pushed together is full speed, not double', () => {
    const walk = walkAxes({ KeyW: true }, { forward: 1, strafe: 0, sprint: false })
    expect(walk.forward).toBe(1)
  })

  test('a gentle thumbstick stays gentle', () => {
    const walk = walkAxes(NO_KEYS, { forward: 0.3, strafe: 0, sprint: false })
    expect(walk.forward).toBeCloseTo(0.3, 10)
    expect(walk.evenly).toBe(1)
  })

  test('either source can call for a sprint', () => {
    expect(walkAxes({ ShiftLeft: true }, STILL).sprint).toBe(true)
    expect(walkAxes(NO_KEYS, { forward: 0, strafe: 0, sprint: true }).sprint).toBe(true)
    expect(walkAxes(NO_KEYS, STILL).sprint).toBe(false)
  })
})

/**
 * The diagonal, which is the bug this whole shape exists to prevent.
 *
 * Each axis is clamped on its own, so W+D used to be two full-strength pushes
 * at right angles: a vector √2 long, and forty per cent faster than walking
 * straight. Free speed for anyone who noticed, and invisible to anyone who did
 * not.
 */
describe('the diagonal', () => {
  test('W+D is brought back to walking pace', () => {
    const walk = walkAxes({ KeyW: true, KeyD: true }, STILL)
    expect(walk.forward).toBe(1)
    expect(walk.strafe).toBe(1)
    // √2 long, so scaled by 1/√2 - and the drawn speed is 1, not 1.41.
    expect(walk.evenly).toBeCloseTo(Math.SQRT1_2, 10)
    expect(Math.hypot(walk.forward * walk.evenly, walk.strafe * walk.evenly)).toBeCloseTo(1, 10)
  })

  test('every diagonal corner is the same speed as straight', () => {
    for (const [a, b] of [
      ['KeyW', 'KeyD'],
      ['KeyW', 'KeyA'],
      ['KeyS', 'KeyD'],
      ['KeyS', 'KeyA'],
    ] as const) {
      const walk = walkAxes({ [a]: true, [b]: true }, STILL)
      const speed = Math.hypot(walk.forward * walk.evenly, walk.strafe * walk.evenly)
      expect(speed).toBeCloseTo(1, 10)
    }
  })

  /** Scaled, not normalised - the difference only shows on a short input. */
  test('a short diagonal is not stretched up to full speed', () => {
    const walk = walkAxes(NO_KEYS, { forward: 0.2, strafe: 0.2, sprint: false })
    expect(walk.evenly).toBe(1)
    expect(Math.hypot(walk.forward, walk.strafe)).toBeCloseTo(0.283, 3)
  })
})

describe('turnCamera', () => {
  const rig = () => ({
    camera: new THREE.PerspectiveCamera(),
    euler: new THREE.Euler(0, 0, 0, 'YXZ'),
  })

  test('nothing asked for turns nothing', () => {
    const { camera, euler } = rig()
    const before = camera.quaternion.clone()
    turnCamera({ camera, euler, keys: NO_KEYS, look: { dx: 0, dy: 0 }, dt: 1 / 60 })
    expect(camera.quaternion.equals(before)).toBe(true)
  })

  test('the arrow keys turn at a rate per second, not per call', () => {
    const { camera, euler } = rig()
    turnCamera({ camera, euler, keys: { ArrowLeft: true }, look: { dx: 0, dy: 0 }, dt: 1 })
    expect(euler.y).toBeCloseTo(LOOK_RATE, 6)
  })

  test('right is the other way from left', () => {
    const { camera, euler } = rig()
    turnCamera({ camera, euler, keys: { ArrowRight: true }, look: { dx: 0, dy: 0 }, dt: 1 })
    expect(euler.y).toBeCloseTo(-LOOK_RATE, 6)
  })

  /**
   * Drained, and that is the whole reason it is passed as an object.
   *
   * The drag accumulated since the last frame has been spent by the time this
   * returns. Leaving it in place would re-apply it every frame until the next
   * touch, which reads as the camera drifting on its own after a swipe.
   */
  test('a touch drag is spent once', () => {
    const { camera, euler } = rig()
    const look = { dx: 10, dy: 0 }
    turnCamera({ camera, euler, keys: NO_KEYS, look, dt: 1 / 60 })
    expect(look).toEqual({ dx: 0, dy: 0 })
    expect(euler.y).toBeCloseTo(-10 * DRAG_RATE, 6)

    const after = euler.y
    turnCamera({ camera, euler, keys: NO_KEYS, look, dt: 1 / 60 })
    expect(euler.y).toBeCloseTo(after, 6)
  })

  test('the drag is drained even when nothing else moved', () => {
    const { camera, euler } = rig()
    const look = { dx: 0, dy: 0 }
    turnCamera({ camera, euler, keys: NO_KEYS, look, dt: 1 / 60 })
    expect(look).toEqual({ dx: 0, dy: 0 })
  })

  /**
   * Looking up and down is bounded, and tighter than the usual ninety degrees.
   *
   * The camera hangs off the look direction, so staring at the ceiling swings
   * the boom under the floor and puts the view inside the ground.
   */
  test('you cannot look past the limits however long you hold it', () => {
    const { camera, euler } = rig()
    for (let i = 0; i < 200; i++) {
      turnCamera({ camera, euler, keys: { ArrowUp: true }, look: { dx: 0, dy: 0 }, dt: 1 / 60 })
    }
    expect(euler.x).toBeCloseTo(PITCH_MAX, 6)

    for (let i = 0; i < 400; i++) {
      turnCamera({ camera, euler, keys: { ArrowDown: true }, look: { dx: 0, dy: 0 }, dt: 1 / 60 })
    }
    expect(euler.x).toBeCloseTo(PITCH_MIN, 6)
  })

  test('down is given more room than up', () => {
    expect(Math.abs(PITCH_MIN)).toBeGreaterThan(Math.abs(PITCH_MAX))
  })
})

/**
 * A phone held upright sees less of the room, so it is given a wider lens.
 */
describe('fovFor', () => {
  test('landscape gets the base lens', () => {
    expect(fovFor(1280, 800)).toBe(58)
  })

  test('portrait is widened, up to a ceiling', () => {
    const portrait = fovFor(390, 844)
    expect(portrait).toBeGreaterThan(58)
    expect(portrait).toBeLessThanOrEqual(82)
  })

  test('the narrower the window, the wider the lens', () => {
    expect(fovFor(390, 844)).toBeGreaterThanOrEqual(fovFor(768, 1024))
  })
})
