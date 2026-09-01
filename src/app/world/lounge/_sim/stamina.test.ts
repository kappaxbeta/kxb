import { describe, expect, test } from 'bun:test'
import {
  FRESH,
  STAMINA_FULL,
  STAMINA_READY,
  stepStamina,
} from '@/app/world/lounge/_sim/stamina'

/** Run a whole number of seconds through it, a tenth at a time. */
function run(wants: boolean, seconds: number, from = FRESH) {
  let state = from
  let sprinting = false
  for (let i = 0; i < seconds * 10; i += 1) {
    const step = stepStamina(state, wants, 0.1)
    state = step.state
    sprinting = step.sprinting
  }
  return { state, sprinting }
}

describe('running', () => {
  test('a full bar is six seconds of it', () => {
    expect(run(true, 3).state.left).toBeCloseTo(STAMINA_FULL - 3, 5)
  })

  test('runs out, and does not go below nothing', () => {
    const spent = run(true, STAMINA_FULL)
    expect(spent.state.left).toBe(0)
    expect(spent.state.winded).toBe(true)

    // The frame that empties it is still a frame of sprinting - you spend the
    // last sliver rather than being refused while you still had it. It is the
    // frame *after* that is a walk.
    expect(spent.sprinting).toBe(true)
    expect(stepStamina(spent.state, true, 0.1).sprinting).toBe(false)
  })

  test('holding the key past empty is walking, and walking gets it back', () => {
    // Deliberate, and worth pinning down: the sprint is refused, so what is
    // happening is a walk - and a walk is how you recover. Somebody who never
    // lets go ends up jogging in bursts rather than being stopped, which is the
    // legible version of being out of breath.
    const spent = run(true, STAMINA_FULL)
    const later = run(true, 3, spent.state)
    expect(later.state.left).toBeGreaterThan(0)
  })

  test('asking for it while stood still costs nothing', () => {
    // `wants` is the key *and* moving. A player leaning on shift at a wall is
    // not running, and paying for it would be a bar that empties itself.
    expect(run(false, 2).state.left).toBe(STAMINA_FULL)
  })
})

describe('getting your breath back', () => {
  test('comes back slower than it goes', () => {
    const spent = run(true, 4)
    const rested = run(false, 4, spent.state)
    expect(rested.state.left).toBeGreaterThan(spent.state.left)
    expect(rested.state.left).toBeLessThan(STAMINA_FULL)
  })

  test('never past full', () => {
    expect(run(false, 60).state.left).toBe(STAMINA_FULL)
  })
})

describe('being winded', () => {
  test('a moment of rest is not enough to run again', () => {
    // The whole point of the lock: without it, an empty bar can be feathered a
    // tenth of a second at a time and the mechanic is a stutter.
    const spent = run(true, STAMINA_FULL + 1)
    expect(spent.state.winded).toBe(true)

    const blink = stepStamina(spent.state, false, 0.2)
    expect(stepStamina(blink.state, true, 0.1).sprinting).toBe(false)
  })

  test('enough rest is', () => {
    const spent = run(true, STAMINA_FULL + 1)
    const rested = run(false, STAMINA_READY + 0.5, spent.state)

    expect(rested.state.winded).toBe(false)
    expect(stepStamina(rested.state, true, 0.1).sprinting).toBe(true)
  })
})
