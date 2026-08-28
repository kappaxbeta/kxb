'use client'

import { useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  createCollector,
  type ChannelState,
  type PerfWindow,
} from '@/app/world/perf/collector'
import { armPerf, disarmPerf, publishWindow } from '@/app/world/perf/store'
import { createClient } from '@/lib/supabase/client'

/**
 * Measuring the room from inside it.
 *
 * Mounted by `<Multiplayer>` and only when the `perf` flag resolved true for
 * this space, which is what makes this component's *existence* the switch: with
 * the flag off there is no frame subscriber, no timer, no ping and no write.
 * The counting calls scattered through the channel handlers stay, and each is
 * one null check against a store nothing has armed.
 *
 * ---------------------------------------------------------------------------
 * What it costs, honestly
 * ---------------------------------------------------------------------------
 * A diagnostic that changes what it measures is worse than none, so the price
 * is worth writing down rather than asserting.
 *
 * **Per frame:** one bounds check and one write into a preallocated ring. No
 * allocation, so the frame loop makes no extra garbage - which is the cost that
 * would actually show up, as a longer GC pause rather than a slower frame.
 *
 * **Per packet:** one `Map` get and set. A room of eight moving about is ~64
 * packets a second arriving at each client; this is not a measurable share of
 * the work of drawing eight bodies.
 *
 * **Per window:** one `close()`, which copies at most 4096 numbers and sorts
 * two short arrays - tens of microseconds, once every fifteen seconds - and one
 * HTTP POST to Postgres. The POST is deliberately *not* on the channel, so the
 * room's own budget never sees it.
 *
 * **On the wire**, which is the only cost big enough to argue about. Each
 * client sends one ping every `PING_INTERVAL_MS` and exactly one peer answers
 * it, so the diagnostic costs `2n / interval` messages a second in a room of
 * `n`. Movement costs `SEND_HZ * n`. Both are broadcasts and both fan out to
 * `n - 1`, so the ratio is fixed whatever the room size:
 *
 *     2 / (5s * 8Hz)  =  5% of a moving room's traffic
 *
 * In an idle room the absolute numbers are tiny either way - a still client
 * sends one keepalive every `KEEPALIVE_MS` - so the diagnostic is a larger
 * share of a very small number. Nothing here is near the 5000/s tenant ceiling:
 * a room of eight delivers around 450 messages a second all in.
 *
 * Two decisions hold that ratio down:
 *
 *   - **The ping is addressed to one peer**, not broadcast for everybody to
 *     answer. That is two messages per ping whatever the room size, against `n`
 *     for the obvious version - and the obvious version is quadratic, which is
 *     exactly the thing this page exists to watch for.
 *   - **The target rotates**, so every link is measured over a minute or so
 *     rather than one link being measured constantly. Coverage without cost.
 *
 * And it is counted like any other packet, so the `ping` line in the breakdown
 * is the diagnostic's own traffic, visible rather than hidden inside the
 * numbers it reports.
 *
 * ---------------------------------------------------------------------------
 * Round trip, and what the halved figure is worth
 * ---------------------------------------------------------------------------
 * The nonce goes out, some peer sends it straight back, and the elapsed time is
 * read off the same `performance.now()` that stamped it. One clock, start to
 * finish. Nothing here ever subtracts another machine's stamp from ours - see
 * the header of `peer-motion` for why `MoveMessage.t` cannot be used that way,
 * and the header of `collector.ts` for why there is no one-way column.
 */

/**
 * How long one row covers.
 *
 * Fifteen seconds is long enough that a 60fps window has ~900 frames behind its
 * percentiles - so p95 means something rather than being the third worst of
 * twenty - and short enough that an operator watching a room get worse sees it
 * within a refresh of the page. It is also comfortably above the five second
 * floor `record_room_perf` enforces, so an honest client is never refused.
 */
const WINDOW_MS = 15_000

/**
 * How often a ping goes out.
 *
 * Five seconds, which is three round trips per window and about thirty-six a
 * minute per client - plenty for a p50, and the page's own aggregation takes
 * the worst p95 across windows rather than trusting any single one. It is the
 * number that sets the diagnostic's whole share of the room's traffic: see the
 * arithmetic in the header, which comes out at 5% of a moving room and is fixed
 * whatever the room size. Halving it would double that share to buy precision
 * nothing here asks for.
 */
const PING_INTERVAL_MS = 5000

/** Nonces are matched, not trusted: short is fine and smaller on the wire. */
function nonce(): string {
  return Math.random().toString(36).slice(2, 10)
}

/**
 * Can this channel push right now?
 *
 * The exact test supabase-js makes in `send()` before it logs "Realtime send()
 * is automatically falling back to REST API", asked with public properties
 * rather than by intercepting the console.
 *
 * Worth surfacing because the fallback changes the transport under a room that
 * still reports itself connected: broadcasts go out as HTTP POSTs, one request
 * each, and the room keeps working while feeling nothing like it did. Nothing
 * else in the app would ever tell you.
 */
