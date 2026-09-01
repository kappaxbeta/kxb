import { describe, expect, test } from 'bun:test'

import {
  apply,
  driving,
  drift,
  DRIVER_TIMEOUT,
  elect,
  gather,
  honour,
  stale,
  unheard,
  worthSending,
  type Claim,
} from '@/domain/thingiverse/live'

describe('who runs the machines', () => {
  test('the lowest connection, which everybody works out alone', () => {
    const room = ['c-9', 'a-2', 'm-4']
    // No round trip: every client sorts the same list and agrees.
    expect(elect(room)).toBe('a-2')
    expect(elect([...room].reverse())).toBe('a-2')
    expect(driving(room, 'a-2')).toBe(true)
    expect(driving(room, 'm-4')).toBe(false)
  })

  test('an empty room drives nothing', () => {
    expect(elect([])).toBeNull()
    expect(driving([], 'a-2')).toBe(false)
  })

  test('and the next one along takes over when the driver leaves', () => {
    expect(elect(['c-9', 'm-4'])).toBe('c-9')
  })
})

describe('a room with nothing to say says nothing', () => {
  test('a lounge with a bench and two lamps sends no heartbeat', () => {
    expect(worthSending([])).toBe(false)
    expect(worthSending([{ i: 'crate', h: 100 }])).toBe(true)
  })
})

describe('what a watcher believes', () => {
  test('a pulse replaces what it thought, rather than merging into it', () => {
    const now = apply({ i: 'pan', s: 'cooking', t: 2, h: 60, o: [['hob', 'patty']] }, 10)
    expect(now.state).toBe('cooking')
    expect(now.since).toBe(2)
    expect(now.health).toBe(60)
    expect(now.slots.get('hob')).toBe('patty')

    // The next pulse says the pan is empty. A merge would leave the patty on it.
    const later = apply({ i: 'pan', s: 'cooked', t: 0 }, 11)
    expect(later.slots.size).toBe(0)
    expect(later.health).toBeUndefined()
  })

  test('the clock keeps running between packets, so the bar moves smoothly', () => {
    const was = apply({ i: 'pan', s: 'cooking', t: 2 }, 10)
    expect(drift(was, 0.016).since).toBeCloseTo(2.016)
    // And nothing else moves: a watcher must not take the change itself.
    expect(drift(was, 5).state).toBe('cooking')
  })

  test('and it stops being believed once the driver goes quiet', () => {
    const was = apply({ i: 'pan', s: 'cooking', t: 2 }, 10)
    expect(stale(was, 10 + DRIVER_TIMEOUT - 0.01)).toBe(false)
    // A bar that fills forever reads as "nearly there" rather than as broken.
    expect(stale(was, 10 + DRIVER_TIMEOUT + 0.01)).toBe(true)
  })

  test('a thing nobody has heard about yet has an empty opinion', () => {
    const fresh = unheard(4)
    expect(fresh.state).toBeUndefined()
    expect(fresh.slots.size).toBe(0)
    expect(stale(fresh, 4)).toBe(false)
  })
})

describe('what a driver honours', () => {
  test('a hit takes health off, and zero is broken', () => {
    expect(honour({ i: 'c', hit: 30 }, { health: 100, hurtable: true })).toEqual({
      health: 70,
      broken: false,
    })
    expect(honour({ i: 'c', hit: 30 }, { health: 20, hurtable: true })).toEqual({
      health: 0,
      broken: true,
    })
  })

  test('but a crate already at zero cannot be broken a second time', () => {
    // Three people swinging at the last of a crate's health all land. Without
    // this the crate breaks three times - and in a kitchen, cooks three burgers.
    expect(honour({ i: 'c', hit: 50 }, { health: 0, hurtable: true })).toEqual({
      health: 0,
      broken: false,
    })
  })

  test('and a hit on scenery does nothing, whatever the sender believed', () => {
    expect(honour({ i: 'c', hit: 50 }, { health: 100, hurtable: false }).health).toBe(100)
    expect(honour({ i: 'c', hit: 50 }, { health: undefined, hurtable: true }).health).toBeUndefined()
  })

  test('a claim that is not a hit leaves health alone', () => {
    expect(honour({ i: 'c', used: true }, { health: 40, hurtable: true })).toEqual({
      health: 40,
      broken: false,
    })
  })
})

describe('gathering a frame of claims', () => {
  const claims: Claim[] = [
    { i: 'crate', hit: 20 },
    { i: 'crate', hit: 15 },
    { i: 'crate', used: true },
    { i: 'crate', used: true },
    { i: 'pan', put: ['hob', 'patty'] },
    { i: 'crate', touched: true },
    { i: 'crate', took: 'top' },
  ]

  test('damage adds up, because two people hitting one crate is two hits', () => {
    expect(gather(claims, 'crate').hit).toBe(35)
  })

  test('but two people using it in one frame is one press', () => {
    expect(gather(claims, 'crate').used).toBe(true)
    expect(gather(claims, 'crate').touched).toBe(true)
  })

  test('and claims about other things are somebody else\'s frame', () => {
    expect(gather(claims, 'pan').hit).toBe(0)
    expect(gather(claims, 'pan').put).toEqual([['hob', 'patty']])
    expect(gather(claims, 'crate').put).toEqual([])
    expect(gather(claims, 'crate').took).toEqual([{ socket: 'top', by: null }])
  })

  test('a frame with nothing in it is all zeroes', () => {
    expect(gather([], 'crate')).toEqual({
      hit: 0,
      used: false,
      touched: false,
      put: [],
      took: [],
    })
  })
})
