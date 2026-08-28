
/**
 * Turning rows into the four answers the page exists to give.
 *
 * Pure, and separate from `queries.ts` for the reason `health/format.ts` is
 * separate from `health/queries.ts`: the arithmetic here is where a monitoring
 * page tells its lies, and it is worth being able to test it without a
 * database. Two of the sums below are wrong in the obvious implementation, and
 * both are argued at the function that gets them right.
 */

import { EXPECTED_REALTIME_LIMITS } from '@/domain/health/realtime-limits'

/**
 * What one client wrote down about one window.
 *
 * The wire shape of `room_perf_samples`, camel-cased. `sent` and `received` are
 * counts over `windowMs` and never rates - see the migration's header for why
 * the division is done here rather than in the browser.
 */
export interface PerfSample {
  sampledAt: string
  tenantId: string
  topic: string
  roomKind: string
  userId: string
  conn: string
  windowMs: number
  channelState: string
  reconnects: number
  quietMs: number | null
  restFallback: boolean
  sent: Partial<Record<string, number>>
  received: Partial<Record<string, number>>
  sentTotal: number
  recvTotal: number
  peers: number
  frames: number
  frameP50Ms: number | null
  frameP95Ms: number | null
  hiddenMs: number
  rttSamples: number
  rttLost: number
  rttP50Ms: number | null
  rttP95Ms: number | null
  linkJitterMs: number | null
  linkDelayMs: number | null
}

/** One client, across every window it wrote in the requested period. */
export interface ClientRollup {
  conn: string
  userId: string
  /** Resolved by the page. Null when the account has no profile row. */
  name: string | null
  samples: number
  lastSeen: string
  /** The most recent window's state - see the note in `rollUpClient`. */
  channelState: string
  reconnects: number
  restFallback: boolean
  quietMs: number | null
  sentHz: number
  recvHz: number
  peers: number
  /** The latest window's median frame time, and the worst p95 ever recorded. */
  frameP50Ms: number | null
  worstFrameP95Ms: number | null
  /** Frames per second implied by the latest median. Null when nothing drew. */
  fps: number | null
  /** How much of this client's measured time the tab was hidden for, 0..1. */
  hiddenShare: number
  rttSamples: number
  rttLost: number
  rttP50Ms: number | null
  worstRttP95Ms: number | null
  linkJitterMs: number | null
  linkDelayMs: number | null
}

/** A per-second figure for one event, on both sides of the wire. */
export interface EventRate {
  event: string
  sentHz: number
  deliveredHz: number
}

export interface RoomRollup {
  clients: ClientRollup[]
  /** Everything the room's clients put on the wire, per second. */
  sentHz: number
  /** Everything its clients took off the wire, per second. The fan-out. */
  deliveredHz: number
  byEvent: EventRate[]
  /** The largest room size any client reported. */
  peers: number
  /** Clients whose most recent window was anything but subscribed. */
  unhealthy: number
  restFallback: boolean
}

/**
 * The tenant's Realtime ceiling, in messages a second.
 *
 * Here so the page can say what fraction of it a room is using, because "142
 * messages a second" means nothing on its own and "3% of the ceiling" means
 * quite a lot.
 *
 * Taken from `realtime-limits.ts` rather than written down again, which is the
 * whole of this change: it was a literal 5000, the box has been configured for
 * 25 000 since the limits were raised, and nobody noticed because the two
 * numbers lived in different files and only one of them was ever checked
 * against the box. Every share this page has drawn was five times too
 * frightening - a room using 2% of its budget was reported as using 10%.
 *
 * The health page compares this same constant against what Realtime actually
 * reports, so if the self-host seed ever reverts the limits underneath us that
 * is where it shows up - and this page's percentages follow the same number
 * rather than drifting away from it a second time.
 */
export const TENANT_EVENT_CEILING = EXPECTED_REALTIME_LIMITS.maxEventsPerSecond

function hz(count: number, windowMs: number): number {
  return windowMs > 0 ? (count * 1000) / windowMs : 0
}

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function worst(values: (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null)
  return present.length === 0 ? null : Math.max(...present)
}

