import type { SkeletonId } from '../assets/packs'
import type { Condition } from '../rules/triggers'

/**
 * `@kxb/xp/animation` - what a body looks like, as a document rather than as code.
 *
 * docs/xp/backlog.md §2b, step one of four, and the section is emphatic about
 * the order: **the data first**, the runtime second, a list panel third, and a
 * node editor last because it is a *view* over data that has to exist before it
 * can be viewed. This is the data and nothing else - no runtime reads it yet.
 *
 * ---------------------------------------------------------------------------
 * Why a graph here is not the node graph §17 refuses
 * ---------------------------------------------------------------------------
 * §17 refuses a node graph over *scripts*, and the argument is the open
 * vocabulary: a graph over JavaScript gives up the one property that makes the
 * rules panel safe - a fixed list of verbs, each a select over a constant,
 * nothing an author can write that fails at runtime - and buys a second
 * authoring language to keep in step with the first forever.
 *
 * An animation graph has the opposite property at both ends. Its states are
 * **clips**, which are a generated, checked-in list tested against the glTFs.
 * Its transitions are **conditions**, and the format already has one: a
 * property, a comparison, a number, and an `of` saying whose. Nothing here is
 * open, which is exactly what makes it worth drawing.
 *
 * ---------------------------------------------------------------------------
 * It is not a new subsystem, and that is the whole framing
 * ---------------------------------------------------------------------------
 * `_runtime/motion.ts` already *is* this machine, hardcoded: a speed with
 * hysteresis on the walk/run boundary, one-shots that clamp on their last
 * frame, and a mapping from state to clip. It is a good machine and it is not
 * editable, so a level whose character should crouch, sit or hold a tool has no
 * way to say so. What this adds is a document that can replace it, with the
 * built-in one as the default when a document says nothing.
 *
 * ---------------------------------------------------------------------------
 * A stance and a layer are different things, and the format has to know
 * ---------------------------------------------------------------------------
 * The correction §2b needed. That machine is no longer one flat set of states:
 * it is a **stance** - idle, walk, run, air, land, dead - which describes the
 * whole body, and a **gesture** - shoot, hit, attack - which happens *while* a
 * stance is true. They were one field and one clip once, and folding them was
 * the bug: a body that punched stopped walking, because the attack clips are
 * authored standing and their leg tracks held it still while it slid across the
 * floor at running pace.
 *
 * So a graph that models only the stance cannot say what the body already does,
 * and one that models gestures as ordinary states re-creates that bug in data,
 * where nobody can fix it without editing a document. A state carrying `parts`
 * is therefore a **layer**: masked to those bones, laid over whatever the body
 * is doing, owning nothing. It is the same word `animate` and `runAnimation`
 * already use, deliberately - a document where `parts` means one thing in a
 * verb and another in a graph is a document nobody can read.
 *
 * ---------------------------------------------------------------------------
 * Its own block, beside `scripts`, and a blueprint points at it
 * ---------------------------------------------------------------------------
 * `animations: { humanoid: {...} }` and `blueprint.animator: 'humanoid'`, which
 * is exactly the shape `scripts` and `blueprint.script` already have. Three
 * reasons it beats inlining the states into the blueprint, all in §2b:
 *
 * - **They are shared differently.** Four kinds of guard are four blueprints
 *   with four sets of properties and *one* way of moving. Inlining would mean
 *   four copies and four places to fix a transition.
 * - **They are edited at different times.** A graph is authored once against a
 *   rig; rules change every time the level does. One file for both is a file
 *   two panels fight over, and autosave makes that a real conflict.
 * - **The vocabularies do not mix.** A rule says what *happens*; a graph says
 *   what the body looks like while it happens. Keeping them apart is what stops
 *   this growing verbs and becoming the thing §17 refuses.
 */

/** How long a state or graph name may be, and how many of each a graph may hold. */
export const MAX_ANIMATION_NAME = 40
export const MAX_STATES = 64
export const MAX_TRANSITIONS = 256

/**
 * Letters, digits, dash and underscore - the same alphabet a script name uses.
 *
 * Shared deliberately: these are two tables of named things in one document,
 * and an author who learns what a name may be should learn it once.
 */
export const ANIMATION_NAME = /^[A-Za-z0-9_-]{1,40}$/

