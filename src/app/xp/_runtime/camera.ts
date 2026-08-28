/**
 * Which way is forward, and where the camera stands.
 *
 * The document half of this is `packages/xp/src/world/camera.ts`, and its opening line
 * is the one that matters here too: **the camera block is an input mode that
 * happens to also move the camera.** This file is that sentence as arithmetic.
 *
 * `player.tsx` has always taken forward from `camera.getWorldDirection` - you
 * walk where you look. Behind a body that is invisible and correct. *Beside* one
 * it is a bug with no error message: forward becomes into the screen, so `W`
 * walks the player away from the viewer and `A`/`D` push them towards and away
 * from the glass. Nothing throws. The controls simply read as broken, and the
 * person playing concludes the game is.
 *
 * So the basis is chosen by the camera rather than derived from it, and it is a
 * pure function because that is the half a test can hold. Where the camera
 * *sits* is four lines of arithmetic anybody can check by looking - except that
 * nobody can look, because the Browser pane never fires a frame, so it is tested
 * too.
 */

import {
  DEFAULT_ABOVE,
  DEFAULT_AXIS,
  DEFAULT_BEHIND,
  DEFAULT_BESIDE,
  DEFAULT_DISTANCE,
  DEFAULT_FAR,
  DEFAULT_FOV,
  DEFAULT_SPAN,
  type CameraAxis,
  type XpCamera,
} from '@kxb/xp'

/**
 * The camera yaw that makes a body face the way a document means.
 *
 * **This existed as an off-by-180 for as long as spawns have had a facing, and
 * it is why `ladder-run` opened on a black screen.** Its spawn is `facing: 90`
 * and its course runs along +x; the camera was looking along -x, with three
 * solid cells in front of it and the whole level behind.
 *
 * The document's convention is the *mark's*: `marks.tsx` turns a frame about Y
 * by `facing` degrees, so its local +z - the way it points - becomes
 * `(sin θ, 0, cos θ)`. `race.ts` crosses that plane along the same normal and
 * `spawn.ts` lays arrivals out against it. Three's camera looks down **-z**, so
 * a bare `rotation.y = θ` points it at `(-sin θ, 0, -cos θ)` - the exact
 * opposite, every time.
 *
 * Worth noting what was already right: `track` reports the heading as
 * `atan2(forward.x, forward.z)`, which *is* the mark convention - so the body,
 * the wire and every peer's rotation have always agreed with the document. Only
 * the one line that placed the camera at spawn disagreed, which is why it
 * survived: nothing downstream of it was wrong, and the symptom was "the level
 * looks empty" rather than anything pointing at a rotation.
 */
export function yawFor(facing: number): number {
  return (facing * Math.PI) / 180 + Math.PI
}

/**
 * And back: the heading a forward direction represents, in the document's
 * degrees.
 *
 * The same arithmetic `player.tsx` does when it reports where somebody is
 * looking. Here so the pair can be tested against each other, which is the only
 * way to catch a convention that is consistently wrong.
 */
export function facingFrom(forwardX: number, forwardZ: number): number {
  return (Math.atan2(forwardX, forwardZ) * 180) / Math.PI
}

export interface Spot {
  x: number
  y: number
  z: number
}

/**
 * Which way the keys push, in world units.
 *
 * `forward` is what `W` does and `right` is what `D` does, both as a direction
 * on the ground plane. Returned as four numbers rather than two vectors because
 * the caller multiplies them by a pace and adds them, sixty times a second, and
 * a pair of allocations per frame for something nothing else ever sees is the
 * kind of thing this folder keeps not doing.
 */
export interface Basis {
  forwardX: number
  forwardZ: number
  rightX: number
  rightZ: number
}

/** What a side-on camera's optional fields mean when a document omits them. */
export function sideSettings(camera: XpCamera): {
  axis: CameraAxis
  distance: number
  span: number
} {
  return {
    axis: camera.axis ?? DEFAULT_AXIS,
    distance: camera.distance ?? DEFAULT_DISTANCE,
    span: camera.span ?? DEFAULT_SPAN,
  }
}

