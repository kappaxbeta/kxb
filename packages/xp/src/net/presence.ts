/**
 * Where everybody else is.
 *
 * The receiving half of multiplayer, and the half that decides whether other
 * people look like people or like something stuttering across the floor. It is
 * pure - samples in, a transform out - which is the only reason any of it can be
 * checked: two laptops in a room cannot be put inside `bun test`, and every bug
 * in this file looks like "the network is bad" from the outside.
 *
 * ---------------------------------------------------------------------------
 * Everybody else is drawn in the past
 * ---------------------------------------------------------------------------
 * This is the decision the rest follows from. A sample says where somebody was
 * when they sent it, and at 8 Hz the next one is 125 ms away - so drawing the
 * newest sample means a body that jumps eight times a second and stands still in
 * between.
 *
 * The two ways out are extrapolation and delay. Extrapolation guesses where they
 * are *now* from where they were going, and is wrong every time somebody changes
 * their mind - which is a body that walks into a wall and is snapped back, sixty
 * times a minute, and reads as lag rather than as a correction. Delay draws them
 * where they actually were, `INTERPOLATION_DELAY` ago, between two samples that
 * both arrived. The cost is that everybody is a quarter of a second behind, and
 * the benefit is that nothing is ever a guess.
 *
 * How far behind is not a free choice, and getting it wrong the *tight* way
 * looks like a network problem rather than a setting: too small a delay runs
 * past the newest sample the moment a packet is late, and a body that freezes
 * and then snaps is precisely the stutter this whole approach exists to avoid.
 * See `INTERPOLATION_DELAY`.
 *
 * A shooter is exactly where that trade is argued about, and it is still the
 * right one here: the shot is tested against the boxes this file produces, so
 * what you hit is what you saw. "I shot them and it did not count" is the bug
 * that makes a game feel broken; "they were a quarter of a second further along
 * than I could see" is one nobody can perceive.
 *
 * ---------------------------------------------------------------------------
 * Nothing here trusts a clock it did not read
 * ---------------------------------------------------------------------------
 * Samples carry no timestamp of their own. Two browsers disagree about what time
 * it is by anything up to minutes, so a sender's clock is a number the receiver
 * cannot use - and the alternative, a clock sync handshake, is a protocol to get
 * wrong for an effect this does not need. What matters is the *spacing* between
 * arrivals, which the receiver can time itself, so a sample is stamped when it
 * lands.
 */

import { EYE_HEIGHT, type Vec3 } from '../world/physics'
import { personBox, type PersonTarget } from '../world/shooting'

/**
 * What one player sends about themselves. Six numbers, and no more.
 *
 * `y` is the **feet**, not the eye. See `sampleAt` for why that is worth a
 * sentence and was worth a bug.
 */
export interface Sample {
  x: number
  y: number
  z: number
  /** Degrees about Y, the document's unit. */
  facing: number
  /**
   * Whether they are dancing, which is the one thing here that is not a place.
   *
   * -------------------------------------------------------------------------
   * Why a stance travels when a gait does not
   * -------------------------------------------------------------------------
   * Everything else about how a body is animated is *derived* by the receiver:
   * a walk, a run, a fall and a landing all fall out of where the body has been
   * over the last few samples, which is why this packet has only ever carried a
   * place and a facing. That is not an economy, it is the reason a peer whose
   * update is late slows to a stop and their legs slow with them.
   *
   * A dance cannot be derived, because a dancing body and a standing body have
   * exactly the same positions - the same argument `Motion` makes about `dead`.
   * So it is the one animation fact that has to be *said*, and it costs one bit
   * eight times a second.
   *
   * Optional so a client that has not reloaded since this shipped reads as not
   * dancing rather than as malformed.
   */
  dance?: boolean
  /**
   * Whether they have gone down, on the same terms as `dance` above.
   *
   * The second stance that cannot be derived, and the pair is the whole list: a
   * corpse and somebody standing still report identical positions, so a receiver
   * watching the buffer has no way to tell them apart. Without this a peer who
   * died simply stopped moving, which reads as somebody idling - and the fall
   * that says what happened to them never played on anybody's screen but their
   * own.
   *
   * How long they stay down is *not* here, because it is not a fact about a
   * frame: `rules.respawn` is the document's answer and the person who died is
   * the one counting it. This says only that they are down now.
   */
  down?: boolean
}

/**
 * The local body, as the wire wants it.
 *
 * The controller holds a position that is the *eye* - `feet + EYE_HEIGHT` -
 * because that is what a camera sits at and what every test in ./physics is
 * written against. What goes on the wire is the *feet*, because the only thing
 * the receiver does with it is stand a model there, and a model's origin is on
 * the floor.
 *
 * Both of those were true, and for a while nothing converted between them: the
 * local body was drawn at `y - EYE_HEIGHT` and everybody else was drawn at `y`,
 * so every other person in the room stood a body-height in the air. Two
 * conventions a hundred lines apart, each correct on its own.
 *
 * It is here rather than at the call site because this is the file that owns
 * the format, and a convention that lives in a component is one the next sender
 * will not know about.
 */