function canPush(channel: RealtimeChannel): boolean {
  return channel.socket.isConnected() && channel.state === 'joined'
}

/**
 * Every channel fails this test on the way *in*.
 *
 * A channel is `joining` for the first round trip of its life, which is exactly
 * when a probe mounted alongside it takes its first look - so the naive check
 * latched the fallback on every healthy room in the deployment, and the first
 * verification run duly reported `rest_fallback` on a socket that was fine.
 *
 * What the column is supposed to mean is "this was working and now it is not",
 * so the state has to be seen good once before a bad reading counts. `joined`
 * rather than the channel's own `joinedOnce`, which is set when the join is
 * *sent* rather than when it succeeds and so would let the same false positive
 * straight back in.
 */
function watchTransport(): (channel: RealtimeChannel) => boolean {
  let everJoined = false
  return (channel) => {
    if (canPush(channel)) {
      everJoined = true
      return false
    }
    return everJoined
  }
}

export interface PerfProbeProps {
  /** The channel being measured. Null while the effect has not opened one. */
  channelRef: React.RefObject<RealtimeChannel | null>
  /** Which room, verbatim: `lounge:<tenant>`, `battle:<id>`, `hall:<id>`. */
  topic: string
  /** The space whose flag admitted this, and whose row this becomes. */
  tenantId: string
  /** This tab, as the presence roster knows it. */
  conn: string
  /**
   * Other clients that said `perf: true` in their presence payload.
   *
   * The ping goes to one of these rather than to any peer, and that is not an
   * optimisation - it is what keeps `rtt_lost` honest. A peer whose space has
   * collection switched off will not answer, and counting its silence as packet
   * loss would report a broken network where there is only a flag.
   */
  targetsRef: React.RefObject<string[]>
  /** Send a ping to one peer. Owned by `<Multiplayer>`, which holds the socket. */
  onPing: (to: string, id: string) => void
  /**
   * The worst peer's link, asked for at the end of each window.
   *
   * A callback rather than the transform map itself, so this component learns
   * nothing about how a peer is drawn. What it returns is the jitter estimate
   * and playout delay `peer-motion` is already computing on every packet - that
   * is "how bad is this peer's link" for free, and it would be perverse to
   * measure it a second time.
   */
  worstLink: () => { jitterMs: number | null; delayMs: number | null }
  /**
   * How many other bodies are in the room, at the moment the window closes.
   *
   * The presence handler's `notePeers` reports joins and leaves, which is only
   * the room's size in the windows where it changed. A room that nobody entered
   * or left for fifteen seconds recorded zero peers - so the steadiest rooms,
   * which are most of them, were the ones that lied hardest about how many
   * people were in them. Asked for here for the same reason `worstLink` is:
   * `notePeers` keeps the high-water mark, so a mid-window join still counts.
   */
  roomSize: () => number
}

