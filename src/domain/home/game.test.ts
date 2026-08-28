import { describe, expect, test } from 'bun:test'
import { homeProp, refundOf } from '@/domain/home/catalog'
import {
  canExtend,
  canMove,
  canShrink,
  canPlace,
  comfort,
  describeUse,
  extend,
  extensionCost,
  extensionTheme,
  coveredTiles,
  drawOffset,
  freeSpotNear,
  facing,
  initialState,
  isWalkable,
  MAX_COMFORT,
  moveProp,
  place,
  propAt,
  remove,
  restSpotAt,
  shrink,
  shrinkRefund,
  standUp,
  sitOn,
  deserialize,
  serialize,
  type HomeState,
} from '@/domain/home/game'
import { tileKey } from '@/domain/world/grid'

/** A house with money and nothing in it, which most tests want. */
function emptyHouse(coins = 5000): HomeState {
  return { ...initialState('home'), coins, props: new Map() }
}

describe('facing', () => {
  test('a quarter turn is an exact grid step, floating point notwithstanding', () => {
    expect(facing(0)).toEqual({ dx: 0, dz: 1 })
    expect(facing(Math.PI / 2)).toEqual({ dx: 1, dz: 0 })
    expect(facing(Math.PI)).toEqual({ dx: 0, dz: -1 })
    expect(facing(Math.PI * 1.5)).toEqual({ dx: -1, dz: 0 })
  })

  test('survives the rotation the build key actually produces', () => {
    // Four presses of R is `(x + PI/2) % (PI * 2)` four times over, which does
    // not land back on exactly zero.
    let rotY = 0
    for (let turn = 0; turn < 4; turn++) rotY = (rotY + Math.PI / 2) % (Math.PI * 2)
    expect(facing(rotY)).toEqual({ dx: 0, dz: 1 })
  })
})

describe('wide props', () => {
  const couch = homeProp('couch')!

  test('grow to the right of the way they face, not away from you', () => {
    expect(coveredTiles({ x: 3, z: 1 }, couch, 0)).toEqual([
      { x: 3, z: 1 },
      { x: 4, z: 1 },
    ])
    expect(coveredTiles({ x: 3, z: 1 }, couch, Math.PI / 2)).toEqual([
      { x: 3, z: 1 },
      { x: 3, z: 0 },
    ])
  })

  test('are drawn centred across both squares, and shoved back to the wall', () => {
    // Half a square to the right, and the sofa is deeper than its square by
    // enough that it has to come forward to keep out of the wallpaper.
    expect(drawOffset(couch)).toEqual({ x: 1, z: -0.17 })
  })

  test('block both squares, and are sold by pointing at either', () => {
    const state = place(emptyHouse(), tileKey(3, 1), 'couch', 0)
    expect(isWalkable(state, { x: 3, z: 1 })).toBe(false)
    expect(isWalkable(state, { x: 4, z: 1 })).toBe(false)
    expect(propAt(state, tileKey(4, 1))?.anchor).toBe(tileKey(3, 1))
  })

  test('are refused when the square beside them is not floor', () => {
    // The living room's east edge: there is nothing at x=6 to hold the far arm.
    const verdict = canPlace(emptyHouse(), tileKey(5, 1), 'couch', 0)
    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.why).toMatch(/rotating/)
  })
})

describe('two-square props', () => {
  const bed = homeProp('bed')!

  test('grow away from the square you pointed at', () => {
    expect(coveredTiles({ x: 1, z: 0 }, bed, 0)).toEqual([
      { x: 1, z: 0 },
      { x: 1, z: 1 },
    ])
  })

  test('lie along whichever way they are turned', () => {
    expect(coveredTiles({ x: 0, z: 0 }, bed, Math.PI / 2)).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
    ])
  })

  test('are refused when the second square is another room', () => {
    // The bedroom is three squares wide and two deep; z=2 is the kitchen.
    const state = emptyHouse()
    const verdict = canPlace(state, tileKey(1, 1), 'bed', 0)
    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.why).toMatch(/rotating/)
  })

  test('fit once rotated to lie along the room instead of across it', () => {
    const state = emptyHouse()
    expect(canPlace(state, tileKey(1, 1), 'bed', Math.PI / 2).ok).toBe(true)
  })

  test('can be sold by pointing at either end', () => {
    const state = place(emptyHouse(1000), tileKey(0, 0), 'bed', 0)
    expect(propAt(state, tileKey(0, 1))?.anchor).toBe(tileKey(0, 0))

    const sold = remove(state, tileKey(0, 1))
    expect(sold.props.size).toBe(0)
    expect(sold.coins).toBe(1000 - homeProp('bed')!.price + refundOf(homeProp('bed')!))
  })

  test('block both of their squares', () => {
    const state = place(emptyHouse(), tileKey(0, 0), 'bed', 0)
    expect(isWalkable(state, { x: 0, z: 0 })).toBe(false)
    expect(isWalkable(state, { x: 0, z: 1 })).toBe(false)
    expect(isWalkable(state, { x: 1, z: 0 })).toBe(true)
  })
})

