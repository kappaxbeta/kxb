/**
 * `@kxb/xp/motions` - a thing a blueprint can do to its own parts, by name.
 *
 * ---------------------------------------------------------------------------
 * What was missing, and why `spin` was not it
 * ---------------------------------------------------------------------------
 * A blueprint could already turn one node of its own model: `spin` names a node
 * and an axis, and a *property* holds the angle. That is a good mechanism and it
 * is a mechanism rather than a feature. To make a fan turn you write a script
 * that adds four degrees to a property every tick; to make a door open you write
 * a script that ramps one to ninety and stops; to make a lever knock twice you
 * write a script with a phase counter in it. Three scripts for three things that
 * are the same idea, and none of them is nameable, callable or reusable.
 *
 * So this is the feature the mechanism was underneath: a blueprint owns
 * **named motions**, each a **sequence** of steps, each step turning a node.
 * `play` starts one by name from a rule or a script. Nothing has to be written
 * in JavaScript, and a lift, a spinning coin and a door are the same three
 * fields with different numbers in them.
 *
 * ---------------------------------------------------------------------------
 * A sequence, because that is what people actually describe
 * ---------------------------------------------------------------------------
 * "Open, wait, close." "Wind up, swing, come back." "Shake, then drop." Every
 * one of those is three things in order, and a format offering one motion per
 * blueprint would make each of them either three blueprints or a script. Steps
 * run one after another and the motion ends - or loops, which is the fan.
 *
 * ---------------------------------------------------------------------------
 * Pure, and that is deliberate rather than tidy
 * ---------------------------------------------------------------------------
 * Everything here is a function from a motion and a number of seconds to a bag
 * of angles. No renderer, no clock, no state. Two reasons, and the second is the
 * one that decided it:
 *
 *   - the Browser pane never fires a frame, so "does the door reach ninety
 *     degrees and stay there" is a question a screenshot cannot answer and a
 *     test can - the same split `_runtime/motion.ts` exists for;
 *   - **every viewer computes the same pose from the same two numbers.** A
 *     motion is a name and the second it started; nothing about where a door
 *     currently is has to travel, and two people watching one door see the same
 *     door because they are evaluating the same function, not exchanging
 *     positions.
 */

/** Which of the model's own axes a step turns about. */
export type MotionAxis = 'x' | 'y' | 'z'

/**
 * The four things a step can be.
 *
 * A closed list, unlike a tag or a clip name, and for the reason the rules panel
 * is a list of verbs: every one of these is a select over a constant, so there
 * is nothing an author can write here that fails at runtime. Adding a fifth is a
 * decision somebody makes on purpose.
 *
 *   spin   keeps turning - `amount` is degrees a **second**. The fan, the coin,
 *          the radar dish. The only kind whose angle grows without bound, which
 *          is why it is the only one that does not come back.
 *   turn   goes to `amount` degrees over the step and stays there. The door, the
 *          drawbridge, the lever. Eased, so it starts and stops rather than
 *          snapping.
 *   swing  out to `amount` and back to nothing, once per step unless `times`
 *          says otherwise. The pendulum, the wave, the breathing chest.
 *   shake  the same trip, jittered rather than smooth. `times` is how many. The
 *          hit reaction, the machine about to break.
 *
 * `hold` is deliberately absent and `turn` with `amount: 0` is not the way to
 * write a pause either - see `MotionStep.node`, which is optional, and a step
 * with no node is the pause. One idea, one spelling.
 */
export const MOTION_KINDS = ['spin', 'turn', 'swing', 'shake'] as const

export type MotionKind = (typeof MOTION_KINDS)[number]

/** How long a name may be, and how many of each a document may hold. */
export const MAX_MOTION_NAME = 40
export const MAX_MOTIONS = 16
export const MAX_MOTION_STEPS = 16

/**
 * Letters, digits, dash and underscore - the same alphabet a script, an
 * animation graph and a blueprint name all use.
 *
 * Shared deliberately. These are four tables of named things in one document,
 * and an author who learns what a name may be should learn it once.
 */
export const MOTION_NAME = /^[A-Za-z0-9_-]{1,40}$/

/** Nothing may turn faster than this, in degrees a second. */
export const MAX_MOTION_RATE = 3600

/** Nor last longer than this, in seconds. A step, not the whole motion. */
export const MAX_MOTION_SECONDS = 60

