'use client'

import { PointerLockControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useRef } from 'react'
import type { PointerLockControls as PointerLockControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import {
  facingFrom,
  fixedCamera,
  followSettings,
  easedChase,
  movementBasis,
  orthoZoom,
  sideCamera,
  yawFor,
} from '@/app/xp/_runtime/camera'
import { samePlace } from '@/app/xp/_runtime/spawn'
import {
  NO_VR_INPUT,
  pressesFrom,
  readPads,
  rigSpot,
  snapTurn,
  type Pad,
  type VrButton,
} from '@/app/xp/_runtime/input/vr'
import type { Touch } from '@/app/xp/_runtime/hud/touch-controls'
import { type ThumbKey, tapsSince, thumbKeys } from '@/app/xp/_runtime/input/touch-keys'
import { STEER_KEY_TURN_RATE, steerTurn } from '@/lib/controls/steer'
import { useCameraMode } from '@/lib/controls/use-camera-mode'
import type { XpCamera } from '@kxb/xp'
import {
  chaseDistance,
  DASH_SECONDS,
  EYE_HEIGHT,
  JUMP_SPEED,
  jumpHeightOf,
  jumpSpeedFor,
  SPRINT_PACE,
  step,
  WALK_PACE,
  type Blocker,
  type BounceTest,
  type SolidTest,
  type SurfaceTest,
  type Vec3,
} from '@kxb/xp/engine'

/**
 * Driving the character controller from a keyboard and a mouse.
 *
 * The controller itself is in `@kxb/xp/engine` and knows nothing about
 * either: it takes a desired movement and a solidity predicate and returns
 * where you ended up. This is the thin layer that turns held keys into that
 * movement and writes the result onto the camera.
 *
 * The split is what makes the interesting half testable. Walking into a wall,
 * landing on a ledge, the two jumps and the slide along a corner are all
 * assertions in `physics.test.ts`; what is left here is key handling and one
 * quaternion, which is the part you can check by looking.
 *
 * ---------------------------------------------------------------------------
 * Everything that changes per frame is a ref
 * ---------------------------------------------------------------------------
 * Position, velocity and which keys are down all change sixty times a second.
 * In React state that is sixty re-renders a second of a tree holding thousands
 * of instanced meshes. They are refs, `useFrame` reads and writes them, and
 * React is not told - which is the standard shape for anything inside a canvas.
 */

/** What the keyboard is currently asking for. */
interface Held {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  sprint: boolean
  jump: boolean
  /** Set on the frame the key went down, cleared once the controller reads it. */
  jumpPressed: boolean
}

/**
 * The default key map.
 *
 * Both WASD and the arrows, because an XP is meant to be handed to somebody who
 * did not build it and "which keys" should not be the first question. This is
 * the `input.keys` block of the document (docs/xp/creator.md §3) with nothing
 * reading it yet - when it does, this becomes the fallback rather than the law.
 */
/**
 * The controllers a session is currently reporting, if any.
 *
 * Defensive in a way most of this file is not, and deliberately: `inputSources`
 * is empty for the first frames of a session and again whenever somebody puts a
 * controller down, `gamepad` is optional on the spec, and every one of those is
 * a normal thing rather than an error. A headset is also the worst place to
 * discover a thrown exception, since there is no console in it.
 */
function padsOf(session: unknown): readonly (Pad | null | undefined)[] {
  const sources = (session as { inputSources?: Iterable<{ gamepad?: Pad | null }> } | undefined)
    ?.inputSources
  if (!sources) return []
  return [...sources].map((source) => source.gamepad)
}

const KEYS: Record<string, keyof Omit<Held, 'jumpPressed'>> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  Space: 'jump',
}

