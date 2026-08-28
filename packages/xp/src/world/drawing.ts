/**
 * `@kxb/xp/drawing` - the gap between where a thing is and where it is drawn.
 *
 * ---------------------------------------------------------------------------
 * Why anything lives on this side of the line
 * ---------------------------------------------------------------------------
 * Nothing in this file is ever read back. Not by a trigger, not by a goal, not
 * by a contact and not by a claim: `./owning` hands the ball over from
 * `world.position`, `./bodies` steps it there and `./triggers` tests it there,
 * and what is here is only what the GPU is told *instead*. The runtime already
 * draws that line for a flinch - `shakeOf` wobbles a crate you can still hit
 * exactly where you can see it - and this is the same line for two more things
 * that both wanted it.
 *
 * ---------------------------------------------------------------------------
 * The handover, which is correct and looks broken
 * ---------------------------------------------------------------------------
 * `./owning` explains at length why a follower draws an owned body a quarter of
 * a second in the past and why a new owner adopts the **newest** sample there
 * is. Both are right and neither is negotiable - one is what makes a followed
 * ball smooth, the other is what stops a claimed ball rolling from a standstill.
 *
 * Put together they are a quarter of a second of travel that the ball has to
 * cross the moment you touch it, and at ten cells a second that is two and a
 * half cells appearing under your foot. Every touch, on the toucher's own
 * screen, which is exactly where it is least forgivable - *"glitches like
 * teleport"*. The mirror happens to whoever is losing it: a live position
 * replaced by a delayed one.
 *
 * The fix cannot be in the simulation, because the simulation is not wrong. So
 * the drawn ball simply **does not move** at a handover: the gap is captured as
 * an offset, the mesh is drawn at position plus offset, and the offset is
 * decayed to nothing over about a sixth of a second. The ball is authoritative
 * from the first frame and catches up with itself while you are still watching
 * your own foot. Past a few cells it snaps instead - a gap that large is a
 * teleport or a reset, and easing one of those is a ball sliding across a pitch
 * it never travelled.
 *
 * ---------------------------------------------------------------------------
 * Rolling, from the drawn position and nothing else
 * ---------------------------------------------------------------------------
 * `BodySpec.roll` has been in the format since bodies could move and it turned
 * `world.rotation` - a **yaw**, which on a ball is a ball spinning on the spot
 * rather than rolling, and which only ever happened on whichever client was
 * integrating, because rotation is not in a `BodySample`. So one player saw a
 * ball twirling and the other saw one skating.
 *
 * `Rolling` is the thing that comment said somebody would have to write. It
 * turns about the axis perpendicular to travel, so the ball rolls the way it is
 * going, and it derives the travel from the **drawn** position rather than from
 * `world.velocity` - which is the only signal that exists on every client, since
 * a follower's velocity row is deleted by `Balls.place` on purpose. It is also
 * the signal that is already smooth, and already has the offset above folded
 * into it, so a ball catching up with itself rolls the distance it appears to
 * cover.
 */

import type { EntityId } from './entities'

/** A point in the world, or an offset from one. Cells. */
export interface Point {
  x: number
  y: number
  z: number
}

/** A rotation, as the four plain numbers a renderer can hand to a quaternion. */
export interface Spin {
  x: number
  y: number
  z: number
  w: number
}

/**
 * How long a captured gap takes to close, as an exponential time constant.
 *
 * A sixth of a second, which is two thirds of the interpolation delay it is
 * usually absorbing. Long enough that nothing steps, short enough that the ball
 * you just kicked is genuinely where it says it is by the time you look up. A
 * time constant rather than a duration because the decay is `exp(-delta/this)` -
 * see `Smoothing.fade`, which is framerate-independent by construction rather
 * than by a tuned per-frame fraction that runs twice as fast on a 120Hz screen.
 */
export const EASE_SECONDS = 0.16

/**
 * Past this, the drawn thing snaps rather than slides. Cells.
 *
 * A sanity bound, and it is doing two jobs. A gap this big out of a handover
 * means something has gone properly wrong - a client that was integrating a
 * ball nobody was watching, or a packet from a level a round behind - and
 * easing it draws a ball crossing ground it was never on. And a *deliberate*
 * teleport is the same shape: a goal that puts the ball back on the centre spot
 * should put it there, not walk it home.
 *
 * Four cells, which is a comfortable multiple of the two and a half an
 * ordinary handover produces and still well under any move an author would call
 * a teleport.
 */
export const SNAP_BEYOND = 4

/** Below this an offset is gone rather than nearly gone. Cells. */
const SETTLED = 0.002

