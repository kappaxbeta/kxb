import { describe, expect, test } from 'bun:test'
import {
  CORNERS,
  CLOSEST,
  MAX_HEALTH,
  MAX_STAMINA,
  RING_HALF,
  RISEN_HEALTH,
  ROUNDS,
  ROUND_SECONDS,
  SHORTEST_ROUND,
  LONGEST_ROUND,
  roundsOf,
  THREE_KNOCKDOWN,
  WALKOUT_SECONDS,
  NO_INTENT,
  fighter,
  free,
  gapOf,
  newFight,
  score,
  stepFight,
  type Corner,
  type Fight,
  type FightEvent,
  type Intent,
} from './fight'
import { MOVES, PUNCHES, durationOf, type MoveName, type PunchName } from './moves'

/**
 * A whole match, in a loop.
 *
 * The reason this file can exist at all is that nothing in `./fight` reads a
 * clock, a `window` or a socket - so three sixty-second rounds run here in
 * about a millisecond and every rule below is asserted rather than eyeballed in
 * a browser. That property is worth more than any single test in the file, and
 * it is the first thing to protect if this ever needs to reach for something.
 */

const TICK = 1 / 60

/**
 * A fight already under way, so tests do not spend three seconds walking out.
 *
 * Both corners are marked ready by hand. That is a *player* pressing a button
 * rather than anything the step decides, so a test that wanted a fight and did
 * not say so would sit in the lobby forever - which is the correct behaviour and
 * a confusing way to fail.
 */
/**
 * Stage the one thing that is a knockout: the biggest punch, thrown into one.
 *
 * Both corners throw an overhand at the same instant, so each is in the other's
 * startup-or-active window when it lands and both are counters -
 * `20 x COUNTER = 27`, over `KNOCKOUT_PUNCH`. Only the one standing on `health`
 * goes down, and because the blow clears the bar it goes down for good.
 *
 * A helper rather than three copies, because the timing is the whole point and
 * a test that staged it slightly differently would be asserting a different
 * rule while looking identical.
 */
function flatten(fight: Fight, corner: Corner, health: number): FightEvent[] {
  const other: Corner = corner === 'red' ? 'blue' : 'red'
  fight[corner].health = health
  fight[corner].move = 'idle'
  fight[corner].stamina = MAX_STAMINA
  fight[other].stamina = MAX_STAMINA
  fight[corner].x = corner === 'red' ? -CLOSEST / 2 : CLOSEST / 2
  fight[other].x = corner === 'red' ? CLOSEST / 2 : -CLOSEST / 2
  return run(
    fight,
    { red: { punch: 'overhand' }, blue: { punch: 'overhand' } },
    durationOf(MOVES.overhand) + 0.05,
  )
}

function fighting(): Fight {
  const fight = newFight(fighter('red', 'r', 'Red'), fighter('blue', 'b', 'Blue'))
  fight.red.ready = true
  fight.blue.ready = true
  run(fight, {}, 3.2)
  expect(fight.phase).toBe('fighting')
  return fight
}

/**
 * Step a fight for `seconds`, holding the given intents.
 *
 * Intents here are *held* for the whole span, including the edges - which is
 * not what a real pad does, and is exactly what these tests want: `spent` and
 * the commitment rules are what stop a held punch being a machine gun, so
 * holding one is how you find out whether they work.
 */
function run(
  fight: Fight,
  intents: Partial<Record<Corner, Partial<Intent>>>,
  seconds: number,
  resolves: readonly Corner[] = CORNERS,
): FightEvent[] {
  const events: FightEvent[] = []
  const steps = Math.round(seconds / TICK)
  for (let i = 0; i < steps; i++) {
    events.push(
      ...stepFight({
        fight,
        intents: {
          red: { ...NO_INTENT, ...intents.red },
          blue: { ...NO_INTENT, ...intents.blue },
        },
        dt: TICK,
        now: (clock.t += TICK),
        resolves,
      }),
    )
  }
  return events
}

/** One monotonic clock for the file, standing in for `XpHost.now()`. */
const clock = { t: 0 }

const contacts = (events: FightEvent[]) =>
  events.filter((e): e is Extract<FightEvent, { type: 'contact' }> => e.type === 'contact')

