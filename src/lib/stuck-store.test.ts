import { beforeEach, describe, expect, test } from 'bun:test'
import { clearStuck, publishStuck, stuckNow, subscribe } from '@/lib/stuck-store'

/**
 * The store a scene offers its ways out through, and the rail's Room tab reads.
 *
 * Everything worth testing here is the seam between two scenes rather than one:
 * a client-side navigation mounts the world you are arriving at *before* it
 * unmounts the one you are leaving, so the departing scene's cleanup runs last -
 * and without the key guard it would take the buttons away from a world that is
 * already on screen, which is exactly the moment somebody needs them.
 *
 * `useStuck` itself is not exercised: it is `useSyncExternalStore` over these
 * functions, and testing React's plumbing would test React.
 */

const nothing = () => {}

// Module state, so one test's world is still standing when the next starts.
beforeEach(() => {
  clearStuck('lounge')
  clearStuck('arena')
})

describe('publishStuck', () => {
  test('offers the scene’s own way out', () => {
    const back = () => {}
    publishStuck('lounge', back, null)
    expect(stuckNow()?.unstick).toBe(back)
  })

  test('a world with no ball offers nothing about one', () => {
    publishStuck('lounge', nothing, null)
    expect(stuckNow()?.ball).toBe(null)
  })

  test('a match with a ball that has stopped offers it back', () => {
    const fetchIt = () => {}
    publishStuck('arena', nothing, fetchIt)
    expect(stuckNow()?.ball).toBe(fetchIt)
  })

  test('there is nothing to press with no world on screen', () => {
    expect(stuckNow()).toBe(null)
  })

  test('walking out takes them away', () => {
    publishStuck('lounge', nothing, null)
    clearStuck('lounge')
    expect(stuckNow()).toBe(null)
  })

  test('the scene you are leaving cannot take the new one’s buttons', () => {
    // The overlap, in the order it actually happens: the arena mounts and
    // publishes, then the lounge's cleanup runs.
    publishStuck('lounge', nothing, null)
    const inArena = () => {}
    publishStuck('arena', inArena, null)
    clearStuck('lounge')

    expect(stuckNow()?.unstick).toBe(inArena)
  })
})

describe('who gets woken', () => {
  test('a new way out wakes the rail', () => {
    let woken = 0
    const stop = subscribe(() => {
      woken += 1
    })

    publishStuck('lounge', nothing, null)
    expect(woken).toBe(1)

    clearStuck('lounge')
    expect(woken).toBe(2)

    stop()
  })

  test('the ball coming and going wakes it on its own', () => {
    // The one value here that changes while a scene stands still: the ball stops
    // being reachable mid-match, and the rail has to grow a button for it.
    publishStuck('arena', nothing, null)

    let woken = 0
    const stop = subscribe(() => {
      woken += 1
    })

    const fetchIt = () => {}
    publishStuck('arena', nothing, fetchIt)
    expect(woken).toBe(1)

    publishStuck('arena', nothing, null)
    expect(woken).toBe(2)

    stop()
  })

  test('the same pair again wakes nobody', () => {
    // The scene republishes whenever its effect re-runs, and
    // `useSyncExternalStore` compares snapshots by identity - so re-announcing
    // an unchanged one would be a rail that re-renders forever.
    publishStuck('lounge', nothing, null)

    let woken = 0
    const stop = subscribe(() => {
      woken += 1
    })

    publishStuck('lounge', nothing, null)
    expect(woken).toBe(0)

    stop()
  })

  test('a clear for somebody else’s world wakes nobody', () => {
    publishStuck('arena', nothing, null)

    let woken = 0
    const stop = subscribe(() => {
      woken += 1
    })

    clearStuck('lounge')
    expect(woken).toBe(0)

    stop()
  })
})
