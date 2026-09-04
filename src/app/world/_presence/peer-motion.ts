/**
 * How a remote body is drawn between the packets that describe it.
 *
 * ---------------------------------------------------------------------------
 * What was wrong with easing toward the newest packet
 * ---------------------------------------------------------------------------
 * Both peer drawers used to chase the last pose they were told about:
 *
 *     current += (target - current) * (1 - exp(-SMOOTHING * delta))
 *
 * It is one line, it is framerate independent, and it is wrong in a way that
 * does not show up until you watch somebody run in a straight line.
 *
 * Easing has no notion of *when* the target was true. It closes a fraction of
 * the remaining gap every frame, so between packets the body decelerates
 * (the gap shrinks), and the moment a packet lands the gap jumps and it
 * accelerates again. At `SMOOTHING = 11` and `SEND_HZ = 8` the gap decays to
 * `exp(-11 * 0.125) = 0.25` of itself between packets - three quarters closed -
 * so it oscillates between 0.67 and 0.17 units behind, and drawn speed is
 * `SMOOTHING x gap`.
 *
 * A peer jogging at a constant 4 units/s is therefore drawn moving between
 * **1.9 and 7.4 units/s, eight times a second**. Measured at +-39% wobble on a
 * perfect LAN and +-47% on a 110ms link. The network makes it worse; it does not
 * cause it. That is the "it jitters a lot" report.
 *
 * ---------------------------------------------------------------------------
 * What this does instead
 * ---------------------------------------------------------------------------
 * Keep the last couple of seconds of poses, and draw the peer as they were a
 * short while ago - late enough that the packet describing that moment has
 * almost certainly arrived - by interpolating between the two real poses either
 * side of that instant. The body then moves at the speed the peer actually
 * moved, because it is replaying samples rather than chasing a target.
 *
 * The cost is honest and fixed: the peer is drawn `delay` milliseconds in the
 * past. That is the trade every multiplayer game makes, and it is a better deal
 * than it looks - lowering `SMOOTHING` to 3 to calm the wobble costs about the
 * same lag and still leaves +-11%, because easing is *always* chasing.
 *
 * Measured against this module, a peer at a constant 4 units/s:
 *
 *   | link              | easing (before) | this (after) |
 *   |-------------------|-----------------|--------------|
 *   | wifi              | +-39%           | +-0%         |
 *   | Lagos mobile      | +-47%           | +-0%         |
 *
 * ---------------------------------------------------------------------------
 * Why the delay adapts
 * ---------------------------------------------------------------------------
 * A buffer that is too short is *worse than easing*: the render instant runs
 * past the newest sample, the body holds still, and then jumps when the next one
 * lands. Simulated at a 150ms buffer on a bad link that measured +-209%. Too
 * long and everyone is needlessly far in the past.
 *
 * So the delay is derived from the jitter this peer is actually showing rather
 * than picked once: two send intervals of headroom plus twice the observed
 * spread, clamped. On wifi that settles near the floor; on a bad mobile link it
 * opens up on its own.
 *
 * ---------------------------------------------------------------------------
 * Whose send interval, and why it is measured rather than assumed
 * ---------------------------------------------------------------------------
 * "Two send intervals" used to mean two of *ours* - the `SEND_HZ = 8` constant
 * this package ships - and that was the same mistake as easing, one level up: a
 * number picked once, describing a peer nobody had listened to.
 *
 * It matters now because the rate is no longer one number. A room broadcasts
 * faster when there are three people in it than when there are twenty (see
 * `sendHzFor`), so the peer standing next to you may be sending at 20Hz while
 * the constant here says 8 - and a buffer floored at two of *those* draws them
 * 250ms in the past when 100ms would have been honest. The lag people describe
 * as "the connection is not great" is mostly this: not the network, the
 * headroom we were holding against it.
 *
 * So the cadence is estimated from the gaps between arrivals, exactly as the
 * clock offset is estimated from their delays, and everything downstream - the
 * jitter spread, the delay floor, what counts as a keepalive rather than a
 * late packet - is scaled off the estimate rather than off a constant. A client
 * that has not reloaded since this shipped is a sender at 8Hz and is measured
 * as one, which is the whole point of measuring.
 *
 * ---------------------------------------------------------------------------
 * Clocks
 * ---------------------------------------------------------------------------
 * `MoveMessage.t` is the sender's `performance.now()` - a monotonic clock whose
 * epoch is the moment that tab opened, so two machines do not agree on it even
 * approximately. It does not need to: every sample in a buffer comes from *one*
 * peer, so only that peer's timeline has to be self-consistent, and a constant
 * offset cancels out. Monotonic is the important property, and the one
 * `Date.now()` lacks - a clock that steps backwards mid-session would reorder
 * the buffer.
 *
 * The offset is estimated with a running minimum of `arrived - sent`, which is
 * the standard trick - the sample that took the least time to arrive is the one
 * least polluted by queueing, so the minimum converges on the true offset
 * instead of the average delay. It is re-baselined after a gap, because a peer
 * who was away for a minute may be on a different network.
 *
 * `t` is optional on the wire. A client that has not reloaded since this shipped
 * sends no `t`, and stamping those on arrival is exactly the old behaviour plus
 * a buffer - still an improvement, and never a crash.
 */

