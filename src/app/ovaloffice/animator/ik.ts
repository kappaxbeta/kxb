import * as THREE from 'three'
import { type BoneSpec, ROOT_BONE } from '@/domain/animator/rig'

/**
 * Dragging a hand and getting an arm.
 *
 * The whole point of the editor is that you pose a body by pulling the parts
 * you can see, not by typing three numbers into a shoulder. That is inverse
 * kinematics, and this is the smallest honest implementation of it: cyclic
 * coordinate descent, which walks up the chain rotating one bone at a time to
 * point the hand a little closer to where the pointer is, and does that a
 * dozen times a frame until it is close enough.
 *
 * CCD is chosen over the analytic two-bone solver everybody reaches for first
 * because the chains here are not all two bones - a hand reaches through
 * wrist, forearm and upper arm - and because joint limits fall out of it
 * naturally: every bone is handled on its own, so clamping one is a line
 * inside the loop rather than a different algorithm.
 *
 * Lives beside the editor rather than in `@/domain/animator` because it works
 * on live `THREE.Bone` objects and their world matrices. The document knows
 * nothing about any of this - it only ever sees the pose that came out.
 */

const X = new THREE.Vector3(1, 0, 0)
const Z = new THREE.Vector3(0, 0, 1)

// Scratch. Every one of these is written before it is read, on every use.
const _pivot = new THREE.Vector3()
const _from = new THREE.Vector3()
const _to = new THREE.Vector3()
const _delta = new THREE.Quaternion()
const _step = new THREE.Quaternion()
const _world = new THREE.Quaternion()
const _parent = new THREE.Quaternion()
const _rel = new THREE.Quaternion()
const _twist = new THREE.Quaternion()

/**
 * The bones a drag on this one is allowed to turn.
 *
 * Starts at the parent, because a bone turning about its own origin cannot
 * move that origin, and the origin is where the handle is. Stops at `root`,
 * which is the node the whole document translates and must never be turned by
 * a limb - a wave that quietly rotated the floor under the figure would be a
 * very confusing bug to find.
 */
export function chainAbove(bone: THREE.Object3D, reach: number): THREE.Bone[] {
  const chain: THREE.Bone[] = []
  let walk = bone.parent
  while (walk && chain.length < reach && walk.name !== ROOT_BONE) {
    chain.push(walk as THREE.Bone)
    walk = walk.parent
  }
  return chain
}

/**
 * Bend a straight joint a little, so the solver has a plane to work in.
 *
 * A hinge that is exactly straight is a hinge with no opinion: the rotation
 * that would bring the hand closer is entirely *across* the hinge axis, the
 * clamp below throws all of it away, and the limb stays a rigid stick that
 * points at the target instead of reaching it. One nudge in the direction the
 * joint is allowed to fold is enough to get it off the singularity, and after
 * that CCD has a gradient to follow.
 *
 * Called once when a drag starts, not per iteration - it is a seed, not a
 * force, and applying it every pass would fight the solver.
 */
export function preBend(
  chain: THREE.Bone[],
  specs: Record<string, BoneSpec>,
  rest: Map<string, THREE.Quaternion>,
): void {
  for (const bone of chain) {
    const hinge = specs[bone.name]?.hinge
    const bind = rest.get(bone.name)
    if (!hinge || !bind) continue

    const axis = hinge.axis === 'x' ? X : Z
    if (Math.abs(hingeAngle(bone.quaternion, bind, axis)) > 0.02) continue

    // Toward the roomier side: that is the way the joint actually folds, and
    // the tiny opposite allowance in the spec is only there to let a limb
    // straighten fully rather than lock a degree short.
    const towards = Math.abs(hinge.max) >= Math.abs(hinge.min) ? hinge.max : hinge.min
    setHinge(bone, bind, axis, THREE.MathUtils.degToRad(towards) * 0.06)
  }
}

/**
 * Turn the chain until the effector is as near the target as it can get.
 *
 * `effector` is the dragged bone; `target` is where the pointer put it, in
 * world space. Nothing here reads or writes the document - it moves live bones
 * and the caller captures the result.
 */
