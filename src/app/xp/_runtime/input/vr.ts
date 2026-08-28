/**
 * A headset's controls, mapped onto the same actions a keyboard produces.
 *
 * The same rule `./touch` follows and for the same reason: there is one
 * movement and one set of actions, and several things that can ask for them. A
 * VR path that invented its own would be a third place for the camera and the
 * document to disagree about direction, on the hardware where being wrong is
 * least pleasant to experience.
 *
 * ---------------------------------------------------------------------------
 * Five actions, four face buttons
 * ---------------------------------------------------------------------------
 * A document may bind five keys (`MAX_PLAYER_KEYS`), and a pair of controllers
 * has **four** face buttons - A and B on the right hand, X and Y on the left.
 * Jump and dance are reserved and always available on top of that, so the demand
 * is seven inputs and the comfortable supply is four.
 *
 * The decision, which is the user's: **jump moves to the right trigger.** It is
 * the input a hand finds without looking and the one every headset user already
 * associates with "the main thing", and moving it off the face buttons leaves
 * all four of them for what the level actually binds. The left trigger is left
 * deliberately unbound - a free input is worth more than a fifth binding nobody
 * asked for, and it is where a "use" or a grab goes when something needs one.
 *
 * ---------------------------------------------------------------------------
 * The fifth action is reported, not dropped
 * ---------------------------------------------------------------------------
 * Four face buttons cannot hold five bindings. The tempting thing is to spill
 * the fifth onto a grip and say nothing, and that is exactly the failure this
 * codebase keeps refusing: a binding that silently does not work is worse than
 * one that is missing, because an author sets it, believes it, and finds out
 * from somebody wearing the headset.
 *
 * So `bindingsFor` returns what it could place *and* what it could not, and the
 * caller is expected to say so. Where it says so is a design decision nobody has
 * made yet - the controls panel is the obvious home - but the information exists
 * rather than being quietly lost between a document and a hand.
 */

/**
 * The inputs a pair of controllers offers, by the names people use for them.
 *
 * Thumbsticks are not here: they are movement and turning, which is not a
 * binding a document gets to make - the same reason `KeyW` is a reserved key.
 */
export const VR_BUTTONS = [
  'a',
  'b',
  'x',
  'y',
  'triggerL',
  'gripL',
  'gripR',
] as const

export type VrButton = (typeof VR_BUTTONS)[number] | 'triggerR'

/**
 * Jump, on the right trigger.
 *
 * Not a face button, so all four stay free for the level. A hand finds the
 * trigger without looking, which matters more for the one action every XP has
 * than for any action a particular one binds.
 */
export const VR_JUMP: VrButton = 'triggerR'

/**
 * The order face buttons are handed out in.
 *
 * Right hand first, because most people are right-handed and the first thing a
 * document binds is the thing it most wants reached. Within a hand, the lower
 * button first - A before B, X before Y - which is the one people press when
 * they have not looked.
 */
const FACE: readonly VrButton[] = ['a', 'b', 'x', 'y']

/** A document's binding, on a physical input. */
export interface VrBinding {
  button: VrButton
  /** The name this emits, which the level's rules give meaning to. */
  does: string
}

export interface VrLayout {
  bound: VrBinding[]
  /**
   * Bindings with nowhere to go, in the document's own order.
   *
   * Never silently empty when it should not be - see the note at the top. A
   * caller that ignores this is shipping a document whose fifth key does
   * nothing in VR and says nothing about it.
   */
  unreachable: string[]
}

/**
 * Where a document's keys land on a headset.
 *
 * Takes the shape rather than the `PlayerKey` type, because that type is not
 * exported from `@kxb/xp` and one field is all this needs - the same reason
 * `rulesOf` is structurally typed.
 */
export function bindingsFor(keys: readonly { key: string; does: string }[]): VrLayout {
  const bound: VrBinding[] = []
  const unreachable: string[] = []

  keys.forEach((entry, index) => {
    const button = FACE[index]
    if (button) bound.push({ button, does: entry.does })
    else unreachable.push(entry.does)
  })

  return { bound, unreachable }
}

