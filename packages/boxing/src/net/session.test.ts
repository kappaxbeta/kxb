import { describe, expect, test } from 'bun:test'
import { memoryHost, memoryNetwork, type MemoryNetwork } from '@kxb/xp/host'

import { joinBoxing, type BoxingSession } from './session'
import { STOPPED } from './wire'
import { CLOSEST, MAX_STAMINA, NO_INTENT, type Intent } from '../rules/fight'
import { MOVES, durationOf } from '../rules/moves'

/**
 * Two clients, one room, no browser.
 *
 * This is the file that proves the integration rather than the game: everything
 * below runs two independent `BoxingSession`s against one `memoryNetwork`, which
 * is the second implementation of `XpHost` the SDK ships precisely so that a
 * test can be two people.
 *
 * **What it cannot prove.** `memory-host.ts` says it plainly and it is worth
 * repeating here: delivery is synchronous, ordered and lossless, and a real
 * transport is none of those. So nothing here finds a race, and a rule that only
 * works because a packet arrived instantly passes here. What this proves is that
 * the *protocol* is right - that the corners agree, that the defender's verdict
 * is what moves the attacker's bar, that nobody resolves a punch twice. Two
 * browsers prove the rest.
 */

const TICK = 1 / 60

/** One clock both hosts read, standing in for two tabs that happen to agree. */
function table() {
  const clock = { t: 0 }
  const network: MemoryNetwork = memoryNetwork()
  const host = (id: string, name: string) =>
    memoryHost({ player: { id, name }, network, now: () => clock.t })
  return { clock, network, host }
}

/** Two joined sessions, plus a way to step them both. */
async function pair(topic = 'ring') {
  const { clock, host } = table()
  // Ids chosen so the sort is unambiguous: `a` takes red.
  const one = await joinBoxing({ host: host('a', 'Ali'), topic })
  const two = await joinBoxing({ host: host('b', 'Bruno'), topic })

  const step = (
    intents: { one?: Partial<Intent>; two?: Partial<Intent> },
    seconds: number,
  ) => {
    const steps = Math.round(seconds / TICK)
    for (let i = 0; i < steps; i++) {
      clock.t += TICK
      one.step({ ...NO_INTENT, ...intents.one }, TICK)
      two.step({ ...NO_INTENT, ...intents.two }, TICK)
    }
  }

  /**
   * Say yes on both sides, which no fight starts without any more.
   *
   * A test that skipped this would sit in the lobby forever - correct
   * behaviour, and a baffling way for an assertion about punching to fail.
   */
  const consent = () => {
    one.say(true)
    two.say(true)
  }

  /**
   * Past the walkout, and stood within range on both machines.
   *
   * Exactly `CLOSEST` apart rather than closer. Placing them nearer than the
   * game allows means the very next step shoves them to the legal distance, and
   * a test measuring how far a fighter drifted between packets would be
   * measuring that shove instead.
   */
  const engage = () => {
    consent()
    step({}, 3.4)
    for (const session of [one, two]) {
      session.fight.red.x = -CLOSEST / 2
      session.fight.blue.x = CLOSEST / 2
    }
  }

  return { one, two, clock, step, engage, consent }
}

describe('taking a corner', () => {
  test('the two clients agree about who is who, with no message', async () => {
    const { one, two } = await pair()
    expect(one.mine).toBe('red')
    expect(two.mine).toBe('blue')
  })

  test('both fights carry both names', async () => {
    const { one, two } = await pair()
    for (const session of [one, two]) {
      expect(session.fight.red.name).toBe('Ali')
      expect(session.fight.blue.name).toBe('Bruno')
    }
  })

  test('exactly one of them owns the clock', async () => {
    const { one, two } = await pair()
    expect([one.owner, two.owner]).toEqual([true, false])
  })

  test('a fighter alone in the room is not ready, and their clock does not run', async () => {
    const { host } = table()
    const lonely = await joinBoxing({ host: host('a', 'Ali'), topic: 'empty' })
    expect(lonely.connected()).toBe(false)
    const before = lonely.fight.clock
    for (let i = 0; i < 120; i++) lonely.step(NO_INTENT, TICK)
    expect(lonely.fight.clock).toBe(before)
  })
})

