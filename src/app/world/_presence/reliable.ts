/**
 * Getting the things that happen *once* to everybody, over a channel that
 * sometimes eats one.
 *
 * ---------------------------------------------------------------------------
 * The bug this is for
 * ---------------------------------------------------------------------------
 * Most of what the lounge broadcasts is self-healing, and deliberately so. A
 * `move` is a fact about where a body *is*, so the next one at `SEND_HZ`
 * corrects whatever the last one missed, and `KEEPALIVE_MS` covers standing
 * still. The ball is restated by its owner once a second even at rest. Losing
 * one of those costs an eighth of a second of staleness and nothing else.
 *
 * The rest are facts about what *happened*, once, and they have no next packet:
 *
 *   - `room` - the mode flipped, or the world was replaced wholesale. Miss it
 *     and you go on building in a battle-mode lounge, or you are left holding a
 *     block map for a world that no longer exists. That reads to the person it
 *     happens to as "it went empty and never came back", and it is the single
 *     most visible way this room breaks.
 *   - `hit` and `push` - somebody swung at you. Miss it and the attacker saw a
 *     hit that never landed, and the two of you now disagree about your health
 *     and your position for the rest of the round.
 *   - `ball-reset` - the ball went back to the middle for everyone except you.
 *
 * Watching two clients diverge, the cause was never that they simulated the
 * same input differently. It was that one of them never heard the input. That
 * is what this fixes, and it is worth being clear that it fixes *only* that.
 *
 * ---------------------------------------------------------------------------
 * How a WebSocket loses a message
 * ---------------------------------------------------------------------------
 * Not the way a datagram does. Realtime rides one TCP connection, so packets
 * are not independently and uniformly dropped, and building for that would be
 * building for the wrong failure. There are exactly two ways to miss one:
 *
 * **The socket went away and came back.** A tab sleeps, a phone changes
 * network, the server recycles. Everything broadcast in that window happened to
 * a room you were not attached to, and resubscribing does not replay it.
 *
 * **The tenant went over its ceiling.** Broadcasts above the per-second limit
 * are dropped rather than queued, and room traffic grows with the *square* of
 * the room, so the busiest moment is exactly the moment a `room` flip is most
 * likely to be the thing dropped.
 *
 * Both are **bursty** - a contiguous run of messages, not one here and one
 * there. So the ring below is sized to cover a run, and the receiver asks for a
 * *range* rather than sending one request per missing message.
 *
 * ---------------------------------------------------------------------------
 * The design, and the one thing it refuses to do
 * ---------------------------------------------------------------------------
 * Every sender stamps its reliable broadcasts with a counter, `s`, from a
 * single sequence space shared by all four event kinds. One space rather than
 * one per kind is the decision that makes gap detection work at all: a `hit`
 * addressed to somebody else is a message this client will never act on, but it
 * still has to be *counted*, or its loss is invisible and the next `room` looks
 * contiguous when it is not. That is why sequencing sits below the addressee
 * filter and not above it - see the wiring in `multiplayer.tsx`.
 *
 * A receiver holds the next `s` it expects from each sender. Ahead of that goes
 * in a holding pen and provokes a resend request; behind it is a duplicate and
 * is dropped; equal is delivered, and then the pen is drained of whatever now
 * follows on.
 *
 * **A sequence belongs to a client session, not to a person**, and every message
 * says which one it is - `c`, the same connection id presence carries and the
 * ball already puts on the wire. That is not tidiness, it is the difference
 * between working and silently not: a counter starts at one for each fresh
 * `<Multiplayer>`, and a receiver still expecting the number the *previous*
 * mount was on reads everything the new one says as behind the mark - which is
 * to say as a duplicate, and drops it. For the rest of the session. What that
 * looks like from inside the room is one player's charges landing on their own
 * screen with a hit mark and taking nothing off anybody, in one direction only,
 * for no reason anybody can see. Keyed by connection, a restarted counter is
 * simply a sender nobody has heard from yet, and it is adopted like any other.
 *
 * It is the same fix, for the same reason, that `BallMessage.c` is: two tabs of
 * one person share a user id, so anything keyed on the person alone has two
 * authors writing into one slot.
 *
 * The refusal: **a gap is never held open forever.** If the sender has gone -
 * and the commonest reason a message never arrives is that the person who would
 * resend it closed the tab - then blocking on it would mean every later
 * message from them is stuck behind a message that no longer exists anywhere.
 * That turns a lost emote into a permanently frozen peer, which is worse than
 * the loss. So after `GAP_GRACE_MS` the pen is drained past the hole and the
 * skip is counted. Reliable here means "asked for twice and waited a second",
 * not "guaranteed", and the caller is told how many it gave up on so the thing
 * is measurable instead of merely hoped for.
 *
 * Pure, and free of Supabase and of React, for the reason `presence-core` and
 * `peer-motion` are: the interesting cases are reordering, duplication and a
 * sender vanishing mid-gap, and none of those are things anybody can stage by
 * hand with two browsers open.
 */

