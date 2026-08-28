import { describe, expect, test } from 'bun:test'
import {
  adopt,
  arrivals,
  claimFor,
  greeting,
  readClaim,
  winner,
  type SceneClaim,
} from './room-scene'

/**
 * A room agreeing on which level it is in, with nobody in charge.
 *
 * Two laptops in a room cannot be put inside `bun test`, and every bug in this
 * file looks like "multiplayer is flaky" from the outside - somebody left behind
 * in an empty level, a room that quietly becomes two rooms, a loading screen
 * that fires because a peer re-announced where you already are. All of it is
 * decidable from pure values, which is the only reason any of it is checkable.
 */

const claim = (scene: string, at: number): SceneClaim => ({ scene, at })

describe('walking through a door', () => {
  test('the first door is claim one', () => {
    expect(claimFor(null, 'next-room')).toEqual({ scene: 'next-room', at: 1 })
  })

  test('and each one after raises the counter', () => {
    /**
     * A counter, not a timestamp. Two browsers disagree about what time it is by
     * anything up to minutes - `./presence` refuses to trust a sender's clock for
     * exactly this reason - so "newest wall time wins" is a room decided by
     * whoever's laptop is furthest ahead.
     */
    expect(claimFor(claim('a', 4), 'b')).toEqual({ scene: 'b', at: 5 })
  })

  test('it carries the name, not the resolved target', () => {
    /**
     * So every client runs `resolveScene` against its *own* document. Sending
     * the resolved URL would let one client's `scenes` table decide where
     * everybody else fetches from — the same shape as trusting a peer's clock,
     * and worse, because it is a URL.
     */
    expect(claimFor(null, 'next-room').scene).toBe('next-room')
  })
})

describe('a claim off the wire', () => {
  test('a well-formed one is read', () => {
    expect(readClaim({ scene: 'a', at: 2 })).toEqual({ scene: 'a', at: 2 })
  })

  test('anything else is refused rather than coerced', () => {
    /**
     * Peers are not trusted input. This arrives from another browser, which may
     * be running a different version of this code, a modified one, or something
     * that is not this code at all - the same argument `./scenes` makes for
     * parsing a fetched document instead of believing it.
     */
    for (const bad of [
      null,
      undefined,
      'next-room',
      42,
      {},
      { scene: 'a' },
      { at: 1 },
      { scene: '', at: 1 },
      { scene: 'a', at: '2' },
      { scene: 'a', at: -1 },
      { scene: 'a', at: Number.NaN },
      { scene: 'a', at: Number.POSITIVE_INFINITY },
    ]) {
      expect({ bad, read: readClaim(bad) }).toEqual({ bad, read: null })
    }
  })

  test('extra fields are ignored, not rejected', () => {
    // A peer on a newer version may send more than we know about, and refusing
    // it would make a room stop working the moment half of it updated.
    expect(readClaim({ scene: 'a', at: 1, andSomethingElse: true })).toEqual({ scene: 'a', at: 1 })
  })
})

describe('which claim wins', () => {
  test('a higher counter', () => {
    expect(winner(claim('a', 1), claim('b', 2))).toEqual(claim('b', 2))
  })

  test('and a lower one is ignored, so a late message cannot drag a room back', () => {
    /**
     * The wire has no ordering guarantee any more than it has a delivery one. An
     * old claim arriving after a newer one is normal, and adopting it would walk
     * everybody back through a door they had already left.
     */
    expect(winner(claim('b', 5), claim('a', 2))).toEqual(claim('b', 5))
  })

  test('two doors on one frame do not split the room', () => {
    /**
     * The failure this file exists to prevent, and the one that cannot be
     * repaired afterwards. Both clients are at counter 4; if each keeps its own,
     * the room is permanently two rooms, and no later message reconciles them
     * because every subsequent claim is compared against a different history.
     *
     * Asserted from *both sides*: the whole point is that the two clients reach
     * the same answer without exchanging anything to decide it.
     */
    const mine = claim('yellow-door', 4)
    const theirs = claim('blue-door', 4)
    expect(winner(mine, theirs)).toEqual(theirs)
    expect(winner(theirs, mine)).toEqual(theirs)
  })

  test('the tie-break is a plain comparison, not a locale-aware one', () => {
    /**
     * `localeCompare` is a comparison two browsers can disagree about, which is
     * precisely the property this must not have. Checked with a pair that some
     * locales order differently from code-point order.
     */
    const a = claim('a-door', 3)
    const z = claim('Z-door', 3)
    // 'Z' < 'a' by code point. If this ever flips, the room splits on a machine
    // whose collation says otherwise.
    expect(winner(a, z)).toEqual(z)
    expect(winner(z, a)).toEqual(z)
  })

  test('anything beats nothing', () => {
    expect(winner(null, claim('a', 1))).toEqual(claim('a', 1))
  })

  test('and it is stable: the same pair always gives the same answer', () => {
    // Total and deterministic is the whole requirement. A room converges because
    // every client computes the same winner, with no message sent to agree.
    const pairs: [SceneClaim, SceneClaim][] = [
      [claim('a', 1), claim('b', 1)],
      [claim('b', 2), claim('a', 3)],
      [claim('same', 7), claim('same', 7)],
    ]
    for (const [x, y] of pairs) {
      expect(winner(x, y)).toEqual(winner(y, x))
    }
  })
})