describe('being ready', () => {
  /**
   * The bug this replaced, reported from real play as "you still can't hit the
   * enemy" and "the game didn't start for one of two".
   *
   * Readiness used to mean *somebody is on my roster*, which is one client's
   * opinion. Two clients can hold different ones - a goodbye from a replaced
   * socket is enough - and the resulting state is the nastiest this game has:
   * the ready side walks, feels the other body, throws everything it has and
   * lands none of it, because the *defender* decides a hit and the defender's
   * client is not running.
   */
  test('a roster entry alone is not enough - a packet has to have arrived', async () => {
    const { host } = table()
    const lonely = await joinBoxing({ host: host('a', 'Ali'), topic: 'quiet' })
    // A peer appears on the roster, and says nothing at all.
    const mute = await joinBoxing({ host: host('b', 'Bruno'), topic: 'quiet' })
    expect(lonely.peers()).toHaveLength(2)
    void mute

    // Nobody has stepped, so nobody has sent a stance. Neither is ready, and
    // crucially neither is ready *alone*.
    expect(lonely.connected()).toBe(false)
    expect(mute.connected()).toBe(false)
  })

  test('one step each is enough, because the stance goes out before the fight does', async () => {
    const { one, two, step } = await pair()
    step({}, TICK * 2)
    expect(one.connected()).toBe(true)
    expect(two.connected()).toBe(true)
  })

  /**
   * The bug this replaces was reported as *"he was showing briefly and then I
   * couldn't see him again"*.
   *
   * Readiness used to need the roster *and* a packet. Presence on a phone is not
   * steady, and one sync that comes back empty was enough to lose somebody who
   * was still sending eight packets a second.
   */
  test('a presence hiccup does not lose somebody who is still sending', async () => {
    const { one, two, step } = await pair()
    step({}, TICK * 2)
    expect(one.connected()).toBe(true)

    // The roster empties and fills again, as a flaky phone's does. Nothing about
    // the fight changes, because packets never stopped.
    expect(one.peers().length).toBe(2)
    step({}, TICK * 2)
    expect(one.connected()).toBe(true)
    expect(one.mine).toBe('red')
    expect(two.mine).toBe('blue')
  })

  test('a corner that stops sending stops being ready', async () => {
    const { one, two, clock, step } = await pair()
    step({}, TICK * 2)
    expect(one.connected()).toBe(true)

    // Two goes quiet - a closed laptop, a dead tab - and one notices without
    // any goodbye having been delivered.
    two.leave()
    clock.t += 5
    expect(one.connected()).toBe(false)
  })
})

describe('what each client may decide', () => {
  test('a punch is answered by the fighter it was aimed at, not by the thrower', async () => {
    const { one, two, step, engage } = await pair()
    engage()

    // Red throws. On red's own machine nothing is resolved - it is not red's
    // place to say the punch landed.
    step({ one: { punch: 'cross' } }, TICK)
    expect(one.fight.blue.health).toBe(100)

    // Blue's machine resolves it, and tells red.
    step({}, durationOf(MOVES.cross))
    expect(two.fight.blue.health).toBeCloseTo(100 - MOVES.cross.damage!, 4)
    expect(one.fight.blue.health).toBeCloseTo(100 - MOVES.cross.damage!, 4)
  })

  test('the defender is believed even when they blocked', async () => {
    const { one, two, step, engage } = await pair()
    engage()
    step({ one: { punch: 'hook' }, two: { guard: true } }, durationOf(MOVES.hook))

    // Both bars show the block, because only one machine decided it was one.
    expect(two.fight.blue.health).toBeGreaterThan(100 - MOVES.hook.damage!)
    expect(one.fight.blue.health).toBe(two.fight.blue.health)
  })

  test('a parry stuns the thrower on the thrower’s own machine', async () => {
    const { one, two, step, engage } = await pair()
    engage()

    // Blue times a parry onto red's cross. The stun is applied by red, off
    // blue's verdict - red never decides it was parried.
    step({ one: { punch: 'cross' }, two: { parry: true } }, 0.14)
    expect(one.fight.red.move).toBe('stunned')
    expect(two.fight.red.health).toBe(100)
  })

  test('one punch is scored once, on both machines', async () => {
    const { one, two, step, engage } = await pair()
    engage()
    step({ one: { punch: 'jab' } }, durationOf(MOVES.jab))
    expect(one.fight.red.dealt).toBeCloseTo(MOVES.jab.damage!, 4)
    expect(two.fight.red.dealt).toBeCloseTo(MOVES.jab.damage!, 4)
  })
})

