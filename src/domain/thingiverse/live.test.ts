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
      // Nobody hit it, so nobody is credited - which is the same answer as a
      // hit from a client that did not name itself. See `hitBy`.
      hitBy: null,
      used: false,
      touched: false,
      put: [],
      took: [],
    })
  })
})

describe('who gets the credit for a kill', () => {
  /**
   * `docs/product/economy.md` §7. A thing with health pays a coin when somebody
   * breaks it, so the frame that finishes it has to name somebody - and the
   * damage total cannot, because it is a sum.
   */
  const on = (id: string, claims: Claim[]) => gather(claims, id)

  test('the biggest hit takes the credit, not the last one to arrive', () => {
    /*
      The order of claims within a frame is the order packets happened to
      arrive: arbitrary, and different on every machine in the room. Crediting
      the last one would hand the same kill to different people depending on
      whose network was quicker, which is a scoreboard nobody can argue with
      because nobody can reproduce it.
    */
    const heard = on('crate', [
      { i: 'crate', c: 'ana', hit: 9 },
      { i: 'crate', c: 'bo', hit: 2 },
    ])
    expect(heard.hit).toBe(11)
    expect(heard.hitBy).toBe('ana')
  })

  test('a tie keeps whoever got there first rather than flipping on order', () => {
    const heard = on('crate', [
      { i: 'crate', c: 'ana', hit: 5 },
      { i: 'crate', c: 'bo', hit: 5 },
    ])
    expect(heard.hitBy).toBe('ana')
  })

  test('damage still adds up, which is the other half of the question', () => {
    // Two people hitting one crate in one frame is two hits against its health.
    // Only one of them can be credited; both of them count.
    expect(on('crate', [
      { i: 'crate', c: 'ana', hit: 3 },
      { i: 'crate', c: 'bo', hit: 4 },
    ]).hit).toBe(7)
  })

  test('a hit from nobody in particular credits nobody', () => {
    /*
      An unattributable kill pays nobody, rather than paying whoever happens to
      be driving. The driver is the thing's owner - crediting them would mean a
      crate paid its own owner for being smashed by somebody else.
    */
    const heard = on('crate', [{ i: 'crate', hit: 40 }])
    expect(heard.hit).toBe(40)
    expect(heard.hitBy).toBeNull()
  })

  test('a frame with no hits names nobody', () => {
    expect(on('crate', [{ i: 'crate', touched: true }]).hitBy).toBeNull()
  })
})