describe('adopting one', () => {
  test('a new level is a change worth acting on', () => {
    expect(adopt(claim('a', 1), { scene: 'b', at: 2 })).toEqual({
      claim: claim('b', 2),
      changed: true,
    })
  })

  test('being told where you already are is not', () => {
    /**
     * The reason `adopt` exists beside `winner`. Fetching a document and
     * swapping a level is expensive and visible, and doing it because a peer
     * re-announced the level you are standing in is a loading screen for
     * nothing - which is exactly what the greeting below causes, repeatedly, in
     * a room people keep joining.
     */
    expect(adopt(claim('a', 3), { scene: 'a', at: 3 })).toEqual({
      claim: claim('a', 3),
      changed: false,
    })
  })

  test('a stale claim changes nothing either', () => {
    expect(adopt(claim('b', 5), { scene: 'a', at: 1 })).toEqual({
      claim: claim('b', 5),
      changed: false,
    })
  })

  test('rubbish is null, which is different from "no change"', () => {
    // A caller may want to count these; conflating "a peer sent nonsense" with
    // "a peer told me something I knew" would hide a version mismatch entirely.
    expect(adopt(claim('a', 1), 'nonsense')).toBeNull()
  })

  test('arriving with nothing, the first claim is a change', () => {
    expect(adopt(null, { scene: 'a', at: 1 })).toEqual({ claim: claim('a', 1), changed: true })
  })
})

describe('telling a newcomer where the room is', () => {
  test('a room that has been through a door says so', () => {
    expect(greeting(claim('a', 2))).toEqual(claim('a', 2))
  })

  test('and a room that has not says nothing at all', () => {
    /**
     * Nearly every room. Announcing "we are on the level you already loaded" is
     * a message that changes nothing, sent by everybody present, every time
     * anybody joins.
     */
    expect(greeting(null)).toBeNull()
    expect(greeting(claim('a', 0))).toBeNull()
  })

  test('several answers converge rather than fight', () => {
    /**
     * The repair for "no delivery guarantee". A newcomer hears from everybody
     * present at once, and because `winner` is total and deterministic it lands
     * where the room is regardless of what order the answers arrive in.
     */
    const answers = [claim('a', 3), claim('b', 7), claim('c', 5)]
    const forwards = answers.reduce<SceneClaim | null>((held, one) => winner(held, one), null)
    const backwards = [...answers]
      .reverse()
      .reduce<SceneClaim | null>((held, one) => winner(held, one), null)
    expect(forwards).toEqual(claim('b', 7))
    expect(backwards).toEqual(claim('b', 7))
  })

  test('and a client that missed the broadcast catches up on the next join', () => {
    /**
     * End to end, in the shape the bug takes: somebody's `send` was dropped, so
     * they are still on the old level while everybody else moved. They are not
     * stuck - the next person through the door is greeted by the room, and the
     * left-behind client hears that greeting too.
     */
    let missed: SceneClaim | null = null
    const room = claim('the-vault', 4)
    const heard = adopt(missed, greeting(room))
    expect(heard?.changed).toBe(true)
    missed = heard?.claim ?? null
    expect(missed).toEqual(room)
  })
})

describe('who has just arrived', () => {
  test('somebody new is an arrival', () => {
    expect(arrivals(['ada', 'grace'], new Set(['ada']))).toEqual(['grace'])
  })

  test('a room that has not changed has none', () => {
    expect(arrivals(['ada', 'grace'], new Set(['ada', 'grace']))).toEqual([])
  })

  test('one leaving and one joining is still an arrival', () => {
    /**
     * The bug this replaced, and the reason it is a set difference rather than
     * a count. The first version compared `present.length` against the last
     * one - and here that is 2 before and 2 after, so no greeting was sent and
     * Grace stood in her own copy of the level while the room was elsewhere.
     *
     * It only happens when two things occur between renders, which is exactly
     * the sort of case that survives a hand test and appears in a busy room.
     */
    const before = ['ada', 'alan']
    const after = ['ada', 'grace']
    expect(after.length).toBe(before.length)
    expect(arrivals(after, new Set(before))).toEqual(['grace'])
  })

  test('somebody who leaves entirely is not an arrival', () => {
    expect(arrivals(['ada'], new Set(['ada', 'alan']))).toEqual([])
  })

  test('and somebody who comes back is greeted again', () => {
    /**
     * Deliberate. They have been away, and the room may have gone through a
     * door while they were - so their document is as stale as a stranger's.
     */
    expect(arrivals(['ada', 'alan'], new Set(['ada']))).toEqual(['alan'])
  })

  test('an empty room has nobody to greet', () => {
    expect(arrivals([], new Set(['ada']))).toEqual([])
  })
})
