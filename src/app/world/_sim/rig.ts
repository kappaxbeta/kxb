/**
 * The third-person rig every place shares: where the camera sits, and which
 * square the player means.
 *
 * Lifted out of the café when the house arrived, because both are the same
 * problem - a small box with four-unit walls, a peep in the middle of it, and a
 * camera that must not spend the game outside looking at the back of the
 * building. Neither the maths nor the numbers depend on what is being built, so
 * they live here and the two games differ only in what they hand in as solid.
 *
 * Everything here mutates its arguments or reads module-level scratch. That is
 * the point: it runs sixty times a second and the frame loop must not make
 * garbage.
 */

import * as THREE from 'three'
import type { SolidTest } from '@/app/world/lounge/_sim/physics'
import { TILE, tileKey, type TileKey } from '@/domain/world/grid'

/** Scratch. Allocated once, reused forever. */
const FORWARD = new THREE.Vector3()
const FLAT = new THREE.Vector3()
const BOOM = new THREE.Vector3()
export const UP = new THREE.Vector3(0, 1, 0)
const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const RAY = new THREE.Raycaster()
const HIT = new THREE.Vector3()
const SCREEN_CENTRE = new THREE.Vector2(0, 0)

/** A tab left in the background returns one enormous frame. Do not simulate it. */
export const MAX_DELTA = 1 / 20

/**
 * How far the player can look up and down.
 *
 * Tighter than the usual full ninety degrees, because the camera hangs off the
 * look direction: staring at the ceiling would swing the boom under the floor
 * and put the view inside the ground. Down is given more room than up, since
 * everything worth interacting with is at knee height.
 */
export const PITCH_MIN = -1.15
export const PITCH_MAX = 0.35

/** The camera never drops below this, whatever the boom maths says. */
const CAMERA_MIN_Y = 0.7

/** How finely the camera boom is marched when looking for a wall. */
const CAMERA_STEP = 0.2

/** Radians per second when turning with the arrow keys. */
export const LOOK_RATE = 1.8

/** Radians per pixel of touch drag. Matches the lounge's feel. */
export const DRAG_RATE = 0.004

/** Vertical field of view in landscape, and the ceiling applied in portrait. */
export const BASE_FOV = 58
export const MAX_FOV = 82

/**
 * How far in front of the player the interaction probe lands.
 *
 * Squares are 2 units, so this reaches the next one along whether they are
 * standing in the middle of their own square or pressed right up against the
 * counter - which is where they will be, since walking into it is how you stop.
 */
const REACH = 2.5

/** How far across the room the build cursor may reach. */
const BUILD_RANGE = 40

export interface View {
  distance: number
  height: number
  /**
   * Skip the wall check.
   *
   * True for any camera already above wall height: there is nothing up there to
   * collide with, and pulling the boom in anyway would defeat the plan view that
   * makes decorating possible in the first place.
   */
  overhead?: boolean
}

/**
 * Widen the lens on a tall screen.
 *
 * three.js' `fov` is the *vertical* angle, so a portrait phone at the desktop's
 * 58 degrees sees about 29 degrees horizontally - you end up peering at the room
 * through a letterbox. Scaling by how tall the viewport is restores a usable
 * width, capped because past about 82 degrees the distortion at the edges is
 * worse than the narrowness it fixes. Landscape is left exactly as it was.
 */
export function fovFor(width: number, height: number): number {
  const aspect = width / Math.max(height, 1)
  return Math.min(BASE_FOV * Math.min(Math.max(1 / aspect, 1), 1.6), MAX_FOV)
}

/** Keep a summed keyboard-plus-thumbstick axis inside [-1, 1]. */
export function clampAxis(value: number): number {
  return Math.max(-1, Math.min(1, value))
}

/** Metres per second on foot, and with Shift held. */
export const WALK_PACE = 5.5
export const SPRINT_PACE = 9

/**
 * What the player is asking for this frame, from the keys and the thumbstick at
 * once.
 *
 * The two are **summed and then clamped** rather than one winning, so holding W
 * while pushing the stick forward is full speed rather than double - which is
 * what a hybrid laptop with a touchscreen actually does.
 */
export interface Walk {
  /** -1 back .. 1 forward, after both inputs are combined. */
  forward: number
  /** -1 left .. 1 right. */
  strafe: number
  sprint: boolean
  /**
   * The scale that brings a diagonal back down to walking pace.
   *
   * Each axis is clamped on its own, so W+D was two full-strength pushes at
   * right angles - a vector √2 long, and forty per cent faster than walking
   * straight. Scaled rather than normalised, so a thumbstick pushed gently
   * still walks gently: only an input longer than one gets shortened. Same fix,
   * and the same reason, as the lounge's.
   */
  evenly: number
  /** Whether either axis is asking for anything at all. */
  walking: boolean
}