/** What a follow camera's optional framing means when a document omits it. */
export function followSettings(camera: XpCamera): {
  behind: number
  above: number
  beside: number
} {
  return {
    behind: camera.behind ?? DEFAULT_BEHIND,
    above: camera.above ?? DEFAULT_ABOVE,
    beside: camera.beside ?? DEFAULT_BESIDE,
  }
}

/**
 * The lens, for the two settings three needs before anything is drawn.
 *
 * Read here rather than in the scene so that "what does absent mean" is
 * answered in the same file as every other camera default - the scene had these
 * two as literals, which is why a level could not have an opinion about either.
 */
export function lensSettings(camera: XpCamera): { fov: number; far: number } {
  return {
    fov: camera.fov ?? DEFAULT_FOV,
    far: camera.far ?? DEFAULT_FAR,
  }
}

/**
 * Where a fixed camera stands, and what it points at.
 *
 * `watching` is the eye, as everywhere else in this file, so a camera with no
 * opinion looks at the player's head rather than their shoes. It was called
 * `at` until the document grew a field of that name, and two `at`s in one
 * function is one too many.
 *
 * Three answers, in the order a document reaches for them:
 *
 * - **`at`, a spot**, and it wins because it is the most specific thing anybody
 *   can say. A table's four chairs all name the same middle, which is what
 *   `seats` needs and what a single `yaw` cannot express.
 * - **`yaw` and `pitch`, a direction**, and the target is a point one cell along
 *   it - a direction rather than a distance, because three's `lookAt` only cares
 *   which way the vector points.
 * - **Neither, and it watches you**, which is the shot a camera nailed to the
 *   corner of a room is actually for.
 *
 * The first two cannot both be written - `cameraProblems` refuses that pair
 * rather than letting this pick - so the order here is a reading order and not
 * a precedence anybody has to know.
 *
 * `yaw` is the document's convention, the same one `Mark.facing` uses: zero
 * looks along +z. `yawFor` is not used here because this produces a *target*
 * rather than a rotation, and the 180-degree correction that function exists
 * for is about three's camera looking down -z. Pointing a camera at a spot in
 * front of it has no such trap - which is the whole reason this returns a
 * target and not an angle.
 */
export function fixedCamera(
  camera: XpCamera,
  watching: Spot,
): { position: Spot; target: Spot } {
  const position = { x: camera.x ?? 0, y: camera.y ?? 0, z: camera.z ?? 0 }

  if (camera.at) {
    return { position, target: { x: camera.at.x, y: camera.at.y, z: camera.at.z } }
  }

  if (camera.yaw === undefined || camera.pitch === undefined) {
    return { position, target: { x: watching.x, y: watching.y, z: watching.z } }
  }

  const yaw = (camera.yaw * Math.PI) / 180
  const pitch = (camera.pitch * Math.PI) / 180
  const flat = Math.cos(pitch)

  return {
    position,
    target: {
      x: position.x + Math.sin(yaw) * flat,
      y: position.y + Math.sin(pitch),
      z: position.z + Math.cos(yaw) * flat,
    },
  }
}

/**
 * The basis the keys are read against.
 *
 * `look` is the camera's own forward direction, which only a `follow` camera
 * uses - a side-on level ignores it entirely, and that is the whole point: the
 * mouse cannot change which way `D` goes when the camera is nailed to an axis.
 *
 * **`forward` is zero for a side-on camera**, so `W` and `S` do nothing. That is
 * a decision rather than an omission. The alternative is letting them move along
 * the camera's own axis, which walks the player out of the plane the level is
 * built on and behind the scenery - a 2D platformer where you can step into the
 * background is a 2D platformer with an invisible third dimension of bugs.
 *
 * `anchor` is the spot a `fixed` camera was placed to frame - the player's own
 * arrival. Absent it falls back to `look`, which is what every caller that has
 * no document to hand does. See the branch for why it is worth threading.
 */
