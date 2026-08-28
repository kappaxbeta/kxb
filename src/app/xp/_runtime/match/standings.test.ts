import { describe, expect, test } from 'bun:test'
import { standingsFrom, teamTotals } from '@/app/xp/_runtime/match/standings'
import type { Mark } from '@kxb/xp'
import type { XpPlayer } from '@kxb/xp/host'

/**
 * The scoreboard, checked without a room.
 *
 * Same reason as ./teams: the runtime cannot be watched, and every bug here is
 * a join between three sources that produces a board which *looks* plausible -
 * a missing row, a duplicated person, a name attached to the wrong score. None
 * of those throws.
 */

function mark(over: Partial<Mark> = {}): Mark {
  return { kind: 'spawn', x: 0, y: 0, z: 0, facing: 0, width: 5, height: 4, ...over }
}

const SIDES = [mark({ team: 'red', x: -6 }), mark({ team: 'blue', x: 6 })]

const player = (id: string, name: string): XpPlayer => ({ id, name })

describe('the board', () => {
  test('a score and a name become one row', () => {
    const rows = standingsFrom({
      scores: { ana: 3 },
      roster: [player('ana', 'Ana')],
      me: 'ana',
      marks: [],
    })
    expect(rows).toEqual([{ id: 'ana', name: 'Ana', kills: 3, mine: true, here: true, out: false }])
  })

  test('somebody here who has not scored is on it at zero', () => {
    // They are playing. A board that only listed scorers would appear one
    // player short until the first kill, which reads as somebody not having
    // joined.
    const rows = standingsFrom({
      scores: { ana: 1 },
      roster: [player('ana', 'Ana'), player('bo', 'Bo')],
      me: 'bo',
      marks: [],
    })
    expect(rows.map((row) => [row.name, row.kills])).toEqual([
      ['Ana', 1],
      ['Bo', 0],
    ])
  })

  /**
   * The half that is easy to get wrong in the other direction: a player who
   * left keeps the kills they got, because those are a fact about the match
   * rather than about who is currently connected.
   */
  test('somebody who has left keeps their score and loses their name', () => {
    const rows = standingsFrom({
      scores: { 'ana-1234-5678': 4, bo: 1 },
      roster: [player('bo', 'Bo')],
      me: 'bo',
      marks: [],
    })
    expect(rows[0]).toEqual({
      id: 'ana-1234-5678',
      name: 'ana-12',
      kills: 4,
      mine: false,
      here: false,
      out: false,
    })
    expect(rows[1]!.here).toBe(true)
  })

  test('two absent players are two rows, not one', () => {
    const rows = standingsFrom({
      scores: { 'aaaaaaaa-1': 1, 'bbbbbbbb-2': 2 },
      roster: [],
      me: undefined,
      marks: [],
    })
    expect(rows).toHaveLength(2)
    expect(rows[0]!.name).not.toBe(rows[1]!.name)
  })

  test('ours is marked, and it is the id the arbiter gave us', () => {
    const rows = standingsFrom({
      scores: { ana: 0, bo: 0 },
      roster: [player('ana', 'Ana'), player('bo', 'Bo')],
      me: 'bo',
      marks: [],
    })
    expect(rows.find((row) => row.mine)?.id).toBe('bo')
    expect(rows.filter((row) => row.mine)).toHaveLength(1)
  })

  test('nobody anywhere is an empty board rather than a row of nothing', () => {
    expect(standingsFrom({ scores: {}, roster: [], me: 'bo', marks: [] })).toEqual([])
  })
})

describe('the order', () => {
  test('most kills first', () => {
    const rows = standingsFrom({
      scores: { ana: 1, bo: 5, cass: 3 },
      roster: [player('ana', 'Ana'), player('bo', 'Bo'), player('cass', 'Cass')],
      me: 'ana',
      marks: [],
    })
    expect(rows.map((row) => row.name)).toEqual(['Bo', 'Cass', 'Ana'])
  })

  /**
   * A tie broken by name rather than left to the map, because the map's order
   * is whatever the database built the jsonb in - so two players on one kill
   * each would swap places on every poll, and a board that flickers while
   * nothing is happening is worse than one in an arbitrary but stable order.
   */
  test('a tie is broken by name, and stays broken the same way', () => {
    const once = standingsFrom({
      scores: { zed: 1, ana: 1 },
      roster: [player('zed', 'Zed'), player('ana', 'Ana')],
      me: 'ana',
      marks: [],
    })
    const twice = standingsFrom({
      scores: { ana: 1, zed: 1 },
      roster: [player('ana', 'Ana'), player('zed', 'Zed')],
      me: 'ana',
      marks: [],
    })
    expect(once.map((row) => row.name)).toEqual(['Ana', 'Zed'])
    expect(twice.map((row) => row.name)).toEqual(once.map((row) => row.name))
  })
})