export interface PlayerProps {
  spawn: { x: number; y: number; z: number; facing: number }
  isSolid: SolidTest
  /**
   * Where each cell's geometry actually stops, from `buildSolids`.
   *
   * Beside `isSolid` and as stable as it is, for the reason `bounceOf` gives
   * below. What it is for is the half-cell in `Solids.topOf`: the platformer
   * kit's floors are 0.500 tall and fill a whole cell, so without this the body
   * stands on the *cell* and hovers half a metre over the floor it is on.
   */
  topOf?: SurfaceTest
  /**
   * Free-standing entity boxes, which stop you where they are drawn.
   *
   * A ref rather than an array, because entities move now: a script lifts a
   * platform and a rule breaks a crate, so the list this reads has to be the one
   * the simulation refilled this frame rather than the one React last rendered.
   * Passing it as a prop would mean a re-render of the whole scene every time a
   * crate moved an inch.
   */
  blockers?: { readonly current: readonly Blocker[] }
  /**
   * How high each cell throws you, from `buildSolids`. Absent is a world with
   * no springs, which is nearly all of them.
   *
   * A plain value rather than a ref, unlike `blockers` above: the grid is
   * rebuilt when the *document* changes and not while you are walking around
   * in it, so this is as stable as `isSolid` is and travels beside it.
   */
  bounceOf?: BounceTest
  /**
   * `player.bounce` - a floor under every landing, in cells.
   *
   * Passed down rather than read from the document here for the same reason
   * `floorY` is: this component is handed numbers, not a document to interpret.
   */
  bounce?: number
  /**
   * The level's movement numbers - `player.speed`, `sprint`, `jump`,
   * `gravity`, `acceleration`, `drag` - handed down for `bounce`'s reason:
   * this component is given numbers, not a document to interpret.
   *
   * Every field absent is the engine's own feel, which is every level written
   * before these existed. `jump` is in *cells* and converted here, once, via
   * `jumpSpeedFor` with the level's own gravity - so a heavy world's two-cell
   * jump still clears two cells.
   */
  movement?: {
    speed?: number
    sprint?: number
    jump?: number
    gravity?: number
    acceleration?: number
    drag?: number
  }
  /**
   * The keys this level binds, so pressing one can mean something.
   *
   * Handed down rather than read off the document here, like every other
   * document fact this component uses: it is given numbers and names, not a
   * document to interpret.
   */
  keys?: readonly { key: string; does: string }[]
  /**
   * Called with the `does` name when a **controller button** goes down.
   *
   * Controllers only. The keyboard half of this lives in `./simulation`, using
   * the buffer in `./actions`, and for a while both existed - two sessions built
   * the same feature on two branches and the merge produced no conflict, because
   * the two listeners were in different files. Every bound key fired twice: a
   * hatch opened and shut, a score counted double.
   *
   * The keyboard one there is the better of the two, and its own argument for
   * where it lives is right - a press ends up in the entity world's trigger
   * pass, not in the body, so it belongs beside that pass rather than in the
   * component about walking. What is left here is the half that has nowhere else
   * to be: a headset's buttons are read from the frame loop, out of a `Gamepad`
   * that only this component polls.
   *
   * The edge is still found here for the controller, because the Gamepad API has
   * no events at all - a held button reports itself every frame, and at 90 Hz
   * that is ninety presses. See `pressesFrom`.
   */
  onPress?: (does: string) => void
  /**
   * Called with the `does` name when a **thumb button** is let go of.
   *
   * Touch only, and the asymmetry with `onPress` above is honest rather than
   * tidy: a headset button reports one thing per frame and its release has
   * nowhere to go yet, while a phone is the device where the missing release was
   * a level you could not finish - pick a piece up, and nothing on the glass
   * could put it down.
   *
   * The controls decide *which* edge a finger was, using the same buffer the
   * keyboard uses; this only carries the answer. See `Touch.lifts`.
   */
  onRelease?: (does: string) => void
  /** Nothing below this, so a level with a hole in it does not lose the player. */
  floorY: number
  /**
   * Falling past here puts the player back at the spawn, when the document asks
   * for it.
   *
   * A prop rather than something read off the document down here, for the same
   * reason `floorY` is: what the bottom of the world *means* is the scene's
   * decision - it is the thing holding `world.ground` and `world.restart` - and
   * the controller only needs the number and the place to go.
   */
  restartBelow?: number
  /** Called on the frame a fall was sent back, so a HUD can say so. */
  onRestart?: () => void
  /**
   * Bump this to put the player back at the spawn.
   *
   * A number rather than a callback or a boolean, because the thing being asked
   * for is an *event* and React props are state. A boolean would need clearing,
   * and clearing it is a second render in which the player is being reset
   * again; a counter says "this is the third time" and needs nothing undone.
   *
   * It exists because dying is the simulation's conclusion and moving the
   * player is this component's alone - the position lives in a ref that
   * `useFrame` overwrites every frame, so anything written from outside is gone
   * before the next paint. `world.restart` reaches the same seam from the other
   * side, by height rather than by health.
   */
  reviveAt?: number
  /**
   * Somewhere to be that is not the spawn — a teleport destination.
   *
   * The same seam `reviveAt` opens and for the same reason: the position lives
   * in a ref `useFrame` overwrites every frame, so a `teleport` verb writing
   * the entity world is gone before the next paint. `at` is the counter, for
   * the reason spelled out above — the ask is an event, and a coordinate that
   * happened to repeat would otherwise not re-fire.
   *
   * **It deliberately does not touch the spawn.** Teleporting somewhere does
   * not make it where you respawn, so dying after a pad still returns you to
   * the start of the level. Checkpoints are a real thing to want and this is
   * one line away from being them, but that is a decision about how a game
   * plays rather than about how a player is moved, so it is not made here.
   */
  sendTo?: { x: number; y: number; z: number; facing: number; at: number }
  /**
   * A `dash` verb, arriving the way a `teleport` does: as a counter.
   *
   * A distance and an event, and *not* a direction - which is the whole reason
   * the verb could not do this itself. Where a body is pointing is a number in
   * the entity world; where somebody is *going* is a camera and a thumbstick,
   * and they live out here. So the level says how far and this decides which
   * way: where you are walking if you are walking, and where you are looking if
   * you are standing still.
   *
   * Spent through `moveX`/`moveZ` over `DASH_SECONDS` rather than written
   * straight into the position, so the character controller's own step is what
   * carries it - a dash into a wall stops at the wall, and one off a ledge
   * falls. A teleport is a place; this is a journey, and only the second one
   * can be interrupted by the level.
   */
  shove?: {
    cells: number
    at: number
    /**
     * Which way, for a shove this body did not choose.
     *
     * A `dash` is aimed by whoever spent it - where you are going, or where you
     * are looking - which is right for a move you asked for and wrong for one
     * somebody else did to you. A boot in the ribs sends you the way the boot
     * was going, so when this is here it wins over both.
     *
     * Absent is the ordinary dash, and everything about it is unchanged.
     */
    x?: number
    z?: number
  }
  /**
   * Where dying puts you, when it is no longer the spawn — a save point.
   *
   * Absent is `spawn`, which is every level without checkpoints in it.
   *
   * **Deliberately not `spawn` itself, and deliberately not in the arrival
   * effect's dependencies.** Writing a checkpoint into `spawn` would fire that
   * effect, which teleports the player onto the pad the instant they touch it
   * rather than the next time they die. Two different questions that a single
   * field would answer with one number: where a level *starts* you, and where
   * it *returns* you.
   *
   * Named `returnTo` rather than `respawnAt` because `rules.respawn` is a
   * duration - how long you wait - and two `respawn`s in one component is a
   * confident wrong edit waiting to happen.
   */
  returnTo?: { x: number; y: number; z: number; facing: number }
  /**
   * First person, or a camera behind the body.
   *
   * A view and not a mode: the controller is identical either way, and so is
   * everything the level can see. What changes is where the camera sits after
   * the body has already been moved - which is why this is four lines at the end
   * of the frame rather than a second character controller.
   */
  view?: 'first' | 'third'
  /**
   * A solid plane the chase camera must not go under, if the world has one.
   *
   * `world.ground` is a rule in the controller rather than cells in the grid, so
   * a camera that only asked the grid would drop through the floor of an
   * otherwise empty level and look up at it from below.
   */
  ground?: number
  /**
   * Where the world is watched from, and therefore which way the keys push.
   *
   * A document setting rather than the `view` toggle beside it: `view` swaps
   * first person for a chase camera and changes nothing about the game, while
   * this changes what forward *means*. See `_runtime/camera.ts` - the block is
   * an input mode that happens to also move the camera.
   */
  camera?: XpCamera
  /**
   * What a thumb is asking for, when there is one.
   *
   * Merged with the keys rather than replacing them: a tablet with a keyboard
   * attached should answer to both, and a branch on "is this touch" would be a
   * second movement path to keep in step with the first. See ./touch - the stick
   * produces the same two numbers the arrow keys do, so by the time it reaches
   * here there is nothing left that knows which it came from.
   */
  touch?: { readonly current: Touch | null }
  /**
   * Ignore the controls entirely while this is true.
   *
   * Set while the player is waiting to come back. A ref rather than a prop
   * because the simulation flips it inside a frame, and because a corpse that
   * kept walking for the sixteen milliseconds until React noticed would be the
   * one frame anybody remembers.
   *
   * Gravity still applies: a body that died in mid-air should fall, and freezing
   * it in the sky would look like the game had crashed rather than like somebody
   * had died.
   */
  frozen?: { readonly current: boolean }
  /**
   * And the other reason not to be driving: a cut is on screen.
   *
   * A prop rather than a ref, unlike `frozen` above, because it changes on a
   * React render either way - a film starts and ends by mounting and unmounting
   * a component - so a ref would buy nothing and cost the honesty of saying
   * where the value comes from.
   *
   * Separate from `frozen` rather than folded into it for the reason ./cutscene
   * gives: `frozen` is owned by death, stuns and scripts, and a film that set it
   * would have to remember what it was in order to hand it back.
   */
  filming?: boolean
  /** Called when the player moves, for a HUD. Throttled to a few times a second. */
  /**
   * Where the player is and which way they are pointing, a few times a second.
   *
   * The heading arrived with the deathmatch. A readout that gives a coordinate
   * and not a bearing tells you where somebody is standing and nothing about
   * where they are looking - which is the whole question when a shot is a ray
   * out of the eye, and it is why landing a hit on purpose in a probe was
   * guesswork. Degrees, in the document's own convention: zero looks along +z,
   * the way a mark faces and the way `track` has always reported it.
   */
  onMove?: (position: Vec3, grounded: boolean, facing: number) => void
  /**
   * Where the player is, every frame, for whatever has to test against them.
   *
   * Separate from `onMove` and not throttled: `onMove` feeds a readout a person
   * looks at, and this feeds the trigger pass. A pickup collected at four
   * samples a second is a pickup you can run through.
   *
   * `teleported` says this position is somewhere the player was *put* rather
   * than somewhere they walked to. It is reported from here because this is the
   * only component that owns the position - anything downstream can see the jump
   * but cannot tell it from a very fast frame, and something has to, or the line
   * between where somebody died and where they respawned counts as travel
   * through everything in between. See `stepRun` in ./race.
   */
  track?: (position: Vec3, facing: number, teleported: boolean) => void
}

/**
 * How far behind the body the camera sits, at most - now a document field.
 *
 * The number and its argument moved into `camera.behind` (`DEFAULT_BEHIND` in
 * the package): four metres is two body heights and about what every
 * third-person game settles on, near enough that the body is the thing you are
 * looking at and far enough to see what is about to walk into you. It is a
 * maximum rather than a distance either way - `chaseDistance` shortens it
 * whenever there is something in the way - which is why a level may raise it
 * without having to think about walls.
 */

/**
 * How far a drag turns the camera, in radians a pixel.
 *
 * A full screen-width drag is a bit over half a turn on a phone, which is the
 * range people expect from a game and roughly what `PointerLockControls` gives a
 * mouse at default sensitivity.
 */
const LOOK_PER_PIXEL = 0.004