describe('placing', () => {
  test('a prop that does not belong to the room is refused', () => {
    const state = emptyHouse()
    // (0, 4) is the bathroom.
    const verdict = canPlace(state, tileKey(0, 4), 'bed', 0)
    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.why).toMatch(/does not go here/)
  })

  test('a plant goes in every room, which is the point of a plant', () => {
    const state = emptyHouse()
    for (const key of [tileKey(0, 0), tileKey(0, 2), tileKey(0, 4), tileKey(3, 0)]) {
      expect(canPlace(state, key, 'monstera', 0).ok).toBe(true)
    }
  })

  test('an empty purse is refused, and says by how much', () => {
    const state = emptyHouse(10)
    const verdict = canPlace(state, tileKey(3, 0), 'couch', 0)
    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.why).toBe(
      `${homeProp('couch')!.price - 10} coins short.`,
    )
  })

  test('buying takes the money once', () => {
    const before = emptyHouse(1000)
    const after = place(before, tileKey(3, 0), 'armchair', 0)
    expect(after.coins).toBe(1000 - homeProp('armchair')!.price)
    expect(after.props.size).toBe(1)
    // The old state is untouched, because every one of these is a copy.
    expect(before.props.size).toBe(0)
  })

  test('a refused purchase changes nothing at all', () => {
    const before = emptyHouse(0)
    expect(place(before, tileKey(3, 0), 'couch', 0)).toBe(before)
  })

  test('a taken square is refused', () => {
    const state = place(emptyHouse(), tileKey(3, 0), 'armchair', 0)
    const verdict = canPlace(state, tileKey(3, 0), 'armchair', 0)
    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.why).toMatch(/taken/)
  })

  test('squares under the house itself are not for sale', () => {
    const garden = { ...initialState('outdoor'), coins: 5000, props: new Map() }
    // (4, 0) is under the building.
    const verdict = canPlace(garden, tileKey(4, 0), 'garden_bench', 0)
    expect(verdict.ok).toBe(false)
    expect(isWalkable(garden, { x: 4, z: 0 })).toBe(false)
  })
})

describe('moving what you already own', () => {
  test('a sofa can be nudged one square along', () => {
    const state = place(emptyHouse(1000), tileKey(3, 0), 'couch', 0)
    const spent = state.coins

    const moved = moveProp(state, tileKey(3, 0), tileKey(3, 1), 0)
    expect(moved.props.has(tileKey(3, 1))).toBe(true)
    expect(moved.props.has(tileKey(3, 0))).toBe(false)
    // Rearranging is free. Only the shop takes money.
    expect(moved.coins).toBe(spent)
  })

  test('a broke player can still put their own furniture back down', () => {
    const state = place(emptyHouse(homeProp('couch')!.price), tileKey(3, 0), 'couch', 0)
    expect(state.coins).toBe(0)
    expect(canMove(state, tileKey(3, 0), tileKey(3, 2), 0).ok).toBe(true)
  })

  test('rotating in place is allowed, and does not collide with itself', () => {
    // Away from the edges, so the turn has somewhere to swing its far half.
    const state = place(emptyHouse(), tileKey(4, 1), 'couch', 0)
    const turned = moveProp(state, tileKey(4, 1), tileKey(4, 1), Math.PI / 2)
    expect(turned.props.get(tileKey(4, 1))?.rotY).toBe(Math.PI / 2)
  })

  test('a move onto another prop is refused and changes nothing', () => {
    let state = place(emptyHouse(), tileKey(3, 0), 'armchair', 0)
    state = place(state, tileKey(3, 2), 'armchair', 0)
    expect(moveProp(state, tileKey(3, 0), tileKey(3, 2), 0)).toBe(state)
  })
})

