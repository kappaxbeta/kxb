import { describe, expect, test } from 'bun:test'
import {
  blueprintProblems,
  colliderOf,
  falls,
  freshSpec,
  freshUse,
  MAX_SEAT_OFFSET,
  MAX_SEATS,
  MAX_THING_SCALE,
  needsValue,
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