describe('the walkout', () => {
  test('nobody can be hit before the bell', () => {
    const fight = newFight(fighter('red', 'r', 'Red'), fighter('blue', 'b', 'Blue'))
    fight.red.ready = true
    fight.blue.ready = true
    const events = run(fight, { red: { punch: 'cross' }, blue: { walk: 1 } }, 2)
    expect(contacts(events)).toHaveLength(0)
    expect(fight.red.health).toBe(100)
  })

  test('the bell starts the round at full time', () => {
    const fight = fighting()
    expect(fight.round).toBe(1)
    expect(fight.clock).toBeGreaterThan(ROUND_SECONDS - 0.3)
  })
})

describe('standing up', () => {
  /**
   * `walk` is screen-relative, so *into each other* is red going right and blue
   * going left. Both pressing the same way is a chase, which the next test is.
   */
  test('two fighters cannot occupy the same metre', () => {
    const fight = fighting()
    run(fight, { red: { walk: 1 }, blue: { walk: -1 } }, 4)
    expect(gapOf(fight)).toBeGreaterThanOrEqual(CLOSEST - 0.001)
  })

  /**
   * The one case where separation and the ropes fight each other.
   *
   * Both walk the same way, so the one in front is pinned against the ropes and
   * the one behind keeps closing. Whichever rule is applied last wins, and if
   * the clamp to the ring is last it can push a fighter back through the other -
   * a chase that ends inside somebody.
   */
  test('and not even when one is chased into the ropes', () => {
    const fight = fighting()
    run(fight, { red: { walk: 1 }, blue: { walk: 1 } }, 6)
    expect(Math.abs(fight.blue.x)).toBeLessThanOrEqual(RING_HALF + 0.001)
    expect(gapOf(fight)).toBeGreaterThanOrEqual(CLOSEST - 0.001)
  })

  test('and A and D mean the same thing to both corners', () => {
    // The bug this replaces: `+1` used to mean *towards the opponent*, so the
    // blue corner pressed the right-hand key and walked left.
    const fight = fighting()
    const before = { red: fight.red.x, blue: fight.blue.x }
    run(fight, { red: { walk: 1 }, blue: { walk: 1 } }, 0.3)
    expect(fight.red.x).toBeGreaterThan(before.red)
    expect(fight.blue.x).toBeGreaterThan(before.blue)
  })

  /**
   * The rule that stopped the sprites merging has to leave every punch usable.
   *
   * If `CLOSEST` ever creeps past the shortest reach, two fighters walk to their
   * minimum distance and stand there unable to touch each other - a stalemate
   * with no error and no way to tell from inside the game what went wrong.
   */
  test('the closest they can stand is inside every punch in the table', () => {
    for (const punch of PUNCHES) {
      expect(MOVES[punch].reach!).toBeGreaterThan(CLOSEST)
    }
  })

  test('nobody leaves the ring', () => {
    const fight = fighting()
    run(fight, { red: { walk: -1 }, blue: { walk: 1 } }, 8)
    expect(Math.abs(fight.red.x)).toBeLessThanOrEqual(RING_HALF + 0.001)
    expect(Math.abs(fight.blue.x)).toBeLessThanOrEqual(RING_HALF + 0.001)
  })

  test('walking in closes the distance', () => {
    const fight = fighting()
    const before = gapOf(fight)
    run(fight, { red: { walk: 1 } }, 0.3)
    expect(gapOf(fight)).toBeLessThan(before)
  })

  test('a dash covers more ground than a walk, and then stands still', () => {
    const walker = fighting()
    run(walker, { red: { walk: 1 } }, 0.2)

    const dasher = fighting()
    run(dasher, { red: { dash: 1 } }, 0.2)

    expect(dasher.red.x).toBeGreaterThan(walker.red.x)
    // Still committed to the recovery: the price of the burst.
    expect(free(dasher.red, clock.t)).toBe(false)
  })
})

describe('throwing punches', () => {
  test('one punch lands once, however long the key is held', () => {
    const fight = fighting()
    fight.red.x = -CLOSEST / 2
    fight.blue.x = CLOSEST / 2
    // Held for the whole move. The active window is 50ms - three frames at 60Hz
    // - and without `spent` this is three jabs.
    const events = run(fight, { red: { punch: 'jab' } }, durationOf(MOVES.jab))
    expect(contacts(events)).toHaveLength(1)
  })

  /**
   * The commitment rule, which is where all the risk in the game lives. If a
   * punch could be abandoned halfway, whiffing one would cost nothing and the
   * correct play would be to throw constantly.
   */
  test('a punch cannot be cancelled into a block', () => {
    const fight = fighting()
    run(fight, { red: { punch: 'overhand' } }, 0.05)
    run(fight, { red: { guard: true } }, 0.05)
    expect(fight.red.move).toBe('overhand')
  })

  test('a punch you cannot afford is not thrown', () => {
    const fight = fighting()
    fight.red.stamina = MOVES.overhand.cost! - 1
    run(fight, { red: { punch: 'overhand' } }, 0.05)
    expect(fight.red.move).not.toBe('overhand')
  })

  test('stamina is spent on the throw, not on the hit', () => {
    const fight = fighting()
    const before = fight.red.stamina
    // Deliberately out of range - it costs the same.
    fight.red.x = -RING_HALF
    run(fight, { red: { punch: 'hook' } }, 0.02)
    expect(fight.red.stamina).toBeLessThanOrEqual(before - MOVES.hook.cost!)
  })
})

