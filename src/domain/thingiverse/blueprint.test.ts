import { describe, expect, test } from 'bun:test'
import {
  blueprintProblems,
  colliderOf,
  colliderProblems,
  falls,
  freshSpec,
  freshUse,
  MAX_COLLIDER_SIZE,
  MAX_SEAT_OFFSET,
  MAX_SEATS,
  MAX_THING_SCALE,
  needsValue,
  seatClip,
  shouts,
  usable,
  usingProblems,
} from '@/domain/thingiverse/blueprint'

const model = 'bedroom/soccer_ball'

describe('a fresh blueprint', () => {
  test('is a solid model that finds the floor', () => {
    const spec = freshSpec(model)

    expect(spec.blocking).toBe(true)
    expect(spec.scale).toBe(1)
    expect(blueprintProblems(spec)).toEqual([])
  })

  test('falls, because a crate let go in mid-air lands', () => {
    expect(falls(freshSpec(model))).toBe(true)
    // Null is the other state and is not the same as an empty body: it is a
    // fountain, which stands where it was put forever.
    expect(falls({ ...freshSpec(model), body: null })).toBe(false)
  })
})

describe('what the engine is told', () => {
  test('blocking is the collider, in the engine s own words', () => {
    expect(colliderOf(freshSpec(model))).toBe('auto')
    expect(colliderOf({ ...freshSpec(model), blocking: false })).toBe('none')
  })

  test('boxes somebody drew are the collider instead of the measurement', () => {
    const legs = [
      { x: -1.2, w: 0.4, h: 3, d: 0.4 },
      { x: 0.8, w: 0.4, h: 3, d: 0.4 },
    ]
    expect(colliderOf({ ...freshSpec(model), collider: legs })).toEqual(legs)
  })

  test('walking through it beats any box drawn on it', () => {
    // The switch has to mean what it says: deleting the boxes first before
    // "you can walk through this" took effect would make it a lie half the time.
    expect(
      colliderOf({
        ...freshSpec(model),
        blocking: false,
        collider: [{ w: 1, h: 1, d: 1 }],
      }),
    ).toBe('none')
  })

  test('an empty list is the measurement, not solid nowhere', () => {
    expect(colliderOf({ ...freshSpec(model), collider: [] })).toBe('auto')
  })
})

describe('boxes drawn by hand', () => {
  test('a plain box is fine, and so is having none', () => {
    expect(colliderProblems({})).toEqual([])
    expect(colliderProblems({ collider: [{ w: 1, h: 1, d: 1 }] })).toEqual([])
  })

  test('a box with no size is refused', () => {
    expect(colliderProblems({ collider: [{ w: 0, h: 1, d: 1 }] })).toHaveLength(1)
  })

  test('a box bigger than the room it is drawn in is refused', () => {
    expect(
      colliderProblems({ collider: [{ w: MAX_COLLIDER_SIZE + 1, h: 1, d: 1 }] }),
    ).toHaveLength(1)
  })

  test('a box parked in the next postcode is refused', () => {
    expect(colliderProblems({ collider: [{ x: 99, w: 1, h: 1, d: 1 }] })).toHaveLength(1)
  })

  test('the whole spec carries them through the same check', () => {
    expect(
      blueprintProblems({ ...freshSpec(model), collider: [{ w: 0, h: 0, d: 0 }] }),
    ).toHaveLength(3)
  })
})

describe('problems', () => {
  test('a model we do not ship is refused', () => {
    expect(blueprintProblems({ ...freshSpec('nope/nothing') })).toEqual([
      'nope/nothing is not a model we ship',
    ])
  })

  test('a scale outside the bounds is refused', () => {
    expect(
      blueprintProblems({ ...freshSpec(model), scale: MAX_THING_SCALE + 1 }),
    ).toHaveLength(1)
  })

  test('a body outside the engine s bounds is refused in the engine s words', () => {
    const problems = blueprintProblems({ ...freshSpec(model), body: { bounce: 1.4 } })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('bounce')
  })

  test('every problem is reported, not just the first', () => {
    expect(
      blueprintProblems({ ...freshSpec('nope/nothing'), scale: 0, body: { mass: 0 } }),
    ).toHaveLength(3)
  })

  test('an action that names nothing to play is refused', () => {
    expect(needsValue('play')).toBe(true)
    expect(needsValue('spin')).toBe(false)

    expect(
      blueprintProblems({
        ...freshSpec(model),
        actions: [{ when: 'touch', deed: 'play' }],
      }),
    ).toHaveLength(1)

    expect(
      blueprintProblems({
        ...freshSpec(model),
        actions: [{ when: 'touch', deed: 'play', value: 'kick' }],
      }),
    ).toEqual([])
  })

  test('a clip is named or absent, never blank', () => {
    expect(blueprintProblems({ ...freshSpec(model), clip: '   ' })).toHaveLength(1)
    expect(blueprintProblems({ ...freshSpec(model), clip: null })).toEqual([])
  })
})

