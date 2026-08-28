import { describe, expect, test } from 'bun:test'
import { PLAYER_RADIUS } from '@kxb/xp/engine'
import { dashCatches, startDash } from '@/app/xp/_runtime/match/dash'

/**
 * The one way a body hurts another body, and the rule that decides it.
 *
 * It lived inside the crowd loop in ../simulation, interleaved with the shove
 * list because that loop already had every peer's box. Nothing about the two
 * was related, and this half is the one with a rule in it - the same rule the
 * battle roster's `alliesOf` arrives at from the other direction, and the same
 * bug if it is got wrong.
 */

const AT = { x: 0, y: 0, z: 0 }

/** A box centred on the player, so overlap is never the thing under test. */
const onTop = { minX: -1, maxX: 1, minY: -1, maxY: 2, minZ: -1, maxZ: 1 }
/** Far enough that no shoulder reaches it. */
const away = { minX: 50, maxX: 52, minY: 0, maxY: 2, minZ: 50, maxZ: 52 }

const sides = (map: Record<string, string>) => (id: string) => map[id]

const dashing = {
  at: AT,
  elapsed: 1,
  dashUntil: 2,
  caught: new Set<string>(),
}

describe('while the dash is running', () => {
  test('an enemy standing on you is caught', () => {
    expect(
      dashCatches({
        ...dashing,
        peers: [{ id: 'them', box: onTop }],
        mine: 'red',
        sideOfPeer: sides({ them: 'blue' }),
      }),
    ).toEqual(['them'])
  })

  test('an enemy out of reach is not', () => {
    expect(
      dashCatches({
        ...dashing,
        peers: [{ id: 'them', box: away }],
        mine: 'red',
        sideOfPeer: sides({ them: 'blue' }),
      }),
    ).toEqual([])
  })

  test('a team-mate is never caught, however close', () => {
    expect(
      dashCatches({
        ...dashing,
        peers: [{ id: 'mate', box: onTop }],
        mine: 'red',
        sideOfPeer: sides({ mate: 'red' }),
      }),
    ).toEqual([])
  })
})

/**
 * A level with no teams has everybody sideless. Reading that as *everyone is an
 * enemy* would make a free-for-all out of a kickabout that never asked for one.
 */
describe('when a side is not known', () => {
  test('a sideless dasher catches nobody', () => {
    expect(
      dashCatches({
        ...dashing,
        peers: [{ id: 'them', box: onTop }],
        mine: undefined,
        sideOfPeer: sides({ them: 'blue' }),
      }),
    ).toEqual([])
  })

  test('nor is a sideless peer caught', () => {
    expect(
      dashCatches({
        ...dashing,
        peers: [{ id: 'them', box: onTop }],
        mine: 'red',
        sideOfPeer: () => undefined,
      }),
    ).toEqual([])
  })

  test('and a room where nobody has a side is a room where nothing happens', () => {
    expect(
      dashCatches({
        ...dashing,
        peers: [{ id: 'a', box: onTop }, { id: 'b', box: onTop }],
        mine: undefined,
        sideOfPeer: () => undefined,
      }),
    ).toEqual([])
  })
})

describe('when the dash is over', () => {
  test('nothing is caught, and no peer is even looked at', () => {
    let asked = 0
    expect(
      dashCatches({
        ...dashing,
        elapsed: 2,
        peers: [{ id: 'them', box: onTop }],
        mine: 'red',
        sideOfPeer: () => { asked++; return 'blue' },
      }),
    ).toEqual([])
    expect(asked).toBe(0)
  })

  test('the last frame of the dash still counts', () => {
    expect(
      dashCatches({
        ...dashing,
        elapsed: 1.999,
        peers: [{ id: 'them', box: onTop }],
        mine: 'red',
        sideOfPeer: sides({ them: 'blue' }),
      }).length,
    ).toBe(1)
  })
})

