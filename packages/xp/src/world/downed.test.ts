import { describe, expect, test } from 'bun:test'
import { stepDowned } from './downed'

/**
 * The rules that fail quietly.
 *
 * This machine spent its life as ninety lines of `if` inside a 1,672-line frame
 * callback, against six refs and three React setters, and had no test - the only
 * way to exercise "a stun that expires on the frame of a death" was to author a
 * level with both and get the timing right by hand.
 *
 * Every case below is one where the wrong answer is *playable*. You are not told
 * the stun outlived the body; you stand up at the spawn and cannot walk.
 */

const ALIVE = {
  stunned: null,
  dying: null,
  dead: false,
  out: false,
  elapsed: 10,
  delta: 1 / 60,
  respawn: 0,
}

describe('walking around', () => {
  test('an ordinary frame changes nothing and asks for nothing', () => {
    const step = stepDowned(ALIVE)
    expect(step).toEqual({
      stunned: null,
      dying: null,
      frozen: undefined,
      downFor: undefined,
      revive: false,
      announce: false,
    })
  })

  /** `undefined` and not `false` - this frame has no opinion about the freeze. */
  test('nobody unfreezes a player who was never frozen', () => {
    expect(stepDowned(ALIVE).frozen).toBeUndefined()
  })
})

describe('a stun', () => {
  test('is left alone while it still has time to run', () => {
    const step = stepDowned({ ...ALIVE, stunned: 12, elapsed: 11.9 })
    expect(step.stunned).toBe(12)
    expect(step.frozen).toBeUndefined()
  })

  test('ends on its second, and lets go of the controller', () => {
    const step = stepDowned({ ...ALIVE, stunned: 12, elapsed: 12 })
    expect(step.stunned).toBeNull()
    expect(step.frozen).toBe(false)
  })

  /**
   * A spectator is frozen for good. A stun expiring is not news to them, and
   * unfreezing here would hand a watcher the controls.
   */
  test('does not unfreeze somebody who is out', () => {
    const step = stepDowned({ ...ALIVE, stunned: 12, elapsed: 12, out: true })
    expect(step.stunned).toBeNull()
    expect(step.frozen).toBeUndefined()
  })

  test('nor somebody already waiting to come back', () => {
    const step = stepDowned({ ...ALIVE, stunned: 12, elapsed: 12, dying: 3 })
    expect(step.stunned).toBeNull()
    expect(step.frozen).toBeUndefined()
  })
})

/**
 * The ordering that the comment in the old code called out and nothing checked.
 */
describe('a stun and a death on the same frame', () => {
  test('the death wins, and no corpse stands up', () => {
    const step = stepDowned({
      ...ALIVE,
      stunned: 12,
      elapsed: 12,
      dead: true,
      respawn: 3,
    })
    expect(step.stunned).toBeNull()
    // The stun would have unfrozen; dying freezes again on the same frame.
    expect(step.frozen).toBe(true)
    expect(step.dying).toBe(3)
  })
})

describe('dying with a wait', () => {
  test('holds the body down rather than reviving it', () => {
    const step = stepDowned({ ...ALIVE, dead: true, respawn: 3 })
    expect(step.dying).toBe(3)
    expect(step.frozen).toBe(true)
    expect(step.revive).toBe(false)
    expect(step.downFor).toBe(3)
    expect(step.announce).toBe(true)
  })

  test('counts down, showing whole seconds', () => {
    expect(stepDowned({ ...ALIVE, dying: 3, delta: 0.5 }).downFor).toBe(3)
    expect(stepDowned({ ...ALIVE, dying: 2.4, delta: 0.5 }).downFor).toBe(2)
    expect(stepDowned({ ...ALIVE, dying: 0.4, delta: 0.2 }).downFor).toBe(1)
  })

  test('and says nothing more while it counts', () => {
    expect(stepDowned({ ...ALIVE, dying: 2, dead: true, respawn: 3 }).announce).toBe(false)
  })

  test('comes back when the clock runs out', () => {
    const step = stepDowned({ ...ALIVE, dying: 0.1, delta: 0.2 })
    expect(step.dying).toBeNull()
    expect(step.revive).toBe(true)
    expect(step.frozen).toBe(false)
    expect(step.downFor).toBeNull()
  })

  /**
   * Standing up at the spawn unable to move is a punishment for having been
   * killed *while* stunned, which is nobody's rule.
   */
  test('and whatever was owed of a stun dies with the body', () => {
    const step = stepDowned({ ...ALIVE, dying: 0.1, delta: 0.2, stunned: 99, elapsed: 10 })
    expect(step.revive).toBe(true)
    expect(step.stunned).toBeNull()
    expect(step.frozen).toBe(false)
  })
})

describe('dying with no wait', () => {
  test('is back at the start on the same frame', () => {
    const step = stepDowned({ ...ALIVE, dead: true, respawn: 0 })
    expect(step.revive).toBe(true)
    expect(step.dying).toBeNull()
    expect(step.announce).toBe(true)
  })

  /**
   * There is no wait to hide it behind, so the unfreeze has to be explicit -
   * otherwise `respawn: 0` puts you back at the start rooted to the spot.
   */
  test('and lets go of the controller on the way', () => {
    const step = stepDowned({ ...ALIVE, dead: true, respawn: 0, stunned: 99 })
    expect(step.frozen).toBe(false)
    expect(step.stunned).toBeNull()
  })
})

describe('being out', () => {
  test('a spectator who is dead is not respawned', () => {
    const step = stepDowned({ ...ALIVE, dead: true, out: true, respawn: 3 })
    expect(step.revive).toBe(false)
    expect(step.dying).toBeNull()
    expect(step.announce).toBe(false)
  })

  /** Already on the way back, so being out does not cancel it. */
  test('but one already counting down still comes back', () => {
    const step = stepDowned({ ...ALIVE, dying: 0.1, delta: 0.2, out: true })
    expect(step.revive).toBe(true)
  })
})

describe('staying dead', () => {
  test('a body still dead the frame after reviving does not double-announce', () => {
    // First frame: dies, starts the wait.
    const first = stepDowned({ ...ALIVE, dead: true, respawn: 3 })
    expect(first.announce).toBe(true)
    // Second: still dead, but now counting - so it is not news again.
    const second = stepDowned({ ...ALIVE, dead: true, respawn: 3, dying: first.dying })
    expect(second.announce).toBe(false)
  })
})