/**
 * The event names that travel reliably.
 *
 * A closed set rather than "anything the caller passes", because the cost of
 * being wrong in each direction is not symmetric. Adding `move` here would put
 * eight messages a second per person into a replay ring for no benefit, since
 * the next one already corrects it. Leaving `room` out is the bug at the top of
 * this file.
 *
 * `emote` and `chat` are deliberately absent. A face lives three seconds and is
 * never written down, so a resent one is a face pulled at the wrong moment
 * rather than a face restored; and a chat line is stored server-side before it
 * is broadcast, so the recovery for a missed one is a refetch, not a replay.
 */
export const RELIABLE_EVENTS = ['room', 'hit', 'push', 'ball-reset'] as const

export type ReliableEvent = (typeof RELIABLE_EVENTS)[number]

/** The event a receiver sends back to ask for what it missed. */
export const RESEND_EVENT = 'resend'

/**
 * How many sent messages a sender can still replay.
 *
 * Sized for a burst rather than for a single drop, per the loss modes above. At
 * the rate these four events actually fire - a mode flip, a swing, a kick -
 * sixty-four is minutes of history, and the memory is four dozen small objects.
 * The ring is per sender and per channel, so it does not grow with room size.
 */
export const REPLAY_RING = 64

/**
 * How long a hole stays open before the stream moves on without it.
 *
 * A second is long enough to cover a resend round trip on a bad mobile link
 * twice over, and short enough that a peer who is genuinely gone does not hold
 * everything behind them for a length of time anybody would notice.
 */
export const GAP_GRACE_MS = 1000

/** How long to wait between asking again for the same hole. */
export const RESEND_INTERVAL_MS = 250

/**
 * A message that carries its place in its sender's sequence.
 *
 * Who sent it is *not* a field here, and is passed to `accept` separately. The
 * four payloads do not agree on where that id lives - a `room` names its sender
 * `u`, a `hit` names it `f`, because from the receiver's side those mean
 * different things - and the alternative to one argument is either a second
 * copy of the id on the wire or a module that knows all four shapes. Neither is
 * worth it to save passing a string.
 *
 * `s` is optional, and that is not defensiveness. A client that has not
 * reloaded since this shipped sends none, and the honest reading of a message
 * with no sequence is "the old behaviour": deliver it straight away and do not
 * pretend to know whether anything came before it. Same bargain `t` struck in
 * `peer-motion`, and for the same reason - a mixed room during a rollout is the
 * normal case, not the edge one.
 *
 * `c` is optional on the same terms, and falling back to the user id is exactly
 * the old behaviour: one slot per person, which is right until that person is
 * two mounts or two tabs.
 */
export interface Sequenced {
  /** Where it sits in its sender's sequence. Absent from pre-rollout clients. */
  s?: number
  /**
   * Which client session that sequence belongs to.
   *
   * The counter restarts at one with every fresh outbox, so the id of the thing
   * holding the outbox is what makes two runs of the same numbers tellable
   * apart. Absent from pre-rollout clients, who get one slot per user id.
   */
  c?: string
}

/** "I am missing `from`..`to` of yours, inclusive." */
export interface ResendRequest {
  /** Whose sequence the hole is in. Only that sender answers. */
  u: string
  /**
   * And which of their client sessions, where the hole is in one that said.
   *
   * A person with two tabs open would otherwise have both replay their own
   * unrelated history at a request meant for one of them - and the second
   * tab's numbers are a different sequence, so its answer is noise that lands
   * in the pen and stays there.
   */
  c?: string
  from: number
  to: number
}

/** One message on its way back out of the inbox, with the kind it arrived as. */
export interface Delivery<T extends Sequenced = Sequenced> {
  event: ReliableEvent
  message: T
}