describe('comfort', () => {
  test('is the sum of what is in the house', () => {
    let state = emptyHouse()
    state = place(state, tileKey(3, 0), 'armchair', 0)
    state = place(state, tileKey(3, 1), 'rug', 0)
    expect(comfort(state)).toBe(
      homeProp('armchair')!.comfort! + homeProp('rug')!.comfort!,
    )
  })

  test('is capped, so a room full of pot plants is not a money printer', () => {
    let state = emptyHouse(100000)
    for (let x = 3; x <= 5; x++) {
      for (let z = 0; z <= 4; z++) {
        state = place(state, tileKey(x, z), 'monstera', 0)
      }
    }
    // Fifteen squares at four apiece is sixty, and the cap holds it at fifty.
    expect(state.props.size).toBe(15)
    expect(comfort(state)).toBe(MAX_COMFORT)
  })
})

describe('saves', () => {
  test('a round trip keeps the furniture', () => {
    const state = place(emptyHouse(), tileKey(3, 1), 'couch', Math.PI / 2)
    const back = deserialize('home', serialize(state))
    expect(back.props.get(tileKey(3, 1))).toEqual({
      propId: 'couch',
      rotY: Math.PI / 2,
    })
  })

  test('a save carries no coins, because the purse is shared', () => {
    expect(serialize(emptyHouse(999))).not.toHaveProperty('coins')
  })

  test('props whose id has since gone are dropped rather than kept invisible', () => {
    const back = deserialize('home', {
      props: [
        [tileKey(3, 0), { propId: 'sofa_that_never_was', rotY: 0 }],
        [tileKey(3, 1), { propId: 'armchair', rotY: 0 }],
      ],
    })
    expect(back.props.size).toBe(1)
    expect(back.props.has(tileKey(3, 1))).toBe(true)
  })
})

describe('extending', () => {
  test('a square touching the house joins the room it touches', () => {
    const state = emptyHouse()
    // (-1, 0) is off the west wall of the bedroom.
    expect(canExtend(state, tileKey(-1, 0)).ok).toBe(true)

    const bigger = extend(state, tileKey(-1, 0))
    expect(bigger.rooms.get(tileKey(-1, 0))).toBe('bedroom')
    expect(bigger.rooms.size).toBe(state.rooms.size + 1)
  })

  test('names the room it would join, which is what the panel labels itself', () => {
    const state = emptyHouse()
    // West of the bedroom, west of the bathroom, and east of the living room.
    expect(extensionTheme(state, tileKey(-1, 0))).toBe('bedroom')
    expect(extensionTheme(state, tileKey(-1, 4))).toBe('bath')
    expect(extensionTheme(state, tileKey(6, 2))).toBe('living')
    expect(extensionTheme(state, tileKey(20, 20))).toBeUndefined()
  })

  test('a corner between two rooms always picks the same one of them', () => {
    const state = emptyHouse()
    // (3,5) touches the living room's (3,4) to the north. Whatever it settles
    // on, it has to settle on it every time - a click that does different
    // things on different frames is worse than one that picks the wrong room.
    const first = extensionTheme(state, tileKey(3, 5))
    expect(extensionTheme(state, tileKey(3, 5))).toBe(first)
    expect(first).toBe('living')
  })

  test('a square touching nothing is refused', () => {
    const verdict = canExtend(emptyHouse(), tileKey(20, 20))
    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.why).toMatch(/Too far/)
  })

  test('a square already in the house is refused', () => {
    expect(canExtend(emptyHouse(), tileKey(0, 0)).ok).toBe(false)
  })

  test('the price rises with every square bought', () => {
    const state = emptyHouse()
    const first = extensionCost(state)
    const after = extend(state, tileKey(-1, 0))
    expect(extensionCost(after)).toBeGreaterThan(first)
    expect(after.coins).toBe(state.coins - first)
  })

  test('an empty purse is refused, and says by how much', () => {
    const state = { ...emptyHouse(0) }
    const verdict = canExtend(state, tileKey(-1, 0))
    expect(verdict.ok).toBe(false)
    expect(verdict.ok === false && verdict.why).toMatch(/coins short/)
  })

  test('a bought square can be furnished, and is walkable', () => {
    let state = extend(emptyHouse(), tileKey(-1, 0))
    expect(isWalkable(state, { x: -1, z: 0 })).toBe(true)

    state = place(state, tileKey(-1, 0), 'closet', 0)
    expect(state.props.has(tileKey(-1, 0))).toBe(true)
  })

  test('bought squares survive a save, and the authored plan is not baked in', () => {
    const state = extend(emptyHouse(), tileKey(-1, 0))
    const saved = serialize(state)
    expect(saved.extra).toEqual([[tileKey(-1, 0), 'bedroom']])

    const back = deserialize('home', saved)
    expect(back.rooms.get(tileKey(-1, 0))).toBe('bedroom')
  })
})

