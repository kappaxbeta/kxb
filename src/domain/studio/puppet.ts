import { type Action, ordered } from '@/domain/studio/action'
import type { Actor } from '@/domain/studio/shot'

/**
 * A performance, turned into a timeline.
 *
 * Driving an animal around by hand is the fastest way to author a shot and the
 * worst way to store one. What comes off the keyboard is a position twenty
 * times a second - a thousand numbers for a fifty second take, describing a
 * path that is really "walk to the crate, stop, walk to the fox". Kept raw it
 * would be a timeline nobody could edit, which is the whole reason the studio
 * has verbs at all.
 *
 * So a take is *reduced*: the wobble is thrown away and what is left is the
 * handful of moves somebody actually meant. The discrete things - a jump, a
 * line, an emote - are not reduced at all, because the moment they happened is
 * exactly what was performed.
 *
 * ---------------------------------------------------------------------------
 * Why the reduction runs in space *and* time
 * ---------------------------------------------------------------------------
 * Ramer-Douglas-Peucker over (x, z) alone finds the corners and loses the
 * pauses: walking up a straight line, stopping for three seconds and walking on
 * is spatially one leg, and would come back as one slow continuous move. So
 * time is carried as a third axis, scaled by a walking pace so that a second of
 * standing still is about as significant as a block of travel. One algorithm,
 * one tolerance, and it splits on both kinds of corner.
 *
 * ---------------------------------------------------------------------------
 * Why the pace is not the lounge's
 * ---------------------------------------------------------------------------
 * The lounge walks at seven blocks a second. The studio calls anything over
 * 2.4 a run - see `clipFor` - so a puppet driven at lounge pace would be
 * performed as a walk and saved as a sprint, and the take would not match the
 * thing it produced. What matters here is that those two agree, so the pace is
 * the studio's, and it is documented rather than tuned by feel.
 */

/**
 * What somebody is asking their animal to do, right now.
 *
 * Between the input and the movement, and the reason there is a type here at
 * all: a keyboard and a thumb on a stick are the same intent arrived at
 * differently, and `stepPuppet` should not have to know which one it got. It is
 * also the only way any of this is testable - a key press is a browser event
 * and a drag is a pointer capture, but "forward, and running" is a value.
 */
export interface Intent {
  /** Away from the camera at 1, towards it at -1. */
  forward: number
  /** Camera-right at 1. */
  strafe: number
  run: boolean
}

export const STILL_INTENT: Intent = { forward: 0, strafe: 0, run: false }

export interface Puppet {
  x: number
  z: number
  /** Degrees, in the studio's convention. */
  heading: number
  /** Blocks covered since the take began. Feeds the walk cycle. */
  distance: number
  /** Blocks a second right now. Picks the clip. */
  speed: number
}

const rad = Math.PI / 180

/**
 * One step of driving.
 *
 * Pure, and takes the whole state in and out, so the frame loop holds the ref
 * and this holds no memory. `azimuth` is the direction the camera is looking,
 * in degrees, which is what makes forward mean "away from me" - a shot's camera
 * can be anywhere, and world-axis controls send the animal sideways at three
 * quarters of the framings anybody actually composes.
 *
 * No acceleration, deliberately. The lounge's controller has momentum because
 * it is a game and weight is part of how it feels; this is a recording device,
 * and momentum would put a curve at the start and end of every leg that nobody
 * performed and that the reduction would then have to throw away.
 *
 * The heading only moves while the animal does: one that stops keeps facing the
 * way it was walking, exactly as `sceneAt` has it, rather than snapping to
 * whatever a zero-length direction rounds to.
 */
export function stepPuppet(
  state: Puppet,
  intent: Intent,
  delta: number,
  azimuth: number,
): Puppet {
  const push = Math.hypot(intent.forward, intent.strafe)
  if (push <= 0.001 || delta <= 0) return { ...state, speed: 0 }

  // Clamped rather than normalised, so a stick pushed half way walks at half
  // pace while a keyboard - which can only ever say 1 - still walks at full.
  // Normalising outright would make every analog input a sprint.
  const throttle = Math.min(1, push)
  const pace = (intent.run ? PUPPET_RUN : PUPPET_WALK) * throttle
  const step = (pace * delta) / push

  // The camera's own axes on the ground plane.
  const sin = Math.sin(azimuth * rad)
  const cos = Math.cos(azimuth * rad)

  const dx = (intent.forward * sin + intent.strafe * cos) * step
  const dz = (intent.forward * cos - intent.strafe * sin) * step

  return {
    x: state.x + dx,
    z: state.z + dz,
    heading: Math.atan2(dx, dz) / rad,
    distance: state.distance + Math.hypot(dx, dz),
    speed: pace,
  }
}

export interface Sample {
  /** Seconds from the start of the shot, not from the start of the take. */
  t: number
  x: number
  z: number
}

/** Blocks a second, driving. Below `RUNNING` in `shot.ts`, so it reads as a walk. */
export const PUPPET_WALK = 1.8

/** And with shift held. Above it, so it reads as a run. */
export const PUPPET_RUN = 3.6

/**
 * How much a second of time weighs against a block of distance, when reducing.
 *
 * The walking pace, so that standing still for a second displaces the same
 * amount as walking for a second - which is what makes a pause survive the
 * reduction rather than being smoothed through.
 */
const TIME_WEIGHT = PUPPET_WALK

/**
 * How far the reduced path may stray from the performed one, in blocks.
 *
 * Generous on purpose. Tight tolerances preserve the shake of somebody's hand
 * on the keyboard, which is not a thing anybody performed - and every point
 * kept is a clip in the timeline to look at later.
 */