/** What an `accept` or a `sweep` produced. */
export interface InboxResult<T extends Sequenced = Sequenced> {
  /** In sequence order, ready to hand to the handlers. Often empty. */
  deliver: Delivery<T>[]
  /** Ask the channel for this, if it is not null. */
  request: ResendRequest | null
  /** How many were given up on in this step. Normally zero. */
  skipped: number
}

interface Pending<T extends Sequenced> {
  /** Whose it is. Kept because a resend request has to name the person. */
  u: string
  /** The next `s` we expect from this sender. */
  expect: number
  /** Arrived early, keyed by `s`. */
  pen: Map<number, Delivery<T>>
  /**
   * When the current hole opened, by the caller's clock. `null` for no hole.
   *
   * Null rather than zero, and the same for `askedAt`, because zero is a
   * perfectly good reading of the clock this is handed - `performance.now()` is
   * zero at page load, and a test drives it from zero by choice. Overloading it
   * to mean "never" makes the grace timer refuse to start and the first resend
   * request refuse to go out, in exactly the first moments of a session.
   */
  gapSince: number | null
  /** When we last asked about it. `null` for never. */
  askedAt: number | null
}

/**
 * The sending half: stamps outgoing messages and remembers them.
 */
export interface Outbox {
  /**
   * Stamp a payload with the next sequence number and file it for replay.
   *
   * Returns the payload to actually send. Mutating nothing the caller passed,
   * because these are built inline at the send site and shared with nobody.
   *
   * The connection the outbox was made with rides along, because the number on
   * its own does not say which run of one-two-three this is. See `Sequenced.c`.
   */
  stamp<T extends Sequenced>(event: ReliableEvent, message: T): T
  /**
   * What we still hold for `from`..`to`, in order.
   *
   * Short of the full range when the ring has rolled past it, which is the
   * honest answer - the receiver's grace timer is what covers the rest.
   */
  replay(from: number, to: number): Delivery[]
}

/**
 * @param conn This client session's id - the same one presence carries. Omitted
 *   only by callers with nothing to identify themselves by, who then get the
 *   old per-person behaviour at the far end.
 */
export function createOutbox(conn?: string): Outbox {
  let next = 1
  // Insertion-ordered and pruned from the front, so the ring is a Map rather
  // than an array with an index to keep straight.
  const sent = new Map<number, Delivery>()

  return {
    stamp<T extends Sequenced>(event: ReliableEvent, message: T): T {
      const s = next++
      const stamped = conn ? { ...message, s, c: conn } : { ...message, s }
      sent.set(s, { event, message: stamped })
      if (sent.size > REPLAY_RING) {
        const oldest = sent.keys().next()
        if (!oldest.done) sent.delete(oldest.value)
      }
      return stamped
    },

    replay(from, to) {
      const out: Delivery[] = []
      // Bounded by the ring rather than by the range, so a request for
      // 1..1000000 - which is either a bug or somebody poking the channel -
      // costs a walk of sixty-four and not a million.
      for (const [s, held] of sent) {
        if (s >= from && s <= to) out.push(held)
      }
      return out
    },
  }
}

/**
 * The receiving half: orders what arrives, and notices what did not.
 */
export interface Inbox<T extends Sequenced = Sequenced> {
  /** Take one message off the channel. `from` is whoever sent it. */
  accept(event: ReliableEvent, from: string, message: T, now: number): InboxResult<T>
  /**
   * Give the open holes another moment's thought.
   *
   * Called on a timer as well as on arrival, because the case that matters
   * most - a sender who has gone quiet or gone entirely - produces no further
   * arrivals to drive the timer from.
   */
  sweep(now: number): InboxResult<T>
  /**
   * Keep only the senders still in the room, and drop the rest.
   *
   * A roster rather than a departure, because that is the shape presence
   * actually hands you - a list of who is here now - and pruning to it is how
   * every other per-peer map in the lounge is kept honest.
   *
   * Not merely tidying: a peer who has left will never answer a resend, so
   * their last hole would otherwise sit open for its full grace period and then
   * be counted as loss the network did not cause.
   *
   * `present` is a set of *keys*, not of people - connection ids for anybody
   * whose messages carry one, user ids for anybody whose do not - because that
   * is what the streams are filed under. Passing a roster of user ids would
   * throw away every connection-keyed stream on the first sync.
   */
  keep(present: ReadonlySet<string>): void
}