/**
 * How long a pending capture waits for somebody to say where the thing really
 * is, in seconds.
 *
 * There has to be a limit, and the case that needs one is a ball that was **at
 * rest** when ownership moved: `bodiesOf` leaves a settled body out of the
 * packet, so the new owner sends nothing at all and the capture would sit there
 * until the next kick - and then absorb a real, wanted movement. Half a second
 * is several round trips and far less than the pause before anybody touches it
 * again.
 */
const WAITS_SECONDS = 0.5

/**
 * The gap between where things are and where they are drawn, on its way to zero.
 *
 * Stateful and honestly so, like `Crowd` and `Balls`: it is a handful of rows
 * that are written when something discontinuous happens and read every frame
 * after. `delta` is passed in, in **seconds**, and it is the simulation's own
 * delta rather than a wall clock - the same clock `shaking` is decayed on, and
 * deliberately not the `performance.now()` milliseconds `Balls` buffers on. Two
 * clocks in one runtime is the mistake this codebase has already made once.
 */
export class Smoothing {
  private readonly offsets = new Map<EntityId, Point>()
  /** Where something was drawn, kept until somebody says where it really is. */
  private readonly waits = new Map<EntityId, { at: Point; left: number }>()

  /** How far the drawn thing is from the real one, or null if it is on it. */
  offsetOf(id: EntityId): Point | null {
    return this.offsets.get(id) ?? null
  }

  /**
   * Where this is being drawn right now, before something moves it.
   *
   * Half of a capture, and split from the other half because the two moments
   * are not always the same frame: ownership is *lost* on the packet that says
   * so and the delayed position it will be drawn at does not exist until the new
   * owner's first sample arrives, which is a round trip later. Gaining is both
   * halves in one go - see `absorb`.
   *
   * Takes the raw position and adds whatever offset is already in flight, so a
   * second handover part way through the first one composes instead of throwing
   * the first one away. The caller passes what the world says; this knows what
   * is drawn.
   */
  drawnAt(id: EntityId, from: Point): void {
    const offset = this.offsets.get(id)
    this.waits.set(id, {
      at: {
        x: from.x + (offset?.x ?? 0),
        y: from.y + (offset?.y ?? 0),
        z: from.z + (offset?.z ?? 0),
      },
      left: WAITS_SECONDS,
    })
  }

  /**
   * ...and where it really is, which is the frame the gap opens.
   *
   * Silently nothing for a body with no capture pending, which is every body on
   * every ordinary frame - the caller is a loop over `waiting()` and this is the
   * guard that lets it be called from anywhere else too.
   */
  placedAt(id: EntityId, to: Point): void {
    const pending = this.waits.get(id)
    if (!pending) return
    this.waits.delete(id)

    const x = pending.at.x - to.x
    const y = pending.at.y - to.y
    const z = pending.at.z - to.z
    const far = Math.sqrt(x * x + y * y + z * z)
    // Too far to be a handover, or too near to be worth a row. Either way the
    // drawn thing is the real thing from this frame on.
    if (far > SNAP_BEYOND || far < SETTLED) {
      this.offsets.delete(id)
      return
    }
    this.offsets.set(id, { x, y, z })
  }

  /** Both halves at once, for a handover that happens inside one frame. */
  absorb(id: EntityId, from: Point, to: Point): void {
    this.drawnAt(id, from)
    this.placedAt(id, to)
  }

  /** Which bodies are still waiting to be told where they really are. */
  waiting(): IterableIterator<EntityId> {
    return this.waits.keys()
  }

  /** Whether anything is waiting at all, so a frame can skip the loop. */
  get pending(): number {
    return this.waits.size
  }

  /** How many gaps are open. For tests, and for the same frame's early out. */
  get open(): number {
    return this.offsets.size
  }

  /**
   * Every gap, a little closer to zero. `delta` in seconds.
   *
   * `exp(-delta/EASE_SECONDS)` rather than a fixed fraction per frame, because a
   * fraction per frame is a different easing on every machine - and the two
   * machines in a two-player kickabout are exactly where somebody would notice.
   * Half a frame and ten frames of it land in the same place.
   */
  fade(delta: number): void {
    if (!(delta > 0)) return

    const left = Math.exp(-delta / EASE_SECONDS)
    for (const [id, offset] of this.offsets) {
      offset.x *= left
      offset.y *= left
      offset.z *= left
      if (Math.abs(offset.x) + Math.abs(offset.y) + Math.abs(offset.z) < SETTLED) {
        this.offsets.delete(id)
      }
    }
    // And a capture nobody ever answered, given up on. See `WAITS_SECONDS`.
    for (const [id, pending] of this.waits) {
      pending.left -= delta
      if (pending.left <= 0) this.waits.delete(id)
    }
  }

