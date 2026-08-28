import { describe, expect, test } from 'bun:test'
import {
  createInbox,
  createOutbox,
  GAP_GRACE_MS,
  REPLAY_RING,
  RESEND_INTERVAL_MS,
  type Delivery,
  type ReliableEvent,
  type Sequenced,
} from '@/app/world/_presence/reliable'

/**
 * A channel that loses what you tell it to.
 *
 * The point of the harness rather than of any one assertion: a resend is not
 * a private reply, it is another broadcast, so the same rig has to show both
 * that the client who asked gets its message *and* that the clients who did
 * not ask are undisturbed by the answer.
 */
function link() {
  const out = createOutbox()
  const seen: Delivery<Sequenced>[] = []
  const inbox = createInbox()
  let clock = 0
  /** Sequence numbers the link will swallow on their first pass. */
  const swallow = new Set<number>()
  const wire: Delivery<Sequenced>[] = []
  const sender = 'alice'

  function deliver(held: Delivery<Sequenced>, resent: boolean) {
    if (!resent && held.message.s !== undefined && swallow.has(held.message.s)) return
    const result = inbox.accept(held.event, sender, held.message, clock)
    seen.push(...result.deliver)
    if (result.request) {
      // The sender answers by broadcasting again - so these come back through
      // the same door, and are marked as a resend only so the link does not
      // swallow them a second time.
      for (const again of out.replay(result.request.from, result.request.to)) {
        deliver(again, true)
      }
    }
  }

  return {
    drop(...seqs: number[]) {
      for (const s of seqs) swallow.add(s)
    },
    /** Send, and let the link decide whether it arrives. */
    send(event: ReliableEvent) {
      const stamped = out.stamp<Sequenced>(event, {})
      wire.push({ event, message: stamped })
      deliver({ event, message: stamped }, false)
      return stamped.s as number
    },
    /** Send without delivering, for tests that reorder the arrivals by hand. */
    hold(event: ReliableEvent) {
      const stamped = out.stamp<Sequenced>(event, {})
      return { event, message: stamped } as Delivery<Sequenced>
    },
    arrive(held: Delivery<Sequenced>) {
      deliver(held, true)
    },
    tick(ms: number) {
      clock += ms
      const result = inbox.sweep(clock)
      seen.push(...result.deliver)
      return result
    },
    inbox,
    at: () => clock,
    order: () => seen.map((d) => d.message.s),
    kinds: () => seen.map((d) => d.event),
    count: () => seen.length,
  }
}

