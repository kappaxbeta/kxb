/**
 * What a client noticed about the room it is standing in, over one window.
 *
 * Deliberately free of React, of three.js and of supabase-js, exactly as
 * `presence-core` is and for the same reason: the arithmetic here is the part
 * that is subtly wrong in ways you cannot see at sixty frames a second, and it
 * has to be testable without standing up a canvas or a socket. Everything
 * arrives as plain numbers and leaves as plain numbers.
 *
 * ---------------------------------------------------------------------------
 * Percentiles, not means
 * ---------------------------------------------------------------------------
 * A mean frame time cannot tell the two failures apart. A room drawing a steady
 * 20ms frame and a room drawing 16ms with a 90ms hitch four times a second have
 * the same mean and feel nothing alike - one is smooth and slightly slow, the
 * other is the one people call broken. p95 is the hitch, and it is the number
 * that changes when somebody says "it got worse".
 *
 * ---------------------------------------------------------------------------
 * Round trip on one clock, and never a one-way figure
 * ---------------------------------------------------------------------------
 * `notePing` and `noteEcho` are both called on *this* client, with this
 * client's `performance.now()`, and the difference between them is the only
 * latency number this file will produce. There is no way to ask it for a
 * one-way time, because there is no honest way to compute one: two browsers do
 * not share a clock, `MoveMessage.t` is the sender's own epoch (see the note in
 * `peer-motion`), and subtracting one machine's stamp from another's is a
 * confident, meaningless number. Halving the round trip is a thing the page may
 * do and label; it is not a thing this file will hand out.
 *
 * ---------------------------------------------------------------------------
 * A hidden tab is a gap, not a zero
 * ---------------------------------------------------------------------------
 * A backgrounded tab gets no `requestAnimationFrame` at all, so the naive
 * sampler records zero frames and an operator reads a room somebody minimised
 * as a room that has died. `noteHidden` accounts for that time explicitly, so a
 * window can say "I drew nothing because nobody was looking" rather than
 * "0 fps". The two are drawn differently and they must be.
 */

/**
 * The event vocabulary lives in `domain/perf/events`.
 *
 * Re-exported rather than moved outright, so every call site in the world keeps
 * importing the thing it counts with from the module that does the counting.
 * It is in `domain` because the backoffice page lists the same names in the
 * same order, and `domain` may not import `app` - see the lint rule that says
 * so, and its own advice about moving the shared piece.
 */
export {
  EVENT_ORDER,
  PERF_EVENTS,
  perfEvent,
  type PerfEvent,
} from '@/domain/perf/events'

import { perfEvent, type PerfEvent } from '@/domain/perf/events'

/**
 * What `channel.subscribe()` last told us, in the vocabulary the table stores.
 *
 * `joining` is the state before it has ever said anything, and it is a real
 * answer rather than a placeholder: a client stuck there is a client that never
 * got onto the channel, which looks exactly like an empty room to the person in
 * it.
 */
export type ChannelState =
  | 'joining'
  | 'subscribed'
  | 'closed'
  | 'errored'
  | 'timed_out'

/**
 * How long an unanswered ping waits before it counts as lost.
 *
 * Five seconds is far beyond any round trip worth measuring - the worst link in
 * the performance study was 110ms each way - so anything this late did not
 * arrive slowly, it did not arrive. Counting it as a very large round trip
 * instead would drag a p95 upward with a number that is not a latency.
 */
export const PING_TIMEOUT_MS = 5000

/**
 * How many frame times one window keeps.
 *
 * A ring rather than a growing array: this is written sixty times a second and
 * the frame loop must not make garbage. 4096 is four times what a fifteen
 * second window at 60fps produces, so in practice nothing is ever dropped and
 * the percentiles are over every frame drawn. A window left open far longer -
 * a tab that was hidden and came back - loses its oldest frames rather than its
 * newest, which is the right end to lose.
 */
const FRAME_CAPACITY = 4096

