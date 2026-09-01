import { describe, expect, test } from 'bun:test'
import { firing } from '@/app/world/lounge/_sim/thing-actions'
import type { ThingAction } from '@/domain/thingiverse/blueprint'

const always: ThingAction = { when: 'always', deed: 'spin' }
const near: ThingAction = { when: 'near', deed: 'bob' }
const touch: ThingAction = { when: 'touch', deed: 'vanish' }

describe('always', () => {
  test('is on from across the room', () => {
    expect([...firing([always], 40, false).active]).toEqual(['spin'])
  })
})

describe('near', () => {
  test('comes on inside its ring and goes off outside it', () => {
    expect(firing([near], 2, false).active.has('bob')).toBe(true)
    expect(firing([near], 4, false).active.has('bob')).toBe(false)
  })
})

describe('touch', () => {
  test('fires once, not every frame you stand there', () => {
    const first = firing([touch], 0.5, false)
    expect(first.active.has('vanish')).toBe(true)
    expect(first.latched).toBe(true)

    const second = firing([touch], 0.5, first.latched)
    expect(second.active.has('vanish')).toBe(false)
  })

  test('re-arms only after you have left the wider ring', () => {
    // Walking a step back is still standing at it: re-arming at the touch
    // radius would let a body wobbling on the boundary re-trigger every few
    // frames, which for `vanish` is a thing that flickers.
    expect(firing([touch], 1.5, true).latched).toBe(true)
    expect(firing([touch], 3, true).latched).toBe(false)
  })

  test('and fires again once it has', () => {
    const away = firing([touch], 3, true)
    expect(firing([touch], 0.5, away.latched).active.has('vanish')).toBe(true)
  })
})

describe('several at once', () => {
  test('every action that applies fires, not the first', () => {
    const active = firing([always, near, touch], 0.5, false).active
    expect([...active].sort()).toEqual(['bob', 'spin', 'vanish'])
  })

  test('a thing with no actions does nothing and latches nothing', () => {
    const quiet = firing([], 0.5, false)
    expect(quiet.active.size).toBe(0)
    // Still latched: the latch is about where the body is, not about whether
    // anything cared this time - so an action added later does not fire
    // immediately for somebody already standing in it.
    expect(quiet.latched).toBe(true)
  })
})