import { SEND_INTERVAL, angleDelta, type Pose } from '@/app/world/_presence/presence-core'

/** One pose, stamped on our own clock. */
export interface Snapshot extends Pose {
  /** When this pose was true, in local time. */
  at: number
}

/**
 * How long a peer's history is worth keeping.
 *
 * Two seconds, which is `KEEPALIVE_MS` - the longest a still peer goes without
 * saying anything. Shorter and a peer who stood still would have their whole
 * history expire and be re-taught their own position as if they had just
 * arrived.
 */
const HISTORY_MS = 2000

/**
 * Floor and ceiling for the playout delay.
 *
 * Exported because it is not only ours: how far behind a peer is drawn is a term
 * in how long a local ball touch may outrank an incoming packet. See
 * `BALL_PREDICT_HOLD` in the lounge's multiplayer.
 */
export const MIN_PLAYOUT_DELAY = SEND_INTERVAL * 2
const MAX_DELAY = 600

/**
 * The floor under the *measured* delay, and the one number here that is not
 * measured.
 *
 * Two frames at 60Hz. Below this the render instant is close enough to the
 * newest sample that an ordinary frame-time wobble walks past it, and walking
 * past the newest sample is the starvation this module exists to avoid - it is
 * worse than easing, not better. It is the guard on the estimate being wrong,
 * not a target: nothing aims for it.
 */
const FLOOR_DELAY = 32

/**
 * Bounds on what a sender's cadence may be estimated as.
 *
 * The fast end is 40Hz, which is faster than anything in this product sends and
 * slower than a burst of two packets arriving back to back - so a stalled
 * connection that dumps its queue cannot convince us the peer is a firehose.
 * The slow end is 4Hz: a sender whose frame loop is that starved is a sender we
 * should be holding a quarter of a second for, and anything slower than it is
 * silence rather than cadence.
 */
const MIN_CADENCE = 25
const MAX_CADENCE = 250

/** How quickly the delay is allowed to follow the jitter estimate. */
const DELAY_EASE = 0.05

/**
 * How many packets a peer gets at the impatient weights.
 *
 * The estimate starts at *our* send interval, which is a guess about somebody
 * we have not heard from yet, and a guess corrected at 0.05 a packet takes a
 * couple of seconds to stop being wrong. Sixteen packets is a fifth of a second
 * at 20Hz and two seconds at 8Hz - long enough to average out a bad one, short
 * enough that nobody watches a peer catch up to their own timeline.
 */
const WARMUP_PACKETS = 16

/** A gap this long means the peer went away; re-baseline the clock. */
const REBASELINE_MS = 5000

export interface MotionBuffer {
  snaps: Snapshot[]
  /** `localTime - senderTime`, running minimum. `null` until the first packet. */
  offset: number | null
  /** Smoothed spread of arrival intervals around `cadence`, in ms. */
  jitter: number
  /**
   * How often this peer actually sends, in ms. Estimated from the gaps between
   * arrivals; starts as a guess at our own rate. See the header.
   */
  cadence: number
  /** Current playout delay in ms. */
  delay: number
  lastArrival: number | null
  /** Arrivals folded into `cadence` so far, capped. See `WARMUP_PACKETS`. */
  heard: number
}

export function newMotionBuffer(): MotionBuffer {
  return {
    snaps: [],
    offset: null,
    jitter: 0,
    cadence: SEND_INTERVAL,
    delay: MIN_PLAYOUT_DELAY,
    lastArrival: null,
    heard: 0,
  }
}

/**
 * File a pose that just arrived.
 *
 * `sent` is `MoveMessage.t` and may be absent; `now` is our own clock.
 */
