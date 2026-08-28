/**
 * A run, timed.
 *
 * The first piece of the mode layer (§8 of docs/xp/creator.md, "Parkour"), and
 * deliberately the smallest one that is worth anything on its own: a document
 * that declares `competition` already has to carry a `start` and a `finish` -
 * `capabilityProblems` refuses it otherwise - and until now nothing read them.
 * `ladder-run` was a course you could walk with no way to say how fast.
 *
 * ---------------------------------------------------------------------------
 * Copied from the lounge, not imported
 * ---------------------------------------------------------------------------
 * `src/app/world/lounge/_sim/race.ts` is the same idea and the rule in
 * AGENTS.md is that `src/app/xp` does not reach into the lounge. So this is the
 * shape of that file with the geometry rewritten, and the rewrite is not
 * cosmetic:
 *
 * A lounge `Goal.facing` is a quarter turn - 0..3 - so its crossing test picks
 * an axis and compares one coordinate. An XP `Mark.facing` is **degrees**, any
 * number, and `./marks.tsx` draws the frame by rotating it about Y by exactly
 * that. A test that snapped to an axis would put the line somewhere other than
 * where the author can see it, which is the one thing a finish line must not
 * do. So the test here is a plane with an arbitrary normal, derived from the
 * same rotation the renderer uses.
 *
 * ---------------------------------------------------------------------------
 * Everything here is pure
 * ---------------------------------------------------------------------------
 * For the reason `./streak.ts` is: the runtime cannot be watched. The Browser
 * pane is always `document.hidden`, so `requestAnimationFrame` never fires and
 * the canvas stays black - "did that finish count" is a question a screenshot
 * cannot answer and `./race.test.ts` can.
 */

import { EYE_HEIGHT } from '@kxb/xp/engine'
import type { Mark } from '@kxb/xp'

/** Where something is. The engine's `Vec3` without importing it for three fields. */
export interface Spot {
  x: number
  y: number
  z: number
}

/**
 * How tall the thing crossing the line is, from its feet.
 *
 * The eye height, because that is the only measurement the controller has: it
 * tracks an eye and stands it `EYE_HEIGHT` above the floor, and there is no
 * separate notion of a head. It matters because a mark is a *frame* with a
 * height, and a player is not a point - see `crossedAt`.
 */
const BODY_HEIGHT = EYE_HEIGHT

/** The marks a run begins at. Plural for the same reason the finishes are. */
export function startMarks(marks: readonly Mark[]): Mark[] {
  return marks.filter((mark) => mark.kind === 'start')
}

/**
 * The marks that end a run.
 *
 * Plural, because a finish wider than one frame is built out of several and a
 * racer through any of them is home. `raceReady` only asks that there is one.
 */
export function finishMarks(marks: readonly Mark[]): Mark[] {
  return marks.filter((mark) => mark.kind === 'finish')
}

/**
 * Can a run be timed here?
 *
 * The same question `capabilityProblems` asks of a document claiming
 * `competition`, asked again at the moment the clock would be mounted. Not
 * redundant: a level can be *played* without its capabilities having been
 * checked - `parseXp` refuses a bad claim, but nothing stops a host handing this
 * a document with no marks at all - and a clock over a course with no finish is
 * a clock that runs forever.
 */
export function raceReady(marks: readonly Mark[]): boolean {
  return startMarks(marks).length > 0 && finishMarks(marks).length > 0
}

/**
 * The plane a mark stands in, in the same terms `./marks.tsx` draws it.
 *
 * `Frame` puts a rectangle at the mark's position and turns it about Y by
 * `facing` degrees, spanning `±width/2` along its own X and `0..height` along
 * its own Y. So the normal is the rotation applied to +Z, the across axis is the
 * rotation applied to +X, and the height is measured up from `mark.y`.
 *
 * Kept as one function rather than inlined twice because "where is the line,
 * exactly" is the fact the renderer and the rules must not disagree about.
 */
function planeOf(mark: Mark) {
  const radians = (mark.facing * Math.PI) / 180
  const sin = Math.sin(radians)
  const cos = Math.cos(radians)
  return {
    /** Signed distance from the plane. Zero is on it. */
    depth: (at: Spot) => (at.x - mark.x) * sin + (at.z - mark.z) * cos,
    /** How far along the line, from its middle. Inside is `|across| <= width/2`. */
    across: (at: Spot) => (at.x - mark.x) * cos - (at.z - mark.z) * sin,
    half: mark.width / 2,
    /** The frame's own bottom and top, in world units. */
    bottom: mark.y,
    top: mark.y + mark.height,
  }
}

