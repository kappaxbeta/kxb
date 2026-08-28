import { describe, expect, test } from 'bun:test'
import { actorAt, DEFAULT_ACTOR, type Actor } from '@/domain/studio/shot'
import { placeActor, turnActor } from '@/domain/studio/staging'

function actor(overrides: Partial<Actor> = {}): Actor {
  return { ...DEFAULT_ACTOR, x: 0, z: 0, rotation: 0, actions: [], ...overrides }
}

const HERE = { x: 0, z: 0 }

describe('placing an actor at the top of the shot', () => {
  test('edits where they start', () => {
    const next = placeActor(actor(), 0, { x: 3, z: 4 }, HERE)
    expect(next.x).toBe(3)
    expect(next.z).toBe(4)
    expect(next.actions).toHaveLength(0)
  })

  test('leaves the axis nobody named alone', () => {
    const next = placeActor(actor({ x: 1, z: 2 }), 0, { x: 5 }, HERE)
    expect(next.x).toBe(5)
    expect(next.z).toBe(2)
  })
})

describe('placing an actor mid-shot', () => {
  test('writes a walk instead of moving the start', () => {
    const next = placeActor(actor(), 4, { x: 6, z: 0 }, HERE)
    expect(next.x).toBe(0)
    expect(next.actions).toHaveLength(1)
  })

  test('the walk lands on the playhead, so what you see is what you set', () => {
    const next = placeActor(actor(), 4, { x: 6, z: -2 }, HERE)
    const pose = actorAt(next, 4)
    expect(pose.x).toBeCloseTo(6, 3)
    expect(pose.z).toBeCloseTo(-2, 3)
  })

  test('and the actor is still at the start when the shot begins', () => {
    const next = placeActor(actor(), 4, { x: 6, z: 0 }, HERE)
    expect(actorAt(next, 0).x).toBeCloseTo(0, 3)
  })

  test('dragging adjusts one walk rather than stacking sixty', () => {
    let next = placeActor(actor(), 4, { x: 1, z: 0 }, HERE)
    for (const x of [2, 3, 4, 5]) {
      next = placeActor(next, 4, { x, z: 0 }, { x, z: 0 })
    }
    expect(next.actions).toHaveLength(1)
    expect(actorAt(next, 4).x).toBeCloseTo(5, 3)
  })

  test('two different moments are two different walks', () => {
    const one = placeActor(actor(), 3, { x: 4, z: 0 }, HERE)
    const two = placeActor(one, 6, { x: 8, z: 0 }, { x: 4, z: 0 })
    expect(two.actions).toHaveLength(2)
    expect(actorAt(two, 3).x).toBeCloseTo(4, 3)
    expect(actorAt(two, 6).x).toBeCloseTo(8, 3)
  })

  test('near the top the walk is shortened rather than starting before zero', () => {
    const next = placeActor(actor(), 0.5, { x: 2, z: 0 }, HERE)
    const walk = next.actions[0]!
    expect(walk.t).toBeGreaterThanOrEqual(0)
    expect(actorAt(next, 0.5).x).toBeCloseTo(2, 3)
  })
})

describe('turning an actor', () => {
  test('at the top it is the starting facing', () => {
    expect(turnActor(actor(), 0, 90).rotation).toBe(90)
  })

  test('mid-shot it is a turn that lands on the playhead', () => {
    const next = turnActor(actor(), 3, 90)
    expect(next.rotation).toBe(0)
    expect(actorAt(next, 3).rotation).toBeCloseTo(90, 3)
  })

  test('and dragging the dial adjusts the one turn', () => {
    let next = turnActor(actor(), 3, 20)
    next = turnActor(next, 3, 140)
    expect(next.actions).toHaveLength(1)
    expect(actorAt(next, 3).rotation).toBeCloseTo(140, 3)
  })
})