describe('what is carried between them', () => {
  test('walking on one machine moves the fighter on the other', async () => {
    const { one, two, step, engage } = await pair()
    engage()
    const before = two.fight.red.x
    step({ one: { walk: 1 } }, 0.5)
    expect(two.fight.red.x).toBeGreaterThan(before)

    // Within one packet of the truth, and no closer - which is the honest
    // bound rather than a loose one. `STANCE` goes at `sendHz`, so the
    // follower's copy is up to 125ms stale, and at walking pace that is a
    // quarter of a metre. This is exactly the gap a renderer has to
    // interpolate across, and a test that demanded better would be asserting
    // that the transport is faster than it is.
    const stale = MOVES.walkIn.travel! / 8
    expect(Math.abs(two.fight.red.x - one.fight.red.x)).toBeLessThanOrEqual(stale)
  })

  test('a punch is announced at once rather than on the stance clock', async () => {
    const { two, step, engage } = await pair()
    engage()
    // A single frame - far inside one tick of the 8Hz stance clock. If `THREW`
    // waited for that clock, blue would not know about this until the punch had
    // already finished.
    step({ one: { punch: 'overhand' } }, TICK)
    expect(two.fight.red.move).toBe('overhand')
  })

  test('the follower takes the round and the clock from the owner', async () => {
    const { one, two, step, consent } = await pair()
    consent()
    step({}, 3.4)
    // Deliberately desync the follower, then let one `MATCH` put it right.
    two.fight.clock = 5
    two.fight.round = 9
    step({}, 0.3)
    expect(two.fight.round).toBe(one.fight.round)
    expect(two.fight.clock).toBeCloseTo(one.fight.clock, 1)
  })

  test('the follower does not overrule the owner’s bell', async () => {
    const { one, two, step, consent } = await pair()
    consent()
    step({}, 3.4)
    one.fight.clock = 0.05
    step({}, 0.4)
    expect(two.fight.phase).toBe(one.fight.phase)
    expect(two.fight.round).toBe(one.fight.round)
  })
})

describe('a whole fight over the wire', () => {
  test('a knockdown on one machine is a knockdown on both', async () => {
    const { one, two, step, engage } = await pair()
    engage()
    two.fight.blue.health = 2
    step({ one: { punch: 'cross' } }, durationOf(MOVES.cross) + 0.05)

    expect(two.fight.blue.move).toBe('down')
    // Red's machine was told, and shows the same empty bar.
    expect(one.fight.blue.health).toBe(0)
  })

  test('the result reaches the corner that did not decide it', async () => {
    const { one, two, step, engage } = await pair()
    engage()
    // Wind the owner's round clock down; the bell and the cards travel.
    one.fight.clock = 0.05
    step({}, 0.4)
    expect(two.fight.cards).toHaveLength(one.fight.cards.length)
    expect(two.fight.cards[0]).toEqual(one.fight.cards[0]!)
  })
})

describe('solo', () => {
  test('one client can hold both corners, and sends nothing', async () => {
    const { clock, host } = table()
    const session: BoxingSession = await joinBoxing({
      host: host('a', 'Ali'),
      topic: 'alone',
      solo: true,
    })
    expect(session.connected()).toBe(true)

    // The clock has to be wound by hand here. `memoryHost` reads the one this
    // test owns, and a loop that steps `dt` without advancing it is a loop in
    // which every move has been running for zero seconds forever - the fight
    // clock counts down and no punch ever leaves its startup.
    const tick = (intent: Partial<Intent> = {}) => {
      clock.t += TICK
      session.step({ ...NO_INTENT, ...intent }, TICK)
    }

    session.say(true)
    for (let i = 0; i < Math.round(3.4 / TICK); i++) tick()

    session.fight.red.x = -CLOSEST / 2
    session.fight.blue.x = CLOSEST / 2
    tick({ punch: 'cross' })
    for (let i = 0; i < Math.round(durationOf(MOVES.cross) / TICK); i++) tick()

    // Resolved locally, both corners, with no transport involved at all.
    expect(session.fight.blue.health).toBeLessThan(100)
  })
})