export function movementBasis(
  camera: XpCamera,
  look: { x: number; z: number },
  anchor?: Spot,
): Basis {
  if (camera.kind === 'side') {
    const { axis } = sideSettings(camera)
    /**
     * Screen-right, worked out from where the camera stands.
     *
     * For an `x` level the camera is off along +z looking back along -z, so
     * screen-right is +x. For a `z` level it is off along +x looking along -x,
     * and screen-right is -z. Getting this backwards is the bug where a
     * platformer's `D` walks you left, which is worse than not shipping one.
     */
    return axis === 'x'
      ? { forwardX: 0, forwardZ: 0, rightX: 1, rightZ: 0 }
      : { forwardX: 0, forwardZ: 0, rightX: 0, rightZ: -1 }
  }

  /**
   * A fixed camera's forward is where the *shot* points, not where it happens to
   * be looking this frame.
   *
   * This branch used to say, in a comment, that its absence was deliberate: a
   * fixed camera has a heading like any other, so falling through to the follow
   * case was the answer. That is true of a camera with a `yaw` and false of one
   * without, and **absent angles are the default** - such a camera turns to watch
   * the player, so its heading is the line from the lens to wherever they are
   * standing. Read that as a basis and the keys rotate under the person holding
   * them: every step sideways swings the shot a little, so `W` no longer means
   * the direction it meant a step ago, and the whole level reads as drifting.
   *
   * Worst exactly where a board game puts you. Mensch's blue chair is at
   * `z = 12.8` and its camera stands at `z = 17` - four cells apart on the floor
   * and seventeen up - so walking to your own die walks you *under the lens*,
   * where the flat heading collapses to nothing and spins through a half turn.
   * Reported as "when you go on the edge of the gamefield the controls rotate
   * you", which is the arithmetic said out loud.
   *
   * So the heading is taken from the anchor - the spot the shot was framed for,
   * which is where the player arrives - rather than from where they have walked
   * to since. Through `fixedCamera` rather than subtracted here, so a document
   * that *did* write a `yaw` gets that one, and there is one definition of where
   * this camera points instead of two that agree until somebody edits one.
   *
   * **A camera that names an `at` needs no anchor at all**, which is why the
   * spot is taken before it: such a shot is already fully decided, and passing
   * it through `fixedCamera` is how that stays one function's opinion rather
   * than a second copy of "does this camera track". Falling back to `look` for
   * one would be right today and only by luck - the lens really is pointing at
   * the spot - and wrong the first time anything else moves it.
   */
  const framed = camera.kind === 'fixed' ? (camera.at ?? anchor) : undefined
  const shot = framed ? fixedCamera(camera, framed) : null
  const heading = shot
    ? { x: shot.target.x - shot.position.x, z: shot.target.z - shot.position.z }
    : look

  /**
   * The behaviour every document has had until now, moved here unchanged.
   *
   * Heading only - the caller flattens the look direction before handing it over,
   * because taking the camera's full direction would drive you into the floor
   * when you looked down. `right` is `forward × up`, which for a flat forward is
   * `(-z, 0, x)`; written out rather than cross-multiplied because two of the
   * three components are always zero.
   */
  const length = Math.hypot(heading.x, heading.z)
  // A camera pointing exactly at the floor has no heading to take. North is as
  // good an answer as any and better than dividing by zero.
  if (length < 1e-6) return { forwardX: 0, forwardZ: -1, rightX: 1, rightZ: 0 }

  const forwardX = heading.x / length
  const forwardZ = heading.z / length
  return { forwardX, forwardZ, rightX: -forwardZ, rightZ: forwardX }
}

/**
 * Where a side-on camera stands, and what it points at.
 *
 * Level with the player rather than above them: a platformer's camera is a
 * window that slides, and any tilt at all turns the flat plane the level is
 * built on into a shallow perspective where two platforms at the same height
 * stop looking like it.
 *
 * `at` is the eye, which is what the controller holds. Using it rather than the
 * feet keeps the player's head at the middle of the frame instead of their
 * shoes, which is where somebody's attention actually is when they are lining up
 * a jump.
 */