/**
 * One step: a node, an axis, how far and how long.
 *
 * The node is optional and that is the pause: a step with nothing to turn is a
 * step that takes its `seconds` and does nothing, which is what "open, wait,
 * close" needs in the middle. A `kind` is still required on one, because a step
 * that is a pause *because a field is missing* is a step whose meaning depends
 * on what you did not write.
 */
export interface MotionStep {
  /**
   * A node in the blueprint's own model - the same names `spin.node` uses and
   * the same list `catalogue.generated.ts` measured. Absent is a pause.
   *
   * Not a `Part`, which is a whole separate model bolted on. A part already has
   * its own place in the document and its own transform; this turns a node
   * *inside* one file, which is the thing nothing else can reach.
   */
  node?: string
  kind: MotionKind
  /**
   * One axis, and one at a time per node.
   *
   * A node is drawn with a single `setFromAxisAngle` between its pivot and its
   * own rest transform, so "turn about Y while tilting about X" is not
   * expressible - the second step on a node replaces the first, axis and all.
   *
   * Deliberate rather than pending. Every mechanical thing this is for - a
   * blade, a lid, a barrel, a lever, a wheel - turns about one axis, because
   * that is what a hinge is; and the alternative is three angles per node in the
   * renderer's hot loop to serve a case nobody has asked for.
   */
  axis: MotionAxis
  /** Degrees a second for `spin`; degrees of travel for the other three. */
  amount: number
  seconds: number
  /**
   * How many times a `swing` or a `shake` goes out and back in this step.
   *
   * Absent is once, which is the reading of "swing" that matches the word.
   * Ignored by `spin` and `turn`, which have no there-and-back to count -
   * refused on them rather than ignored, because a number that does nothing is
   * a number somebody will tune for an hour.
   */
  times?: number
}

/**
 * A named motion: what it does, and whether it stops.
 *
 * `loop` is on the motion rather than on a step, because a sequence that
 * repeated one of its steps forever would never reach the ones after it. What
 * loops is the whole thing.
 */
export interface Motion {
  loop?: boolean
  steps: readonly MotionStep[]
}

/** How long one pass takes, in seconds. */
export function motionLength(motion: Motion): number {
  return motion.steps.reduce((total, step) => total + step.seconds, 0)
}

/**
 * Every node this motion turns, deduplicated.
 *
 * What a renderer sizes for, and what the editor checks against the model. A
 * motion that names a node the model does not have turns nothing, silently -
 * the same contract `spin` has - so this is also what makes that catchable
 * before anybody plays the level.
 */
export function motionNodes(motion: Motion): string[] {
  const nodes = new Set<string>()
  for (const step of motion.steps) if (step.node) nodes.add(step.node)
  return [...nodes]
}

/** Where one node is, and about which axis. */
export interface NodeTurn {
  axis: MotionAxis
  /** Degrees, from the node's rest pose. */
  angle: number
}

/**
 * Where every node is, `seconds` into this motion.
 *
 * ---------------------------------------------------------------------------
 * Steps do not compose, and the last one to mention a node wins
 * ---------------------------------------------------------------------------
 * A motion is a *sequence*, not a stack of layers: at any instant exactly one
 * step is running, and what it says about its node is what that node is doing.
 * Nodes named by earlier steps hold whatever those steps left them at, which is
 * what makes "open, wait, close" work - the door does not shut during the wait
 * because nothing during the wait says anything about it.
 *
 * The alternative - every step's contribution added together - reads better on
 * paper and is unusable: two `turn` steps on one node would end at the sum of
 * their angles rather than at the second one's, so "open to 90 then to 0" would
 * close to 90.
 *
 * ---------------------------------------------------------------------------
 * Past the end
 * ---------------------------------------------------------------------------
 * A looping motion wraps. A finished one is evaluated at its final instant and
 * *stays there*, which is the same `clampWhenFinished` a one-shot clip gets and
 * the reason a door that opened stays open. Whoever is holding the motion
 * decides when to stop asking; this always has an answer.
 */