/** One dash must not catch the same person twice while it is still running. */
describe('somebody already caught', () => {
  test('is not caught again', () => {
    expect(
      dashCatches({
        ...dashing,
        peers: [{ id: 'them', box: onTop }],
        mine: 'red',
        sideOfPeer: sides({ them: 'blue' }),
        caught: new Set(['them']),
      }),
    ).toEqual([])
  })

  test('but the person beside them still is', () => {
    expect(
      dashCatches({
        ...dashing,
        peers: [{ id: 'them', box: onTop }, { id: 'other', box: onTop }],
        mine: 'red',
        sideOfPeer: sides({ them: 'blue', other: 'blue' }),
        caught: new Set(['them']),
      }),
    ).toEqual(['other'])
  })

  test('and the set handed in is never written to', () => {
    const caught = new Set(['them'])
    dashCatches({
      ...dashing,
      peers: [{ id: 'other', box: onTop }],
      mine: 'red',
      sideOfPeer: sides({ other: 'blue' }),
      caught,
    })
    expect([...caught]).toEqual(['them'])
  })
})

/**
 * `shoverBox` is measured from `at` *downwards* - `at.y` is the eye, and the box
 * runs an `EYE_HEIGHT` below it to the feet. A peer whose box starts at the
 * player's eye and goes up is above the shoulder, not in it, which is easy to
 * get wrong when writing one of these by hand.
 */
describe('the shoulder', () => {
  const beside = (x: number) => ({
    minX: x, maxX: x + 0.1, minY: -1, maxY: 1, minZ: -0.1, maxZ: 0.1,
  })

  test('reaches about as far as the player is wide', () => {
    expect(
      dashCatches({
        ...dashing,
        peers: [{ id: 'near', box: beside(PLAYER_RADIUS * 0.9) }],
        mine: 'red',
        sideOfPeer: sides({ near: 'blue' }),
      }).length,
    ).toBe(1)
  })

  test('and no further', () => {
    expect(
      dashCatches({
        ...dashing,
        peers: [{ id: 'far', box: beside(PLAYER_RADIUS * 4) }],
        mine: 'red',
        sideOfPeer: sides({ far: 'blue' }),
      }),
    ).toEqual([])
  })

  test('a peer entirely above the eye is not in it', () => {
    expect(
      dashCatches({
        ...dashing,
        peers: [{ id: 'above', box: { minX: -1, maxX: 1, minY: 1, maxY: 3, minZ: -1, maxZ: 1 } }],
        mine: 'red',
        sideOfPeer: sides({ above: 'blue' }),
      }),
    ).toEqual([])
  })
})

/**
 * Starting one, which is where the only piece of state a dash keeps gets
 * thrown away.
 */
describe('starting a dash', () => {
  const dash = (until = 0, caught: string[] = []) => ({
    until: { current: until },
    caught: { current: new Set(caught) },
  })

  test('charges for its own length from now', () => {
    const d = dash()
    startDash(d, 10, 0.2)
    expect(d.until.current).toBeCloseTo(10.2, 10)
  })

  /**
   * Cleared at the *start* rather than the end, which is the rule: dashing
   * through the same person twice is two hits, because that is what it looks
   * like from the outside.
   */
  test('forgets who the last one caught', () => {
    const d = dash(0, ['them'])
    startDash(d, 10, 0.2)
    expect(d.caught.current.size).toBe(0)
  })

  test('so the same person can be caught by the next one', () => {
    const d = dash(0, ['them'])
    startDash(d, 10, 0.2)
    expect(
      dashCatches({
        peers: [{ id: 'them', box: onTop }],
        at: AT,
        mine: 'red',
        sideOfPeer: () => 'blue',
        elapsed: 10,
        dashUntil: d.until.current,
        caught: d.caught.current,
      }),
    ).toEqual(['them'])
  })

  test('a dash started again mid-flight extends it rather than stacking', () => {
    const d = dash()
    startDash(d, 10, 0.2)
    startDash(d, 10.1, 0.2)
    expect(d.until.current).toBeCloseTo(10.3, 10)
  })
})
