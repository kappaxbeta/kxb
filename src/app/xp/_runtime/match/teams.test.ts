import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parseXp } from '@kxb/xp'
import { sideOf, teamColour, teamsOf } from '@/app/xp/_runtime/match/teams'
import { arrivalSpot } from '@/app/xp/_runtime/spawn'
import { TEAM_COLOURS, type Mark } from '@kxb/xp'

/**
 * Sides, checked without a room.
 *
 * The runtime cannot be watched - the Browser pane is always `document.hidden` -
 * and "is the room split down the middle" is a question about a moment that
 * happens once per player per join. It would otherwise be answered by opening
 * eight tabs, which is both slow and the least reliable way to find out.
 */

function mark(over: Partial<Mark> = {}): Mark {
  return { kind: 'spawn', x: 0, y: 0, z: 0, facing: 0, width: 5, height: 4, ...over }
}

const SIDES = [mark({ team: 'red', x: -6 }), mark({ team: 'blue', x: 6 })]

/**
 * A document's own spawn, placed between the two sides.
 *
 * `moving-parts` really does this, which is what makes it the shape worth
 * testing against rather than a fixture picked for convenience.
 */
const MIDDLE = { x: 0, y: 1, z: 8, facing: 180 }

describe('what sides a document has', () => {
  test('read off the spawn marks, in the order it names them', () => {
    expect(teamsOf(SIDES)).toEqual(['red', 'blue'])
  })

  test('a level with no team spawns has no sides', () => {
    // Which is most levels, and not a degraded case - it is a level with no
    // sides, and a player with no side stands on the document's own spawn.
    expect(teamsOf([])).toEqual([])
    expect(teamsOf([mark(), mark()])).toEqual([])
    expect(sideOf([mark(), mark()], { id: 'anybody' })).toBeUndefined()
  })

  test('two marks for one side is one side', () => {
    // A wide spawn built out of two marks is still one team, and counting it
    // twice would put a third of a two-sided room on a side that does not exist.
    expect(teamsOf([mark({ team: 'red' }), mark({ team: 'red' }), mark({ team: 'blue' })])).toEqual([
      'red',
      'blue',
    ])
  })

  test('goals and finishes are not spawns, however they are teamed', () => {
    const marks = [mark({ kind: 'red' }), mark({ kind: 'finish' }), mark({ team: 'blue' })]
    expect(teamsOf(marks)).toEqual(['blue'])
  })
})

describe('which side you are on', () => {
  test('a host that has already chosen wins outright', () => {
    /**
     * The battle lobby picks sides before anybody loads the document, and when
     * it has, none of the derivation runs. Honoured even for a side the document
     * does not have: the alternative is silently overriding a host that knows
     * something this does not.
     */
    expect(sideOf(SIDES, { id: 'anybody', given: 'blue' })).toBe('blue')
    expect(sideOf(SIDES, { id: 'anybody', given: 'green' })).toBe('green')
  })

  test('the same person is always on the same side', () => {
    // What lets every client work out every other client's side with nothing on
    // the wire, and what stops somebody changing colour on a reconnect.
    const once = sideOf(SIDES, { id: 'player-abc' })
    for (let i = 0; i < 20; i++) expect(sideOf(SIDES, { id: 'player-abc' })).toBe(once)
  })

  test('a room splits roughly down the middle', () => {
    /**
     * "Roughly" is the honest word and the comment matters more than the
     * numbers. This is not balance and must not be called that - four people can
     * land three against one, and a hash says nothing about any single room.
     * What it does guarantee is that it is not *constant*, which is the failure
     * that would make every player red and look exactly like teams working.
     */
    const sides = Array.from({ length: 200 }, (_, i) =>
      sideOf(SIDES, { id: `9f2a-41bc-a0d3-${i}` }),
    )
    const red = sides.filter((side) => side === 'red').length

    expect(red).toBeGreaterThan(60)
    expect(red).toBeLessThan(140)
    expect(sides.every((side) => side === 'red' || side === 'blue')).toBe(true)
  })

  test('one side is everybody’s side', () => {
    // A level with one team spawn is half-finished rather than one-sided, and
    // putting half the room on a team with nowhere to stand would hide the
    // missing mark rather than expose it.
    const half = [mark({ team: 'red' })]
    expect(sideOf(half, { id: 'a' })).toBe('red')
    expect(sideOf(half, { id: 'b' })).toBe('red')
  })

  test('`host` means wait to be told, and the level says so', () => {
    /**
     * The one thing `assign` is for. A document only ever played as a scheduled
     * match should not split a room by itself - two people who found it on their
     * own get no side, which is the setting working rather than failing.
     *
     * The host still wins: a side that was handed in is honoured whatever the
     * document says, because the host is the one that knows.
     */
    expect(sideOf(SIDES, { id: 'anybody' }, { assign: 'host' })).toBeUndefined()
    expect(sideOf(SIDES, { id: 'anybody' }, { assign: 'spread' })).toBeDefined()
    expect(sideOf(SIDES, { id: 'anybody', given: 'blue' }, { assign: 'host' })).toBe('blue')
  })

  test('nobody in particular is on nobody’s side', () => {
    /**
     * The regression this file shipped with in its first draft, and it arrived
     * through a different door than the one ./spawn already had a guard on.
     *
     * A side decides which spawn mark you arrive at. Returning "the first side"
     * for an anonymous player puts them on red's mark - and `moving-parts` puts
     * its `xp.spawn` deliberately in the middle between its two team spawns, six
     * cells from either. So "sensible default" here silently moved every solo
     * player off the spot their author chose.
     *
     * Nobody in particular is the author trying the level out, or anybody
     * playing it alone. One person is not a side.
     */
    expect(sideOf(SIDES, {})).toBeUndefined()
    expect(arrivalSpot(SIDES, {}, MIDDLE)).toEqual(MIDDLE)
  })
})