/**
 * Whether a headset can reach everything this document binds.
 *
 * The question a controls panel asks, phrased so the answer is a yes rather
 * than a count - "one of your keys cannot be pressed in VR" is what an author
 * needs to hear, and the number is the detail.
 */
export function fitsOnAHeadset(keys: readonly { key: string; does: string }[]): boolean {
  return bindingsFor(keys).unreachable.length === 0
}

/**
 * Whether this browser can actually put somebody in a headset.
 *
 * `navigator.xr` is absent on every desktop browser without a headset attached
 * and on every phone, so the optional chain is the common case rather than
 * defensive noise. `isSessionSupported` is the second question and a different
 * one: Chrome on a laptop *has* `navigator.xr` and answers `false`, which is
 * exactly the case a bare `'xr' in navigator` check would get wrong.
 *
 * Asynchronous because the spec is - it may consult hardware - so a caller has
 * to render without the answer first and reveal the way in when it arrives.
 * That is the right order anyway: a button that appears a moment late is much
 * better than one that is there and does nothing.
 */
export async function headsetAvailable(): Promise<boolean> {
  const xr = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr
  if (!xr) return false
  try {
    return await xr.isSessionSupported('immersive-vr')
  } catch {
    // A browser that has the API and refuses the question - a permissions
    // policy, an insecure context - is a browser with no headset for our
    // purposes. Better a missing button than one that throws when pressed.
    return false
  }
}

/**
 * Put the headset on.
 *
 * three's `WebGLRenderer` has WebXR built in, so this needs no extra package -
 * request a session, hand it to `gl.xr`, and the renderer draws stereo from the
 * headset pose from the next frame.
 *
 * `local-floor` because a platformer is a thing you stand up in: it puts the
 * origin on the floor of the room rather than at the headset, so a level's
 * ground and the room's ground are the same height and somebody who stands up
 * does not rise through the ceiling.
 *
 * Failures are returned rather than thrown. Entering VR is a thing a person did
 * on purpose, and every way it can fail - permission refused, headset busy,
 * browser changed its mind since `headsetAvailable` said yes - is something they
 * should be told rather than something that should vanish into a console.
 */
export async function enterVr(
  renderer: { xr: { enabled: boolean; setSession(session: unknown): Promise<void> } } | null,
): Promise<string | null> {
  if (!renderer) return 'the level is not ready yet'

  const xr = (
    navigator as Navigator & {
      xr?: { requestSession(mode: string, options?: unknown): Promise<unknown> }
    }
  ).xr
  if (!xr) return 'this browser has no headset'

  try {
    const session = await xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor'],
    })
    renderer.xr.enabled = true
    await renderer.xr.setSession(session)
    return null
  } catch (reason) {
    return reason instanceof Error ? reason.message : 'the headset refused'
  }
}

/**
 * ---------------------------------------------------------------------------
 * Standing somewhere, in a headset
 * ---------------------------------------------------------------------------
 * Everything below is the other half of the file's opening argument. The
 * bindings above say *what a button does*; this says how a wearer moves at all,
 * and it has to exist because a headset takes the camera away from you.
 *
 * In an immersive session three drives the camera from the headset pose every
 * frame. The controller's `camera.position.set(...)` is overwritten before
 * anything is drawn, so a player who walks across a level stays exactly where
 * the session started - which reads as "VR is broken" and is really "there is
 * nobody driving".
 *
 * three's answer, and the one every WebXR project arrives at, is a **rig**: give
 * the camera a parent and move the parent. `WebXRManager` composes the headset
 * pose with `camera.parent.matrixWorld`, so the wearer's real head movement
 * happens *inside* a frame the game is free to place. The camera's own
 * transform is simply ignored while a session is running, which is exactly the
 * right division - the headset owns where you are looking, the game owns where
 * you are standing.
 */

import { EYE_HEIGHT } from '@kxb/xp/engine'
import { NO_PUSH, pushFrom, stickAt, type Push } from '@/app/xp/_runtime/input/touch'