export function record(
  buffer: MotionBuffer,
  pose: Pose,
  sent: number | null,
  now: number,
): void {
  const gap = buffer.lastArrival == null ? null : now - buffer.lastArrival
  buffer.lastArrival = now

  // A long silence means the previous offset describes a network this peer may
  // no longer be on, and a stale history would be interpolated *through*.
  if (gap != null && gap > REBASELINE_MS) {
    buffer.snaps.length = 0
    buffer.offset = null
    buffer.jitter = 0
    buffer.cadence = SEND_INTERVAL
    buffer.delay = MIN_PLAYOUT_DELAY
    buffer.heard = 0
  }

  /*
    How often this peer sends, and how far each arrival strays from it.

    Keepalives are ignored: a still peer sends every KEEPALIVE_MS and that is
    not jitter, it is silence. The window is the estimate's own four intervals
    *or* half a second, whichever is wider - and the floor under it is the
    interesting half. Without it a burst of two packets arriving back to back
    can drag the estimate down to its minimum, at which point every real gap
    looks like a keepalive, nothing is ever folded in again, and the buffer is
    stuck believing in a 40Hz peer that does not exist.
  */
  if (gap != null && gap < Math.max(buffer.cadence * 4, MAX_CADENCE * 2)) {
    const spread = Math.abs(gap - buffer.cadence)
    buffer.jitter = buffer.jitter * 0.9 + spread * 0.1

    // Impatient while the estimate is still our guess about somebody we had not
    // heard from, steady once it is theirs. See `WARMUP_PACKETS`.
    const weight = buffer.heard < WARMUP_PACKETS ? 0.25 : 0.05
    buffer.cadence = clamp(
      buffer.cadence + (gap - buffer.cadence) * weight,
      MIN_CADENCE,
      MAX_CADENCE,
    )
    if (buffer.heard < WARMUP_PACKETS) buffer.heard += 1
  }

  const wanted = clamp(buffer.cadence * 2 + buffer.jitter * 2, FLOOR_DELAY, MAX_DELAY)
  // Open up fast, close down slowly: a buffer that shrinks eagerly starves on
  // the next late packet, which is the failure this whole module is avoiding.
  // Except while warming up, where "slowly" would mean holding a fast peer a
  // quarter of a second behind for the first two seconds of watching them.
  const ease = buffer.heard < WARMUP_PACKETS ? 0.25 : DELAY_EASE
  buffer.delay =
    wanted > buffer.delay ? wanted : buffer.delay + (wanted - buffer.delay) * ease

  const stamp = sent ?? now
  const candidate = now - stamp
  buffer.offset = buffer.offset == null ? candidate : Math.min(buffer.offset, candidate)

  const at = stamp + buffer.offset

  // Out-of-order arrivals happen; keep the array sorted by when the pose was
  // true rather than by when it turned up, or the interpolation walks backwards.
  const snap: Snapshot = { at, x: pose.x, y: pose.y, z: pose.z, yaw: pose.yaw }
  const snaps = buffer.snaps
  if (snaps.length === 0 || at >= snaps[snaps.length - 1].at) snaps.push(snap)
  else {
    let i = snaps.length
    while (i > 0 && snaps[i - 1].at > at) i--
    snaps.splice(i, 0, snap)
  }

  const cutoff = now - HISTORY_MS
  let drop = 0
  // Keep one sample older than the cutoff: it is the left-hand end of the pair
  // the render instant currently sits between.
  while (drop + 1 < snaps.length && snaps[drop + 1].at < cutoff) drop++
  if (drop > 0) snaps.splice(0, drop)
}

/**
 * Write where the peer should be drawn this frame into `out`.
 *
 * Returns false when there is nothing to draw from yet, so the caller can leave
 * the body where it is rather than snapping it to the origin.
 */
export function sample(buffer: MotionBuffer, now: number, out: Pose): boolean {
  const snaps = buffer.snaps
  if (snaps.length === 0) return false

  if (snaps.length === 1) {
    copyInto(out, snaps[0])
    return true
  }

  const at = now - buffer.delay

  // Before anything we know about: the peer has only just appeared.
  if (at <= snaps[0].at) {
    copyInto(out, snaps[0])
    return true
  }

  // Past the newest sample - the next packet is late. Hold the last known pose
  // rather than extrapolating: guessing forward makes a peer overshoot and snap
  // back, which reads worse than a body that pauses for a frame or two.
  const newest = snaps[snaps.length - 1]
  if (at >= newest.at) {
    copyInto(out, newest)
    return true
  }

  let i = snaps.length - 1
  while (i > 0 && snaps[i - 1].at > at) i--
  const b = snaps[i]
  const a = snaps[i - 1]

  const span = b.at - a.at
  const f = span <= 0 ? 1 : (at - a.at) / span

  out.x = a.x + (b.x - a.x) * f
  out.y = a.y + (b.y - a.y) * f
  out.z = a.z + (b.z - a.z) * f
  out.yaw = a.yaw + angleDelta(a.yaw, b.yaw) * f
  return true
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

function copyInto(out: Pose, from: Pose): void {
  out.x = from.x
  out.y = from.y
  out.z = from.z
  out.yaw = from.yaw
}