/** One client's account of one window. Every rate divides by `windowMs`. */
export interface PerfWindow {
  windowMs: number
  channelState: ChannelState
  reconnects: number
  /** Since anything at all arrived. Null when nothing ever has. */
  quietMs: number | null
  restFallback: boolean
  sent: Partial<Record<PerfEvent, number>>
  received: Partial<Record<PerfEvent, number>>
  /** The busiest the room got, excluding us. What makes a rate interpretable. */
  peers: number
  frames: number
  frameP50Ms: number | null
  frameP95Ms: number | null
  hiddenMs: number
  rttSamples: number
  rttLost: number
  rttP50Ms: number | null
  rttP95Ms: number | null
  /** The worst peer's link, straight out of `peer-motion`. Null with no peers. */
  linkJitterMs: number | null
  linkDelayMs: number | null
}

/**
 * Nearest-rank percentile over an unsorted list.
 *
 * Sorts a copy rather than the caller's array: the frame ring is reused every
 * window and reordering it in place would scramble the "drop the oldest" rule
 * it depends on.
 *
 * Null for an empty list rather than zero, and that distinction is the whole
 * point of the return type: zero milliseconds is a perfect frame, and "no
 * frames" is a hidden tab. Collapsing them is how a minimised window reads as a
 * broken room.
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))]
}

export interface Collector {
  /** Begin the first window. Called from an effect, with `performance.now()`. */
  start(now: number): void
  /** One drawn frame took this many milliseconds. */
  noteFrame(ms: number): void
  /** We put one message on a channel. */
  noteSent(event: string): void
  /** One message arrived. `now` is this client's clock. */
  noteReceived(event: string, now: number): void
  /** `subscribe()` said something. Transitions back into `subscribed` count. */
  noteChannel(state: ChannelState): void
  /** supabase-js announced it is sending over REST instead of the socket. */
  noteRestFallback(): void
  /** How many other people are on the channel right now. */
  notePeers(count: number): void
  /** We sent a ping carrying this nonce. */
  notePing(nonce: string, now: number): void
  /** An echo came back. Returns false for a nonce we are not waiting on. */
  noteEcho(nonce: string, now: number): boolean
  /** Give up on pings older than `PING_TIMEOUT_MS`. Call on the same tick. */
  expirePings(now: number): void
  /** The tab became hidden, or visible again. */
  noteHidden(hidden: boolean, now: number): void
  /** The worst peer's jitter and playout delay, read off `peer-motion`. */
  noteLink(jitterMs: number | null, delayMs: number | null): void
  /** Close the window, hand it over, and open the next one at `now`. */
  close(now: number): PerfWindow
}