/**
 * What the document declares, against what its world implies.
 *
 * The field exists because the marks could only ever say two things - sides or
 * no sides - and a level can want a third, or want the first two overruled.
 */
describe('the shape the document declares', () => {
  test('a declared free-for-all stops the marks being read', () => {
    // The marks are still there. `ffa` is an author saying those spawn points
    // are places to stand rather than sides, which is a thing a level with four
    // named spawns may well mean.
    expect(sideOf(SIDES, { id: 'anybody' }, { sides: 'ffa' })).toBeUndefined()
    expect(sideOf(SIDES, { id: 'anybody' })).toBeDefined()
  })

  test('and puts a solo player back on the document’s own spawn', () => {
    // The consequence that matters, because a side is what decides where you
    // arrive: a free-for-all in a level with two ends starts everybody in the
    // middle, where its author put the spawn.
    const side = sideOf(SIDES, { id: 'anybody' }, { sides: 'ffa' })
    expect(arrivalSpot(SIDES, { ...(side ? { team: side } : {}) }, MIDDLE)).toEqual(MIDDLE)
  })

  test('one against everyone hands out nothing until a host names the one', () => {
    /**
     * Picking exactly one player out of a room needs the roster, and the roster
     * is not there on the frame a side is decided - which is the argument this
     * whole file is built on. So the answer is the same as `assign: 'host'`:
     * nobody has a side until somebody authoritative says.
     */
    expect(sideOf(SIDES, { id: 'anybody' }, { sides: 'one-vs-all' })).toBeUndefined()
    expect(sideOf(SIDES, { id: 'anybody', given: 'champion' }, { sides: 'one-vs-all' })).toBe(
      'champion',
    )
  })

  test('a declared team game is what a document with two team spawns already was', () => {
    // Saying it out loud must not change anything, or every level that gains
    // the field gains a behaviour with it.
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(sideOf(SIDES, { id }, { sides: 'team' })).toBe(sideOf(SIDES, { id }))
    }
  })

  test('and a level that says nothing is untouched, which is every level so far', () => {
    expect(sideOf(SIDES, { id: 'anybody' }, {})).toBe(sideOf(SIDES, { id: 'anybody' }))
    // Including the half-finished one: a single named spawn is still everybody's
    // side, because that rule is about a missing mark rather than about shape.
    expect(sideOf([mark({ team: 'red' })], { id: 'a' }, {})).toBe('red')
  })
})

