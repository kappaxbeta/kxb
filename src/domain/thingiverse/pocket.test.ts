import { describe, expect, test } from 'bun:test'

import {
  dropped,
  emptyPocket,
  holding,
  inHand,
  nextInHand,
  POCKET_SIZE,
  pocketed,
  roomFor,
  type Pocket,
} from '@/domain/thingiverse/pocket'

/** A pocket with these items in it, holding the first. */
function carrying(...items: string[]): Pocket {
  return { items, holding: items.length > 0 ? 0 : null }
}

describe('picking things up', () => {
  test('you arrive empty-handed', () => {
    expect(inHand(emptyPocket())).toBeUndefined()
    expect(emptyPocket().items).toEqual([])
  })

  test('what you just picked up is what you are holding', () => {
    // Otherwise a kitchen needs a click between every step.
    const pocket = pocketed(pocketed(emptyPocket(), 'bun'), 'patty')
    expect(inHand(pocket)).toBe('patty')
  })

  test('a full pocket refuses, and says so by not changing', () => {
    let pocket = emptyPocket()
    for (let n = 0; n < POCKET_SIZE; n++) pocket = pocketed(pocket, `item ${n}`)
    expect(roomFor(pocket)).toBe(false)

    const refused = pocketed(pocket, 'one more')
    // The caller compares, and the slot keeps its item - so the thing you
    // tried to take is still sitting there, which is a thing you can see.
    expect(refused).toBe(pocket)
  })
})

describe('putting things down', () => {
  test('you keep holding something, so the next one goes down too', () => {
    // "Always empty-handed afterwards" is the obvious rule and makes a
    // four-ingredient recipe four trips to the pocket.
    const two = carrying('bun', 'bun')
    const after = dropped(two, 0)
    expect(after.items).toEqual(['bun'])
    expect(inHand(after)).toBe('bun')
  })

  test('the last one out leaves you empty-handed', () => {
    const after = dropped(carrying('bun'), 0)
    expect(after.items).toEqual([])
    expect(inHand(after)).toBeUndefined()
  })

  test('dropping the last of several holds the one before it', () => {
    const three: Pocket = { items: ['a', 'b', 'c'], holding: 2 }
    const after = dropped(three, 2)
    expect(after.items).toEqual(['a', 'b'])
    expect(inHand(after)).toBe('b')
  })

  test('and an index nobody has changes nothing', () => {
    const two = carrying('bun', 'patty')
    expect(dropped(two, 9)).toBe(two)
    expect(dropped(two, -1)).toBe(two)
  })
})

describe('choosing what is in your hand', () => {
  test('by index, and out of range is empty-handed', () => {
    const two = carrying('bun', 'patty')
    expect(inHand(holding(two, 1))).toBe('patty')
    expect(inHand(holding(two, null))).toBeUndefined()
    expect(inHand(holding(two, 5))).toBeUndefined()
  })

  test('or by stepping through, wrapping at the end', () => {
    let pocket = carrying('a', 'b', 'c')
    pocket = nextInHand(pocket)
    expect(inHand(pocket)).toBe('b')
    pocket = nextInHand(pocket)
    expect(inHand(pocket)).toBe('c')
    pocket = nextInHand(pocket)
    expect(inHand(pocket)).toBe('a')
  })

  test('stepping an empty pocket stays empty rather than wrapping to nothing', () => {
    expect(nextInHand(emptyPocket()).holding).toBeNull()
  })

  test('and stepping from empty-handed picks the first', () => {
    expect(inHand(nextInHand({ items: ['a', 'b'], holding: null }))).toBe('a')
  })
})