/**
 * One client's windows, folded into one row.
 *
 * Three of these are not the obvious aggregate and each is deliberate:
 *
 *  - **The channel state is the newest window's, not the worst.** A client that
 *    errored ten minutes ago and has been subscribed since is not a problem
 *    now, and a page that kept saying so would train an operator to ignore it.
 *  - **The percentiles are not averaged**, because percentiles do not average -
 *    the mean of two p95s is not the p95 of the union, and the number it
 *    produces is not a statistic of anything. So p95 is the worst any window
 *    recorded, which is a real reading from a real window, and p50 is the most
 *    recent one, which is how the room feels right now.
 *  - **The rate is the mean of the per-window rates**, not the total divided by
 *    the elapsed time. A client that joined halfway through the period would
 *    otherwise have its traffic halved by the minutes before it arrived.
 */
export function rollUpClient(samples: PerfSample[]): ClientRollup {
  // Newest first, so "latest" below is index zero and nothing has to re-sort.
  const rows = [...samples].sort((a, b) => b.sampledAt.localeCompare(a.sampledAt))
  const latest = rows[0]

  const measuredMs = rows.reduce((total, row) => total + row.windowMs, 0)
  const hiddenMs = rows.reduce((total, row) => total + row.hiddenMs, 0)

  /**
   * The most recent *real* reading, not simply the most recent window.
   *
   * A window can legitimately measure neither: a tab that was hidden drew no
   * frames, and a client alone in the room has nobody to ping. Taking the
   * latest row regardless put a dash in the headline while the p95 beside it
   * showed 58ms - which reads as a page contradicting itself rather than as
   * "the last fifteen seconds had nothing in them".
   *
   * Still the *latest*, not the best: this is the "how does it feel now" half
   * of the pair, and `worst*` below is the other. If a client has drawn nothing
   * and echoed nothing for the whole period these stay null, which is the
   * honest answer and the one the page draws as "hidden" or "no echo".
   */
  const frameP50Ms = rows.find((row) => row.frames > 0)?.frameP50Ms ?? null
  const rttP50Ms = rows.find((row) => row.rttSamples > 0)?.rttP50Ms ?? null

  return {
    conn: latest.conn,
    userId: latest.userId,
    name: null,
    samples: rows.length,
    lastSeen: latest.sampledAt,
    channelState: latest.channelState,
    reconnects: latest.reconnects,
    restFallback: rows.some((row) => row.restFallback),
    quietMs: latest.quietMs,
    sentHz: mean(rows.map((row) => hz(row.sentTotal, row.windowMs))),
    recvHz: mean(rows.map((row) => hz(row.recvTotal, row.windowMs))),
    peers: Math.max(...rows.map((row) => row.peers)),
    frameP50Ms,
    worstFrameP95Ms: worst(rows.map((row) => row.frameP95Ms)),
    // From the median frame time rather than frames over wall clock, so a tab
    // that was hidden for part of a window is not reported as running at half
    // speed. See `fpsOf`, which makes the same argument in the browser.
    fps: frameP50Ms ? 1000 / frameP50Ms : null,
    hiddenShare: measuredMs > 0 ? hiddenMs / measuredMs : 0,
    rttSamples: rows.reduce((total, row) => total + row.rttSamples, 0),
    rttLost: rows.reduce((total, row) => total + row.rttLost, 0),
    rttP50Ms,
    worstRttP95Ms: worst(rows.map((row) => row.rttP95Ms)),
    linkJitterMs: latest.linkJitterMs,
    linkDelayMs: latest.linkDelayMs,
  }
}

/**
 * Every event's rate across the room, on both sides.
 *
 * Per client first and summed afterwards, exactly as the totals are and for the
 * same reason - see `rollUpRoom`. An event nobody sent and nobody received does
 * not appear at all, so a lounge with no ball in it is not a row of zeroes
 * inviting somebody to wonder what happened to football.
 */