export function reachFor(
  effector: THREE.Object3D,
  chain: THREE.Bone[],
  target: THREE.Vector3,
  specs: Record<string, BoneSpec>,
  rest: Map<string, THREE.Quaternion>,
  {
    iterations = 16,
    /**
     * How much of each step to take.
     *
     * A full step was the thing this was expected to need protecting from -
     * the bone nearest the hand swings all the way onto the target, the clamp
     * pulls it back, and the next pass overshoots the other way. Measured
     * against this rig it does not: full steps converge monotonically and
     * several times faster on every target tried, including the ones that
     * fight a hinge limit. The knob stays because a longer chain might yet
     * need it; the default is what the arm and the leg actually want.
     */
    damping = 1,
    tolerance = 0.001,
  } = {},
): void {
  if (chain.length === 0) return

  for (let pass = 0; pass < iterations; pass += 1) {
    if (effector.getWorldPosition(_from).distanceToSquared(target) < tolerance * tolerance) return

    for (const bone of chain) {
      bone.getWorldPosition(_pivot)
      effector.getWorldPosition(_from).sub(_pivot)
      _to.copy(target).sub(_pivot)

      // A bone sitting exactly on the hand, or a target sitting exactly on the
      // joint, has no direction to point at. Skip rather than normalise a zero.
      if (_from.lengthSq() < 1e-10 || _to.lengthSq() < 1e-10) continue

      _delta.setFromUnitVectors(_from.normalize(), _to.normalize())
      _step.identity().slerp(_delta, damping)

      // The step is a rotation in world space; a bone's own quaternion is in
      // its parent's. Sandwiching by the parent's world rotation is what moves
      // it between the two.
      bone.getWorldQuaternion(_world)
      if (bone.parent) bone.parent.getWorldQuaternion(_parent)
      else _parent.identity()
      bone.quaternion.copy(_parent.invert()).multiply(_step).multiply(_world)

      const hinge = specs[bone.name]?.hinge
      const bind = rest.get(bone.name)
      if (hinge && bind) {
        const axis = hinge.axis === 'x' ? X : Z
        setHinge(
          bone,
          bind,
          axis,
          THREE.MathUtils.clamp(
            hingeAngle(bone.quaternion, bind, axis),
            THREE.MathUtils.degToRad(hinge.min),
            THREE.MathUtils.degToRad(hinge.max),
          ),
        )
      }

      bone.updateMatrixWorld(true)
    }
  }
}

/**
 * How far this bone has turned about its hinge, relative to the bind pose.
 *
 * The bone's rotation off the bind pose is a swing and a twist mixed together;
 * only the twist about the hinge axis is a legal elbow. Projecting the
 * quaternion's vector part onto the axis is the standard way to pull those
 * apart, and the signed angle of what is left is `2 * atan2(projection, w)`.
 */
function hingeAngle(
  quaternion: THREE.Quaternion,
  bind: THREE.Quaternion,
  axis: THREE.Vector3,
): number {
  _rel.copy(bind).invert().multiply(quaternion)
  const along = _rel.x * axis.x + _rel.y * axis.y + _rel.z * axis.z
  let angle = 2 * Math.atan2(along, _rel.w)
  // atan2 of a quaternion whose w has flipped sign reports the long way round.
  if (angle > Math.PI) angle -= 2 * Math.PI
  if (angle < -Math.PI) angle += 2 * Math.PI
  return angle
}

/** The bone, set to exactly this much hinge and no swing at all. */
function setHinge(
  bone: THREE.Object3D,
  bind: THREE.Quaternion,
  axis: THREE.Vector3,
  angle: number,
): void {
  _twist.setFromAxisAngle(axis, angle)
  bone.quaternion.copy(bind).multiply(_twist)
}

/**
 * Put pinned limbs back where they were.
 *
 * What makes lowering the hips a crouch. Without it, every handle in the body
 * is relative to the root, so moving the root moves the feet through the floor
 * and the animator has to re-plant both of them by hand after every nudge -
 * which is exactly the drudgery that stops people from animating.
 *
 * Run after the root moves, never during a limb drag: a pinned hand being
 * dragged is a contradiction, and the drag wins.
 */
export function holdPins(
  pins: Map<string, THREE.Vector3>,
  bones: Map<string, THREE.Object3D>,
  specs: Record<string, BoneSpec>,
  rest: Map<string, THREE.Quaternion>,
): void {
  for (const [name, at] of pins) {
    const bone = bones.get(name)
    const spec = specs[name]
    if (!bone || !spec) continue
    reachFor(bone, chainAbove(bone, spec.reach), at, specs, rest, { iterations: 8 })
  }
}
