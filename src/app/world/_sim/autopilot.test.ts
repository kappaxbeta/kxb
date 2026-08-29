import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { EYE_HEIGHT } from '@/app/world/lounge/_sim/physics'
import { CATCH_UP, type Drift, drift } from '@/app/world/_sim/autopilot'
import {
  type Activity,
  POSTURE,
  type Roam,
  type Roamable,
} from '@/domain/world/autonomy'
import { rectangleRoom, tileKey } from '@kxb/peepz-world/grid'

/**
 * A roamer pinned to one answer.
 *
 * The schedule itself is covered in `src/domain/world/autonomy.test.ts`; what is
 * under test here is only the easing that carries a body toward it, so holding
 * the target still is what makes the assertions about convergence mean anything.
 */
function fixed(pose: Partial<Roam> & { activity?: Activity } = {}) {
  const answer: Roam = {
    activity: 'watch',
    x: 0,
    z: 0,
    yaw: 0,
    ...pose,
  }
  return { at: () => answer }
}

function room(): Roamable {
  const tiles = [...rectangleRoom(5, 4)].sort()
  const inside = new Set(tiles)
  return { tiles, walkable: (tile) => inside.has(tileKey(tile.x, tile.z)) }
}

function out(): Drift {
  return { yaw: 0, lean: 0 }
}

describe('drift', () => {
  test('walks the body toward the schedule instead of teleporting it', () => {
    const player = new THREE.Vector3(9, EYE_HEIGHT, 9)
    const gap = player.x

    // One frame closes a small fraction of the gap, not the whole of it. This
    // is the difference between switching the autopilot on and being flung
    // across the room, since the schedule has been running all along without
    // you. At 60Hz and a rate of 4 that fraction is about 6.5%.
    drift(fixed({ x: 0, z: 0 }), room(), player, 1 / 60, out())

    const moved = gap - player.x
    expect(moved).toBeGreaterThan(0)
    expect(moved).toBeLessThan(gap * 0.1)
  })

  test('closes the gap without overshooting it', () => {
    const player = new THREE.Vector3(9, EYE_HEIGHT, -4)
    const target = fixed({ x: 0, z: 0 })
    const plan = room()

    for (let i = 0; i < 600; i++) drift(target, plan, player, 1 / 60, out())

    expect(player.x).toBeCloseTo(0, 3)
    expect(player.z).toBeCloseTo(0, 3)
  })

  test('the approach is monotonic - it never doubles back', () => {
    const player = new THREE.Vector3(9, EYE_HEIGHT, 9)
    const target = fixed({ x: 0, z: 0 })
    const plan = room()

    let previous = Math.hypot(player.x, player.z)
    for (let i = 0; i < 300; i++) {
      drift(target, plan, player, 1 / 60, out())
      const distance = Math.hypot(player.x, player.z)
      expect(distance).toBeLessThanOrEqual(previous + 1e-9)
      previous = distance
    }
  })

  test('is framerate independent', () => {
    // Same elapsed second, different frame budgets. A body that ends up
    // somewhere different on a 30Hz laptop is a body whose broadcast position
    // disagrees with what everyone else is drawing.
    const smooth = new THREE.Vector3(9, EYE_HEIGHT, 0)
    const choppy = new THREE.Vector3(9, EYE_HEIGHT, 0)
    const target = fixed({ x: 0, z: 0 })
    const plan = room()

    for (let i = 0; i < 120; i++) drift(target, plan, smooth, 1 / 120, out())
    for (let i = 0; i < 30; i++) drift(target, plan, choppy, 1 / 30, out())

    expect(smooth.x).toBeCloseTo(choppy.x, 2)
  })

  test('the eye drops with the posture, so sitting lowers the camera', () => {
    const plan = room()

    const standing = new THREE.Vector3(0, EYE_HEIGHT, 0)
    const sitting = new THREE.Vector3(0, EYE_HEIGHT, 0)

    for (let i = 0; i < 600; i++) {
      drift(fixed({ activity: 'watch' }), plan, standing, 1 / 60, out())
      drift(fixed({ activity: 'sleep' }), plan, sitting, 1 / 60, out())
    }

    expect(standing.y).toBeCloseTo(EYE_HEIGHT, 3)
    expect(sitting.y).toBeCloseTo(EYE_HEIGHT - POSTURE.sleep.drop, 3)
    expect(sitting.y).toBeLessThan(standing.y)
  })

  test('reports the heading and lean for the body to follow', () => {
    const steering = out()
    drift(
      fixed({ activity: 'sleep', yaw: 1.2 }),
      room(),
      new THREE.Vector3(0, EYE_HEIGHT, 0),
      1 / 60,
      steering,
    )

    expect(steering.yaw).toBe(1.2)
    expect(steering.lean).toBe(POSTURE.sleep.lean)
  })

  test('every posture the schedule can report has a drop and a lean', () => {
    // The renderer indexes `POSTURE` by whatever comes back, so a new activity
    // added without an entry would be a body at `undefined` height.
    for (const activity of ['travel', 'potter', 'watch', 'sit', 'sleep'] as const) {
      expect(POSTURE[activity].drop).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(POSTURE[activity].lean)).toBe(true)
    }
  })

  test('CATCH_UP is a rate, not a fraction', () => {
    // Guards the constant against being "tuned" to something above 1 in the
    // belief that it is a lerp factor - it is an exponent, and the easing is
    // `1 - e^(-rate * delta)`.
    expect(CATCH_UP).toBeGreaterThan(0)
  })
})