export function eventRates(byClient: Map<string, PerfSample[]>): EventRate[] {
  const sent = new Map<string, number>()
  const delivered = new Map<string, number>()

  for (const rows of byClient.values()) {
    const names = new Set<string>()
    for (const row of rows) {
      for (const key of Object.keys(row.sent)) names.add(key)
      for (const key of Object.keys(row.received)) names.add(key)
    }
    for (const name of names) {
      const s = mean(rows.map((row) => hz(row.sent[name] ?? 0, row.windowMs)))
      const d = mean(rows.map((row) => hz(row.received[name] ?? 0, row.windowMs)))
      sent.set(name, (sent.get(name) ?? 0) + s)
      delivered.set(name, (delivered.get(name) ?? 0) + d)
    }
  }

  const names = new Set([...sent.keys(), ...delivered.keys()])
  return [...names]
    .map((event) => ({
      event,
      sentHz: sent.get(event) ?? 0,
      deliveredHz: delivered.get(event) ?? 0,
    }))
    .sort((a, b) => b.deliveredHz - a.deliveredHz)
}

/**
 * A room, from the rows its clients wrote.
 *
 * The important line is that the room's rate is the **sum** across clients and
 * never their mean. Both numbers exist and they answer different questions: the
 * per-client rate says whether one person is behaving differently from the
 * rest, and the sum is what actually arrives at the tenant's ceiling. Averaging
 * would report a twenty-player room as being no busier than a two-player one,
 * which is the exact shape of the problem this page was built to see.
 *
 * `deliveredHz` is the other half and the one that grows quadratically: every
 * message sent into a room of n is fanned out to the n-1 others. It is measured
 * rather than multiplied out from the room size, so a client that is quietly
 * missing packets shows up as a shortfall instead of being assumed away.
 */
export function rollUpRoom(samples: PerfSample[]): RoomRollup {
  const byClient = new Map<string, PerfSample[]>()
  for (const sample of samples) {
    const rows = byClient.get(sample.conn)
    if (rows) rows.push(sample)
    else byClient.set(sample.conn, [sample])
  }

  const clients = [...byClient.values()]
    .map(rollUpClient)
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))

  return {
    clients,
    sentHz: clients.reduce((total, client) => total + client.sentHz, 0),
    deliveredHz: clients.reduce((total, client) => total + client.recvHz, 0),
    byEvent: eventRates(byClient),
    peers: clients.reduce((most, client) => Math.max(most, client.peers), 0),
    unhealthy: clients.filter((client) => client.channelState !== 'subscribed').length,
    restFallback: clients.some((client) => client.restFallback),
  }
}

/**
 * Half a round trip, and the assumption that buys it.
 *
 * Offered because "how long does a change take to land on somebody else's
 * screen" is a one-way question, and refusing to answer it at all would send
 * every reader off to halve the number in their head anyway - without the
 * caveat. Returned with the caveat attached instead, and the page prints it
 * next to the figure.
 *
 * The assumption is a symmetric path, and it is often wrong: mobile uplinks are
 * routinely slower than their downlinks, so on a phone the outbound leg is the
 * larger half and this understates it. That is why the round trip is what is
 * stored and what the tables lead with; this is a derived convenience and is
 * labelled as one everywhere it appears.
 */
export function oneWayGuess(roundTripMs: number | null): number | null {
  return roundTripMs === null ? null : roundTripMs / 2
}

/** How close a room is to the tenant's ceiling, as a fraction. */
export function ceilingShare(deliveredHz: number): number {
  return deliveredHz / TENANT_EVENT_CEILING
}

/**
 * What a room this size would cost at this send rate if it kept growing.
 *
 * Not a prediction and drawn as an aside: fan-out is `sends x (n-1)`, so a room
 * that is comfortable at six can be at the ceiling at forty without anybody
 * changing anything. The point of putting it on the page is that the quadratic
 * is invisible in a measurement of today's room, which is the only thing every
 * other number here describes.
 */
export function projectedDeliveredHz(perClientSentHz: number, size: number): number {
  return perClientSentHz * size * Math.max(0, size - 1)
}