export function sideCamera(
  camera: XpCamera,
  at: Spot,
): { position: Spot; target: Spot } {
  const { axis, distance } = sideSettings(camera)

  return {
    position:
      axis === 'x'
        ? { x: at.x, y: at.y, z: at.z + distance }
        : { x: at.x + distance, y: at.y, z: at.z },
    // Straight through the player, so the camera is square to the plane.
    target: { x: at.x, y: at.y, z: at.z },
  }
}

/**
 * How much an orthographic camera has to zoom to frame `span` cells.
 *
 * three.js builds an orthographic frustum in *pixels* under R3F's defaults, so
 * `zoom` is how many pixels one world unit is worth. Height rather than width,
 * because height is the axis a platformer is composed on - a jump either fits on
 * the screen or it does not - and the width then follows from whatever shape the
 * window is.
 *
 * Which is worth saying out loud to whoever lays out a course: a wide screen
 * shows *more* of the level horizontally and exactly the same vertically. A
 * phone shows less across, not less up.
 */
export function orthoZoom(camera: XpCamera, viewportHeight: number): number {
  const { span } = sideSettings(camera)
  // A zero-height canvas happens for a frame during layout, and dividing by a
  // span that `cameraProblems` already refuses to let be zero is safe.
  if (viewportHeight <= 0) return 1
  return viewportHeight / span
}

/**
 * How fast the chase camera lets itself back out, per second.
 *
 * A rate rather than a step, so it is an exponential: six closes about **seven
 * tenths** of the gap in a fifth of a second and about nineteen twentieths in
 * half a second. Those are measured rather than claimed - the first version of
 * this note said "most of it in a fifth", the test disagreed, and the numbers
 * the test gives are the ones worth writing down.
 *
 * Half a second to walk back out to four cells is the trade: fast enough that
 * stepping clear of a doorway does not feel like the camera is on a leash, slow
 * enough that a ray flickering on and off a post reads as a drift rather than a
 * snap - which is the whole reason any of this is here.
 */
export const CHASE_EASE = 6

/**
 * Where the chase camera actually sits, given where it may sit.
 *
 * ---------------------------------------------------------------------------
 * Snap in, ease out
 * ---------------------------------------------------------------------------
 * `chaseDistance` casts **one ray** straight back from the eye and returns
 * where it stops. That is the right answer and the wrong thing to apply raw:
 * walking sideways past a crate, a post or the edge of a doorway sweeps that
 * ray on and off the geometry, so the number alternates between the full four
 * cells and something short - and the camera snaps back and forth once a frame.
 * Reported as *it jitters a bit when you strafe*, which is that arithmetic said
 * out loud.
 *
 * The asymmetry is the fix rather than a compromise:
 *
 * - **In is instant.** A camera left outside a wall for even one frame is a
 *   frame of the inside of a wall, which is the thing the ray exists to
 *   prevent. Easing inwards would trade a jitter for a clip.
 * - **Out is eased.** Coming back out has nothing riding on it - it is comfort -
 *   so it is worth a fifth of a second, and easing is what turns a wall the ray
 *   keeps losing into a camera that drifts back rather than one that flickers.
 *
 * Frame-rate independent, so the same walk looks the same at 30 frames and at
 * 144: the fraction closed is `delta * CHASE_EASE`, clamped, rather than a
 * constant per frame. The clamp is what stops a backgrounded tab's one enormous
 * delta sending the camera straight past what it was easing towards.
 *
 * Pure, because this is the half that can be proved and the half that breaks -
 * the same argument `movementBasis` makes at the top of this file. Nothing here
 * can be watched: the Browser pane never fires a frame.
 */
export function easedChase(held: number, wanted: number, delta: number): number {
  if (wanted <= held) return wanted
  return held + (wanted - held) * Math.min(1, Math.max(0, delta * CHASE_EASE))
}