describe('a side and a spawn slot are independent', () => {
  test('everybody on one side does not stand on one square', () => {
    /**
     * The bug this guards is subtle and would look like two features breaking
     * at once: ./spawn hashes the same id to pick a slot on the grid, so a
     * shared seed would correlate side with slot and put every red player on
     * red's first square, inside each other, which is the exact thing the spawn
     * grid exists to prevent.
     */
    const reds = Array.from({ length: 60 }, (_, i) => `7c1e-4a02-b8f5-${i}`).filter(
      (id) => sideOf(SIDES, { id }) === 'red',
    )
    expect(reds.length).toBeGreaterThan(10)

    const squares = new Set(
      reds.map((id) =>
        JSON.stringify(arrivalSpot(SIDES, { id, team: 'red' }, { x: 0, y: 0, z: 0, facing: 0 })),
      ),
    )
    expect(squares.size).toBeGreaterThan(3)
  })
})

describe('what a side looks like', () => {
  test('the two colours are the ones the goals already use', () => {
    // Somebody who has seen a red goal should not have to learn a second red.
    expect(teamColour('red')).toBe('#f0abfc')
    expect(teamColour('blue')).toBe('#67e8f9')
  })

  test('a side nobody has heard of still gets a ring', () => {
    // A ring that vanishes is indistinguishable from a player with no side, and
    // an unknown team name is a level being unusual rather than a level broken.
    //
    // `green` was the unknown name here until it stopped being one - the deck
    // grew to four sides for the table games, and this test went red asserting
    // that a side which now has a colour does not have one. The claim is about
    // the *fallback*, so it needs a name that is not in `TEAM_COLOURS`, and
    // taking it from the list rather than picking another literal means the next
    // side to be added cannot make this stale a second time.
    const unknown = 'chartreuse'
    expect(TEAM_COLOURS as readonly string[]).not.toContain(unknown)
    expect(teamColour(unknown)).toBe('#ffffff')
    expect(teamColour(undefined)).toBe('#ffffff')
  })
})

describe('seated in the order the room agrees on', () => {
  const marks = [
    { kind: 'spawn' as const, team: 'blue', x: 0, y: 0, z: 0, facing: 0, width: 1, height: 1 },
    { kind: 'spawn' as const, team: 'red', x: 1, y: 0, z: 0, facing: 0, width: 1, height: 1 },
    { kind: 'spawn' as const, team: 'green', x: 2, y: 0, z: 0, facing: 0, width: 1, height: 1 },
    { kind: 'spawn' as const, team: 'yellow', x: 3, y: 0, z: 0, facing: 0, width: 1, height: 1 },
  ]
  const rules = { assign: 'order' as const }
  // Deliberately not in sorted order: the roster is each client's own idea of
  // who is here, and the whole point is that the answer does not depend on it.
  const roster = ['d-fourth', 'a-first', 'c-third', 'b-second']

  const seat = (id: string, who = roster) => sideOf(marks, { id, roster: who }, rules)

  test('the first id takes the first side, and so on down', () => {
    expect(seat('a-first')).toBe('blue')
    expect(seat('b-second')).toBe('red')
    expect(seat('c-third')).toBe('green')
    expect(seat('d-fourth')).toBe('yellow')
  })

  test('and every client answers the same however its roster is ordered', () => {
    const shuffled = ['c-third', 'd-fourth', 'b-second', 'a-first']
    for (const id of roster) expect(seat(id, shuffled)).toBe(seat(id))
  })

  test('a duplicate in the roster does not shift everybody after it', () => {
    // Presence can report somebody twice across a reconnect, and a seat that
    // moved because of it would move the camera and the spawn with it.
    expect(seat('c-third', [...roster, 'a-first'])).toBe('green')
  })

  test('nobody is seated before the roster has landed', () => {
    // Late on purpose: there is no roster on the first frame. The alternative
    // is a side that changes, which is worse than one that arrives.
    expect(sideOf(marks, { id: 'a-first' }, rules)).toBeUndefined()
    expect(sideOf(marks, { id: 'a-first', roster: [] }, rules)).toBeUndefined()
  })

  test('somebody the roster has not heard of is not seated', () => {
    expect(seat('e-stranger')).toBeUndefined()
  })

  test('a fifth player shares a seat rather than losing one', () => {
    // A room one bigger than the level has chairs for is a room, not an error.
    // No side at all would take away their spawn and their camera.
    expect(seat('e-fifth', [...roster, 'e-fifth'])).toBe('blue')
  })

  test('the seat order is the arbiter\'s turn order, which is the point', () => {
    // `turn_start` seats the turn with `array_agg(key order by key)` over the
    // arbiter's own map - the account ids, sorted. Sorting them here produces
    // the identical sequence, so the first person to sit down is the first to
    // play, with nothing added to the wire.
    const arbiters = [...roster].sort()
    expect(arbiters.map((id) => seat(id))).toEqual(['blue', 'red', 'green', 'yellow'])
  })
})