describe('getting in it', () => {
  test('a fresh blueprint is not something you can get into', () => {
    expect(usable(freshSpec(model))).toBe(false)
    expect(usable({ ...freshSpec(model), use: freshUse() })).toBe(true)
  })

  test('a fresh use block is three moments with no clips yet', () => {
    expect(usingProblems(freshUse())).toEqual([])
  })

  test('a clip is named or absent, never blank - in all three moments', () => {
    expect(usingProblems({ ...freshUse(), enter: '  ' })).toHaveLength(1)
    expect(usingProblems({ ...freshUse(), enter: 'sit_down' })).toEqual([])
  })

  test('a seat far from the thing is refused, so nobody sits in the next room', () => {
    expect(
      usingProblems({ ...freshUse(), seats: [{ x: 0, y: 0, z: MAX_SEAT_OFFSET + 1 }] }),
    ).toHaveLength(1)
  })

  test('a bench seats several, and a thing with no seats seats nobody', () => {
    expect(
      usingProblems({
        ...freshUse(),
        seats: [
          { x: -0.6, y: 0, z: 0 },
          { x: 0, y: 0, z: 0 },
          { x: 0.6, y: 0, z: 0 },
        ],
      }),
    ).toEqual([])

    expect(usingProblems({ ...freshUse(), seats: [] })).toHaveLength(1)
  })

  test('more people than a room holds is refused', () => {
    const many = Array.from({ length: MAX_SEATS + 1 }, () => ({ x: 0, y: 0, z: 0 }))
    expect(usingProblems({ ...freshUse(), seats: many })).toHaveLength(1)
  })

  test('one key may not play two clips', () => {
    const problems = usingProblems({
      ...freshUse(),
      inputs: [
        { key: 'q', clip: 'wave' },
        { key: 'Q', clip: 'dance' },
      ],
    })

    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('Q')
  })

  test('an input is one key, and it plays something', () => {
    expect(usingProblems({ ...freshUse(), inputs: [{ key: 'qq', clip: 'wave' }] })).toHaveLength(1)
    expect(usingProblems({ ...freshUse(), inputs: [{ key: 'q', clip: ' ' }] })).toHaveLength(1)
  })

  test('the whole spec carries its use block through the same check', () => {
    expect(
      blueprintProblems({ ...freshSpec(model), use: { ...freshUse(), leave: '' } }),
    ).toHaveLength(1)
  })
})

describe('what a body does while it is in one', () => {
  test('a seat with nothing of its own plays whatever the thing loops', () => {
    const use = { ...freshUse(), loop: 'sit' }
    expect(seatClip(use, 0)).toBe('sit')
  })

  test('a seat that says so plays its own', () => {
    const use = {
      ...freshUse(),
      loop: 'sit',
      seats: [
        { x: 0, y: 0, z: 0, clip: 'drive' },
        { x: 1, y: 0, z: 0 },
      ],
    }
    // The driver holds a wheel; the passenger holds on, which is the thing's
    // own answer rather than a second field saying the same word.
    expect(seatClip(use, 0)).toBe('drive')
    expect(seatClip(use, 1)).toBe('sit')
  })

  test('a thing that loops nothing seats you doing nothing', () => {
    expect(seatClip(freshUse(), 0)).toBeNull()
  })

  test('a seat nobody has is the thing s own answer, not a crash', () => {
    // Reachable: somebody edits a bench down to one seat while a second person
    // is sitting in what used to be seat three. See `seatOf`, which shuffles
    // them along for the same reason.
    expect(seatClip({ ...freshUse(), loop: 'sit' }, 7)).toBe('sit')
  })

  test('a seat clip is named or inherited, never blank', () => {
    const use = { ...freshUse(), seats: [{ x: 0, y: 0, z: 0, clip: '  ' }] }
    expect(usingProblems(use)).toEqual(['a seat plays a named clip, or inherits'])
  })
})

describe('a thing that shouts', () => {
  test('is one whose machine, table or recipe says a word', () => {
    expect(shouts({ states: { start: 'a', states: [{ name: 'a', emit: 'ding', changes: [] }] } })).toBe(
      true,
    )
    expect(shouts({ craft: { slots: [{ socket: 'top', takes: [], emit: 'clunk' }], recipes: [] } })).toBe(
      true,
    )
    expect(
      shouts({
        craft: { slots: [], recipes: [{ needs: ['bun'], makes: 'burger', emit: 'served' }] },
      }),
    ).toBe(true)
    expect(shouts({ actions: [{ when: 'use', deed: 'emit', value: 'open' }] })).toBe(true)
  })

  test('and a bench is not', () => {
    expect(shouts({})).toBe(false)
    expect(
      shouts({
        actions: [{ when: 'near', deed: 'spin' }],
        states: { start: 'a', states: [{ name: 'a', changes: [] }] },
        craft: { slots: [{ socket: 'top', takes: [] }], recipes: [] },
      }),
    ).toBe(false)
  })
})