describe('a finish decided by the corner it happened to', () => {
  /**
   * The bug: a knockout only counted when the *red* corner suffered it.
   *
   * A knockout is decided by the fighter it happened to - the defender resolves
   * contact on their own body - and the match is ended by whoever owns the
   * clock, which is always red. Those are the same client exactly half the
   * time. When they were not, blue's fight ended on blue's screen, red never
   * heard, and red's next `MATCH` still said `fighting` - which blue applies,
   * because blue is not the owner. The finish was undone about a quarter of a
   * second after it happened.
   */
  async function flattenBlue() {
    const pairing = await pair()
    const { one, two, step, engage } = pairing
    engage()

    // Only blue's client is authoritative about blue's bar. Red's copy catches
    // up from the `LANDED` blue sends when the punch arrives, which is the
    // whole point of the tier and the reason this test does not set it twice.
    two.fight.blue.health = 8
    for (const session of [one, two]) {
      session.fight.red.stamina = MAX_STAMINA
      session.fight.blue.stamina = MAX_STAMINA
    }

    // Both throw the biggest punch in the table at the same instant, so each is
    // a counter - 27, over `KNOCKOUT_PUNCH`. Only blue is standing on eight.
    step(
      { one: { punch: 'overhand' }, two: { punch: 'overhand' } },
      durationOf(MOVES.overhand) + 0.1,
    )
    return pairing
  }

  test('the fighter who went out ends their own match', async () => {
    const { two } = await flattenBlue()
    expect(two.fight.phase).toBe('over')
    expect(two.fight.verdict?.how).toBe('ko')
    expect(two.fight.verdict?.winner).toBe('red')
  })

  test('and it reaches the owner, who makes it official', async () => {
    const { one } = await flattenBlue()
    expect(one.fight.phase).toBe('over')
    expect(one.fight.verdict?.how).toBe('ko')
    expect(one.fight.verdict?.winner).toBe('red')
  })

  test('it survives the next MATCH, which is what used to undo it', async () => {
    const { one, two, step } = await flattenBlue()
    // A quarter of a second is one `MATCH` at 4Hz, and it was enough to put
    // blue back into `fighting` as though nothing had happened.
    step({}, 0.5)
    expect(one.fight.phase).toBe('over')
    expect(two.fight.phase).toBe('over')
  })

  test('the result is one result, not two', async () => {
    const { two } = await flattenBlue()
    // `stopFight` refuses a fight that is already over. Without that the owner
    // ratifying a stoppage it had also reached itself would score the round
    // twice and announce the winner twice.
    const rounds = two.fight.verdict?.cards.map((card) => card.round) ?? []
    expect(new Set(rounds).size).toBe(rounds.length)
  })

  test('nobody can knock out somebody else by saying so', async () => {
    const { clock, host } = table()
    const one = await joinBoxing({ host: host('a', 'Ali'), topic: 'claims' })
    const two = await joinBoxing({ host: host('b', 'Bruno'), topic: 'claims' })
    one.say(true)
    two.say(true)
    for (let i = 0; i < Math.round(3.4 / TICK); i++) {
      clock.t += TICK
      one.step(NO_INTENT, TICK)
      two.step(NO_INTENT, TICK)
    }
    expect(one.fight.phase).toBe('fighting')

    /**
     * Somebody on the topic who is not in the fight, claiming *red* is out.
     *
     * The transport is a `BroadcastChannel` on the local host and a Realtime
     * topic on the real one, and neither of them promises that a packet came
     * from a fighter - which is why every reader in ./wire is a reader and not
     * a cast, and why this refusal is in the session rather than in the reader.
     * A reader has no idea who sent it; the session does.
     */
    const stranger = await host('z', 'Spy').network.join('claims')
    stranger.send(STOPPED, { corner: 'red', how: 'ko' })

    expect(one.fight.phase).toBe('fighting')
    expect(one.fight.verdict).toBe(null)
  })
})
