import { describe, expect, test } from 'bun:test'
import { PLAYER_ID, type Effect } from '@kxb/xp/engine'
import { collectSaying, type SayingSources } from '@/app/xp/_runtime/net/saying'

/**
 * The first test this logic has ever had.
 *
 * It lived inside a 1,745-line `useFrame` in ./simulation, which is to say it
 * could only be exercised by loading a level in a browser with a second browser
 * beside it - see the `play-xp-with-two-browsers` note. Everything below runs
 * in a millisecond and would have caught a real regression in the wire split.
 */

const NOTHING: SayingSources = {
  fromPeers: [],
  revives: 0,
  toldUnstick: 0,
  ballBackAt: undefined,
  toldBallBack: 0,
  effects: [],
}

const emit = (event: string, from = 1, script?: true): Effect =>
  script ? { kind: 'emit', event, from, script } : { kind: 'emit', event, from }

describe('a quiet frame', () => {
  test('says nothing and moves no counter', () => {
    expect(collectSaying(NOTHING)).toEqual({
      saying: [],
      outgoing: [],
      toldUnstick: 0,
      toldBallBack: 0,
    })
  })

  test('ignores effects that are not emits', () => {
    const effects: Effect[] = [{ kind: 'score', amount: 1, by: null }]
    const out = collectSaying({ ...NOTHING, effects })
    expect(out.saying).toEqual([])
    expect(out.outgoing).toEqual([])
  })
})

/**
 * The split that is the whole reason there are two lists.
 *
 * A script's emit has already happened on every client, because a script runs
 * on all of them from the same inputs. Sending it would fire every listener
 * twice. A rule's has not. Getting this backwards is a double-scoring bug that
 * only appears with two people in the room.
 */
describe('what goes on the wire', () => {
  test('a rule emit is heard locally and sent', () => {
    const out = collectSaying({ ...NOTHING, effects: [emit('gate-open')] })
    expect(out.saying).toEqual([{ event: 'gate-open', from: 1 }])
    expect(out.outgoing).toEqual([{ event: 'gate-open', from: 1 }])
  })

  test('a script emit is heard locally and NOT sent', () => {
    const out = collectSaying({ ...NOTHING, effects: [emit('tick', 1, true)] })
    expect(out.saying).toEqual([{ event: 'tick', from: 1 }])
    expect(out.outgoing).toEqual([])
  })

  test('a mixed frame sends only the rule half', () => {
    const out = collectSaying({
      ...NOTHING,
      effects: [emit('a', 1), emit('b', 2, true), emit('c', 3)],
    })
    expect(out.saying.map((s) => s.event)).toEqual(['a', 'b', 'c'])
    expect(out.outgoing.map((s) => s.event)).toEqual(['a', 'c'])
  })
})

/**
 * What a peer said is heard, and never echoed.
 *
 * Sending it back is how a two-client room turns one `gate-open` into an
 * infinite one.
 */
describe('what peers said', () => {
  test('is heard locally but never returned to the room', () => {
    const out = collectSaying({ ...NOTHING, fromPeers: [{ event: 'gate-open', from: 7 }] })
    expect(out.saying).toEqual([{ event: 'gate-open', from: 7 }])
    expect(out.outgoing).toEqual([])
  })

  test('comes before this frame’s own emits', () => {
    const out = collectSaying({
      ...NOTHING,
      fromPeers: [{ event: 'theirs', from: 7 }],
      effects: [emit('ours')],
    })
    expect(out.saying.map((s) => s.event)).toEqual(['theirs', 'ours'])
  })

  test('the caller’s queue is not mutated', () => {
    const fromPeers = [{ event: 'gate-open', from: 7 }]
    const out = collectSaying({ ...NOTHING, fromPeers })
    out.saying.push({ event: 'nope', from: 0 })
    expect(fromPeers).toEqual([{ event: 'gate-open', from: 7 }])
  })
})

/**
 * The two buttons, which are counters rather than states.
 *
 * The reason is `samePlace` in ./spawn: pressing unstick twice from the same
 * spot has to do the thing twice, and any value describing *where* would equal
 * itself and fire once.
 */
describe('the unstick button', () => {
  test('a first press is heard, and from the player', () => {
    const out = collectSaying({ ...NOTHING, revives: 1 })
    expect(out.saying).toEqual([{ event: 'unstuck', from: PLAYER_ID }])
    expect(out.toldUnstick).toBe(1)
  })

  test('the same press is not heard twice', () => {
    const out = collectSaying({ ...NOTHING, revives: 1, toldUnstick: 1 })
    expect(out.saying).toEqual([])
  })

  test('a second press from the same spot is heard again', () => {
    const out = collectSaying({ ...NOTHING, revives: 2, toldUnstick: 1 })
    expect(out.saying).toEqual([{ event: 'unstuck', from: PLAYER_ID }])
    expect(out.toldUnstick).toBe(2)
  })

  /**
   * Catching up to a counter that never fired is not an event.
   *
   * `revives` starts at 0 and `toldUnstick` starts at 0, so this is only
   * reachable if something resets one - but a reset that announced an unstick
   * nobody asked for would strand a level on load.
   */
  test('does not fire when catching up to zero', () => {
    const out = collectSaying({ ...NOTHING, revives: 0, toldUnstick: 3 })
    expect(out.saying).toEqual([])
    expect(out.toldUnstick).toBe(0)
  })

  test('is never sent to the room', () => {
    expect(collectSaying({ ...NOTHING, revives: 1 }).outgoing).toEqual([])
  })
})

describe('the ball button', () => {
  test('an absent count reads as never asked', () => {
    const out = collectSaying({ ...NOTHING, ballBackAt: undefined, toldBallBack: 0 })
    expect(out.saying).toEqual([])
  })

  test('a first press is heard, and is its own event', () => {
    const out = collectSaying({ ...NOTHING, ballBackAt: 1 })
    expect(out.saying).toEqual([{ event: 'ball back', from: PLAYER_ID }])
    expect(out.toldBallBack).toBe(1)
  })

  test('the same press is not heard twice', () => {
    expect(collectSaying({ ...NOTHING, ballBackAt: 1, toldBallBack: 1 }).saying).toEqual([])
  })

  test('both buttons in one frame are both heard', () => {
    const out = collectSaying({ ...NOTHING, revives: 1, ballBackAt: 1 })
    expect(out.saying.map((s) => s.event)).toEqual(['unstuck', 'ball back'])
  })
})