  /** This thing no longer exists, or is exactly where it says it is. */
  forget(id: EntityId): void {
    this.offsets.delete(id)
    this.waits.delete(id)
  }

  /** A new round. Ids are reused, so a leftover row is somebody else's gap. */
  clear(): void {
    this.offsets.clear()
    this.waits.clear()
  }
}

/**
 * How far round a rolling thing has turned, from how far it has been drawn.
 *
 * A quaternion per body rather than three angles, because rolling is not a
 * yaw-pitch-roll: a ball that goes out, comes back and goes out again at a
 * different angle has accumulated a rotation no ordered triple of axes
 * describes. Four plain numbers, multiplied by hand, so this stays a package
 * with no renderer in it.
 */
export class Rolling {
  private readonly spins = new Map<EntityId, Spin>()
  private readonly wasAt = new Map<EntityId, { x: number; z: number }>()

  /**
   * Roll this to where it is now drawn, and say how it is turned.
   *
   * `perCell` is the blueprint's `body.roll`, in degrees per cell travelled.
   * Rolling without slipping is `180/(pi*radius)` - about 115 for a ball half a
   * cell across - and an author who wants a beach ball to spin twice as fast as
   * it travels is allowed to say so; this is drawing, and nothing reads it back.
   *
   * Null before there is a previous point to measure from, which is the frame a
   * body appears, and null for a step too big to be travel: a goal that puts the
   * ball back on the centre spot has not rolled it thirty times on the way, and
   * a body that was hidden and is drawn again has not rolled at all. Reuses
   * `SNAP_BEYOND` for that, because it is the same question `Smoothing` asks -
   * *is this movement, or is this somebody putting it somewhere*.
   *
   * **Once per body per frame.** It integrates, so a caller that asks twice
   * rolls twice - which is why the renderer works it out before the loop over
   * the places one blueprint draws this model.
   */
  rolled(id: EntityId, x: number, z: number, perCell: number): Spin | null {
    const was = this.wasAt.get(id)
    this.wasAt.set(id, { x, z })
    if (!was) return null

    const dx = x - was.x
    const dz = z - was.z
    const far = Math.sqrt(dx * dx + dz * dz)
    const held = this.spins.get(id) ?? null
    if (far === 0 || far > SNAP_BEYOND || perCell === 0) return held

    /**
     * The axis, which is up crossed with the way it is going.
     *
     * So a ball travelling in +x turns about -z, which takes its top forwards -
     * the one sign in this file that is easy to get backwards and impossible to
     * miss once it is wrong, because the ball rolls uphill.
     */
    const ax = dz / far
    const az = -dx / far
    const half = (far * perCell * Math.PI) / 360
    const sin = Math.sin(half)
    const turn: Spin = { x: ax * sin, y: 0, z: az * sin, w: Math.cos(half) }

    const next = held ? times(turn, held) : turn
    const spin = unit(next)
    this.spins.set(id, spin)
    return spin
  }

  /** How this is turned, without rolling it. */
  spinOf(id: EntityId): Spin | null {
    return this.spins.get(id) ?? null
  }

  /** Drop everything that is not in the world any more. */
  sweep(alive: ReadonlySet<EntityId>): void {
    for (const id of this.spins.keys()) if (!alive.has(id)) this.spins.delete(id)
    for (const id of this.wasAt.keys()) if (!alive.has(id)) this.wasAt.delete(id)
  }

  /** How many things are being rolled. For tests. */
  get count(): number {
    return this.spins.size
  }

  clear(): void {
    this.spins.clear()
    this.wasAt.clear()
  }
}

/** `a` applied after `b`, which is the Hamilton product in that order. */
function times(a: Spin, b: Spin): Spin {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  }
}

/**
 * Renormalised, because this is accumulated for the length of a match.
 *
 * Sixty multiplications a second drift, and a quaternion that has drifted off
 * the unit sphere is a mesh that is quietly growing or shrinking - which reads
 * as a ball that has been inflating for two minutes rather than as a rounding
 * error.
 */
function unit(of: Spin): Spin {
  const length = Math.sqrt(of.x * of.x + of.y * of.y + of.z * of.z + of.w * of.w)
  if (length === 0) return { x: 0, y: 0, z: 0, w: 1 }
  return { x: of.x / length, y: of.y / length, z: of.z / length, w: of.w / length }
}
