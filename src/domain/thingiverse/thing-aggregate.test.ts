import { describe, expect, test } from 'bun:test'
import {
  decide,
  initialThingState,
  thingDecider,
} from '@/domain/thingiverse/thing-aggregate'
import {
  MAX_THINGS_PER_WORLD,
  type ThingEvent,
} from '@/domain/thingiverse/thing-events'
import { DomainError } from '@/es/errors'
import { fold } from '@/es/types'

const blueprintId = 'b0000000-0000-4000-8000-000000000001'
const worldId = 'c0000000-0000-4000-8000-000000000001'

const summoned: ThingEvent = {
  type: 'ThingSummoned',
  data: { worldId, blueprintId, x: 3, y: 0, z: -4, facing: 0, scale: 1, keep: true },
}

function given(...events: ThingEvent[]) {
  return fold(thingDecider, events)
}

const summon = {
  type: 'SummonThing' as const,
  worldId,
  blueprintId,
  x: 3,
  y: 0,
  z: -4,
  facing: 0,
  scale: 1,
  keep: true,
  standing: 0,
}

describe('summoning', () => {
  test('records the blueprint, the cell, the turn and the size', () => {
    expect(decide(initialThingState, summon)).toEqual([summoned])
  })

  test('wraps a turn past west back round to north', () => {
    const [event] = decide(initialThingState, { ...summon, facing: 5 })
    expect(event).toMatchObject({ data: { facing: 1 } })
  })

  test('leaves the world off when it is the lounge', () => {
    const [event] = decide(initialThingState, { ...summon, worldId: undefined })
    expect(event.type).toBe('ThingSummoned')
    expect('worldId' in event.data).toBe(false)
  })

  test('stands on tenths, because a bench is not a cube', () => {
    // Whole cells are right for blocks and wrong for furniture: a bench 2.4
    // across against a wall is either buried in it or a hand's width off it.
    expect(decide(initialThingState, { ...summon, x: 3.5 })).toHaveLength(1)
    expect(decide(initialThingState, { ...summon, x: 3.1, z: -4.9 })).toHaveLength(1)
  })

  test('refuses a position finer than a tenth', () => {
    // The log is immutable, so a float that arrives as 3.0000000000000004 is in
    // the history forever and every reader has to decide whether it is 3.
    expect(() => decide(initialThingState, { ...summon, x: 3.14159 })).toThrow(DomainError)
  })

  test('refuses a size nobody could find again', () => {
    expect(() => decide(initialThingState, { ...summon, scale: 0 })).toThrow(DomainError)
  })

  test('refuses the one past what a world may hold', () => {
    expect(() =>
      decide(initialThingState, { ...summon, standing: MAX_THINGS_PER_WORLD }),
    ).toThrow(DomainError)
  })
})

describe('moving it about', () => {
  test('dropping it back where it started records nothing', () => {
    expect(decide(given(summoned), { type: 'MoveThing', x: 3, y: 0, z: -4 })).toEqual([])
  })

  test('turning it to where it already faces records nothing', () => {
    expect(decide(given(summoned), { type: 'TurnThing', facing: 4 })).toEqual([])
  })

  test('resizing it to the size it is records nothing', () => {
    expect(decide(given(summoned), { type: 'ScaleThing', scale: 1 })).toEqual([])
  })

  test('a dismissed thing cannot be moved', () => {
    const gone = given(summoned, { type: 'ThingDismissed', data: {} })
    expect(() => decide(gone, { type: 'MoveThing', x: 0, y: 0, z: 0 })).toThrow(DomainError)
  })
})

describe('tuning one of them', () => {
  test('records a disagreement with its blueprint', () => {
    expect(
      decide(given(summoned), { type: 'TuneThing', tuning: { blocking: false } }),
    ).toEqual([{ type: 'ThingTuned', data: { tuning: { blocking: false } } }])
  })

  test('setting the same body a second time records nothing, whatever the key order', () => {
    const tuned = given(summoned, {
      type: 'ThingTuned',
      data: { tuning: { body: { gravity: 1, bounce: 0.5 } } },
    })

    expect(
      decide(tuned, { type: 'TuneThing', tuning: { body: { bounce: 0.5, gravity: 1 } } }),
    ).toEqual([])
  })

  test('scenery and "no override" are different states', () => {
    const scenery = given(summoned, { type: 'ThingTuned', data: { tuning: { body: null } } })

    // Clearing the override is a tuning without the field, and that is a change
    // from "this one is scenery" - the thing goes back to whatever its kind is.
    expect(decide(scenery, { type: 'TuneThing', tuning: {} })).toHaveLength(1)
  })
})

describe('whether it outlives you', () => {
  test('furniture by default, and the log says so', () => {
    const [event] = decide(initialThingState, summon)
    expect(event).toMatchObject({ data: { keep: true } })
  })

  test('a thing summoned before the field existed replays as furniture', () => {
    // The field is optional on the event for exactly this: everything already
    // in the log was placed to stay, and absent has to keep meaning that.
    const old = given({
      type: 'ThingSummoned',
      data: { worldId, blueprintId, x: 0, y: 0, z: 0, facing: 0, scale: 1 },
    })
    expect(old.keep).toBe(true)
  })

  test('letting one go is its own event, not a retune', () => {
    expect(decide(given(summoned), { type: 'SetThingKeep', keep: false })).toEqual([
      { type: 'ThingKeepSet', data: { keep: false } },
    ])
  })

  test('saying it twice records nothing', () => {
    expect(decide(given(summoned), { type: 'SetThingKeep', keep: true })).toEqual([])
  })
})

describe('dismissing', () => {
  test('is soft, and saying it twice records nothing', () => {
    const gone = given(summoned, { type: 'ThingDismissed', data: {} })
    expect(decide(gone, { type: 'DismissThing' })).toEqual([])
  })

  test('a thing nobody summoned cannot be dismissed', () => {
    expect(() => decide(initialThingState, { type: 'DismissThing' })).toThrow(DomainError)
  })
})