/**
 * And the one shipped level whose whole mode is two sides.
 *
 * Reported from play: *"the red is by start, not going to start."* Two people
 * opened capture the flag and both of them were red - so nobody was at the
 * other end, no flag could be taken, and from inside the room it read as the
 * match refusing to begin.
 *
 * Nothing was broken. `spread` is a hash of an account id, which is a coin
 * flip per person and lands two-nothing a quarter of the time in a room of two
 * - the very thing `a room splits roughly down the middle` above says out loud
 * and calls honest. It is honest for a public deathmatch that fills up; it is
 * not a capture-the-flag match, which is unplayable the moment one end is
 * empty.
 *
 * So the document says `order`, and this is the assertion that it still does.
 * Against the shipped file rather than a fixture: the failure was a *missing
 * line in a document*, and a test built on marks of its own would have passed
 * on the day it was reported.
 */
describe('capture the flag is played from two ends', () => {
  const ctf = () => {
    const parsed = parseXp(
      JSON.parse(
        readFileSync(
          path.join(process.cwd(), 'public', 'xp', 'xps', 'capture-the-flag.xp.json'),
          'utf8',
        ),
      ),
    )
    if (!parsed.ok) throw new Error('capture the flag does not parse')
    return parsed.document
  }

  test('two players are one red and one blue, whoever they are', () => {
    const xp = ctf()
    const rules = { ...(xp.rules?.assign ? { assign: xp.rules.assign } : {}) }
    /**
     * Twenty rooms of two, because one pair proves nothing about a hash: the
     * old behaviour splits an individual pair correctly half the time, so a
     * single assertion would have passed on the broken document one run in two.
     */
    for (let room = 0; room < 20; room++) {
      const roster = [`ana-${room}`, `bo-${room}`]
      const sides = roster.map((id) => sideOf(xp.world.marks, { id, roster }, rules))
      expect([...sides].sort()).toEqual(['blue', 'red'])
    }
  })

  test('and they stand at their own end rather than in each other’s base', () => {
    const xp = ctf()
    const rules = { ...(xp.rules?.assign ? { assign: xp.rules.assign } : {}) }
    const roster = ['ana', 'bo']
    const ends = roster.map((id) => {
      const team = sideOf(xp.world.marks, { id, roster }, rules)
      return arrivalSpot(xp.world.marks, { id, ...(team ? { team } : {}), seated: true }, xp.spawn).x
    })
    // One at each end of the field, which is the whole shape of the mode.
    expect(Math.sign(ends[0]!) * Math.sign(ends[1]!)).toBe(-1)
  })

  test('and nobody starts inside a base before the room has seated them', () => {
    /**
     * `order` answers late by design - there is no roster on the first frame -
     * so the body stands on the document's own `spawn` until presence lands and
     * is re-seated from there. That spot was red's own line, which made a blue
     * player arrive in the enemy base and then get flown the width of the field
     * a second later. `moving-parts` puts its spawn between its two team spawns
     * for exactly this reason, and this is that, asserted.
     */
    const xp = ctf()
    const ends = xp.world.marks
      .filter((mark) => mark.kind === 'spawn' && mark.team !== undefined)
      .map((mark) => mark.x)
    expect(Math.min(...ends)).toBeLessThan(xp.spawn.x)
    expect(Math.max(...ends)).toBeGreaterThan(xp.spawn.x)
  })
})