export function walkAxes(
  keys: Record<string, boolean>,
  stick: { forward: number; strafe: number; sprint: boolean },
): Walk {
  const forward = clampAxis((keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) + stick.forward)
  const strafe = clampAxis((keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + stick.strafe)
  const drive = Math.hypot(forward, strafe)

  return {
    forward,
    strafe,
    sprint: (keys.ShiftLeft ?? false) || stick.sprint,
    evenly: drive > 1 ? 1 / drive : 1,
    walking: forward !== 0 || strafe !== 0,
  }
}

/**
 * Turn the camera with the arrow keys and with an accumulated touch drag.
 *
 * The arrow keys are the fallback for anywhere pointer lock is unavailable or
 * refused, and a perfectly good way to play regardless. Both are applied here,
 * in the frame, rather than in their handlers - so the turn rate is per second
 * rather than per keydown repeat, and follows frames rather than how often the
 * OS chose to deliver a move event.
 *
 * **`look` is drained**, which is why it is taken as the mutable object rather
 * than a pair of numbers: the drag accumulated since the last frame has now
 * been spent, and leaving it there would apply it again every frame until the
 * next touch.
 */
export function turnCamera({
  camera,
  euler,
  keys,
  look,
  dt,
}: {
  camera: THREE.Camera
  euler: THREE.Euler
  keys: Record<string, boolean>
  look: { dx: number; dy: number }
  dt: number
}): void {
  const turn = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0)
  const tilt = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0)

  const dragX = look.dx
  const dragY = look.dy
  look.dx = 0
  look.dy = 0

  if (turn === 0 && tilt === 0 && dragX === 0 && dragY === 0) return

  euler.setFromQuaternion(camera.quaternion)
  euler.y -= turn * LOOK_RATE * dt + dragX * DRAG_RATE
  euler.x -= tilt * LOOK_RATE * dt + dragY * DRAG_RATE
  euler.x = Math.max(PITCH_MIN, Math.min(PITCH_MAX, euler.x))
  camera.quaternion.setFromEuler(euler)
}

/**
 * Put the camera behind the player without putting it through a wall.
 *
 * A room here is a small box with four-unit walls around it, so the naive
 * "player minus forward times distance" rig spends most of its time standing
 * outside in the dark. This marches out along the boom and stops short of
 * anything solid, which is the standard third-person answer and the only one
 * that survives a five-by-four room.
 */
export function placeCamera(
  camera: THREE.Camera,
  player: THREE.Vector3,
  view: View,
  solid: SolidTest,
): void {
  camera.getWorldDirection(FORWARD)

  /**
   * The boom follows the yaw only, never the pitch.
   *
   * Hanging it off the full look vector couples where the camera *is* to where
   * it is *pointing*, so glancing down drags the camera up and back and the
   * whole room lurches. Flattening it means looking around aims the camera and
   * nothing else - the rig stays a fixed distance behind and above.
   */
  FLAT.copy(FORWARD)
  FLAT.y = 0
  if (FLAT.lengthSq() < 1e-6) return
  FLAT.normalize()

  BOOM.copy(FLAT).multiplyScalar(-view.distance).addScaledVector(UP, view.height)
  const reach = BOOM.length()
  BOOM.normalize()

  let distance = reach

  if (!view.overhead) {
    for (let along = CAMERA_STEP; along <= reach; along += CAMERA_STEP) {
      const x = player.x + BOOM.x * along
      const y = player.y + BOOM.y * along
      const z = player.z + BOOM.z * along
      if (solid(Math.floor(x), Math.floor(y), Math.floor(z))) {
        // Back off one step, then a little more, so the near plane does not
        // clip into the surface we just stopped against.
        distance = Math.max(0, along - CAMERA_STEP * 1.5)
        break
      }
    }
  }

  camera.position.copy(player).addScaledVector(BOOM, distance)
  camera.position.y = Math.max(camera.position.y, CAMERA_MIN_Y)
}

/**
 * Which square the player means.
 *
 * Two different questions, so two different answers. On the floor you mean "the
 * thing I am standing in front of", which a probe a step ahead gets right even
 * when you are jammed against it. Building, you mean "the square under the
 * crosshair", which is a ray onto the ground - you are placing furniture across
 * the room, not bumping into it.
 */
export function probeTile(
  camera: THREE.Camera,
  player: THREE.Vector3,
  overhead: boolean,
): TileKey | null {
  if (overhead) {
    RAY.setFromCamera(SCREEN_CENTRE, camera)
    if (!RAY.ray.intersectPlane(GROUND, HIT)) return null
    if (HIT.distanceTo(player) > BUILD_RANGE) return null
    return tileKey(Math.round(HIT.x / TILE), Math.round(HIT.z / TILE))
  }

  camera.getWorldDirection(FORWARD)
  FLAT.copy(FORWARD)
  FLAT.y = 0
  if (FLAT.lengthSq() < 1e-6) return null
  FLAT.normalize()

  return tileKey(
    Math.round((player.x + FLAT.x * REACH) / TILE),
    Math.round((player.z + FLAT.z * REACH) / TILE),
  )
}

/**
 * The square the player is *standing on*, which is not the same question.
 *
 * Used for doorways: a way out belongs to the square you walked onto, not to the
 * one you happen to be facing, so that turning round on the doormat does not
 * cancel the journey.
 */
export function standingOn(player: THREE.Vector3): TileKey {
  return tileKey(Math.round(player.x / TILE), Math.round(player.z / TILE))
}