/**
 * Where to put the rig, given where the controller thinks the eye is.
 *
 * The whole of it is one subtraction, and it is here with a test because this
 * exact confusion has already cost this codebase a bug: `sampleAt` in
 * `presence` had every other player standing a body-height in the air, because
 * the controller's position is an **eye** and a model's origin is its **feet**,
 * and for a while nothing converted between them.
 *
 * The same fork, one level down. Outside a session the camera sits at the rig's
 * origin, so the rig goes where the eye goes. Inside one, `local-floor` puts the
 * headset pose's origin on the floor of the wearer's actual room and the pose
 * already carries however tall they are - so a rig at eye height stacks one
 * head-height on another and leaves somebody looking down at the level from
 * three metres up.
 *
 * It also means a tall person and a short person see the level from their own
 * heights rather than from `EYE_HEIGHT`, which is a feature and not a rounding
 * error: standing up in VR should do what standing up does.
 */
export function rigSpot(
  eye: { x: number; y: number; z: number },
  presenting: boolean,
): { x: number; y: number; z: number } {
  return { x: eye.x, y: presenting ? eye.y - EYE_HEIGHT : eye.y, z: eye.z }
}

/**
 * One controller, as the Gamepad API describes it.
 *
 * Structural rather than `Gamepad`, because the real type demands a dozen
 * fields this never reads and no test would want to build. The same reason
 * `bindingsFor` takes a shape rather than `PlayerKey`.
 */
export interface Pad {
  handedness: string
  axes: readonly number[]
  buttons: readonly { pressed: boolean }[]
}

/**
 * Where the buttons are, under the `xr-standard` mapping.
 *
 * Named rather than inlined because the numbers are meaningless on sight and
 * wrong by one is a game where the grip jumps. This is the layout every headset
 * with two sticks reports; a device that does not is a device with fewer inputs
 * than this file already assumes.
 *
 * `axes` 0 and 1 are the touchpad, which is why the stick is 2 and 3 - the
 * single most common mistake with WebXR gamepads, and it presents as a stick
 * that does nothing rather than as an error.
 */
const TRIGGER = 0
const GRIP = 1
const LOWER_FACE = 4
const UPPER_FACE = 5
const STICK_X = 2
const STICK_Y = 3

/** What a frame of controller input amounts to. */
export interface VrInput {
  /**
   * Movement, in `./touch`'s own type rather than a second one.
   *
   * `Push` is "what the controller is being asked for, in the keyboard's own
   * terms" - `inputZ` is +1 forward exactly as `W` produces, not a world axis.
   * Returning it rather than a pair of numbers is what makes the thumbstick and
   * the thumb on glass literally the same value by the time anything reads them.
   */
  push: Push
  /** Held, not tapped. The controller does its own edge detection. */
  jump: boolean
  /** How hard the right stick is pushed sideways, for turning. */
  turn: number
  /** Every button down this frame, by name. Edges are the caller's business. */
  down: readonly VrButton[]
}

export const NO_VR_INPUT: VrInput = { push: NO_PUSH, jump: false, turn: 0, down: [] }

/**
 * A frame of both controllers, as movement and a set of buttons.
 *
 * Movement goes through `stickAt` and `pushFrom` rather than being computed
 * here, and that is the point the top of this file makes about there being one
 * movement: a thumbstick and a thumb on glass are the same gesture through
 * different plastic. Reusing them brings the dead zone, the rescaling that
 * stops the dead zone costing top speed, and the sprint threshold - three
 * numbers that a hand-rolled version would get *nearly* right, which is worse
 * than getting them wrong, because nearly right is not a bug anybody reports.
 *
 * The axes need no conversion. A gamepad reports "pushed away from me" as -1,
 * `stickAt` is written for screen coordinates where up is negative, and
 * `pushFrom` negates once at the end. The one axis flip in the whole path stays
 * in the one place that already owned it.
 *
 * The left stick moves and the right stick turns, which is not a preference -
 * it is what every headset game does, and somebody who has played one should
 * not have to discover that this one is backwards.
 */