describe('a link that loses nothing', () => {
  test('delivers every message once, in order, and asks for nothing', () => {
    const net = link()
    for (let i = 0; i < 10; i++) net.send('room')

    expect(net.order()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(net.tick(GAP_GRACE_MS * 2).request).toBeNull()
  })
})

describe('a dropped message', () => {
  test('is asked for and recovered, without disturbing the order', () => {
    const net = link()
    net.drop(3)
    for (let i = 0; i < 5; i++) net.send('room')

    // 4 arriving is what reveals that 3 never did; the resend puts it back in
    // its place rather than on the end.
    expect(net.order()).toEqual([1, 2, 3, 4, 5])
  })

  test('recovers a whole burst - the shape a reconnect actually has', () => {
    const net = link()
    net.drop(2, 3, 4, 5, 6)
    for (let i = 0; i < 8; i++) net.send('room')

    expect(net.order()).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  test('asks for the range in one request, not one request per hole', () => {
    const inbox = createInbox()
    inbox.accept('room', 'alice', { s: 1 }, 0)
    const result = inbox.accept('room', 'alice', { s: 7 }, 0)

    expect(result.request).toEqual({ u: 'alice', from: 2, to: 6 })
    expect(result.deliver).toHaveLength(0)
  })
})

describe('what arrives out of order', () => {
  test('is delivered in sequence, not in arrival order', () => {
    const net = link()
    const a = net.hold('room')
    const b = net.hold('hit')
    const c = net.hold('room')

    net.arrive(a)
    net.arrive(c)
    net.arrive(b)

    expect(net.order()).toEqual([1, 2, 3])
    expect(net.kinds()).toEqual(['room', 'hit', 'room'])
  })

  test('is not asked for again once the hole has filled', () => {
    const net = link()
    const a = net.hold('room')
    const b = net.hold('room')
    net.arrive(b)
    net.arrive(a)

    expect(net.tick(RESEND_INTERVAL_MS * 4).request).toBeNull()
  })
})

describe('a duplicate', () => {
  test('is dropped, so a resend somebody else asked for is harmless', () => {
    const inbox = createInbox()
    inbox.accept('room', 'alice', { s: 1 }, 0)
    inbox.accept('room', 'alice', { s: 2 }, 0)

    // The same two arriving again, because a bystander asked for them.
    const again = inbox.accept('room', 'alice', { s: 1 }, 10)
    expect(again.deliver).toHaveLength(0)
    expect(again.request).toBeNull()
  })
})

describe('a sender that vanishes mid-gap', () => {
  test('does not wedge everything behind the message it never resent', () => {
    const inbox = createInbox()
    inbox.accept('room', 'alice', { s: 1 }, 0)
    // 2 is lost, and alice has closed the tab, so no resend is ever coming.
    const held = inbox.accept('room', 'alice', { s: 3 }, 0)
    expect(held.deliver).toHaveLength(0)

    // Nothing gives up early.
    expect(inbox.sweep(GAP_GRACE_MS - 1).deliver).toHaveLength(0)

    const gave = inbox.sweep(GAP_GRACE_MS + 1)
    expect(gave.deliver.map((d) => d.message.s)).toEqual([3])
    expect(gave.skipped).toBe(1)
  })

  test('counts every message it wrote off, rather than losing them quietly', () => {
    const inbox = createInbox()
    inbox.accept('room', 'alice', { s: 1 }, 0)
    inbox.accept('room', 'alice', { s: 9 }, 0)

    expect(inbox.sweep(GAP_GRACE_MS + 1).skipped).toBe(7)
  })

  test('starts the next hole’s clock fresh, not part-elapsed', () => {
    const inbox = createInbox()
    inbox.accept('room', 'alice', { s: 1 }, 0)
    // Two holes: 2 is missing, and so is 4.
    inbox.accept('room', 'alice', { s: 3 }, 0)
    inbox.accept('room', 'alice', { s: 5 }, 0)

    const first = inbox.sweep(GAP_GRACE_MS + 1)
    expect(first.deliver.map((d) => d.message.s)).toEqual([3])

    // 5 must not fall out on the same tick just because time had passed while
    // the *previous* hole was open.
    expect(inbox.sweep(GAP_GRACE_MS + 2).deliver).toHaveLength(0)
    expect(
      inbox.sweep(GAP_GRACE_MS * 2 + 2).deliver.map((d) => d.message.s),
    ).toEqual([5])
  })
})

describe('one sequence space across the event kinds', () => {
  test('notices a lost hit addressed to somebody else', () => {
    // The whole reason the kinds share a counter. This client is not the target
    // of the hit and would never act on it - but if it does not *count* it, the
    // `room` that follows looks contiguous, and the world swap goes missing.
    const net = link()
    net.drop(2) // a hit, aimed at a third party
    net.send('room')
    net.send('hit')
    net.send('room')

    expect(net.kinds()).toEqual(['room', 'hit', 'room'])
    expect(net.order()).toEqual([1, 2, 3])
  })
})

describe('a client from before this shipped', () => {
  test('is delivered straight through rather than treated as a hole', () => {
    const inbox = createInbox()
    const result = inbox.accept('room', 'legacy', {}, 0)

    expect(result.deliver).toHaveLength(1)
    expect(result.request).toBeNull()
    expect(inbox.sweep(GAP_GRACE_MS * 2).skipped).toBe(0)
  })
})

describe('joining a room already in progress', () => {
  test('adopts the sender’s counter instead of asking for its history', () => {
    const inbox = createInbox()
    // Alice has been in the lounge for an hour; her first message we ever see
    // is her four hundredth.
    const result = inbox.accept('room', 'alice', { s: 400 }, 0)

    expect(result.deliver).toHaveLength(1)
    expect(result.request).toBeNull()
  })
})

describe('a peer that leaves', () => {
  test('stops being expected, so their hole never counts against anyone', () => {
    const inbox = createInbox()
    inbox.accept('room', 'alice', { s: 1 }, 0)
    inbox.accept('room', 'alice', { s: 5 }, 0)
    inbox.keep(new Set(['bob']))

    const swept = inbox.sweep(GAP_GRACE_MS + 1)
    expect(swept.deliver).toHaveLength(0)
    expect(swept.skipped).toBe(0)
  })

  test('and comes back on a fresh counter, which is not read as duplicates', () => {
    const inbox = createInbox()
    inbox.accept('room', 'alice', { s: 40 }, 0)
    inbox.keep(new Set())

    // A reload restarts her at one. Without the prune this is 1 < 41, dropped.
    expect(inbox.accept('room', 'alice', { s: 1 }, 0).deliver).toHaveLength(1)
  })

  test('leaves the senders who stayed alone', () => {
    const inbox = createInbox()
    inbox.accept('room', 'alice', { s: 1 }, 0)
    inbox.keep(new Set(['alice']))

    // Still expecting 2, so 2 lands in sequence rather than being adopted.
    expect(inbox.accept('room', 'alice', { s: 3 }, 0).request).toEqual({
      u: 'alice',
      from: 2,
      to: 2,
    })
  })
})

describe('the replay ring', () => {
  test('answers what it still holds and no more', () => {
    const out = createOutbox()
    for (let i = 0; i < REPLAY_RING + 10; i++) out.stamp('room', {})

    // 1..10 have rolled off; asking for them is not an error, it is a short
    // answer, and the receiver’s grace timer covers the difference.
    expect(out.replay(1, 10)).toHaveLength(0)
    expect(out.replay(1, REPLAY_RING + 10)).toHaveLength(REPLAY_RING)
  })

  test('replays in order, with the kind each message was sent as', () => {
    const out = createOutbox()
    out.stamp('room', {})
    out.stamp('hit', {})
    out.stamp('ball-reset', {})

    expect(out.replay(1, 3).map((d) => d.event)).toEqual([
      'room',
      'hit',
      'ball-reset',
    ])
  })
})

/**
 * The bug this half of the module was extended for.
 *
 * A counter belongs to an outbox and an outbox belongs to a mount, so "the same
 * person" is not the same stream - and reading a fresh run of one-two-three as
 * duplicates of the last one is a silent, permanent, one-directional loss. In
 * the room it looked like one player's charges landing with a hit mark and
 * taking nothing off anybody.
 */
describe('a sender that starts counting again', () => {
  test('is adopted rather than read as duplicates', () => {
    const inbox = createInbox()
    const before = createOutbox('tab-one')

    for (let at = 0; at < 5; at++) {
      inbox.accept('hit', 'alice', before.stamp<Sequenced>('hit', {}), 0)
    }

    // The same person, a new mount: a new outbox at one, and the connection
    // that says so.
    const after = createOutbox('tab-two')
    const first = inbox.accept('hit', 'alice', after.stamp<Sequenced>('hit', {}), 0)

    expect(first.deliver).toHaveLength(1)
    expect(first.request).toBeNull()
    expect(first.skipped).toBe(0)

    // And keeps going, rather than landing once and then falling behind again.
    expect(
      inbox.accept('hit', 'alice', after.stamp<Sequenced>('hit', {}), 0).deliver,
    ).toHaveLength(1)
  })

  test('is still one stream per person when nobody says which tab', () => {
    const inbox = createInbox()
    const before = createOutbox()
    for (let at = 0; at < 5; at++) {
      inbox.accept('hit', 'alice', before.stamp<Sequenced>('hit', {}), 0)
    }

    // Unchanged old behaviour, deliberately: a client that has not reloaded
    // since this shipped sends no `c`, and inventing a stream per message
    // would be worse than the duplicate rule it has always had.
    const after = createOutbox()
    expect(
      inbox.accept('hit', 'alice', after.stamp<Sequenced>('hit', {}), 0).deliver,
    ).toHaveLength(0)
  })

  test('does not disturb the other tab of the same person', () => {
    const inbox = createInbox()
    const one = createOutbox('tab-one')
    const two = createOutbox('tab-two')

    // Interleaved, which is exactly what two tabs of one person produce and
    // what a single per-person slot turns into a run of holes and duplicates.
    expect(inbox.accept('hit', 'alice', one.stamp<Sequenced>('hit', {}), 0).deliver).toHaveLength(1)
    expect(inbox.accept('hit', 'alice', two.stamp<Sequenced>('hit', {}), 0).deliver).toHaveLength(1)
    expect(inbox.accept('hit', 'alice', one.stamp<Sequenced>('hit', {}), 0).deliver).toHaveLength(1)
    expect(inbox.accept('hit', 'alice', two.stamp<Sequenced>('hit', {}), 0).deliver).toHaveLength(1)
  })

  test('asks the tab with the hole, not the person', () => {
    const inbox = createInbox()
    const out = createOutbox('tab-one')
    inbox.accept('room', 'alice', out.stamp<Sequenced>('room', {}), 0)

    out.stamp('room', {}) // lost on the way
    const held = out.stamp<Sequenced>('room', {})

    expect(inbox.accept('room', 'alice', held, 0).request).toEqual({
      u: 'alice',
      c: 'tab-one',
      from: 2,
      to: 2,
    })
  })

  test('is pruned by the connection it is filed under', () => {
    const inbox = createInbox()
    const out = createOutbox('tab-one')
    inbox.accept('room', 'alice', out.stamp<Sequenced>('room', {}), 0)

    // A roster of people alone would drop the stream on every sync. The scene
    // passes connections *and* people - see the `keep` call in multiplayer.
    inbox.keep(new Set(['alice', 'tab-one']))
    expect(inbox.accept('room', 'alice', { s: 3, c: 'tab-one' }, 0).request).toEqual({
      u: 'alice',
      c: 'tab-one',
      from: 2,
      to: 2,
    })

    inbox.keep(new Set(['alice']))
    // Forgotten, so the next thing it says is adopted rather than held.
    expect(
      inbox.accept('room', 'alice', { s: 9, c: 'tab-one' }, 0).deliver,
    ).toHaveLength(1)
  })
})