export const DEFAULT_TOLERANCE = 0.35

/** Below this much travel, a leg is somebody standing still rather than moving. */
const STILL = 0.08

interface Point {
  t: number
  x: number
  z: number
}

/** Distance from `p` to the segment `a`-`b`, in the weighted three-space. */
function deviation(p: Point, a: Point, b: Point): number {
  const ax = a.x
  const az = a.z
  const at = a.t * TIME_WEIGHT
  const bx = b.x - ax
  const bz = b.z - az
  const bt = b.t * TIME_WEIGHT - at
  const px = p.x - ax
  const pz = p.z - az
  const pt = p.t * TIME_WEIGHT - at

  const length = bx * bx + bz * bz + bt * bt
  // A segment of no length at all - two samples at the same instant and place -
  // is a point, and the distance to it is the plain one.
  const u = length <= 0 ? 0 : Math.min(1, Math.max(0, (px * bx + pz * bz + pt * bt) / length))

  const dx = px - bx * u
  const dz = pz - bz * u
  const dt = pt - bt * u
  return Math.sqrt(dx * dx + dz * dz + dt * dt)
}

/**
 * The same path, with the points nobody meant removed.
 *
 * Iterative rather than recursive: a fifty second take at twenty samples a
 * second is a thousand points, and the recursive formulation of this is a
 * thousand stack frames deep in the degenerate case where every point is a
 * corner - which is exactly what a take driven with a shaky hand looks like.
 */
export function simplify(samples: Sample[], tolerance = DEFAULT_TOLERANCE): Sample[] {
  if (samples.length <= 2) return [...samples]

  const keep = new Array<boolean>(samples.length).fill(false)
  keep[0] = true
  keep[samples.length - 1] = true

  const stack: [number, number][] = [[0, samples.length - 1]]

  while (stack.length > 0) {
    const span = stack.pop()
    if (!span) break
    const [first, last] = span
    if (last <= first + 1) continue

    let worst = -1
    let worstAt = first

    for (let i = first + 1; i < last; i += 1) {
      const distance = deviation(samples[i], samples[first], samples[last])
      if (distance > worst) {
        worst = distance
        worstAt = i
      }
    }

    if (worst > tolerance) {
      keep[worstAt] = true
      stack.push([first, worstAt], [worstAt, last])
    }
  }

  return samples.filter((_, i) => keep[i])
}

export interface Take {
  /** When the take began, in shot time. */
  start: number
  /** And when it stopped. */
  end: number
  /** Where the actor stood at `start`, so the first leg begins from the truth. */
  from: { x: number; z: number }
  /** The performed path, in order. */
  path: Sample[]
  /**
   * Everything that was not a position: jumps, emotes, lines, dances.
   *
   * Already actions, and passed straight through. These are not reduced,
   * smoothed or re-timed - the moment somebody pressed the key *is* the
   * performance, and there is nothing to infer.
   */
  events: Action[]
}

/**
 * A take, as actions.
 *
 * Legs that cover no ground are dropped rather than emitted as a move of zero
 * distance: the sampler holds an actor's position when nothing is moving them,
 * so a pause is the absence of a clip rather than a clip that does nothing -
 * and a timeline full of two-second "Move 3.4, 1.2" bars that change nothing is
 * one nobody can read.
 */
export function actionsFromTake(take: Take, tolerance = DEFAULT_TOLERANCE): Action[] {
  const path = simplify(take.path, tolerance)
  const moves: Action[] = []

  let fromX = take.from.x
  let fromZ = take.from.z
  let fromT = take.start

  for (const point of path) {
    const distance = Math.hypot(point.x - fromX, point.z - fromZ)
    const duration = point.t - fromT

    if (distance >= STILL && duration > 0) {
      moves.push({
        kind: 'move',
        t: round(fromT),
        duration: Math.max(0.05, round(duration)),
        x: round(point.x),
        z: round(point.z),
      })
      fromX = point.x
      fromZ = point.z
    }

    // The clock advances whether or not a leg was emitted, so the pause a
    // dropped leg represents still separates the moves either side of it.
    fromT = point.t
  }

  return ordered([...moves, ...take.events])
}

/** Two decimals, as everywhere else in the studio. */
const round = (value: number) => Math.round(value * 100) / 100

/**
 * The actor, with the take performed onto them.
 *
 * Actions overlapping the take are *replaced*, not merged. Re-performing a
 * stretch means "do it like this instead", and a version that kept the old
 * clips would leave the actor being walked in two directions at once by two
 * sets of moves - which the sampler resolves by letting the later one win, so
 * the picture would silently depend on array order.
 *
 * Everything wholly outside the take survives untouched, which is what makes it
 * safe to perform the middle ten seconds of a shot without losing the ends.
 */
export function applyTake(actor: Actor, take: Take, tolerance = DEFAULT_TOLERANCE): Actor {
  const kept = actor.actions.filter(
    (action) => action.t + action.duration <= take.start || action.t >= take.end,
  )

  // A take from the very top of the shot moves the actor's home as well: there
  // are no earlier actions to have put them anywhere, so the position they were
  // driven from is where they now start.
  const home =
    take.start <= 0.02 && take.path.length > 0
      ? { x: round(take.path[0].x), z: round(take.path[0].z) }
      : { x: actor.x, z: actor.z }

  return {
    ...actor,
    ...home,
    actions: ordered([...kept, ...actionsFromTake(take, tolerance)]),
  }
}