/**
 * Where along this frame's travel the mark was crossed, or null.
 *
 * Swept, and this is the whole reason the file exists. The frame a mark draws
 * has no thickness, so "are you standing in the finish right now" is a question
 * with no answer - and any thickness invented to give it one is a thickness that
 * can be crossed in a single step. `SPRINT_PACE` is 13 cells a second and the
 * controller clamps a frame to a twentieth of a second, so a step is up to two
 * thirds of a cell; a containment test tuned to catch that would be a finish
 * line that fires while somebody is still a third of a cell short of it, and one
 * tuned tighter would miss exactly the arrivals people care about - the ones
 * taken at speed - and would miss them *more often the worse the frame rate
 * got*. A finish that did not count is the one bug a race cannot survive.
 *
 * Returns the fraction rather than a boolean so the clock can be stopped at the
 * moment of crossing rather than at the end of the frame it happened in. At
 * 60fps that is worth up to sixteen milliseconds, which is more than the gap
 * between two people racing the same course.
 *
 * `from` and `to` are **feet**, and the test is the player's whole span against
 * the frame's - not a point. A point at the feet would walk under a finish
 * hanging at head height; a point at the eye would duck under a low one. Neither
 * is what an author sees when they look at the rectangle they placed.
 *
 * Direction-agnostic, like the goal the lounge borrows it from: running back
 * through a line counts as crossing it. That is a real hole in a lap race and no
 * hole at all here - `stepRun` is what decides a backwards finish is not a
 * result, and it decides it by asking whether a run was under way.
 */
export function crossedAt(from: Spot, to: Spot, mark: Mark): number | null {
  const plane = planeOf(mark)

  const before = plane.depth(from)
  const after = plane.depth(to)

  /**
   * Never approached the plane's depth this frame.
   *
   * Note that standing exactly *on* it does not re-cross every frame: with
   * `before === after` there is no crossing at all, which is what the equality
   * below buys and what stops a player parked on the start line resetting their
   * own clock sixty times a second.
   */
  if (before === after) return null
  if ((before < 0 && after < 0) || (before > 0 && after > 0)) return null

  const t = (0 - before) / (after - before)
  if (t < 0 || t > 1) return null

  const at = {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
  }

  if (Math.abs(plane.across(at)) > plane.half) return null
  // Spans overlap, rather than a point being inside. See the note above.
  return at.y + BODY_HEIGHT >= plane.bottom && at.y <= plane.top ? t : null
}

/** A mark met this frame, and how far through the frame it was met. */
export interface Crossing {
  kind: 'start' | 'finish'
  t: number
}

/**
 * Everything crossed this frame, earliest first.
 *
 * Plural and ordered because one frame really can hold two: a fall past the last
 * gap of `ladder-run` covers thirty cells, and a course whose start and finish
 * are near each other can be entered and left inside one step. Resolving them in
 * the order they happened is the difference between a run that started and one
 * that started and finished.
 *
 * Ties keep document order. A start and a finish crossed at the same instant is
 * a course with both lines in the same place, which is broken in a way no
 * ordering rescues - the honest thing is to be deterministic about it rather
 * than to pretend there is a right answer.
 */
export function crossings(from: Spot, to: Spot, marks: readonly Mark[]): Crossing[] {
  const met: Crossing[] = []

  for (const mark of marks) {
    if (mark.kind !== 'start' && mark.kind !== 'finish') continue
    const t = crossedAt(from, to, mark)
    if (t !== null) met.push({ kind: mark.kind, t })
  }

  return met.sort((a, b) => a.t - b.t)
}

/** Whether a run is waiting to begin, under way, or over. */
export type RunPhase = 'waiting' | 'running' | 'finished'

export interface Run {
  phase: RunPhase
  /** Seconds on the clock: counting up while running, the result once finished. */
  time: number
  /** The fastest completed run so far, or null before the first one. */
  best: number | null
  /**
   * How many runs have been completed.
   *
   * A counter and not a flag, for the reason `reviveAt` in ./simulation is one:
   * "a result arrived" is an *event* and React props are state, so a second run
   * with an identical time has to be distinguishable from the first. It is also
   * the cheapest way for a HUD to notice a new result without diffing a float.
   */
  finishes: number
}