/**
 * And less of it per pixel on glass.
 *
 * A mouse moves as far as the desk allows and a thumb moves as far as a thumb
 * does, so the same radians-per-pixel is a much faster turn on a phone -
 * reported as *the mobile control is a bit sensitive*. Two thirds, which is
 * about the ratio between a comfortable thumb arc and the same gesture with a
 * mouse: enough to aim a cursor at one field of a board without lifting and
 * re-dragging, and not so slow that turning round becomes a chore.
 *
 * Its own number rather than a scale factor at the call site, because there are
 * two call sites and one of them is the pointer lock, which must not change.
 */
const TOUCH_LOOK_PER_PIXEL = 0.0026


export function Player({
  spawn,
  camera: shot = { kind: 'follow' },
  touch,
  frozen,
  filming,
  isSolid,
  topOf,
  blockers,
  keys: bound,
  onPress,
  onRelease,
  bounceOf,
  bounce,
  movement,
  floorY,
  view = 'first',
  ground,
  restartBelow,
  onRestart,
  reviveAt,
  sendTo,
  shove,
  returnTo,
  onMove,
  track,
}: PlayerProps) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  /**
   * Whether this browser has a pointer to lock at all.
   *
   * WebKit on iOS and iPadOS has no Pointer Lock API: no
   * `requestPointerLock` on an element, anywhere. That normally does not
   * matter, because a phone is a coarse pointer and takes the touch path - but
   * `useIsTouch` answers `false` for the hydrating render, so the mouse path
   * mounts for exactly one commit on every iPhone, and the effect below used
   * to bind a method that was not there and take the whole level down on Play.
   * An iPad with a trackpad is the case that is not transient: a fine pointer,
   * no lock, and a click that used to throw from inside drei's own handler.
   *
   * Read off the canvas rather than sniffed from the user agent, and safe on
   * the server because nothing inside a canvas renders there.
   */
  const canLockPointer = typeof gl.domElement.requestPointerLock === 'function'
  const scene = useThree((state) => state.scene)

  /**
   * The thing that is actually moved, which is not the camera.
   *
   * In an immersive session three drives the camera from the headset pose every
   * frame, so `camera.position.set(...)` is overwritten before anything is
   * drawn - a player who walks across a level stays exactly where the session
   * started. That reads as "VR is broken" and is really "nobody is driving".
   *
   * `WebXRManager` composes the headset pose with `camera.parent.matrixWorld`,
   * so giving the camera a parent and moving *that* is three's own answer, and
   * the division it produces is the right one: the headset owns where you are
   * looking, the game owns where you are standing. Outside a session the rig is
   * simply where the camera used to be and nothing about this is visible.
   *
   * See `rigSpot` in ./vr for the one difference between the two cases, which is
   * a subtraction and has already been got wrong once elsewhere in this
   * codebase.
   */
  const rig = useRef<THREE.Group>(null)
  useEffect(() => {
    const node = rig.current
    if (!node) return
    node.add(camera)
    /**
     * Zeroed, because the rig now carries the position it used to.
     *
     * Whatever the camera was holding would otherwise be added to the rig's
     * transform, which puts the player twice as far from the origin as they
     * asked to be - and only after the first frame, which makes it look like a
     * physics problem.
     */
    camera.position.set(0, 0, 0)
    return () => {
      // Back to the scene rather than left parented to a group being unmounted,
      // which would take the camera out of the graph with it.
      scene.add(camera)
    }
  }, [camera, scene])

  /**
   * Where the rig is put, which is the only place that knows about the fork.
   *
   * Extracted for the reason `placeAt` was: there are four callers - arriving,
   * a side-on level, third person and first - and four copies of "and subtract
   * the eye height, but only in a headset" is three chances to disagree.
   */
  const placeRig = useCallback(
    (x: number, y: number, z: number) => {
      const node = rig.current
      if (!node) return
      const spot = rigSpot({ x, y, z }, gl.xr.isPresenting === true)
      node.position.set(spot.x, spot.y, spot.z)
    },
    [gl],
  )

  /** Whether the right stick has come back to the middle since the last snap. */
  const armed = useRef(true)

  /**
   * The bindings and the callback, in refs the listeners can read.
   *
   * The key listener is registered once, with an empty dependency array, so it
   * closes over whatever the props were on mount. A document that gains a
   * binding - or a parent that re-creates its callback, which React does on
   * every render - would otherwise be invisible to it forever. Re-registering
   * the listener instead would work and would mean adding and removing a window
   * listener on every render of the component that owns the frame loop.
   */
  const boundRef = useRef<readonly { key: string; does: string }[]>(bound ?? [])
  const pressRef = useRef<((does: string) => void) | undefined>(onPress)
  const releaseRef = useRef<((does: string) => void) | undefined>(onRelease)
  /**
   * The same bindings as buttons, in draw order.
   *
   * Kept beside `boundRef` and derived from the same list, so the order the
   * thumb fires in is the order the thumb sees - the controls draw from
   * `thumbKeys` too.
   */
  const thumbRef = useRef<readonly ThumbKey[]>(thumbKeys(bound))
  useEffect(() => {
    boundRef.current = bound ?? []
    thumbRef.current = thumbKeys(bound)
    pressRef.current = onPress
    releaseRef.current = onRelease
  }, [bound, onPress, onRelease])

  /**
   * What the thumb buttons' counters said last frame.
   *
   * The touch twin of `wasDown` below, and it holds the *map* rather than a
   * copy of it: the controls replace the object on every tap, so an unchanged
   * reference means nothing was pressed and the comparison can be skipped
   * entirely on the frames where nothing happened, which is almost all of them.
   */
  const seenTaps = useRef<Readonly<Record<string, number>>>({})
  /** And the same for the releases, which are counted on their own tally. */
  const seenLifts = useRef<Readonly<Record<string, number>>>({})

  /**
   * Which controller buttons were down last frame.
   *
   * A headset reports a button as held every frame it is held, so the edge has
   * to be found by comparison - the same thing `event.repeat` does for a
   * keyboard, done by hand because the Gamepad API has no events at all.
   */
  const wasDown = useRef<readonly VrButton[]>([])
  /**
   * How tall the canvas is, for a side-on camera's zoom.
   *
   * R3F builds an orthographic frustum in pixels, so the zoom is pixels per
   * world unit and it has to be recomputed when the window changes. Subscribed
   * rather than read once: a level framed for the window it opened in and never
   * again is a level that is wrong after a rotation.
   */
  const height = useThree((state) => state.size.height)

  const held = useRef<Held>({
    forward: false,
    back: false,
    left: false,
    right: false,
    sprint: false,
    jump: false,
    jumpPressed: false,
  })

  const position = useRef<Vec3>({ x: spawn.x, y: spawn.y + EYE_HEIGHT, z: spawn.z })
  /**
   * Where the eye is, chasing where the body is.
   *
   * The body steps up a whole cell in one frame - that is what makes stairs
   * walkable at all - and a camera pinned to it jumps a metre instantly, four
   * times a second, going up a staircase. It reads as a stutter rather than as
   * a climb, and it is the half of "smooth steps" that has nothing to do with
   * collision.
   *
   * So the eye lags and catches up. Only *upwards*: falling has to be
   * immediate, because a camera that eases down a drop feels like the floor is
   * sinking rather than like you are.
   */
  const eyeY = useRef(spawn.y + EYE_HEIGHT)
  /**
   * How far back the chase camera is sitting right now. See `CHASE_EASE`.
   *
   * Started at the document's own framing rather than at zero: a camera that
   * eases out from the player's nose on the first frame of every level is an
   * animation nobody asked for.
   */
  const chase = useRef(followSettings(shot).behind)
  const velocityY = useRef(0)
  /**
   * The horizontal stride, in cells a second, carried between frames.
   *
   * Only meaningfully *state* when the level sets `acceleration` or `drag` -
   * without either it is overwritten with the stick's own answer every frame
   * and the component behaves exactly as it did before it existed.
   */
  const stride = useRef({ x: 0, z: 0 })
  const grounded = useRef(false)
  const jumps = useRef(0)
  const reported = useRef(0)

  /**
   * The position object this last handed to `track`.
   *
   * Compared by identity, which is what makes "somebody moved me" an exact
   * question rather than a distance threshold: every ordinary frame assigns
   * `position.current = result.position` and reports that same object, so a
   * different object in there means something outside this loop wrote it - the
   * spawn effect, a revive, and whatever teleport verb arrives next. A threshold
   * would have to be tuned against the fastest legitimate frame, and a race
   * clock decided by a tuned threshold is one that will one day drop a finish.
   */
  const tracked = useRef<Vec3 | null>(null)
  /** Whether the jump button was down last frame, so a press can be an edge. */
  const heldJump = useRef(false)
  /**
   * Which way the body is turned, when the camera cannot say.
   *
   * A side-on camera looks *at* the player, so taking the heading from it turns
   * the body to face the viewer - a character running along a course while
   * staring out of the screen. What a platformer means by "facing" is the way
   * you are *going*, so it comes from the movement instead, and is remembered
   * while standing still because a body that snapped back to a default the
   * moment you stopped would flip at the end of every run.
   */
  const facing = useRef(0)
  /** The drag totals as of last frame, so this frame's turn is a difference. */
  const sawLook = useRef({ x: 0, y: 0 })

  /**
   * Put the camera where the document says - before the first frame, and again
   * every time somebody dies.
   *
   * One effect for both because they are the same act: arriving. `reviveAt` is
   * in the dependencies rather than in a second effect, so there is one place
   * that knows what "you are at the spawn now" means and no chance of the two
   * drifting over which of position, eye and facing get reset.
   *
   * The velocity is deliberately not touched here - `useFrame` owns it and will
   * have it back to zero on the first grounded frame. Reaching into it from an
   * effect is how two writers end up disagreeing about a falling body.
   */
  /**
   * Put the body, the eye and the camera at one place, in feet.
   *
   * Extracted rather than written twice: arriving and being teleported are the
   * same act, and the note above is explicit that the danger is two writers
   * drifting over which of position, eye and facing get reset. There is one.
   *
   * `useCallback` so it can be a dependency of both effects without either of
   * them re-running every render.
   */
  const placeAt = useCallback(
    (at: { x: number; y: number; z: number; facing: number }) => {
      position.current = { x: at.x, y: at.y + EYE_HEIGHT, z: at.z }
      eyeY.current = position.current.y
      placeRig(position.current.x, position.current.y, position.current.z)
      /**
       * The rig's own turn, reset by arriving.
       *
       * A player who snap-turned four times and then died would otherwise come
       * back at the spawn facing whatever they had accumulated, rather than at
       * the heading the author pointed the mark in. The camera's rotation below
       * is the mouse's; this is the headset's, and arriving clears both.
       */
      rig.current?.rotation.set(0, 0, 0)
      /**
       * `yawFor`, not the raw degrees.
       *
       * Three's camera looks down -z, so a bare yaw points it the *opposite* way
       * from everything else in the document - the marks, the race, the spawn
       * grid and the heading `track` reports all use `(sin θ, 0, cos θ)`. See
       * ./camera: this one line is why `ladder-run` opened facing away from its
       * own course, onto an empty screen.
       */
      camera.rotation.set(0, yawFor(at.facing), 0, 'YXZ')
    },
    [camera, placeRig],
  )

  /**
   * Where a death sends you, read at the moment it happens.
   *
   * In a ref because the two readers are a frame loop and an effect that must
   * not re-run when it changes: taking a save point has to alter where the
   * *next* death lands without moving anybody now.
   */
  const back = useRef(returnTo ?? spawn)
  useEffect(() => {
    back.current = returnTo ?? spawn
  }, [returnTo, spawn])

  /**
   * Arriving: the start of the level, on mount and on a new document.
   *
   * Guarded by *where* rather than by the identity of what was passed, and the
   * guard is the fix for a bug reported from a live match as "I get reset often
   * randomly". `spawn` is a fresh object out of a `useMemo` whose inputs include
   * things that can change identity without changing meaning, and `placeAt`
   * depends on a camera three can swap. Either one firing this effect puts a
   * player who was halfway across the level back on the spawn mark, in the
   * middle of a match, for no reason they can see.
   *
   * Every other placement in this file already learned that lesson from the
   * other direction - `reviveAt` and `sendTo` are counters *precisely* so a
   * render cannot fire them. Arriving is the one that was still keyed on an
   * object, and this is the same idea in the shape arriving needs: the effect
   * still runs, and asks whether the spawn has actually moved before acting.
   *
   * A ref rather than state, because the answer must not itself cause a render.
   */
  const arrived = useRef<{ x: number; y: number; z: number; facing: number } | null>(null)
  useEffect(() => {
    if (arrived.current && samePlace(arrived.current, spawn)) return
    arrived.current = spawn
    placeAt(spawn)
  }, [placeAt, spawn])

  /**
   * Coming back: the save point if one has been taken, the spawn otherwise.
   *
   * Split from arriving rather than sharing its effect, which is what the two
   * used to do. They are the same *act* and no longer the same *place*, and a
   * single effect would have to ask which of its dependencies had changed to
   * tell them apart - which is the shape that gets it wrong once and then
   * silently stays wrong.
   *
   * The first run is skipped because mounting is not a revival; arriving is
   * already handled above, and without this the player would be placed twice on
   * load, the second time at a checkpoint they cannot have reached yet.
   */
  const revived = useRef(false)
  useEffect(() => {
    if (!revived.current) {
      revived.current = true
      return
    }
    placeAt(back.current)
    // The counter is the event, like `sendTo` below. `back` is deliberately a
    // ref and not a dependency: taking a save point has to change where the
    // *next* death lands without moving anybody now.
  }, [placeAt, reviveAt])

  /**
   * And again wherever a `teleport` verb said, when it says so.
   *
   * Keyed on the counter alone. The coordinates are deliberately *not*
   * dependencies: they are read when the effect runs, and listing them would
   * make a destination that moved - a node parented to a lift - drag the player
   * along with it every time it did.
   */
  useEffect(() => {
    if (!sendTo) return
    placeAt(sendTo)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the counter is the event, see above
  }, [placeAt, sendTo?.at])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const action = KEYS[event.code]
      if (!action) return
      // The browser scrolls the page on space and arrows, which under pointer
      // lock is invisible and, the moment lock is released, disorienting.
      event.preventDefault()
      if (action === 'jump' && !held.current.jump) held.current.jumpPressed = true
      held.current[action] = true
    }
    const up = (event: KeyboardEvent) => {
      const action = KEYS[event.code]
      if (!action) return
      held.current[action] = false
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    /**
     * Let go of everything when the tab loses focus.
     *
     * Without this, alt-tabbing while walking means the keyup never arrives and
     * the player is still walking when you come back - into a wall, usually,
     * having sprinted somewhere they did not intend to be.
     */
    const clear = () => {
      held.current = {
        forward: false,
        back: false,
        left: false,
        right: false,
        sprint: false,
        jump: false,
        jumpPressed: false,
      }
    }
    window.addEventListener('blur', clear)

    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  const forward = useRef(new THREE.Vector3())
  const right = useRef(new THREE.Vector3())
  /** The full look direction, pitch included - what the chase camera sits along. */
  const look = useRef(new THREE.Vector3())

  /**
   * The one-thumb mode: pushing the stick (or the keys) also swings the camera.
   *
   * The preference is the same store the controls panel writes, so flipping it
   * mid-level applies on the next frame. The latch and its scratch live here
   * because they are frame state, not React state - see `@/lib/controls/steer`
   * for the model and for why the basis is latched rather than read live.
   *
   * **Steer is the default on glass, free on a desk**, which is a change of who
   * has to go looking for a mode rather than a change of mode. Strafing with a
   * thumb while a second thumb drags the camera is what reads as *a weird
   * jitter* on a phone, and the panel that fixes it is two taps behind a `?`
   * chip. The presence of `touch` is the test rather than a media query, so a
   * desktop with the touch HUD forced on gets the controls it is drawing. A
   * stored answer still wins either way - see `useCameraMode`.
   */
  const { mode: cameraMode } = useCameraMode(touch ? 'steer' : 'free')
  /**
   * Scratch for the one write steering makes to the camera.
   *
   * A euler read off the quaternion rather than `camera.rotation` directly:
   * on desktop the pointer lock leaves the rotation in `XYZ`, and setting
   * `rotation.order` in place *reinterprets* those angles - a different
   * orientation, not a relabelling of the same one.
   */
  const steerEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))

  /**
   * A dash that has been asked for and not yet aimed.
   *
   * The distance is known in the effect below; the direction is not known until
   * a frame, because it comes from where the stick is pushed *this* frame. So
   * the ask waits here as a number and the frame loop turns it into a heading -
   * which also means a dash asked for between two frames is aimed by the input
   * somebody was holding when it landed, not by whatever they were doing a
   * frame earlier.
   */
  const asked = useRef<{ cells: number; x?: number; z?: number } | null>(null)
  /** A dash in flight: how much longer, and how fast in each direction. */
  const dash = useRef<{ left: number; x: number; z: number } | null>(null)

  useEffect(() => {
    if (!shove) return
    asked.current = {
      cells: shove.cells,
      ...(shove.x !== undefined ? { x: shove.x } : {}),
      ...(shove.z !== undefined ? { z: shove.z } : {}),
    }
    // The counter is the event, exactly as it is for `sendTo`: dashing twice
    // with the same number in it has to dash twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [shove?.at])

  useFrame((state, rawDelta) => {
    const keys = held.current

    /**
     * A frame no longer than a twentieth of a second.
     *
     * A tab that was in the background hands back one enormous delta, and the
     * controller would integrate a whole second of gravity in one step - which
     * puts the player through the floor, because collision is tested at the
     * end of the move and not along it.
     */
    const delta = Math.min(rawDelta, 0.05)
    /** What a thumb is asking for, if there is one. Read once, used three times. */
    const thumb = touch?.current

    /**
     * Did something outside this loop move the body since the last frame?
     *
     * Read before the step rather than after, because the step is about to
     * overwrite the evidence. The first frame after mount counts as one, which
     * is right: arriving is not walking.
     */
    const put = position.current !== tracked.current

    /**
     * A drag, turned into a look.
     *
     * Only on touch, and only where there is a look to have - a side-on camera
     * is nailed to its axis and is about to overwrite this anyway. Applied
     * before the direction is read, so the frame moves in the direction the
     * thumb just asked for rather than the one before it.
     *
     * `YXZ` and a clamped pitch, which is what `PointerLockControls` does on the
     * other path: any other order lets the horizon roll, and an unclamped pitch
     * lets somebody look past straight up and find the world upside down with no
     * way back.
     */
    if (thumb && shot.kind !== 'side') {
      /**
       * Diffed against what this last saw, rather than drained.
       *
       * The component keeps a running total and never resets it; the difference
       * since last frame is the drag. That keeps one writer and one reader -
       * mutating the component's ref from in here is the arrangement React's
       * compiler refuses, and it is right that two authorities on one number is
       * how they come to disagree.
       */
      const dx = thumb.lookX - sawLook.current.x
      const dy = thumb.lookY - sawLook.current.y
      sawLook.current = { x: thumb.lookX, y: thumb.lookY }

      if (dx !== 0 || dy !== 0) {
        /**
         * `YXZ` and a clamped pitch, which is what `PointerLockControls` does on
         * the other path: any other order lets the horizon roll, and an
         * unclamped pitch lets somebody look past straight up and find the world
         * upside down with no way back.
         *
         * Written through `state.camera` rather than the binding captured at
         * render, for the reason the orthographic zoom is - a render-time read
         * and a frame-time write are how the two come to disagree.
         */
        const lens = state.camera
        lens.rotation.order = 'YXZ'
        lens.rotation.y -= dx * TOUCH_LOOK_PER_PIXEL
        lens.rotation.x = Math.max(
          -Math.PI / 2 + 0.01,
          Math.min(Math.PI / 2 - 0.01, lens.rotation.x - dy * TOUCH_LOOK_PER_PIXEL),
        )
      }
    }

    // Heading only: taking the camera's full direction would make looking down
    // while walking forward drive you into the floor. The full one is kept,
    // because the chase camera does want the pitch - looking down should raise
    // the camera rather than tip the arm into the ceiling.
    /**
     * The basis the keys are read against, chosen by the camera.
     *
     * This used to be four lines of `getWorldDirection` and a cross product,
     * which is exactly right behind a body and silently wrong beside one - see
     * `_runtime/camera.ts`. The full look direction is still kept, because the
     * chase camera wants the pitch: looking down should raise the camera rather
     * than tip the arm into the ceiling.
     */
    camera.getWorldDirection(look.current)
    const basis = movementBasis(shot, { x: look.current.x, z: look.current.z }, spawn)
    forward.current.set(basis.forwardX, 0, basis.forwardZ)
    right.current.set(basis.rightX, 0, basis.rightZ)

    /**
     * Dead people do not walk.
     *
     * Checked before the keys are read rather than by zeroing the movement
     * afterwards, so a held key does not queue up: without this, dying with `W`
     * down and respawning three seconds later starts you already running.
     */
    const down = frozen?.current === true || filming === true
    let inputX = 0
    let inputZ = 0
    if (!down && keys.forward) inputZ += 1
    if (!down && keys.back) inputZ -= 1
    if (!down && keys.right) inputX += 1
    if (!down && keys.left) inputX -= 1

    /**
     * And the thumb, added to the keys rather than replacing them.
     *
     * A stick at half travel and a key held together read as one full press,
     * which is the honest answer for a device that has both: whichever asks for
     * more, gets it. The clamp below is the same one the keyboard has always
     * needed for a diagonal.
     */
    if (thumb && !down) {
      inputX += thumb.push.inputX
      inputZ += thumb.push.inputZ
    }

    /**
     * And the controllers, on exactly the same terms.
     *
     * `readPads` returns `./touch`'s own `Push`, so a thumbstick arrives here
     * indistinguishable from a thumb on glass and is added the same way. That is
     * the whole of what the top of ./vr argues for: one movement, several things
     * that can ask for it, and no third place for "how far is far enough to run"
     * to be answered differently.
     *
     * Polled rather than listened to, because the Gamepad API has no events -
     * `getGamepads` and `XRInputSource.gamepad` are both snapshots, and a
     * headset is the one device where reading them once a frame is unarguably
     * the right rate.
     */
    const pads = gl.xr.isPresenting === true ? readPads(padsOf(gl.xr.getSession?.())) : NO_VR_INPUT
    if (!down) {
      inputX += pads.push.inputX
      inputZ += pads.push.inputZ
    }

    /**
     * Turning, in steps rather than a sweep.
     *
     * Applied to the rig rather than to the camera, because in a session the
     * camera's own rotation is the headset's and is overwritten every frame.
     * See `snapTurn` for why this is not a smooth rotation - briefly, a turn the
     * inner ear did not agree to is the most reliable way to make somebody ill,
     * and unlike a moving HUD you cannot look away from it.
     */
    /**
     * The same presses, from the other kind of hand.
     *
     * `bindingsFor` decides which physical button carries which binding, and
     * this is the only place that decision is *acted* on - the controls card in
     * ./vr-hud only prints it. Building both from one function is what stops the
     * card telling somebody to press A for a thing that B does, which is the
     * kind of mistake you find out about wearing a headset.
     */
    if (pads.down.length > 0 || wasDown.current.length > 0) {
      for (const does of pressesFrom(boundRef.current, pads.down, wasDown.current)) {
        pressRef.current?.(does)
      }
      wasDown.current = pads.down
    }

    /**
     * And the same presses from a thumb.
     *
     * Compared rather than drained, exactly as the headset's buttons are. The
     * controls own their buffer and this loop was handed a reference to it, so
     * emptying a queue here would make the reader a second authority on
     * somebody else's object - which is the arrangement React's compiler
     * refuses, and the reason the buffer counts instead of queueing.
     */
    const taps = thumb?.taps
    if (taps && taps !== seenTaps.current) {
      for (const does of tapsSince(seenTaps.current, taps, thumbRef.current)) {
        pressRef.current?.(does)
      }
      seenTaps.current = taps
    }

    /**
     * And the releases, read the same way off their own tally.
     *
     * Second, so a tap and its lift inside one frame arrive in the order the
     * finger made them - which is the order the trigger pass fires them in, and
     * the difference between picking a piece up and putting it straight back
     * down.
     */
    const lifts = thumb?.lifts
    if (lifts && lifts !== seenLifts.current) {
      for (const does of tapsSince(seenLifts.current, lifts, thumbRef.current)) {
        releaseRef.current?.(does)
      }
      seenLifts.current = lifts
    }

    const snap = snapTurn(pads.turn, armed.current)
    armed.current = snap.armed
    if (snap.degrees !== 0 && rig.current) {
      rig.current.rotation.y += (snap.degrees * Math.PI) / 180
    }

    /**
     * Steering: the sideways axis turns, the forward axis drives.
     *
     * One rule for the stick and the keys alike - "when you move the joystick
     * on the x we rotate the player and view left or right, and y we move the
     * player forward or backward". So `inputX` is spent here on a turn and
     * zeroed: there is no strafe in this mode, on either input, because the
     * axis that would carry one is the axis doing the turning.
     *
     * Only behind a `follow` camera - `side` and `fixed` overwrite the camera
     * at the end of every frame, so turning it here would be work they undo -
     * and never in a headset, where a turn the inner ear did not agree to is
     * the thing snap turns exist to avoid.
     *
     * The turn lands on the camera *after* `movementBasis` read it, so this
     * frame walks along the heading you had when it began and the next one
     * along the heading you now have. That single frame of lag is what keeps
     * the whole thing from feeding back into itself, which is precisely what
     * the latched version this replaced could not do - see ./steer.
     */
    if (cameraMode === 'steer' && shot.kind === 'follow' && gl.xr.isPresenting !== true) {
      if (inputX !== 0) {
        // A key is all-or-nothing and a stick is not, so they turn at their
        // own rates; `keys.left`/`keys.right` is how we tell which this was.
        const byKey = keys.left || keys.right
        const swing = steerTurn(inputX, delta, byKey ? STEER_KEY_TURN_RATE : undefined)
        const lens = state.camera
        steerEuler.current.setFromQuaternion(lens.quaternion)
        steerEuler.current.y += swing
        lens.quaternion.setFromEuler(steerEuler.current)
        inputX = 0
      }
    }

    const sprinting = keys.sprint || thumb?.push.sprint === true || pads.push.sprint

    let moveX = forward.current.x * inputZ + right.current.x * inputX
    let moveZ = forward.current.z * inputZ + right.current.z * inputX

    /**
     * Normalised *down* to one, never up.
     *
     * Down is the oldest bug in first-person movement - a keyboard diagonal is
     * two full axes, √2 long, and walking north-east must not outrun walking
     * north. But this used to normalise *everything* to exactly one, and that
     * threw away the other half of the input: the touch stick reports a
     * magnitude on purpose (see `input/touch.ts`, which eases it so the first
     * half of the throw is for aiming), and a hard normalise turned any
     * deflection past the dead zone into a full-speed walk. Reported as the
     * speed being weird on phones, which it was: there were exactly two speeds.
     *
     * A keyboard still gets 1 either way - each axis is already a unit - so
     * desktop feel is untouched.
     */
    const length = Math.hypot(moveX, moveZ)
    const pace = (sprinting ? movement?.sprint ?? SPRINT_PACE : movement?.speed ?? WALK_PACE)
    const push = Math.min(1, length)
    let wantX = 0
    let wantZ = 0
    if (length > 1e-6) {
      wantX = (moveX / length) * pace * push
      wantZ = (moveZ / length) * pace * push
    }

    /**
     * The level's ramp, when it has one - `player.acceleration` and `drag`.
     *
     * Two rates in cells a second squared: how quickly the stride catches the
     * stick, and how quickly a release brings it back to nothing. Either
     * absent means that side is instant, which together is exactly the old
     * behaviour - `stride` simply *is* the target - so every level that never
     * heard of these plays to the frame as it always did.
     *
     * The step is `rate * delta` along the gap, which is constant acceleration
     * and therefore frame-rate independent: the same corner cut at 30 frames
     * and at 144.
     */
    const wanting = Math.hypot(wantX, wantZ) > 1e-6
    const rate = wanting ? movement?.acceleration : movement?.drag
    if (rate === undefined) {
      stride.current.x = wantX
      stride.current.z = wantZ
    } else {
      const gapX = wantX - stride.current.x
      const gapZ = wantZ - stride.current.z
      const gap = Math.hypot(gapX, gapZ)
      const most = rate * delta
      if (gap <= most) {
        stride.current.x = wantX
        stride.current.z = wantZ
      } else {
        stride.current.x += (gapX / gap) * most
        stride.current.z += (gapZ / gap) * most
      }
    }

    moveX = stride.current.x * delta
    moveZ = stride.current.z * delta

    /**
     * A dash asked for, aimed.
     *
     * Where you are *going* if you are going anywhere, and where you are
     * looking if you are standing still. Both are what somebody means by
     * "forward" and which one they mean depends on what they were doing, so
     * guessing either alone is wrong half the time: a dash that always followed
     * the camera would fire sideways out of a strafe, and one that always
     * followed the stick would do nothing at all from a standstill.
     *
     * Aimed off `length`, which is the *unnormalised* push, so a stick barely
     * off centre still aims a full-length dash. How far you dash is the level's
     * number; how hard you were pushing is not part of it.
     */
    if (asked.current !== null) {
      const { cells, x: sentX, z: sentZ } = asked.current
      asked.current = null
      // A shove that came with a heading keeps it: see `shove.x`. Only a dash
      // this body spent itself is aimed by where it was going or looking.
      const [aimX, aimZ] =
        sentX !== undefined && sentZ !== undefined
          ? [sentX, sentZ]
          : length > 1e-6
            ? [(forward.current.x * inputZ + right.current.x * inputX) / length,
               (forward.current.z * inputZ + right.current.z * inputX) / length]
            : [forward.current.x, forward.current.z]
      // Flat, and re-normalised because `forward` carries no pitch but does
      // carry a length of one only when it was built from one.
      const flat = Math.hypot(aimX, aimZ)
      if (flat > 1e-6) {
        const speed = cells / DASH_SECONDS
        dash.current = { left: DASH_SECONDS, x: (aimX / flat) * speed, z: (aimZ / flat) * speed }
      }
    }

    /**
     * And spent, a frame's worth at a time.
     *
     * Added to the walk rather than replacing it, so a dash you steer out of
     * still ends where its own distance says - the two are a sum, which is what
     * makes a dash *while running* feel like a burst rather than a takeover.
     *
     * `Math.min` on the tail end, or a long frame at the end of a dash would
     * spend more of it than there was left and overshoot by however late that
     * frame was - which is a dash whose length depends on the frame rate.
     */
    if (dash.current) {
      const spent = Math.min(delta, dash.current.left)
      moveX += dash.current.x * spent
      moveZ += dash.current.z * spent
      dash.current.left -= spent
      if (dash.current.left <= 0) dash.current = null
    }

    /**
     * The jump button, edge-detected here rather than in the component.
     *
     * A key reports its own press through `keydown`; a button reports only that
     * it is held. The controller wants both - `jump` for the hold and
     * `jumpPressed` for the frame it went down - so the edge is found by
     * comparing against last frame, which is what a keyboard's autorepeat
     * suppression does for the other path.
     */
    const buttonJump = thumb?.jump === true || pads.jump
    const buttonPressed = buttonJump && !heldJump.current
    heldJump.current = buttonJump

    const result = step({
      position: position.current,
      velocityY: velocityY.current,
      moveX,
      moveZ,
      jump: !down && (keys.jump || buttonJump),
      jumpPressed: !down && (keys.jumpPressed || buttonPressed),
      grounded: grounded.current,
      jumps: jumps.current,
      delta,
      isSolid,
      ...(topOf ? { topOf } : {}),
      blockers: blockers?.current,
      bounceOf,
      bounce,
      /*
        `player.jump` is cells and the step wants a speed, so the conversion
        happens here - through the level's own gravity, or a heavy world would
        quietly shrink the height the document asked for. A level that sets
        gravity but not jump keeps the built-in *height* rather than the
        built-in speed, for the same reason: cells are the author's unit.
      */
      ...(movement?.jump !== undefined || movement?.gravity !== undefined
        ? {
            jumpSpeed: jumpSpeedFor(
              movement.jump ?? jumpHeightOf(JUMP_SPEED),
              movement.gravity,
            ),
          }
        : {}),
      ...(movement?.gravity !== undefined ? { gravity: movement.gravity } : {}),
      floorY,
      ...(restartBelow === undefined
        ? {}
        : {
            restart: {
              below: restartBelow,
              // The save point too: falling into a hole is a death, and a
              // course that sent you back to the start for it while dying on
              // the spikes beside it returned you to the checkpoint would be
              // teaching two different rules for the same mistake.
              to: { x: back.current.x, y: back.current.y, z: back.current.z },
            },
          }),
    })

    /**
     * Back at the start, and the eye goes with the body.
     *
     * `eyeY` lags the body upwards so a stair does not read as a stutter, and a
     * lag of thirty cells is not a stutter - it is the camera flying up out of
     * the pit you just fell into. A restart is the one move that is not a climb,
     * so it is the one that skips the easing.
     */
    if (result.restarted) {
      eyeY.current = result.position.y
      // The stride too: a fall carried at full sprint must not walk you off
      // the spawn the frame you arrive back on it.
      stride.current.x = 0
      stride.current.z = 0
      onRestart?.()
    }

    // Spent, whether or not it fired: a press that arrived mid-air with no
    // jumps left must not sit in the buffer waiting to go off on landing.
    keys.jumpPressed = false

    position.current = result.position
    velocityY.current = result.velocityY
    grounded.current = result.grounded
    jumps.current = result.jumps

    /**
     * Catch up to the body over about a tenth of a second, framerate
     * independent - `1 - e^(-t/tau)` rather than a fixed fraction per frame,
     * which would ease twice as fast at 120fps as at 60.
     */
    const target = result.position.y
    if (target < eyeY.current) {
      eyeY.current = target
    } else {
      eyeY.current += (target - eyeY.current) * (1 - Math.exp(-delta / 0.06))
      // Close enough is close enough: without this it approaches forever and
      // the camera never quite settles.
      if (Math.abs(target - eyeY.current) < 0.001) eyeY.current = target
    }

    /**
     * Where the camera ends up.
     *
     * First person is the eye. Third is the eye pushed backwards along the look
     * direction, as far as it can go before it is inside something - a fixed arm
     * would spend half of every corridor behind the wall, showing the level from
     * the outside, and the fix for that is asking rather than a shorter arm.
     *
     * The *body* still moves exactly as it did: this is the last thing that
     * happens in the frame and nothing downstream reads the camera's position.
     * `track` below reports the player's position, not the camera's, which is
     * what keeps a trigger firing where the person is standing rather than where
     * they are being watched from.
     */
    if (shot.kind === 'side') {
      /**
       * Nailed to the axis, level with the eye, looking straight through it.
       *
       * Written last in the frame, like the other two, and it overrides whatever
       * `PointerLockControls` did with the mouse - which is deliberate rather
       * than wasteful. The lock is still what a click takes and what the shot
       * path checks, so leaving it mounted keeps one way in; what it must not do
       * is turn the camera, and the cheapest way to say that is to put the
       * camera where it belongs afterwards.
       */
      const eye = { x: result.position.x, y: eyeY.current, z: result.position.z }
      const { position, target } = sideCamera(shot, eye)
      placeRig(position.x, position.y, position.z)
      camera.lookAt(target.x, target.y, target.z)

      /**
       * And the framing, which only an orthographic camera has.
       *
       * Guarded rather than assumed: `scene.tsx` builds an orthographic camera
       * for a side-on document, but a `zoom` written onto a perspective camera
       * is a silent no-op that would leave somebody wondering why `span` does
       * nothing. Setting it every frame is one assignment and a compare - the
       * alternative is an effect that has to know about resize, rotation and
       * the document changing under it.
       */
      /**
       * Read off the frame's own state rather than the binding above.
       *
       * They are the same camera. The difference is that `zoom` is a plain
       * property rather than a nested object with a `set` on it, and React's
       * compiler refuses a direct assignment to a value captured at render -
       * correctly, since that is how a render-time read and a frame-time write
       * come to disagree. `state.camera` is obtained inside the frame, so there
       * is nothing captured to be stale.
       */
      const lens = state.camera
      const wanted = orthoZoom(shot, height)
      if (lens.zoom !== wanted) {
        lens.zoom = wanted
        lens.updateProjectionMatrix()
      }
    } else if (shot.kind === 'fixed') {
      /**
       * Nailed to a spot, and turning to watch unless the document aimed it.
       *
       * Written last in the frame and overriding the mouse, exactly as the
       * side-on branch does and for the reason spelled out there: the pointer
       * lock stays mounted because it is what a click takes and what the shot
       * path checks, and what it must not do is turn the camera.
       *
       * `view` is not consulted. First person inside a camera bolted to the far
       * corner of a room is not a thing anybody means, and honouring the toggle
       * would put the eye somewhere the document explicitly said the camera is
       * not.
       */
      const eye = { x: result.position.x, y: eyeY.current, z: result.position.z }
      const { position, target } = fixedCamera(shot, eye)
      placeRig(position.x, position.y, position.z)
      camera.lookAt(target.x, target.y, target.z)
    } else if (view === 'third') {
      const eye = { x: result.position.x, y: eyeY.current, z: result.position.z }
      const { behind, above, beside } = followSettings(shot)
      const back = { x: -look.current.x, y: -look.current.y, z: -look.current.z }
      // Where it may sit, and then where it actually does - see `easedChase`,
      // which is why a walk past a post is a drift rather than a flicker.
      const wanted = chaseDistance(eye, back, behind, { isSolid, ground })
      /*
       * A teleport is not a wall. Respawning, a save point or a door puts the
       * body somewhere else entirely, and easing across that gap is a camera
       * flying through the level to catch up - so the ease is skipped for the
       * frame that moved you, which is the same `put || result.restarted` the
       * tracker uses one screen down.
       */
      if (put || result.restarted) chase.current = wanted
      chase.current = easedChase(chase.current, wanted, delta)
      const distance = chase.current
      /**
       * The shoulder, worked out from the look direction rather than the camera.
       *
       * `right` is `forward x up`, which for a flat forward is `(-z, 0, x)` -
       * the same two lines `movementBasis` writes out, and written out here
       * again rather than shared because that function answers "which way do the
       * keys push" and this answers "where does the lens sit". They agree today
       * and are not the same question: a level that one day wants a camera
       * offset without the keys following it would break the shared one.
       *
       * Applied *after* the wall check, deliberately. The shoulder is small
       * compared to the arm, and folding it into the ray would make the camera
       * jump between shoulders every time somebody brushed a corner.
       */
      const flat = Math.hypot(look.current.x, look.current.z) || 1
      const rightX = -look.current.z / flat
      const rightZ = look.current.x / flat
      placeRig(
        eye.x + back.x * distance + rightX * beside,
        eye.y + back.y * distance + above,
        eye.z + back.z * distance + rightZ * beside,
      )
    } else {
      placeRig(result.position.x, eyeY.current, result.position.z)
    }

    // Every frame, unthrottled: this is what the trigger pass tests against,
    // and a pickup sampled four times a second is a pickup you run through.
    /**
     * The heading, in the document's degrees rather than in radians.
     *
     * Taken from the camera's own direction rather than from an accumulated
     * turn, because the mouse look is `PointerLockControls`' business and a
     * second copy of "which way am I facing" is a second copy that drifts.
     */
    /**
     * Which way the body is pointing, which is not always where the camera looks.
     *
     * Behind the body they are the same thing and this is the arithmetic it has
     * always done. Beside it they are opposites: the camera looks *at* the
     * player, so a body turned to match it faces the viewer and runs the course
     * sideways-on with its face to the glass.
     *
     * So a side-on level takes its heading from travel. `facingFrom` is the same
     * conversion `yawFor` is the inverse of, which is what keeps this in the
     * document's convention rather than inventing a third one.
     *
     * **And a fixed level, for the same reason and one more.** It is beside the
     * body too - the shot stands off in a corner and looks in - so the first
     * argument applies unchanged. The one more is that its basis is now the
     * *shot's* heading rather than the lens's (`movementBasis`), so it no longer
     * moves at all: a body pointed at it would face one direction for the whole
     * game however far you walked, which is a body nobody is driving. Travel is
     * the only reading left that changes, and it is the right one - you face the
     * way you are going, which is what a piece on a board does.
     */
    if (shot.kind === 'side' || shot.kind === 'fixed') {
      if (Math.hypot(moveX, moveZ) > 1e-6) facing.current = facingFrom(moveX, moveZ)
    } else {
      facing.current = facingFrom(forward.current.x, forward.current.z)
    }

    track?.(
      result.position,
      facing.current,
      // `result.restarted` is the other half of the same fact: a fall sent back
      // to the spawn is a jump made *inside* the step, so the identity check
      // above cannot see it.
      put || result.restarted,
    )
    tracked.current = result.position

    // The HUD wants a readout, not sixty of them a second.
    reported.current += delta
    if (onMove && reported.current > 0.1) {
      reported.current = 0
      // The same `facing.current` `track` reports, so the readout and the wire
      // can never disagree about which way somebody is pointing.
      onMove(result.position, result.grounded, facing.current)
    }
  })

  /**
   * A click that comes too soon after Escape still takes the lock, a beat later.
   *
   * The browser refuses `requestPointerLock` for about a second after the user
   * leaves the lock, and refuses it as a *rejected promise* that three does not
   * hold on to - so the page prints `Uncaught (in promise) SecurityError` and,
   * far worse, nothing happens. Escape, click, and the mouse still moves a
   * cursor over a game that is waiting to be played, with no way to tell that
   * the click was heard and declined.
   *
   * The cooldown is the browser's, not ours, so it cannot be avoided - only
   * waited out. One retry, once, a beat after the refusal: long enough to be
   * past the gate and short enough that it still reads as the click doing it.
   * A second click in the meantime cancels it, because by then the person has
   * said what they want more recently than we have.
   *
   * Wrapped around the canvas' own method rather than around `controls.lock`,
   * because three calls `requestPointerLock` itself and drops the promise on
   * the floor - the rejection never passes through anything drei or we own.
   */
  useEffect(() => {
    if (touch) return
    const canvas = gl.domElement
    // Nothing to wrap where there is no lock - see `canLockPointer`.
    if (!canLockPointer) return
    const own = Object.getOwnPropertyDescriptor(canvas, 'requestPointerLock')
    const ask = canvas.requestPointerLock.bind(canvas) as () => Promise<void> | undefined
    let retry: ReturnType<typeof setTimeout> | null = null

    canvas.requestPointerLock = function patched(this: HTMLCanvasElement) {
      if (retry) clearTimeout(retry)
      retry = null
      const asked = ask()
      // Older browsers return nothing at all, which is the same success this
      // has always had and nothing to wait on.
      if (!asked || typeof asked.catch !== 'function') return asked as unknown as void
      return asked.catch(() => {
        if (document.pointerLockElement) return
        retry = setTimeout(() => {
          retry = null
          // Still nothing locked, and the page is still in front of somebody:
          // a tab that went to the background in the meantime asking for the
          // pointer is exactly what the cooldown is there to stop.
          if (document.pointerLockElement || document.hidden) return
          void ask()?.catch(() => {
            /*
             * Refused twice, a second and a half apart, which is not the
             * cooldown any more. Said once and quietly, because the two things
             * that produce it are worth knowing and neither is a bug in here:
             * a frame with no `allow="pointer-lock"`, and a document that is
             * not the focused one.
             *
             * This is also the whole reason three's own line is silenced below
             * rather than left alone - a message that prints on every refusal,
             * including the ones the retry above quietly fixes, teaches people
             * to ignore the one that matters.
             */
            console.warn(
              'The browser will not give this page the pointer. Click the game once more, or check the tab is focused.',
            )
          })
        }, 1300)
      }) as unknown as void
    } as typeof canvas.requestPointerLock

    return () => {
      if (retry) clearTimeout(retry)
      // Back to the prototype's own, unless this element had one of its own
      // before us - in which case it gets it back rather than losing it.
      if (own) Object.defineProperty(canvas, 'requestPointerLock', own)
      else delete (canvas as Partial<HTMLCanvasElement>).requestPointerLock
    }
  }, [canLockPointer, gl, touch])

  /**
   * And three's own commentary on the refusal, which is the noisy half.
   *
   * `PointerLockControls` listens for `pointerlockerror` and prints *THREE.
   * PointerLockControls: Unable to use Pointer Lock API* for every one it sees.
   * The browser fires that event for the Escape cooldown as well - the same
   * refusal the retry above recovers from a beat later - so the loudest message
   * in the console describes the case that already works, and says the API is
   * unusable when it is about to be used.
   *
   * Silenced by the only route the library leaves: its listeners are registered
   * in `connect` from the fields as they stand, so disconnecting, replacing the
   * handler and connecting again is a swap rather than a monkey-patch. The
   * signal it carried is not lost - the second refusal above says it, once, in
   * words about this page.
   *
   * The cast is because the field is `private` in the typings and public on the
   * instance. Narrow, deliberate, and it fails safely: a version that stops
   * having any of these three leaves the effect doing nothing at all.
   */
  const lock = useRef<PointerLockControlsImpl>(null)

  useEffect(() => {
    if (touch) return

    const controls = lock.current as unknown as {
      domElement?: HTMLElement
      connect?: (element: HTMLElement) => void
      disconnect?: () => void
      onPointerlockError?: () => void
    } | null

    const element = controls?.domElement
    if (!controls || !element || !controls.connect || !controls.disconnect) return

    const noisy = controls.onPointerlockError
    controls.disconnect()
    controls.onPointerlockError = () => {}
    controls.connect(element)

    return () => {
      if (!controls.connect || !controls.disconnect) return
      controls.disconnect()
      controls.onPointerlockError = noisy
      controls.connect(element)
    }
  }, [touch])

  /**
   * Pointer lock is a mouse idea.
   *
   * There is nothing to lock on a phone, and mounting it there puts a click
   * handler over the whole page that swallows the first touch of every session.
   * Touch turns the camera by dragging instead - see the look block above.
   *
   * And nothing to lock in a browser that has no Pointer Lock API - iOS and
   * iPadOS WebKit - where drei's click handler would call a method that is not
   * there. A level with no mouse look is worse than one with it and better than
   * one that throws on the first click. See `canLockPointer`.
   */
  return (
    <>
      {/*
        Empty, and load-bearing. Everything it does is done to it from the frame
        loop - it exists so the camera has a parent for a headset pose to be
        composed with. See the note where it is declared.
      */}
      <group ref={rig} />
      {touch || !canLockPointer ? null : (
        /*
          Locked by a click on the level, not by a click anywhere on the page.

          Given no `selector`, drei hangs its click-to-lock handler on `document`
          itself - so *any* click on the page re-locks the pointer, including one
          on the rail beside the scene. That is how "End the match" in the rail
          came to re-grab the pointer mid-confirm: the click armed the button and,
          on its way up to `document`, also asked for the lock, which pulled focus
          off the button and tripped its `onBlur` disarm (see match-block.tsx). The
          post-Escape retry above made it worse, re-locking a beat later even when
          the first ask was refused - so the confirm could never survive to its
          second press.

          Scoped to `.playing` - the scene's own root, which the HUD and the
          "click to look" overlay sit inside and the rail sits outside - a click
          on the level still locks, and a click on the chrome around it no longer
          does.
        */
        <PointerLockControls ref={lock} selector=".playing" />
      )}
    </>
  )
}