describe('the exchange', () => {
  /** Walk in and land one, so the damage numbers are exercised end to end. */
  function land(punch: 'jab' | 'cross' | 'hook' | 'uppercut' | 'overhand', guard = false) {
    const fight = fighting()
    fight.red.x = -CLOSEST / 2
    fight.blue.x = CLOSEST / 2
    // Exactly one move long: `punch` is an edge, and holding it past the
    // recovery is a second punch rather than a longer first one.
    const events = run(fight, { red: { punch }, blue: { guard } }, durationOf(MOVES[punch]))
    return { fight, events }
  }

  test('a clean punch takes exactly its damage', () => {
    const { fight } = land('cross')
    expect(fight.blue.health).toBeCloseTo(100 - MOVES.cross.damage!, 5)
  })

  test('a blocked punch barely scratches, and drains the guard', () => {
    const { fight } = land('hook', true)
    expect(fight.blue.health).toBeGreaterThan(100 - MOVES.hook.damage!)
    expect(fight.blue.stamina).toBeLessThan(MAX_STAMINA)
  })

  test('the damage dealt is what the round is scored on', () => {
    const { fight } = land('cross')
    expect(fight.red.dealt).toBeCloseTo(MOVES.cross.damage!, 5)
    expect(fight.blue.dealt).toBe(0)
  })

  test('a clean hit staggers and a blocked one does not', () => {
    expect(land('cross').fight.blue.move).toBe('hurt')
    expect(land('jab', true).fight.blue.move).toBe('block')
  })
})

describe('going down', () => {
  /** Put somebody on the canvas without needing to land eight real punches. */
  function drop(fight: Fight, corner: Corner, health = 1, punch: PunchName = 'jab') {
    const other: Corner = corner === 'red' ? 'blue' : 'red'
    fight[corner].health = health
    fight[corner].move = 'idle'
    fight[corner].x = corner === 'red' ? -CLOSEST / 2 : CLOSEST / 2
    fight[other].x = corner === 'red' ? CLOSEST / 2 : -CLOSEST / 2
    fight[other].stamina = MAX_STAMINA
    return run(fight, { [other]: { punch } }, durationOf(MOVES[punch]) + 0.05)
  }

  test('health at zero is a knockdown, not a loss', () => {
    const fight = fighting()
    const events = drop(fight, 'blue')
    expect(events.some((e) => e.type === 'down')).toBe(true)
    expect(fight.blue.move).toBe('down')
    expect(fight.phase).toBe('fighting')
  })

  test('they get up, on much less than they went down with', () => {
    const fight = fighting()
    drop(fight, 'blue')
    run(fight, {}, MOVES.down.recovery + 0.1)
    expect(fight.blue.move).toBe('idle')
    expect(fight.blue.health).toBe(RISEN_HEALTH)
  })

  test('a fighter on the canvas cannot be hit again', () => {
    const fight = fighting()
    drop(fight, 'blue')
    const events = run(fight, { red: { punch: 'cross' } }, 0.4)
    expect(contacts(events)).toHaveLength(0)
  })

  test('three in a round and it is stopped', () => {
    const fight = fighting()
    for (let i = 0; i < THREE_KNOCKDOWN; i++) {
      drop(fight, 'blue')
      run(fight, {}, MOVES.down.recovery + 0.2)
    }
    expect(fight.phase).toBe('over')
    expect(fight.verdict?.how).toBe('tko')
    expect(fight.verdict?.winner).toBe('red')
  })

  /**
   * The knockout, which is the only reason the top of the punch ladder is worth
   * its recovery. Without a `ko` path every finish is the three-knockdown rule
   * and an overhand is a slow hook.
   */
  test('the biggest punch, thrown into one, ends it there and then', () => {
    const fight = fighting()
    const events = flatten(fight, 'blue', 8)
    expect(events.some((e) => e.type === 'over')).toBe(true)
    expect(fight.verdict?.how).toBe('ko')
    expect(fight.blue.move).toBe('out')
    expect(fight.red.move).toBe('won')
  })

  test('anything smaller on the same empty bar is a knockdown, not a finish', () => {
    /**
     * The regression this rule exists for, and the reason it stopped reading
     * overkill. On eight health *every* real punch clears twelve points past
     * zero, so the clean knockout used to be the ordinary way a round ended -
     * and rounds two and three were almost never played.
     *
     * Same bar, same punch, thrown at somebody who is not throwing back: 20
     * rather than 27, under `KNOCKOUT_PUNCH`, so they go down and get up.
     */
    const fight = fighting()
    const events = drop(fight, 'blue', 8, 'overhand')
    expect(events.some((e) => e.type === 'down')).toBe(true)
    expect(events.some((e) => e.type === 'over')).toBe(false)
    expect(fight.phase).toBe('fighting')
  })

  test('nothing happens after it is over', () => {
    const fight = fighting()
    flatten(fight, 'blue', 8)
    expect(fight.phase).toBe('over')
    const health = fight.blue.health
    const events = run(fight, { red: { punch: 'overhand' }, blue: { walk: 1 } }, 2)
    expect(events).toHaveLength(0)
    expect(fight.blue.health).toBe(health)
  })
})