export function sampleAt(eye: Vec3, facing: number, doing?: { dance?: boolean; down?: boolean }): Sample {
  // Omitted rather than sent as false, so the ordinary packet is the four
  // numbers it has always been and only a body doing one of these two things
  // costs an extra key.
  return {
    x: eye.x,
    y: eye.y - EYE_HEIGHT,
    z: eye.z,
    facing,
    ...(doing?.dance ? { dance: true } : {}),
    ...(doing?.down ? { down: true } : {}),
  }
}

/** A sample, stamped by whoever received it. */
interface Held extends Sample {
  at: number
}

/**
 * How far behind the newest sample everybody else is drawn.
 *
 * **Two send intervals, not one.** This was 150 ms - "a little over one send
 * interval at 8 Hz" - and that description was also the bug. One interval plus
 * a little is a margin of *almost nothing*: against a real spacing of 133 ms it
 * left 17 ms before `at` ran past the newest sample, returned `settled`, and
 * froze the body on its last position until the next packet landed. Then it
 * snapped. Any network worth the name jitters by more than 17 ms, so this fired
 * constantly, and it was reported as exactly what it is - stuttering.
 *
 * Two intervals absorbs a whole missing packet. The cost is that everybody is a
 * quarter of a second behind rather than an eighth, which is the trade the top
 * of this file argues for and is still the right side of it: a body drawn a
 * little further in the past is imperceptible, and a body that stops dead eight
 * times a second is the first thing anybody notices.
 *
 * A default rather than the law - see `delayFor`, which derives it from the
 * rate the host actually sends at.
 */
export const INTERPOLATION_DELAY = 250

/**
 * The delay that matches a send rate.
 *
 * The constant above has to agree with a number defined in another package -
 * `XpNetwork.sendHz` - and a constant that has to agree with something it cannot
 * see is a constant that will eventually disagree with it. The host knows its
 * own rate, so it can say so: at 8 Hz this is 250 ms, and a host that sends
 * twice as often gets half the delay without editing this file.
 *
 * Two intervals, for the reason above.
 */
export function delayFor(sendHz: number): number {
  // A rate of zero or less is a host that has not filled the field in. The
  // default is a better answer than dividing by it.
  if (!Number.isFinite(sendHz) || sendHz <= 0) return INTERPOLATION_DELAY
  return 2000 / sendHz
}

/**
 * Whether enough time has passed to send again, and what is left over.
 *
 * Beside `sampleAt` because it is the other half of the *sending* side, and in
 * this file rather than in the component for the reason that one is: it was
 * wrong, silently, and a rate that is 6% off shows up in no type and no test.
 *
 * **The remainder is carried rather than dropped.** The caller used to reset its
 * accumulator to zero on send, which throws away the overshoot: at 8 Hz and
 * 60 fps the threshold is crossed on the 8th frame at 133 ms, so the real rate
 * was 7.5 Hz and it wandered between 117 ms and 133 ms as the frame time moved.
 * Subtracting the interval instead keeps the average exactly on the rate asked
 * for, which is what the receiver's delay is sized against.
 */
export function sendDue(since: number, sendHz: number): { send: boolean; since: number } {
  if (!Number.isFinite(sendHz) || sendHz <= 0) return { send: false, since }
  const interval = 1 / sendHz
  if (since < interval) return { send: false, since }
  /**
   * Modulo rather than one subtraction.
   *
   * A tab returning from the background hands back a delta worth many intervals,
   * and subtracting one would leave the accumulator still over the threshold -
   * so the next few frames would each fire a send, a burst of packets about a
   * position that has not changed. One send, and the remainder is whatever is
   * genuinely left.
   */
  return { send: true, since: since % interval }
}

/**
 * How long a body is held after the last thing it said.
 *
 * A dropped packet is not a departure, and a tab that hitches for half a second
 * is not either - so a body stands where it was rather than vanishing. Who is
 * actually *present* is the socket's question, not this file's: a peer that left
 * is removed by name, and this only decides what to do about silence.
 */
export const STALE_AFTER = 5_000

/** Where somebody is, as the renderer wants it. */
export interface Placed extends Sample {
  /** True while this is the last thing they said rather than between two. */
  settled: boolean
}

/**
 * Everybody else, buffered.
 *
 * A class rather than a bag of functions because it is the one thing in this
 * package that is honestly stateful: it is a *buffer*, and a buffer whose
 * contents are threaded through every call would be the same object written
 * less clearly.
 */
export class Crowd {
  private readonly samples = new Map<string, Held[]>()

  /**
   * How far in the past this one draws, in milliseconds.
   *
   * Taken rather than read off the module, so a host that knows its own send
   * rate can hand over `delayFor(sendHz)` instead of hoping a constant in this
   * package agrees with a number defined in another one. The default is what
   * every caller had before and what the tests are written against.
   */
  constructor(private readonly delay: number = INTERPOLATION_DELAY) {}

