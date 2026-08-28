import { describe, expect, test } from 'bun:test'
import {
  adoptable,
  arbitratedFields,
  changed,
  openingValues,
  persisted,
  plannedReads,
  readBack,
  shareable,
} from '@/app/xp/_runtime/level-data'
import type { XpData } from '@kxb/xp'

const DATA: XpData = {
  coins: { scope: 'player', value: 0 },
  town: { scope: 'space', value: 3 },
  best: { scope: 'shared', value: 0 },
}

describe('opening a level that keeps something', () => {
  test('every field starts where the author said', () => {
    expect(openingValues(DATA)).toEqual(new Map([['coins', 0], ['town', 3], ['best', 0]]))
  })

  test('every field is read, not only the ones a rule mentions', () => {
    // Reading lazily would put a round trip inside a frame and make the first
    // `coins >= 10` of a session answer against a default not yet filled in.
    expect(plannedReads(DATA)).toEqual([
      { name: 'coins', key: 'player:coins' },
      { name: 'town', key: 'space:town' },
      { name: 'best', key: 'shared:best' },
    ])
  })

  test('a level that keeps nothing reads nothing', () => {
    expect(plannedReads({})).toEqual([])
    expect(openingValues({})).toEqual(new Map())
  })
})

describe('what a stored value is worth', () => {
  test('a number is the number', () => {
    expect(readBack(12, 0)).toBe(12)
    expect(readBack(-4.5, 0)).toBe(-4.5)
    expect(readBack(0, 7)).toBe(0)
  })

  test('nobody has written it yet, so the default stands', () => {
    // The common case on a first visit, and not a failure.
    expect(readBack(undefined, 7)).toBe(7)
    expect(readBack(null, 7)).toBe(7)
  })

  test('a stored value that stopped matching the model does not poison a rule', () => {
    // `coins >= 10` against NaN is false forever, and a level that silently
    // stops working is worse than one that starts over.
    expect(readBack(Number.NaN, 7)).toBe(7)
    expect(readBack('12', 7)).toBe(7)
    expect(readBack({ coins: 12 }, 7)).toBe(7)
    expect(readBack(Number.POSITIVE_INFINITY, 7)).toBe(7)
  })
})

describe('what to write back', () => {
  const written = new Map([['coins', 0], ['town', 3]])

  test('only what moved', () => {
    // Each field is its own store row, and writing an untouched `space:town`
    // would be one player's frame overwriting a value everybody shares.
    expect(changed(new Map([['coins', 4], ['town', 3]]), written)).toEqual(['coins'])
    expect(changed(new Map([['coins', 0], ['town', 3]]), written)).toEqual([])
  })

  test('a field written for the first time counts as moved', () => {
    expect(changed(new Map([['best', 9]]), new Map())).toEqual(['best'])
  })

  test('back to where it started is not a change', () => {
    // A rule that adds one and takes it away in the same second has written
    // nothing, and a round trip saying so is a round trip for nothing.
    expect(changed(new Map([['coins', 0]]), written)).toEqual([])
  })

  test('several at once come back in a stable order', () => {
    expect(changed(new Map([['town', 9], ['coins', 1]]), written)).toEqual(['coins', 'town'])
  })
})

describe('a number that is only true for this match', () => {
  const data = {
    coins: { scope: 'space' as const, value: 0, label: 'coins' },
    best: { scope: 'player' as const, value: 0 },
    dice: { scope: 'run' as const, value: 0, label: 'roll' },
    'blue-home': { scope: 'run' as const, value: 0 },
  }

  test('a run field is never read from the store', () => {
    /**
     * The bug this scope exists for: the board game counted pieces home into
     * the *space*, so a finished game left a four in the row forever and the
     * next table opened already won, with last week's roll still on it.
     */
    expect(plannedReads(data).map((one) => one.name)).toEqual(['coins', 'best'])
  })

  test('and never written back to it, however much it moved', () => {
    const live = new Map([['coins', 3], ['dice', 6], ['blue-home', 4]])
    // `changed` still reports it - what moved is a question about the map, not
    // about the document - and `persisted` is what decides there is anywhere to
    // put it.
    expect(changed(live, new Map())).toEqual(['blue-home', 'coins', 'dice'])
    expect(persisted(changed(live, new Map()), data)).toEqual(['coins'])
  })

  test('so it starts at its declared default every time', () => {
    // Not an optimisation of the behaviour - it *is* the behaviour, and it is
    // also why a phase does not survive a reload.
    expect(openingValues(data).get('dice')).toBe(0)
    expect(openingValues(data).get('blue-home')).toBe(0)
  })

  test('a field the document never declared is not persisted either', () => {
    // A name that reached the map from somewhere else has no scope to read, and
    // guessing one would write a row nothing can ever match back.
    expect(persisted(['ghost'], data)).toEqual([])
  })
})

describe('the read that belongs beside the write', () => {
  const data = {
    coins: { scope: 'space' as const, value: 0 },
    open: { scope: 'shared' as const, value: 0 },
    best: { scope: 'player' as const, value: 0 },
    streak: { scope: 'run' as const, value: 0 },
  }

  test('only the fields somebody else can change are asked about again', () => {
    // `player` is yours and nobody else writes it, so re-reading it is a round
    // trip for an answer that cannot have changed - and one that could arrive
    // stale over a value you just set.
    expect(shareable(data).map((one) => one.name)).toEqual(['coins', 'open'])
  })

  test('a field with nothing local waiting may be adopted', () => {
    const live = new Map([['coins', 3]])
    const written = new Map([['coins', 3]])
    expect(adoptable('coins', live, written)).toBe(true)
  })

  test('and one this client has moved may not', () => {
    /**
     * The guard the whole poll rests on: a live value that has moved since it
     * was last written is this client's own unflushed change, and adopting the
     * stored row over it would undo somebody's roll a second after they made it.
     */
    const live = new Map([['coins', 4]])
    const written = new Map([['coins', 3]])
    expect(adoptable('coins', live, written)).toBe(false)
  })

  test('a field nobody has written yet is adoptable, because both are absent', () => {
    expect(adoptable('coins', new Map(), new Map())).toBe(true)
  })
})

describe('the fields the arbiter keeps for one game', () => {
  const table: XpData = {
    coins: { scope: 'player', value: 0 },
    town: { scope: 'space', value: 3 },
    dice: { scope: 'run', value: 0 },
    home: { scope: 'run', value: 0 },
  }

  test('only the run ones', () => {
    expect(arbitratedFields(table).sort()).toEqual(['dice', 'home'])
  })

  test('and they are exactly the ones the store never sees', () => {
    /**
     * The two transports have to be disjoint. A field written to both would be
     * two writers with two clocks arguing about one number - and the losing
     * half would be whichever flushed last, which is not a rule anybody could
     * predict from the document.
     */
    const stored = new Set([
      ...plannedReads(table).map((one) => one.name),
      ...shareable(table).map((one) => one.name),
      ...persisted(Object.keys(table), table),
    ])
    for (const name of arbitratedFields(table)) expect(stored.has(name)).toBe(false)
  })

  test('a level that declares none asks for nothing', () => {
    expect(arbitratedFields({ coins: { scope: 'player', value: 0 } })).toEqual([])
  })
})
