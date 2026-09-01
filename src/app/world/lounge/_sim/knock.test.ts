import { describe, expect, test } from 'bun:test'

import { ballAt } from '@/app/world/lounge/_sim/football'
import { awake, drifted, knockable, knocked } from '@/app/world/lounge/_sim/knock'
import { EYE_HEIGHT } from '@/app/world/lounge/_sim/physics'

const nothingSolid = () => false

/** A body standing at `x`, walking towards positive x at `speed`. */
function walker(x: number, speed: number) {
  return { position: { x, y: EYE_HEIGHT, z: 0 }, vx: speed, vz: 0 }
}

describe('which things are loose', () => {
  test('a thing that falls and does not block is a ball', () => {
    expect(knockable({ body: {}, blocking: false })).toBe(true)
  })

  test('furniture is not, however it is spelled', () => {
    expect(knockable({ body: {}, blocking: true })).toBe(false)
    expect(knockable({ body: null, blocking: false })).toBe(false)
    expect(knockable({ body: null, blocking: true })).toBe(false)
  })
})

describe('being knocked about', () => {
  test('walking into it sends it away from you', () => {
    const ball = ballAt({ x: 1, y: 0.4, z: 0 })
    const { ball: next, touched } = knocked({
      ball,
      bodies: [walker(0, 4)],
      delta: 1 / 60,
      isSolid: nothingSolid,
    })

    expect(touched).toBe(true)
    expect(next.vx).toBeGreaterThan(0)
  })

  test('and walking faster sends it further', () => {
    const at = { x: 1, y: 0.4, z: 0 }
    const slow = knocked({
      ball: ballAt(at),
      bodies: [walker(0, 2)],
      delta: 1 / 60,
      isSolid: nothingSolid,
    })
    const fast = knocked({
      ball: ballAt(at),
      bodies: [walker(0, 8)],
      delta: 1 / 60,
      isSolid: nothingSolid,
    })

    expect(fast.ball.vx).toBeGreaterThan(slow.ball.vx)
  })

  test('standing next to it does nothing', () => {
    // Not a contact at all: `strike` answers null for a body that is neither
    // closing on the ball nor standing inside it, which is what stops somebody
    // idling beside a ball from nudging it across the room a frame at a time.
    const { ball, touched } = knocked({
      ball: ballAt({ x: 1, y: 0.4, z: 0 }),
      bodies: [walker(0, 0)],
      delta: 1 / 60,
      isSolid: nothingSolid,
    })

    expect(touched).toBe(false)
    expect(ball.vx).toBe(0)
  })

  test('nobody near it and it is already asleep', () => {
    const { ball, moving, touched } = knocked({
      ball: ballAt({ x: 20, y: 0.4, z: 20 }),
      bodies: [walker(0, 6)],
      delta: 1 / 60,
      isSolid: nothingSolid,
    })

    expect(touched).toBe(false)
    expect(moving).toBe(false)
    expect(awake(ball)).toBe(false)
  })

  test('a kick runs out on its own', () => {
    let ball = ballAt({ x: 1, y: 0.4, z: 0 })
    ball = knocked({
      ball,
      bodies: [walker(0, 9)],
      delta: 1 / 60,
      isSolid: nothingSolid,
    }).ball

    let moving = true
    for (let frame = 0; frame < 60 * 20 && moving; frame += 1) {
      const step = knocked({ ball, bodies: [], delta: 1 / 60, isSolid: nothingSolid })
      ball = step.ball
      moving = step.moving
    }

    expect(moving).toBe(false)
    expect(ball.x).toBeGreaterThan(1)
  })
})

describe('when a new place is worth writing down', () => {
  test('a nudge is not', () => {
    expect(drifted({ x: 0, y: 0, z: 0 }, { x: 0.05, y: 0, z: 0.05 })).toBe(false)
  })

  test('a kick across the room is', () => {
    expect(drifted({ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 })).toBe(true)
  })
})