export function createInbox<T extends Sequenced = Sequenced>(): Inbox<T> {
  const peers = new Map<string, Pending<T>>()

  /** Move everything the pen can now hand over, in order, onto `deliver`. */
  function drain(state: Pending<T>, deliver: Delivery<T>[]): void {
    for (;;) {
      const held = state.pen.get(state.expect)
      if (!held) break
      state.pen.delete(state.expect)
      state.expect += 1
      deliver.push(held)
    }
  }

  /**
   * Whether the hole in front of `state` has waited long enough, and if so,
   * step over it to whatever the pen holds next.
   */
  function abandon(state: Pending<T>, now: number, result: InboxResult<T>): void {
    if (state.pen.size === 0) {
      state.gapSince = null
      return
    }
    if (state.gapSince === null) {
      state.gapSince = now
      return
    }
    if (now - state.gapSince < GAP_GRACE_MS) return

    // The lowest thing waiting is where the stream resumes. Everything between
    // here and there is written off - counted, not silently swallowed.
    let lowest = Infinity
    for (const s of state.pen.keys()) if (s < lowest) lowest = s
    result.skipped += lowest - state.expect
    state.expect = lowest
    state.gapSince = null
    state.askedAt = null
    drain(state, result.deliver)
    // A drain can uncover the *next* hole, and that one starts its clock now
    // rather than inheriting the elapsed grace of the one before it.
    if (state.pen.size > 0) state.gapSince = now
  }

  /** The range we are missing, if we should ask about it right now. */
  function ask(key: string, state: Pending<T>, now: number): ResendRequest | null {
    if (state.pen.size === 0) return null
    if (state.askedAt !== null && now - state.askedAt < RESEND_INTERVAL_MS) {
      return null
    }

    let lowest = Infinity
    for (const s of state.pen.keys()) if (s < lowest) lowest = s
    state.askedAt = now
    // `u` addresses the request and `c` narrows it to the one session whose
    // numbering the hole is in. `key` is `c` whenever there is one, so it is
    // only worth sending when it is not simply the person again.
    return key === state.u
      ? { u: state.u, from: state.expect, to: lowest - 1 }
      : { u: state.u, c: key, from: state.expect, to: lowest - 1 }
  }

  return {
    accept(event, from, message, now) {
      const result: InboxResult<T> = { deliver: [], request: null, skipped: 0 }

      // No sequence: a client from before this shipped. Straight through, and
      // no state kept for it - half-tracking a sender whose numbering we cannot
      // see would invent holes that are not there.
      if (typeof message.s !== 'number' || !Number.isFinite(message.s)) {
        result.deliver.push({ event, message })
        return result
      }

      /**
       * One stream per client session, and only per *person* for a sender too
       * old to say which session it is.
       *
       * The counter is the outbox's, and an outbox lives exactly as long as the
       * mount holding it - so a remount is a new run of one-two-three, and
       * filing it under the person would put it behind the mark the last run
       * left. See the note at the top of this file.
       */
      const key = message.c ?? from

      let state = peers.get(key)
      if (!state) {
        // First we have heard from them. Their counter did not start at one for
        // us - it started whenever they joined, which may be long before we
        // did - so we adopt whatever they are on rather than asking them to
        // replay a history that was never addressed to us.
        state = {
          u: from,
          expect: message.s,
          pen: new Map(),
          gapSince: null,
          askedAt: null,
        }
        peers.set(key, state)
      }

      // Behind the mark: a duplicate, which is the normal cost of a resend
      // being a broadcast everybody hears. Dropping it here is what lets the
      // sender answer one client's request without disturbing the others.
      if (message.s < state.expect) return result

      if (message.s === state.expect) {
        state.expect += 1
        result.deliver.push({ event, message })
        drain(state, result.deliver)
        if (state.pen.size === 0) {
          state.gapSince = null
          state.askedAt = null
        }
        return result
      }

      // Ahead of the mark: hold it, and start or continue asking.
      state.pen.set(message.s, { event, message })
      if (state.gapSince === null) state.gapSince = now
      result.request = ask(key, state, now)
      return result
    },

    sweep(now) {
      const result: InboxResult<T> = { deliver: [], request: null, skipped: 0 }
      for (const [key, state] of peers) {
        abandon(state, now, result)
        // One request per sweep. Two senders with holes at the same instant is
        // rare, and the next sweep is a quarter of a second away.
        if (!result.request) result.request = ask(key, state, now)
      }
      return result
    },

    keep(present) {
      for (const key of peers.keys()) {
        if (!present.has(key)) peers.delete(key)
      }
    },
  }
}