export function createCollector(): Collector {
  /**
   * When the open window began.
   *
   * Zero until `start` is called, rather than `performance.now()` taken in the
   * factory. The collector is made during a render and the clock is read in an
   * effect, which is the only order that keeps creation pure - reading a timer
   * while rendering is exactly what React's purity rule is about.
   */
  let openedAt = 0
  let channelState: ChannelState = 'joining'
  let subscribes = 0
  let restFallback = false
  let lastMessageAt: number | null = null
  let peers = 0
  let linkJitterMs: number | null = null
  let linkDelayMs: number | null = null

  const sent = new Map<PerfEvent, number>()
  const received = new Map<PerfEvent, number>()

  const frameRing = new Float64Array(FRAME_CAPACITY)
  let frameWrite = 0
  let frames = 0

  const rtts: number[] = []
  let rttLost = 0
  /** Nonce -> when we sent it. Deliberately *not* cleared on close: a ping sent
   *  at the end of one window is usually echoed in the next, and throwing the
   *  pending set away would count every boundary as a loss. */
  const pending = new Map<string, number>()

  let hiddenSince: number | null = null
  let hiddenMs = 0

  function bump(map: Map<PerfEvent, number>, name: string): void {
    const key = perfEvent(name)
    map.set(key, (map.get(key) ?? 0) + 1)
  }

  function drain(map: Map<PerfEvent, number>): Partial<Record<PerfEvent, number>> {
    const out: Partial<Record<PerfEvent, number>> = {}
    for (const [key, value] of map) out[key] = value
    map.clear()
    return out
  }

  return {
    start(now) {
      openedAt = now
    },

    noteFrame(ms) {
      // Guarded rather than trusted: a tab returning from the background hands
      // the frame loop one enormous delta for the time it was away, and that is
      // not a frame anybody waited for. It would also be, by a wide margin, the
      // p95 of the window it lands in.
      if (!Number.isFinite(ms) || ms <= 0 || ms > 1000) return
      frameRing[frameWrite] = ms
      frameWrite = (frameWrite + 1) % FRAME_CAPACITY
      frames += 1
    },

    noteSent(event) {
      bump(sent, event)
    },

    noteReceived(event, now) {
      bump(received, event)
      lastMessageAt = now
    },

    noteChannel(state) {
      // Counted on the way *in* to `subscribed`, and only after the first: the
      // number an operator wants is "how many times has this client had to get
      // back on", not "is it on".
      if (state === 'subscribed') {
        subscribes += 1
      }
      channelState = state
    },

    noteRestFallback() {
      restFallback = true
    },

    notePeers(count) {
      // The high-water mark, not the latest. The traffic in this window was
      // produced by the room at its busiest, and dividing it by the two people
      // left at the end would describe neither.
      if (count > peers) peers = count
    },

    notePing(nonce, now) {
      pending.set(nonce, now)
    },

    noteEcho(nonce, now) {
      const at = pending.get(nonce)
      if (at === undefined) return false
      pending.delete(nonce)
      rtts.push(now - at)
      return true
    },

    expirePings(now) {
      for (const [nonce, at] of pending) {
        if (now - at < PING_TIMEOUT_MS) continue
        pending.delete(nonce)
        rttLost += 1
      }
    },

    noteHidden(hidden, now) {
      if (hidden) {
        if (hiddenSince === null) hiddenSince = now
        return
      }
      if (hiddenSince !== null) {
        hiddenMs += now - hiddenSince
        hiddenSince = null
      }
    },

    noteLink(jitter, delay) {
      linkJitterMs = jitter
      linkDelayMs = delay
    },

    close(now) {
      // Still hidden as the window closes: bank the time so far and start the
      // next window still hidden, so a tab that spends five minutes in the
      // background reports five minutes of gap rather than one.
      if (hiddenSince !== null) {
        hiddenMs += now - hiddenSince
        hiddenSince = now
      }

      const kept = Math.min(frames, FRAME_CAPACITY)
      const times: number[] = []
      for (let i = 0; i < kept; i++) {
        times.push(frameRing[(frameWrite - kept + i + FRAME_CAPACITY) % FRAME_CAPACITY])
      }

      const window: PerfWindow = {
        windowMs: Math.max(1, Math.round(now - openedAt)),
        channelState,
        // One subscribe is arriving; every one after it is a reconnect.
        reconnects: Math.max(0, subscribes - 1),
        quietMs: lastMessageAt === null ? null : Math.round(now - lastMessageAt),
        restFallback,
        sent: drain(sent),
        received: drain(received),
        peers,
        frames,
        frameP50Ms: percentile(times, 50),
        frameP95Ms: percentile(times, 95),
        hiddenMs: Math.round(hiddenMs),
        rttSamples: rtts.length,
        rttLost,
        rttP50Ms: percentile(rtts, 50),
        rttP95Ms: percentile(rtts, 95),
        linkJitterMs,
        linkDelayMs,
      }

      openedAt = now
      frames = 0
      frameWrite = 0
      rtts.length = 0
      rttLost = 0
      hiddenMs = 0
      peers = 0
      /**
       * `restFallback` and `subscribes` are deliberately *not* reset.
       *
       * Both are facts about the session rather than about the window.
       * Reconnects is a running total an operator reads as "this client has had
       * a rough time", and a fallback that happened once explains a transport
       * that stayed changed - zeroing either would make a client look like it
       * had recovered simply because fifteen seconds went by.
       */
      return window
    },
  }
}

/**
 * Frames per second implied by a window, or null when it drew none.
 *
 * From the *median frame time* rather than from `frames / windowMs`, and the
 * difference matters: a tab that was hidden for half the window drew half as
 * many frames, and dividing by the whole window would report 30fps for a room
 * that was running perfectly and simply not being looked at. The median frame
 * time describes the frames that were actually drawn.
 */
export function fpsOf(window: {
  frameP50Ms: number | null
  frames: number
}): number | null {
  if (window.frames === 0 || !window.frameP50Ms) return null
  return 1000 / window.frameP50Ms
}