describe('sides', () => {
  test('a level with no team spawns puts nobody on a side', () => {
    const rows = standingsFrom({
      scores: { ana: 1 },
      roster: [player('ana', 'Ana')],
      me: 'ana',
      marks: [],
    })
    expect(rows[0]!.side).toBeUndefined()
    expect(teamTotals(rows)).toEqual([])
  })

  test('a side is derived from the id, the same way the rings are', () => {
    const rows = standingsFrom({
      scores: { ana: 1, bo: 1 },
      roster: [player('ana', 'Ana'), player('bo', 'Bo')],
      me: 'ana',
      marks: SIDES,
    })
    for (const row of rows) {
      expect(row.side).toBeDefined()
      expect(['red', 'blue']).toContain(row.side!)
    }
  })

  /**
   * The one thing a host may override, and only for us: the battle lobby picks
   * sides before anybody loads the document, and a derived side that disagreed
   * with the lobby would put somebody on a scoreboard row they are not playing
   * on.
   */
  test('a side the host chose beats the derived one, for us alone', () => {
    const derived = standingsFrom({
      scores: { ana: 1 },
      roster: [player('ana', 'Ana')],
      me: 'ana',
      marks: SIDES,
    })[0]!.side
    const other: string = derived === 'red' ? 'blue' : 'red'

    const rows = standingsFrom({
      scores: { ana: 1, bo: 1 },
      roster: [player('ana', 'Ana'), player('bo', 'Bo')],
      me: 'ana',
      marks: SIDES,
      team: other,
    })
    expect(rows.find((row) => row.id === 'ana')?.side).toBe(other)
    // And nobody else is moved by it. `given` is about this client's player.
    expect(rows.find((row) => row.id === 'bo')?.side).toBe(
      standingsFrom({ scores: { bo: 1 }, roster: [player('bo', 'Bo')], me: 'ana', marks: SIDES })[0]!
        .side,
    )
  })

  test('totals are summed per side, biggest first', () => {
    const rows = [
      { id: 'a', name: 'A', kills: 2, side: 'red', mine: false, here: true, out: false },
      { id: 'b', name: 'B', kills: 1, side: 'red', mine: false, here: true, out: false },
      { id: 'c', name: 'C', kills: 2, side: 'blue', mine: true, here: true, out: false },
    ]
    expect(teamTotals(rows)).toEqual([
      { side: 'red', kills: 3 },
      { side: 'blue', kills: 2 },
    ])
  })

  test('a player with no side is left out of the totals rather than made a side', () => {
    const rows = [
      { id: 'a', name: 'A', kills: 2, side: 'red', mine: false, here: true, out: false },
      { id: 'c', name: 'C', kills: 9, mine: true, here: true, out: false },
    ]
    expect(teamTotals(rows)).toEqual([{ side: 'red', kills: 2 }])
  })
})

/**
 * Out, which is not the same as down and not the same as gone.
 *
 * Three states that look alike on a scoreboard and mean completely different
 * things to somebody reading it: waiting to respawn, eliminated for the rest of
 * the match, and not connected. Only the middle one is a rule.
 */
describe('elimination', () => {
  test('a level with no lives has nobody out', () => {
    const rows = standingsFrom({
      scores: { ana: 1, bo: 0 },
      roster: [player('ana', 'Ana'), player('bo', 'Bo')],
      me: 'ana',
      marks: [],
    })
    expect(rows.every((row) => !row.out)).toBe(true)
  })

  test('nobody is out for being on zero health', () => {
    // Health is not in this join at all, deliberately: down is a client-side
    // fact with a countdown attached and out is a rule. A board that conflated
    // them would show somebody as eliminated for eight seconds.
    const rows = standingsFrom({
      scores: { ana: 0 },
      lives: { ana: 2 },
      roster: [player('ana', 'Ana')],
      me: 'ana',
      marks: [],
    })
    expect(rows[0]!.out).toBe(false)
  })

  test('no lives left is out', () => {
    const rows = standingsFrom({
      scores: { ana: 3, bo: 0 },
      lives: { ana: 1, bo: 0 },
      roster: [player('ana', 'Ana'), player('bo', 'Bo')],
      me: 'bo',
      marks: [],
    })
    expect(rows.find((row) => row.id === 'bo')?.out).toBe(true)
    expect(rows.find((row) => row.id === 'ana')?.out).toBe(false)
  })

  test('somebody with lives and no score is still on the board', () => {
    // The union has to include the lives map too, or the one player who has
    // joined and neither scored nor been seen by presence is missing entirely.
    const rows = standingsFrom({ scores: {}, lives: { ghost: 3 }, roster: [], me: undefined, marks: [] })
    expect(rows.map((row) => row.id)).toEqual(['ghost'])
  })
})
