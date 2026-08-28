import { beforeEach, describe, expect, test } from 'bun:test'
import { hereNow, leaveHere, publishHere, subscribe } from '@/app/world/_stores/here-store'

/**
 * The store the scenes report their room into and the sidebar reads.
 *
 * Everything here is about the seam between two scenes rather than about one:
 * a client-side navigation mounts the room you are arriving at *before* it
 * unmounts the one you are leaving, so the departing scene's cleanup runs last
 * and would otherwise wipe a roster it no longer owns.
 *
 * `useHere` itself is not exercised - it is `useSyncExternalStore` over these
 * two functions, and testing React's plumbing would test React.
 */

/** The room, read the same way the hook's getter reads it. */
const read = hereNow

// The store is module state, so one test's room is still standing when the
// next one starts. Emptying every place is cheaper than reaching in to reset
// it, and it exercises the same door everything else leaves by.
beforeEach(() => {
  leaveHere('lounge')
  leaveHere('cafe')
  leaveHere('home')
  leaveHere('outdoor')
})

describe('publishHere', () => {
  test('names the room and everybody in it', () => {
    publishHere('lounge', [{ userId: 'a', name: 'Ada', avatar: 'fox' }])

    expect(read()).toEqual({
      place: 'lounge',
      people: [{ userId: 'a', name: 'Ada', avatar: 'fox' }],
    })
  })

  test('an empty room is still a room - you are in it', () => {
    publishHere('cafe', [])
    expect(read().place).toBe('cafe')
    expect(read().people).toEqual([])
  })

  test('the same roster twice does not wake the subscribers', () => {
    const peers = [{ userId: 'a', name: 'Ada', avatar: 'fox' }]
    publishHere('lounge', peers)

    let woken = 0
    const stop = subscribe(() => {
      woken += 1
    })
    // A fresh array with the same contents: this is what a presence sync hands
    // over on every join anywhere in the room, including ones that change
    // nothing about who is standing here.
    publishHere('lounge', [{ userId: 'a', name: 'Ada', avatar: 'fox' }])
    stop()

    expect(woken).toBe(0)
  })

  test('a rename is a change, even though the roster is the same size', () => {
    publishHere('lounge', [{ userId: 'a', name: 'Ada', avatar: 'fox' }])

    let woken = 0
    const stop = subscribe(() => {
      woken += 1
    })
    publishHere('lounge', [{ userId: 'a', name: 'Ada L', avatar: 'fox' }])
    stop()

    expect(woken).toBe(1)
    expect(read().people[0].name).toBe('Ada L')
  })
})

describe('leaveHere', () => {
  test('empties the room you were in', () => {
    publishHere('lounge', [{ userId: 'a', name: 'Ada', avatar: 'fox' }])
    leaveHere('lounge')

    expect(read()).toEqual({ place: null, people: [] })
  })

  /**
   * The case the guard exists for. Walking from the café to the garden mounts
   * the garden first, so the café's cleanup fires after the garden has already
   * published - and without the guard the rail would go blank on arrival and
   * stay blank until the next presence sync.
   */
  test('a scene that has already been replaced cannot empty its successor', () => {
    publishHere('cafe', [{ userId: 'a', name: 'Ada', avatar: 'fox' }])
    publishHere('outdoor', [{ userId: 'b', name: 'Sam', avatar: 'bear' }])

    leaveHere('cafe')

    expect(read().place).toBe('outdoor')
    expect(read().people).toHaveLength(1)
  })
})