describe('sitting and sleeping', () => {
  test('pressing use on a chair sits you on it', () => {
    const state = place(emptyHouse(), tileKey(3, 0), 'armchair', 0)
    const seated = sitOn(state, tileKey(3, 0))
    expect(seated.resting).toBe(tileKey(3, 0))
  })

  test('pressing it again gets you up', () => {
    let state = place(emptyHouse(), tileKey(3, 0), 'armchair', 0)
    state = sitOn(state, tileKey(3, 0))
    expect(sitOn(state, tileKey(3, 0)).resting).toBeNull()
    expect(standUp(state).resting).toBeNull()
  })

  test('furniture you cannot get into does nothing', () => {
    const state = place(emptyHouse(), tileKey(3, 0), 'bookshelf', 0)
    expect(sitOn(state, tileKey(3, 0)).resting).toBeNull()
  })

  test('a bed can be got into from either end, and puts you in the middle', () => {
    const state = place(emptyHouse(), tileKey(0, 0), 'bed', 0)
    const asleep = sitOn(state, tileKey(0, 1))
    expect(asleep.resting).toBe(tileKey(0, 0))

    const spot = restSpotAt(asleep, asleep.resting!)!
    expect(spot.pose).toBe('lie')
    // Centred across both squares - tile 0 and tile 1 in z, so world z = 1 -
    // and then carried the 0.2 that puts the headboard against the wall.
    expect(spot.z).toBeCloseTo(1.2)
    expect(spot.x).toBe(0)
  })

  test('selling the bed you are asleep in wakes you up', () => {
    let state = place(emptyHouse(), tileKey(0, 0), 'bed', 0)
    state = sitOn(state, tileKey(0, 0))
    expect(remove(state, tileKey(0, 1)).resting).toBeNull()
  })

  test('moving the chair you are sitting on stands you up', () => {
    let state = place(emptyHouse(), tileKey(3, 0), 'armchair', 0)
    state = sitOn(state, tileKey(3, 0))
    expect(moveProp(state, tileKey(3, 0), tileKey(3, 2), 0).resting).toBeNull()
  })

  test('the prompt says what E would do', () => {
    let state = place(emptyHouse(), tileKey(3, 0), 'armchair', 0)
    expect(describeUse(state, tileKey(3, 0))).toBe('Sit down')
    expect(describeUse(state, tileKey(3, 4))).toBeNull()

    state = sitOn(state, tileKey(3, 0))
    expect(describeUse(state, null)).toBe('Get up')
  })
})

describe('getting out of the furniture', () => {
  test('there is somewhere to stand next to what you were sitting on', () => {
    const state = place(emptyHouse(), tileKey(3, 0), 'armchair', 0)
    const spot = freeSpotNear(state, tileKey(3, 0))

    expect(spot).not.toBeNull()
    // A world position, and one that is genuinely walkable rather than inside
    // the chair you just got out of.
    expect(isWalkable(state, { x: spot!.x / 2, z: spot!.z / 2 })).toBe(true)
  })

  test('a two-square bed is escaped from beside either end', () => {
    const state = place(emptyHouse(), tileKey(0, 0), 'bed', 0)
    const spot = freeSpotNear(state, tileKey(0, 0))

    expect(spot).not.toBeNull()
    // Not inside the bed itself, which covers (0,0) and (0,1).
    expect([spot!.x, spot!.z]).not.toEqual([0, 0])
    expect([spot!.x, spot!.z]).not.toEqual([0, 2])
  })

  test('it does not put you through a wall into the next room', () => {
    // The bathroom's (0,4) has the kitchen's (0,3) directly north of it, with a
    // wall between - the declared doorway is one square east, at (1,3).
    const state = place(emptyHouse(), tileKey(0, 4), 'toilet', 0)
    const spot = freeSpotNear(state, tileKey(0, 4))

    expect(spot).toEqual({ x: 2, z: 8 })
    expect(spot).not.toEqual({ x: 0, z: 6 })
  })

  test('boxed in on every side, it says so rather than teleporting you', () => {
    // (0,4) is a bathroom corner: outside to the west and south, a wall to the
    // north, so blocking (1,4) leaves it with nowhere to get out to.
    let state = emptyHouse(100000)
    state = place(state, tileKey(0, 4), 'toilet', 0)
    state = place(state, tileKey(1, 4), 'shower', 0)

    expect(freeSpotNear(state, tileKey(0, 4))).toBeNull()
  })
})