describe('the cards', () => {
  test('the fighter who dealt more takes the round ten-nine', () => {
    const fight = fighting()
    fight.red.dealt = 40
    fight.blue.dealt = 12
    expect(score(fight)).toEqual({ round: 1, red: 10, blue: 9 })
  })

  test('a knockdown makes it ten-eight, whoever landed more', () => {
    const fight = fighting()
    fight.red.dealt = 5
    fight.blue.dealt = 90
    fight.blue.downsThisRound = 1
    // Blue out-landed red all round and still loses it 10-8, because blue went
    // down. The winner of a round always gets ten - see `score`.
    expect(score(fight)).toEqual({ round: 1, red: 10, blue: 8 })
  })

  test('an even round is even', () => {
    const fight = fighting()
    fight.red.dealt = 20
    fight.blue.dealt = 20
    expect(score(fight)).toEqual({ round: 1, red: 10, blue: 10 })
  })
})

describe('the distance', () => {
  /**
   * The full three rounds, driven in a loop. Slow to write and instant to run,
   * which is the trade the whole package is built on.
   */
  test('a fight nobody wins goes to the cards as a draw', () => {
    const fight = newFight(fighter('red', 'r', 'Red'), fighter('blue', 'b', 'Blue'))
    fight.red.ready = true
    fight.blue.ready = true
    run(fight, {}, 3.2 + ROUNDS * (ROUND_SECONDS + 13))
    expect(fight.phase).toBe('over')
    expect(fight.cards).toHaveLength(ROUNDS)
    expect(fight.verdict?.how).toBe('draw')
    expect(fight.verdict?.winner).toBe(null)
  })

  test('the bell rings between rounds and hands health back', () => {
    const fight = fighting()
    fight.red.health = 20
    const events = run(fight, {}, ROUND_SECONDS + 0.2)
    expect(events.some((e) => e.type === 'bell')).toBe(true)
    expect(fight.phase).toBe('between')
    expect(fight.round).toBe(2)
    expect(fight.red.health).toBeGreaterThan(20)
    expect(fight.red.stamina).toBe(MAX_STAMINA)
  })
})

describe('who is allowed to decide', () => {
  /**
   * `resolves` is the netcode - see the header of ./fight. These two tests are
   * the whole of it, and they are the reason the field is a list rather than a
   * boolean: a client resolves *some* corners, not all or none.
   */
  test('a corner this client does not own takes no damage from it', () => {
    const fight = fighting()
    fight.red.x = -CLOSEST / 2
    fight.blue.x = CLOSEST / 2
    // We own red. Red punches blue - and it is not our place to say it landed.
    run(fight, { red: { punch: 'cross' } }, 0.5, ['red'])
    expect(fight.blue.health).toBe(100)
  })

  test('a corner this client does not own still plays out the move it is in', () => {
    const fight = fighting()
    // Blue arrived over the wire mid-overhand. It should finish, not freeze.
    // Widened deliberately: assigning the literal narrows the field for the
    // rest of the test, and the assertion below is that it *changed*.
    fight.blue.move = 'overhand' as MoveName
    fight.blue.since = clock.t
    run(fight, {}, 0.9, ['red'])
    expect(fight.blue.move).toBe('idle')
  })

  test('a corner this client does not own starts nothing of its own', () => {
    const fight = fighting()
    run(fight, { blue: { punch: 'overhand', walk: 1 } }, 0.3, ['red'])
    expect(fight.blue.move).toBe('idle')
  })
})