export function readPads(pads: readonly (Pad | null | undefined)[]): VrInput {
  let push = NO_PUSH
  let jump = false
  let turn = 0
  const down: VrButton[] = []

  for (const pad of pads) {
    if (!pad) continue
    const right = pad.handedness === 'right'
    const x = pad.axes[STICK_X] ?? 0
    const y = pad.axes[STICK_Y] ?? 0

    if (right) {
      // Turning only. A right stick that also moved would fight the left one.
      // Through `stickAt` as well, so a resting thumb does not spin the world.
      turn = stickAt(x, 0, 1).x
    } else {
      push = pushFrom(stickAt(x, y, 1))
    }

    const button = (index: number) => pad.buttons[index]?.pressed === true
    if (button(TRIGGER)) {
      if (right) jump = true
      else down.push('triggerL')
    }
    if (button(GRIP)) down.push(right ? 'gripR' : 'gripL')
    if (button(LOWER_FACE)) down.push(right ? 'a' : 'x')
    if (button(UPPER_FACE)) down.push(right ? 'b' : 'y')
  }

  return { push, jump, turn, down }
}

/**
 * How far one flick of the right stick turns you.
 *
 * ---------------------------------------------------------------------------
 * Why it snaps rather than sweeps
 * ---------------------------------------------------------------------------
 * The obvious thing is to rotate continuously while the stick is held, the way
 * a mouse does. In a headset that is the other reliable way to make somebody
 * ill - a smooth rotation the inner ear did not agree to is exactly the
 * mismatch that causes motion sickness, and it is worse than a moving HUD
 * because you cannot look away from it.
 *
 * A snap gives the eye no motion to disagree with: the world is one way, then
 * it is another. It is what every comfortable headset game defaults to, and the
 * people who prefer smooth turning are the people who will not be made ill by
 * anything, which is the population that needs the option least.
 *
 * Thirty degrees because it is a twelfth of a circle: six flicks to face the
 * other way, twelve to come back round. Small enough to line up on something
 * rather than overshooting it, large enough that turning round is a gesture
 * rather than a chore.
 */
export const SNAP_DEGREES = 30

/**
 * How far the stick goes before it counts as a flick.
 *
 * Well past `DEAD_ZONE`, because this is a discrete action rather than a
 * proportional one: a nudge should do nothing at all rather than turn you
 * thirty degrees, and the gap between "moving" and "turning" is what makes that
 * true.
 */
export const SNAP_AT = 0.7

/**
 * One flick, and only one.
 *
 * `armed` is the whole of it, and it is why this is a function rather than a
 * comparison at the call site. A headset runs at ninety frames a second; a
 * stick held over the threshold for a third of a second is thirty frames, and
 * without a latch that is thirty snaps - a full turn and a half, from one flick
 * nobody thought was long. The stick has to come back to the middle before it
 * can turn you again.
 *
 * Returns the new latch rather than mutating one, so the caller keeps the state
 * and this stays testable without one.
 */
export function snapTurn(turn: number, armed: boolean): { degrees: number; armed: boolean } {
  if (Math.abs(turn) < SNAP_AT) return { degrees: 0, armed: true }
  if (!armed) return { degrees: 0, armed: false }
  return { degrees: turn > 0 ? SNAP_DEGREES : -SNAP_DEGREES, armed: false }
}

/**
 * Which bindings went down this frame, given what is down now and what was.
 *
 * A headset reports a button as held every frame it is held - there is no
 * `keydown` in the Gamepad API and no `event.repeat` either - so the edge has to
 * be found by comparison. Without it a rule bound to A fires ninety times a
 * second while somebody rests a thumb, which is not a bug anybody diagnoses from
 * the symptom.
 *
 * It goes through `bindingsFor` rather than taking buttons directly, so the
 * button that *acts* is by construction the button the controls card *printed*.
 * Those are the two halves of the same promise and they are the sort that drift
 * quietly: a card that says A and a game that wants B is discovered by somebody
 * wearing a headset, with nothing to check it against.
 */
export function pressesFrom(
  keys: readonly { key: string; does: string }[],
  down: readonly VrButton[],
  before: readonly VrButton[],
): string[] {
  const fired: string[] = []
  for (const binding of bindingsFor(keys).bound) {
    if (down.includes(binding.button) && !before.includes(binding.button)) fired.push(binding.does)
  }
  return fired
}