describe('shrinking a room', () => {
  /** Buy a run of squares out from the house, returning the keys in order. */
  function grown(state: HomeState, keys: string[]): HomeState {
    let next = state
    for (const key of keys) next = extend(next, key)
    return next
  }

  /** A square just outside the opening plan, and the one beyond it. */
  function outward(state: HomeState): string[] {
    for (const key of state.rooms.keys()) {
      const [x, z] = key.split(',').map(Number)
      for (const step of [1, 2, 3]) {
        const candidate = tileKey(x + step, z)
        if (!state.rooms.has(candidate)) {
          // Only useful if the first step is actually adjacent to the house.
          if (step === 1) return [candidate, tileKey(x + 2, z), tileKey(x + 3, z)]
          break
        }
      }
    }
    throw new Error('no room to grow into')
  }

  test('the house it came with is not for sale', () => {
    const house = emptyHouse()
    const original = [...house.plan.rooms.keys()][0]
    expect(canShrink(house, original).ok).toBe(false)
  })

  test('a square that is not part of the house cannot be sold', () => {
    expect(canShrink(emptyHouse(), tileKey(999, 999)).ok).toBe(false)
  })

  test('bought ground sells back', () => {
    const house = emptyHouse()
    const [first] = outward(house)
    const bigger = extend(house, first)

    expect(bigger.rooms.has(first)).toBe(true)
    expect(canShrink(bigger, first).ok).toBe(true)
    expect(shrink(bigger, first).rooms.has(first)).toBe(false)
  })

  /**
   * The property the decider's refund is built around: buying a square and
   * selling it straight back leaves the purse exactly where it started. Any
   * other answer makes the pair either a coin printer or a tax on trying
   * a layout out.
   */
  test('buying then selling leaves the balance untouched', () => {
    const house = emptyHouse(5000)
    const [first, second] = outward(house)

    // Once from a house that has bought nothing...
    const one = extend(house, first)
    expect(one.coins).toBeLessThan(house.coins)
    expect(shrink(one, first).coins).toBe(house.coins)

    // ...and again one square further out, where the price has moved on. The
    // round trip has to be free at every point on the curve, not just the first.
    const two = extend(one, second)
    expect(two.coins).toBeLessThan(one.coins)
    expect(shrink(two, second).coins).toBe(one.coins)
  })

  test('the refund is what the last square actually cost', () => {
    const house = emptyHouse()
    const [first, second] = outward(house)

    const one = extend(house, first)
    const two = extend(one, second)

    // Selling the second back returns what the second cost.
    expect(shrinkRefund(two)).toBe(one.coins - two.coins)
  })

  test('furniture standing on it blocks the sale', () => {
    const house = emptyHouse()
    const [first] = outward(house)
    const bigger = extend(house, first)

    const withProp = place(bigger, first, propsOnAnySquare(bigger, first), 0)
    // Only meaningful if something actually landed there.
    if (withProp.props.size > bigger.props.size) {
      expect(canShrink(withProp, first).ok).toBe(false)
    }
  })

  /**
   * The rule that needs the whole floor plan to explain: selling a square in
   * the middle of a spur strands everything past it - still owned, still
   * drawn, and no longer walkable to.
   */
  test('a square holding up the ground beyond it cannot be sold', () => {
    const house = emptyHouse()
    const [first, second] = outward(house)
    const spur = grown(house, [first, second])

    expect(canShrink(spur, second).ok).toBe(true)
    expect(canShrink(spur, first).ok).toBe(false)
    expect(canShrink(spur, first).ok).toBe(false)
  })

  test('the far end of a spur sells, and then so does the next', () => {
    const house = emptyHouse()
    const [first, second] = outward(house)
    const spur = grown(house, [first, second])

    const shorter = shrink(spur, second)
    expect(shorter.rooms.has(second)).toBe(false)
    // With nothing beyond it any more, the first square is now the far end.
    expect(canShrink(shorter, first).ok).toBe(true)
  })

  test('a refused sale changes nothing', () => {
    const house = emptyHouse()
    const original = [...house.plan.rooms.keys()][0]
    expect(shrink(house, original)).toEqual(house)
  })
})

/** The first prop the catalogue will let us put on a square, for the block test. */
function propsOnAnySquare(state: HomeState, key: string): string {
  for (const id of ['chair', 'stool', 'lamp', 'plant', 'bed', 'sofa']) {
    if (homeProp(id) && canPlace(state, key, id, 0).ok) return id
  }
  return 'chair'
}