  /**
   * Take a sample, stamped with when it arrived.
   *
   * `now` is passed in rather than read, for the reason the whole engine passes
   * time in: a module that finds out what time it is cannot be stepped by a test
   * at whatever rate the test likes.
   */
  remember(id: string, sample: Sample, now: number): void {
    const held = this.samples.get(id)
    const stamped: Held = { ...sample, at: now }
    if (!held) {
      this.samples.set(id, [stamped])
      return
    }
    /**
     * Out-of-order arrivals are dropped rather than sorted in.
     *
     * A transport that can reorder can also duplicate, and a buffer that accepts
     * a sample from before the one it already has will interpolate *backwards* -
     * a body that walks two steps forward and one back, for as long as the
     * network is unhappy. Dropping one late packet costs a frame nobody sees.
     */
    if (stamped.at < (held.at(-1)?.at ?? 0)) return
    held.push(stamped)

    // Everything older than the delay is unreachable: nothing will ever be drawn
    // from it again. One kept past the cutoff, because the pair being
    // interpolated between straddles it.
    const cutoff = now - this.delay * 2
    while (held.length > 2 && held[1].at < cutoff) held.shift()
  }

  /** Somebody who left, forgotten outright. */
  forget(id: string): void {
    this.samples.delete(id)
  }

  /** Everyone with anything to say. */
  ids(): string[] {
    return [...this.samples.keys()]
  }

  /**
   * Where somebody should be drawn, or null if they have said nothing.
   *
   * The answer is between the two samples that straddle `now - delay`. Before
   * the first one there is nothing to interpolate from, so it is the first
   * sample itself - which is why a body appears where it was rather than sliding
   * in from the origin.
   */
  at(id: string, now: number): Placed | null {
    const held = this.samples.get(id)
    if (!held || held.length === 0) return null

    const target = now - this.delay

    const newest = held[held.length - 1]
    // Past the end of what we have: hold the last thing they said. Not
    // extrapolated - see the note at the top - and marked, so a caller that
    // wants to fade a silent body can.
    if (target >= newest.at) return { ...strip(newest), settled: true }

    const oldest = held[0]
    if (target <= oldest.at) return { ...strip(oldest), settled: held.length === 1 }

    for (let i = held.length - 1; i > 0; i--) {
      const after = held[i]
      const before = held[i - 1]
      if (target < before.at) continue
      const span = after.at - before.at
      // Two samples stamped at the same millisecond: the later one wins rather
      // than a division by zero.
      const t = span <= 0 ? 1 : (target - before.at) / span
      return {
        x: lerp(before.x, after.x, t),
        y: lerp(before.y, after.y, t),
        z: lerp(before.z, after.z, t),
        facing: lerpAngle(before.facing, after.facing, t),
        // No midpoint between dancing and not: it takes the sample the draw is
        // coming *from*, so the flag changes on the same frame the body reaches
        // the position it changed at.
        ...(before.dance ? { dance: true } : {}),
        ...(before.down ? { down: true } : {}),
        settled: false,
      }
    }

    return { ...strip(oldest), settled: false }
  }

  /**
   * Everybody, as something a bullet can meet.
   *
   * Where they are *drawn* rather than where their last packet said, which is
   * the only defensible answer: a body is hittable where the player can see it,
   * and a hitbox at the newest sample would sit a quarter of a second ahead of
   * the thing on screen. Shooting somebody would then mean aiming at where they
   * are not, which reads as the game being broken rather than as latency.
   *
   * Anybody with nothing to say yet is left out - there is no box for a body
   * that has not been drawn.
   */
  targets(now: number): PersonTarget[] {
    const targets: PersonTarget[] = []
    for (const id of this.samples.keys()) {
      const placed = this.at(id, now)
      if (placed) targets.push({ id, box: personBox(placed) })
    }
    return targets
  }

  /** Who has gone quiet for long enough to be dropped. */
  silent(now: number): string[] {
    const gone: string[] = []
    for (const [id, held] of this.samples) {
      const last = held[held.length - 1]
      if (last && now - last.at > STALE_AFTER) gone.push(id)
    }
    return gone
  }
}

const strip = ({ x, y, z, facing, dance, down }: Held): Sample => ({
  x,
  y,
  z,
  facing,
  ...(dance ? { dance } : {}),
  ...(down ? { down } : {}),
})

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Turning the short way round.
 *
 * 350° to 10° is twenty degrees, not three hundred and forty. Interpolating the
 * numbers directly spins a body most of the way round its own axis every time it
 * crosses north, which is both wrong and the funniest bug in this file.
 */
export function lerpAngle(a: number, b: number, t: number): number {
  const delta = (((b - a) % 360) + 540) % 360 - 180
  return (((a + delta * t) % 360) + 360) % 360
}