export function PerfProbe({
  channelRef,
  topic,
  tenantId,
  conn,
  targetsRef,
  onPing,
  worstLink,
  roomSize,
}: PerfProbeProps) {
  /**
   * The collector, made once and armed for the life of the mount.
   *
   * `useState` with a lazy initialiser rather than a ref, and never set again:
   * it is the one hook that creates a value exactly once without reading
   * anything during a render. Nothing here re-renders - the object is mutated
   * sixty times a second by the frame loop below and React is never told.
   */
  const [collector] = useState(createCollector)

  useEffect(() => {
    const supabase = createClient()
    // The clock is read here rather than where the collector was made: the
    // factory runs during a render, and reading a timer there is impure.
    collector.start(performance.now())
    armPerf(collector)

    /**
     * The tab going away and coming back.
     *
     * Not politeness: a hidden tab gets no `requestAnimationFrame`, so without
     * this the window records zero frames and an operator reads a minimised
     * browser as a room that stopped drawing. Seeded from the current state
     * rather than waiting for the first event, because a probe that mounts in
     * an already-hidden tab has been hidden since it started.
     */
    const seeAndTell = () =>
      collector.noteHidden(document.visibilityState === 'hidden', performance.now())
    seeAndTell()
    document.addEventListener('visibilitychange', seeAndTell)

    /**
     * The ping, and the round robin that picks who answers it.
     *
     * `cursor` walks the target list rather than picking at random, so over a
     * minute every peer in the room has answered roughly the same number of
     * times. Random selection would leave the room's worst link unmeasured for
     * long stretches, which is the one it exists to find.
     */
    let cursor = 0
    const fellBack = watchTransport()
    const pinging = setInterval(() => {
      const now = performance.now()
      collector.expirePings(now)

      const channel = channelRef.current
      if (channel && fellBack(channel)) collector.noteRestFallback()

      const targets = targetsRef.current
      // An empty room has nobody to measure a round trip against, and a ping
      // into it is a packet spent proving that. Recorded as no samples, which
      // is what the page draws as "nobody to ask".
      if (!targets || targets.length === 0) return

      cursor = (cursor + 1) % targets.length
      const id = nonce()
      collector.notePing(id, now)
      onPing(targets[cursor], id)
    }, PING_INTERVAL_MS)

    /** Close a window and write it down. */
    const writing = setInterval(() => {
      const now = performance.now()

      // The worst peer, not the mean: the room is as good as whoever is having
      // the hardest time in it, and an average over five good links and one
      // terrible one describes nobody.
      const link = worstLink()
      collector.noteLink(link.jitterMs, link.delayMs)
      collector.notePeers(roomSize())

      const window = collector.close(now)
      // Published whether or not anything is drawing it: the probe does not
      // know whether this space turned the readout on, and a subscriber-aware
      // publisher would be a coupling for the sake of one object assignment.
      publishWindow(window)
      void write(supabase, tenantId, topic, conn, window)
    }, WINDOW_MS)

    return () => {
      document.removeEventListener('visibilitychange', seeAndTell)
      clearInterval(pinging)
      clearInterval(writing)
      /**
       * Nothing is flushed on the way out, and that is deliberate.
       *
       * A partial window is a row whose `window_ms` is whatever fraction of
       * fifteen seconds somebody happened to leave after, and every rate on the
       * page divides by it - so a walk out of the room three hundred
       * milliseconds after a write would post a row claiming an enormous
       * packet rate. The last few seconds of a session are not worth a lie
       * about the busiest the room ever got.
       */
      disarmPerf(collector)
    }
  }, [collector, channelRef, targetsRef, worstLink, roomSize, onPing, tenantId, topic, conn])

  /**
   * One frame drawn.
   *
   * `useFrame` rather than a `requestAnimationFrame` loop of our own, and they
   * are the same clock: R3F drives its loop from rAF, so this delta is the
   * interval between the frames this room actually put on screen. A second rAF
   * loop beside it would measure the browser's cadence rather than the scene's,
   * and would keep the compositor busy for the privilege.
   *
   * Registered with a very negative priority so it runs before the character
   * controller and the ball - it only reads a number, and a sampler that ran
   * last would be timing itself into the frame it is measuring.
   *
   * Negative, and that is load-bearing rather than stylistic. R3F counts a
   * *positive* priority as "this subscriber renders the scene itself" and stops
   * rendering automatically - `internal.priority + (priority > 0 ? 1 : 0)` in
   * its store. A `1` here would leave every room in the app a black canvas.
   */
  useFrame((_, delta) => {
    collector.noteFrame(delta * 1000)
  }, -1000)

  return null
}

/**
 * Post one window.
 *
 * Fire and forget, and silent about refusals. `record_room_perf` returns false
 * rather than raising when the flag has been switched off underneath a tab that
 * is still open - which is the intended way to stop collection without asking
 * everybody to reload - and a room that filled somebody's console with errors
 * because an operator turned a switch would be a diagnostic making itself felt
 * by the people it is measuring.
 */
async function write(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  topic: string,
  conn: string,
  window: PerfWindow,
): Promise<void> {
  /**
   * Nulls go over as `undefined`, which is not a formality.
   *
   * Every optional argument here has a SQL default of NULL, and the generated
   * Args type spells that `p_quiet_ms?: number` rather than `number | null` -
   * the same shape `resolveFeatures` works around for `p_tenant_id`. Omitting
   * the key lets the function's own default apply, which is the NULL the column
   * wants; sending JSON `null` would not type-check and would mean something
   * else if it did.
   */
  const { error } = await supabase.rpc('record_room_perf', {
    p_tenant_id: tenantId,
    p_topic: topic,
    p_conn: conn,
    p_window_ms: window.windowMs,
    p_channel_state: window.channelState,
    p_reconnects: window.reconnects,
    p_quiet_ms: window.quietMs ?? undefined,
    p_rest_fallback: window.restFallback,
    p_sent: window.sent,
    p_received: window.received,
    p_peers: window.peers,
    p_frames: window.frames,
    p_frame_p50_ms: window.frameP50Ms ?? undefined,
    p_frame_p95_ms: window.frameP95Ms ?? undefined,
    p_hidden_ms: window.hiddenMs,
    p_rtt_samples: window.rttSamples,
    p_rtt_lost: window.rttLost,
    p_rtt_p50_ms: window.rttP50Ms ?? undefined,
    p_rtt_p95_ms: window.rttP95Ms ?? undefined,
    p_link_jitter_ms: window.linkJitterMs ?? undefined,
    p_link_delay_ms: window.linkDelayMs ?? undefined,
  })

  if (error && process.env.NODE_ENV !== 'production') {
    console.warn('[perf] sample not recorded', error.message)
  }
}

/** What `subscribe()` said, in the vocabulary the table stores. */
export function channelStateOf(status: string): ChannelState {
  switch (status) {
    case 'SUBSCRIBED':
      return 'subscribed'
    case 'CHANNEL_ERROR':
      return 'errored'
    case 'TIMED_OUT':
      return 'timed_out'
    case 'CLOSED':
      return 'closed'
    default:
      return 'joining'
  }
}