/**
 * One state: a clip, and whether it owns the body or lies over it.
 *
 * The clip name is **not** checked against any pack, for the reason
 * `blueprint.pose` is not: this package does not know which glTFs a host has
 * loaded, so a document is not wrong because this renderer is currently
 * incurious. The narrowing lives in the editor, where `clips.generated.ts`
 * offers only what can actually play - which is where a wrong name is cheapest
 * to prevent and hardest to type.
 */
export interface AnimationState {
  clip: string
  /**
   * Repeat, or play once and hand the body back.
   *
   * Absent is once, which is the safer default of the two: a one-shot that
   * should have looped is a thing that stops, and a loop that should have been
   * a one-shot is a thing that never stops - and the second is the one nobody
   * can tell from a hang.
   */
  loop?: boolean
  /**
   * The parts this state applies to, which is what makes it a **layer**.
   *
   * Absent, the state owns the whole body and the machine is in it: entering
   * one leaves the last. Present, it is masked to those bones and laid over
   * whatever the body is already doing, so a wave and a walk are both true at
   * once and neither has to win.
   *
   * Which names mean which bones is the **host's** business, not this
   * package's: they name parts of a *rig*, and a document that could be played
   * on two different bodies would be naming two different things. The runtime's
   * `BODY_PARTS` is the list today.
   */
  parts?: readonly string[]
}

/**
 * One arrow: where from, where to, and what has to be true.
 *
 * A list rather than a map, because **order is the tie-break**: two arrows can
 * leave the same state, and which one is taken when both conditions hold is a
 * question the author answers by putting one first. A map keyed by `from` could
 * not express it and would need a priority field to get it back.
 *
 * Both directions are written separately, which is the one thing worth copying
 * wholesale from the reference: an arrow each way is two rules, and conflating
 * them is how a machine ends up unable to say *you may leave a dodge but not
 * enter one twice*.
 *
 * `when` absent is an arrow always taken, which is how a one-shot returns to
 * the state after it - `land` into `idle` in the built-in machine is exactly
 * that, and it fires when the clip ends rather than on a condition.
 */
export interface AnimationTransition {
  from: string
  to: string
  when?: Condition
}

/**
 * A machine a blueprint can point at.
 *
 * `entry` is the state a body is in before anything has happened, and it has to
 * name a **stance** rather than a layer: a body that started life as an arms-only
 * overlay would be a body with nothing driving its legs, which is the bind pose
 * with extra steps.
 */
export interface AnimationGraph {
  entry: string
  states: Readonly<Record<string, AnimationState>>
  transitions: readonly AnimationTransition[]
  /**
   * Which skeleton this graph was written for.
   *
   * ---------------------------------------------------------------------------
   * A clip name means nothing without a rig behind it
   * ---------------------------------------------------------------------------
   * The note on `AnimationState` says the clip name is deliberately unchecked -
   * this package does not know which glTFs a host has loaded, so a document is
   * not wrong because *this* renderer is currently incurious. That argument is
   * still right and it has a limit, and the second rig is where the limit shows.
   *
   * `Walking_A` is a name in the dummy's clip pack. `walk` is a name inside a
   * peep's own file. Neither exists on the other body, and neither does a single
   * part name: `arms` against `wing-left`. So a graph is not merely a list of
   * names a host may or may not have - it is a list of names that can only ever
   * be true of *one* of the two bodies we ship, and which one is a fact about
   * the graph rather than about the renderer.
   *
   * Absent reads as the dummy, which is what every graph written before now is.
   *
   * ---------------------------------------------------------------------------
   * Here and not on the blueprint
   * ---------------------------------------------------------------------------
   * The blueprint's `model` already implies a rig - `skeletonOf` reads it
   * straight off the pack. So this looks redundant, and it is the opposite: it
   * is the thing that lets the parser *catch* a blueprint whose model and whose
   * animator disagree. Without it there is nothing to compare against, and the
   * mismatch is a body standing perfectly still with no error anywhere.
   *
   * It also travels correctly when nothing points at the graph yet. A document
   * is edited in pieces, and a graph authored before the body that will use it
   * would have no rig at all if the rig lived only on the blueprint.
   */
  rig?: SkeletonId
}

/** Is this state a layer over the body rather than the body itself? */
export function isLayer(state: AnimationState): boolean {
  return state.parts !== undefined && state.parts.length > 0
}