/** Nothing has happened yet. */
export const NO_RUN: Run = { phase: 'waiting', time: 0, best: null, finishes: 0 }

export interface RunStep {
  /** Where the feet were last frame, and where they are now. */
  from: Spot
  to: Spot
  /** How long that took, in seconds. */
  delta: number
  /**
   * The player was *put* here rather than having walked here.
   *
   * A restart, a revive, or one day a teleport verb. It matters more than it
   * looks: the straight line from where somebody died back to the spawn passes
   * through anything in between, and on `ladder-run` a fall at the last gap
   * draws that line straight through the finish frame. Timing it as travel hands
   * out a result for dying near the line, which is the worst possible bug in the
   * only number this file produces.
   */
  teleported?: boolean
}

/**
 * The clock, one frame on.
 *
 * A pure transition rather than a mutable timer, so the awkward parts - two
 * crossings in one frame, a finish nobody started, a death on the line - are
 * settled in a test rather than by running a course and hoping.
 *
 * The clock is **simulated** seconds, accumulated from the same clamped delta
 * the rest of the frame uses, rather than wall time. Somebody will disagree with
 * that, so: a backgrounded tab hands back one enormous delta and the simulation
 * clamps it, meaning the player does not move for as long as the tab was away.
 * Wall time would charge them for a period in which the world was frozen and
 * ruin a run for switching windows. The opposite error - a stuttering frame
 * shaving a millisecond off a time - is smaller and much harder to do on
 * purpose.
 */
export function stepRun(run: Run, marks: readonly Mark[], step: RunStep): Run {
  let { phase, time, best, finishes } = run

  const met = step.teleported ? [] : crossings(step.from, step.to, marks)

  /** How much of this frame has already been accounted for. */
  let cursor = 0

  for (const crossing of met) {
    if (phase === 'running') time += step.delta * (crossing.t - cursor)
    cursor = crossing.t

    if (crossing.kind === 'start') {
      /**
       * Crossing the start always begins a run, even mid-run.
       *
       * Which is what makes a death on a course cost the run rather than needing
       * a rule of its own: `world.restart` puts you back behind the line, you
       * walk over it, and the clock is zero again. A course that loops back
       * through its own start would restart the clock too - that is a course
       * that has said its start line is a start line.
       */
      phase = 'running'
      time = 0
    } else if (phase === 'running') {
      /**
       * A finish only counts when a run was under way.
       *
       * Otherwise walking backwards over the finish line - or spawning past it -
       * produces a time for a course nobody ran.
       */
      phase = 'finished'
      finishes += 1
      if (best === null || time < best) best = time
    }
  }

  if (phase === 'running') time += step.delta * (1 - cursor)

  return { phase, time, best, finishes }
}

/**
 * A time, as a person reads it.
 *
 * Hundredths, because a course two people have both run is decided in them, and
 * a race reported to a tenth is a race they argue about. Minutes only once there
 * are any: `1:02.40` for a long course, `12.40` for a short one, rather than
 * `0:12.40` padding every reading with a zero that is never anything else.
 */
export function formatRunTime(seconds: number): string {
  /**
   * Rounded before it is split, which it was not.
   *
   * The minutes used to be floored off the raw seconds and the remainder
   * rounded afterwards, so a run of `119.999` read **`1:60.00`** — a clock
   * showing sixty seconds. Found by a test in ./race-record asserting that the
   * time we *store* and the time we *show* are the same reading; the stored one
   * was right and this was not.
   *
   * `toFixed` rather than `Math.round(x * 100)` because those two disagree on
   * exact halves - a float's real value is not the decimal that was typed - and
   * the record keeps the number this produces. One rounding operation, in both
   * places, means a stored result cannot read differently from the screen it
   * was shown on.
   */
  const safe = Number(Math.max(0, seconds).toFixed(2))
  const minutes = Math.floor(safe / 60)
  const rest = safe - minutes * 60

  if (minutes === 0) return rest.toFixed(2)
  // Padded, because `1:2.40` reads as one minute and two seconds only to
  // somebody who already knows what it says.
  return `${minutes}:${rest < 10 ? '0' : ''}${rest.toFixed(2)}`
}