export function poseAt(motion: Motion, seconds: number): Record<string, NodeTurn> {
  const length = motionLength(motion)
  const out: Record<string, NodeTurn> = {}
  if (length <= 0) return out

  const at = motion.loop
    ? ((seconds % length) + length) % length
    : Math.min(Math.max(seconds, 0), length)

  /**
   * Where each node was left, by node **and axis**.
   *
   * The thing that makes a sequence compose. "Open to ninety, wait, close to
   * nothing" only reads as closing if the third step knows it is starting from
   * ninety - and the first version of this did not, so the door snapped shut on
   * the frame the last step began and then eased from zero to zero.
   *
   * Keyed by axis as well as node because an angle is an angle *about
   * something*: a step turning the lid about Y to ninety says nothing about
   * where the lid is about X, and a following X step starting from ninety would
   * be inheriting a number that was never about it.
   */
  const from: Record<string, number> = {}

  let start = 0
  for (const step of motion.steps) {
    const end = start + step.seconds
    if (!step.node) {
      start = end
      continue
    }

    /**
     * Every step up to the playhead, in order, and none after it.
     *
     * A step in the future is not merely skipped - the loop stops - so nothing
     * is pre-empted by something that has not happened. The step containing the
     * playhead is evaluated at its own progress; the ones behind it are
     * evaluated at their ends, which is how their result becomes the next one's
     * starting point.
     */
    if (at < start) break

    const key = `${step.node}:${step.axis}`
    const base = from[key] ?? 0
    out[step.node] = { axis: step.axis, angle: angleAt(step, Math.min(at, end) - start, base) }
    // Its *end*, not where the playhead has it - so the next step on this node
    // starts where this one finishes rather than where it currently is.
    from[key] = angleAt(step, step.seconds, base)
    start = end
  }

  return out
}

/**
 * One step's angle, `t` seconds in.
 *
 * Separated from `poseAt` because it is the whole of the maths and every one of
 * these four shapes is a thing somebody can be wrong about on their own.
 */
export function angleAt(step: MotionStep, t: number, from = 0): number {
  const time = Math.min(Math.max(t, 0), step.seconds)

  switch (step.kind) {
    case 'spin':
      // Degrees a second, and the only kind that does not come back. Unbounded
      // on purpose: a fan does not have a final angle, and clamping one to 360
      // would make a long step stop. Continued from where the node was, so a
      // spin after a turn picks up rather than jumping back.
      return from + step.amount * time
    case 'turn': {
      /**
       * Eased, rather than linear, and this is the one place easing is worth
       * the six characters.
       *
       * A door that reaches ninety degrees at a constant rate and stops dead is
       * a door that reads as a value being set rather than a door opening. The
       * curve is smoothstep - three-t-squared minus two-t-cubed - which is the
       * cheapest thing with a zero derivative at both ends, and the same curve
       * the animator's `smooth` easing uses, so a motion and a keyed clip
       * accelerate alike.
       */
      const p = step.seconds <= 0 ? 1 : time / step.seconds
      /**
       * **To** `amount`, from wherever the node already was.
       *
       * The one kind whose `amount` is a destination rather than a distance, and
       * the distinction is what makes a sequence work: "turn to 90" then "turn
       * to 0" is a door that opens and shuts, where two distances would be a
       * door that opens to 90 and then opens another 0.
       */
      return from + (step.amount - from) * (p * p * (3 - 2 * p))
    }
    case 'swing': {
      // Out and back, `times` of them. A sine rather than a triangle, so the
      // ends are where it changes direction rather than where it jerks.
      const laps = step.times ?? 1
      const p = step.seconds <= 0 ? 0 : time / step.seconds
      // About wherever it already is, rather than about zero - so a lid that
      // has been opened can be waggled without shutting first.
      return from + step.amount * Math.sin(p * laps * Math.PI * 2)
    }
    case 'shake': {
      /**
       * The same trip, jittered.
       *
       * A shake is a swing whose *amplitude* falls away rather than whose angle
       * does - which is the difference between something wobbling and something
       * being hit. The decay is linear across the step, so the last knock is
       * nothing and the step ends where it started, which is what lets a shake
       * be dropped into the middle of a sequence without moving anything after
       * it.
       *
       * Deliberately not random. Two viewers computing a pose from a motion and
       * a start time must get the same answer, and a `Math.random` here would
       * make one person's crate shake differently from everybody else's - which
       * is the whole reason the pose is computed rather than sent.
       */
      const laps = step.times ?? 3
      const p = step.seconds <= 0 ? 0 : time / step.seconds
      return from + step.amount * (1 - p) * Math.sin(p * laps * Math.PI * 2)
    }
  }
}