describe('the lobby', () => {
  const waiting = () => newFight(fighter('red', 'r', 'Red'), fighter('blue', 'b', 'Blue'))

  test('a new fight is in the lobby with no clock running', () => {
    const fight = waiting()
    run(fight, {}, 5)
    expect(fight.phase).toBe('lobby')
    expect(fight.clock).toBe(0)
  })

  test('one fighter saying yes is not enough', () => {
    const fight = waiting()
    fight.red.ready = true
    run(fight, {}, 5)
    expect(fight.phase).toBe('lobby')
  })

  test('both saying yes starts the walkout, and only then the round', () => {
    const fight = waiting()
    fight.red.ready = true
    fight.blue.ready = true
    run(fight, {}, TICK)
    expect(fight.phase).toBe('walkout')
    // A hair past, because the clock has to cross zero rather than reach it.
    run(fight, {}, WALKOUT_SECONDS + TICK * 2)
    expect(fight.phase).toBe('fighting')
  })

  /**
   * The lobby is not a pause: nothing about a body changes in it, so a fighter
   * cannot arrive at the bell already stunned or already spent.
   */
  test('nothing happens to anybody while they wait', () => {
    const fight = waiting()
    fight.red.stamina = 40
    run(fight, { red: { punch: 'overhand', walk: 1 } }, 3)
    expect(fight.red.stamina).toBe(40)
    expect(fight.red.move).toBe('idle')
    expect(gapOf(fight)).toBe(3)
  })

  test('each corner gets a different fighter, so two strangers can tell each other apart', () => {
    const fight = waiting()
    expect(fight.red.character).not.toBe(fight.blue.character)
  })
})

describe('a client that cannot keep up', () => {
  /**
   * The failure that looked like broken collision.
   *
   * The *defender* resolves a punch, so it is the victim's frame rate that
   * decides whether a punch exists at all. A point test - "is it active right
   * now" - asked once a frame simply misses a fifty-millisecond window on a
   * client running at 20fps, and the attacker watches a clean hit pass through
   * somebody and do nothing.
   */
  const landsAt = (fps: number) => {
    const fight = newFight(fighter('red', 'r', 'Red'), fighter('blue', 'b', 'Blue'))
    fight.red.ready = true
    fight.blue.ready = true
    const dt = 1 / fps
    let now = clock.t
    const step = (intent: Partial<Intent> = {}) => {
      now += dt
      clock.t = now
      return stepFight({
        fight,
        intents: { red: { ...NO_INTENT, ...intent }, blue: NO_INTENT },
        dt,
        now,
        resolves: CORNERS,
      })
    }

    for (let i = 0; i < Math.ceil(3.4 / dt); i++) step()
    fight.red.x = -CLOSEST / 2
    fight.blue.x = CLOSEST / 2

    const events = [...step({ punch: 'jab' })]
    for (let i = 0; i < Math.ceil(durationOf(MOVES.jab) / dt); i++) events.push(...step())
    return events.filter((event) => event.type === 'contact').length
  }

  test('a jab lands at sixty frames a second', () => {
    expect(landsAt(60)).toBe(1)
  })

  /**
   * Eight frames a second is 125ms a frame - two and a half times the jab's
   * whole active window. A point test cannot see it at all; an interval test
   * cannot miss it.
   */
  test('and at eight, which a point test could not see at all', () => {
    expect(landsAt(8)).toBe(1)
  })

  test('and still only once, however slow the client is', () => {
    expect(landsAt(5)).toBe(1)
  })

  /**
   * Four frames a second: one frame is 250ms, which is a jab's *entire*
   * duration.
   *
   * The punch is begun and finished inside a single step. It used to be cleared
   * to `idle` by `advance` before `strike` ever looked at it, so every punch on
   * a slow machine silently did not happen - and from the other end that is
   * indistinguishable from broken collision. Contact is resolved before moves
   * are cleared now, and this is the case that says so.
   */
  test('and when one frame is longer than the whole punch', () => {
    expect(landsAt(4)).toBe(1)
  })

  test('and when one frame is longer than several punches', () => {
    expect(landsAt(2)).toBe(1)
  })
})

describe('after it is over', () => {
  /** A finished fight, so the rematch tests do not each have to win one. */
  function finished(): Fight {
    const fight = fighting()
    flatten(fight, 'blue', 8)
    expect(fight.phase).toBe('over')
    return fight
  }

  test('nobody is carrying a ready from the fight that just ended', () => {
    const fight = finished()
    expect(fight.red.ready).toBe(false)
    expect(fight.blue.ready).toBe(false)
  })

  test('one corner asking for another is not enough', () => {
    const fight = finished()
    fight.red.ready = true
    run(fight, {}, 3)
    expect(fight.phase).toBe('over')
  })

  test('both asking starts a clean fight', () => {
    const fight = finished()
    fight.red.ready = true
    fight.blue.ready = true
    run(fight, {}, TICK * 2)

    expect(fight.phase).toBe('walkout')
    expect(fight.round).toBe(1)
    expect(fight.cards).toEqual([])
    expect(fight.verdict).toBe(null)
    for (const corner of CORNERS) {
      expect(fight[corner].health).toBe(MAX_HEALTH)
      expect(fight[corner].downs).toBe(0)
      // And nobody is still holding the button that started this one, or the
      // fight after would begin without being agreed to.
      expect(fight[corner].ready).toBe(false)
    }
  })

  test('the fighters keep their corners and their bodies', () => {
    const fight = finished()
    const was = { name: fight.red.name, character: fight.red.character }
    fight.red.ready = true
    fight.blue.ready = true
    run(fight, {}, TICK * 2)
    expect(fight.red.name).toBe(was.name)
    expect(fight.red.character).toBe(was.character)
  })
})

describe('a knockdown', () => {
  test('puts both fighters back in their corners, not just the one who fell', () => {
    // Otherwise the round resumes with the winner of the exchange stood over
    // somebody who has just got up on forty health, and the knockdown decides
    // the next one too.
    const fight = fighting()
    fight.blue.health = 1
    fight.red.x = -CLOSEST / 2
    fight.blue.x = CLOSEST / 2
    run(fight, { red: { punch: 'jab' } }, durationOf(MOVES.jab) + 0.05)
    expect(fight.blue.move).toBe('down')

    run(fight, {}, MOVES.down.recovery + 0.1)
    expect(fight.blue.move).toBe('idle')
    expect(gapOf(fight)).toBe(3)
  })

  test('and the count is long enough to be felt', () => {
    expect(MOVES.down.recovery).toBeGreaterThanOrEqual(3)
  })
})

describe('a time limit set by the host', () => {
  /**
   * The wizard offers a limit for the *match*; this game counts rounds. The
   * division happens in `roundsOf` rather than at the call site, so every host
   * gets the same answer.
   */
  test('three minutes is three one-minute rounds, which is the default', () => {
    expect(roundsOf(180)).toBe(60)
    expect(roundsOf(180)).toBe(ROUND_SECONDS)
  })

  test('six minutes is three two-minute rounds', () => {
    expect(roundsOf(360)).toBe(120)
  })

  test('nothing set is the game deciding', () => {
    expect(roundsOf(null)).toBe(ROUND_SECONDS)
    expect(roundsOf(undefined)).toBe(ROUND_SECONDS)
    expect(roundsOf(0)).toBe(ROUND_SECONDS)
  })

  /**
   * A limit is a number somebody typed, and both ends of it break the game
   * rather than tuning it: a round shorter than the fighters take to close is
   * not a short round, it is no round.
   */
  test('an absurdly short limit is clamped rather than obeyed', () => {
    expect(roundsOf(3)).toBe(SHORTEST_ROUND)
  })

  test('and an absurdly long one', () => {
    expect(roundsOf(60 * 60 * 10)).toBe(LONGEST_ROUND)
  })

  test('the fight is built with it, and keeps it through a rematch', () => {
    const fight = newFight(fighter('red', 'r', 'Red'), fighter('blue', 'b', 'Blue'), 360)
    expect(fight.roundSeconds).toBe(120)

    fight.red.ready = true
    fight.blue.ready = true
    run(fight, {}, WALKOUT_SECONDS + TICK * 3)
    expect(fight.phase).toBe('fighting')
    expect(fight.clock).toBeGreaterThan(119)
  })
})
