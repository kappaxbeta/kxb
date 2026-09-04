/**
 * A body in front of a camera, turned into a pose for the dummy.
 *
 * ---------------------------------------------------------------------------
 * Directions, not positions
 * ---------------------------------------------------------------------------
 * The tempting way to do this is inverse kinematics: take the person's wrist,
 * scale it into the model's space, and solve the arm to reach it. It is the
 * wrong way, and the reason is in the numbers - MediaPipe measures a person
 * roughly 1.7m tall and the dummy is about 1.3 units from floor to helmet,
 * with an upper arm that is a different fraction of that again. Any solver
 * asked to put a short arm where a long arm's wrist is either misses, and the
 * miss is a shoulder pulled out of its socket, or reaches, and the reach is an
 * elbow bent to make up length that was never there.
 *
 * So nothing here reaches for a point. Each bone is asked only which way it
 * points - shoulder to elbow, elbow to wrist, knee to ankle - and that
 * question has the same answer whatever size either body is. It is the whole
 * argument for skeletal animation restated: an angle transfers, a position
 * does not.
 *
 * ---------------------------------------------------------------------------
 * Swing from the bind pose, so the twist survives
 * ---------------------------------------------------------------------------
 * Every bone in this pack points down its own `+Y`, so pointing one somewhere
 * is the rotation taking its rest direction onto the new one - and there are
 * infinitely many of those, differing by a turn about the bone itself. The
 * shortest is taken, applied *on top of* the bone's rest rotation rather than
 * instead of it, which keeps whatever roll the model was built with. A camera
 * cannot see roll anyway: nothing in a set of joint centres says whether a
 * forearm is palm-up or palm-down.
 *
 * The three bones that do get a full orientation - hips, chest, head - are the
 * ones with two measurable lines through them, a line across and a line up. A
 * frame built from those carries the turn of the body, which is exactly the
 * part a chain of directions cannot express.
 *
 * ---------------------------------------------------------------------------
 * What this cannot do
 * ---------------------------------------------------------------------------
 * Travel, because the feed is hip-centred (see `./landmarks`) - the figure
 * stands still and is stood *on the floor* by `ground` below. Roll of any
 * kind, per the paragraph above. And depth is a single camera's guess, so a
 * hand moving straight towards the lens is the reading least worth trusting.
 * Everything here is a first pass to key over, which is what the animator is
 * for.
 */
import type { Pose, Quat, Vec3 } from '@/domain/animator/clip'
import { LM, type LandmarkName, type PoseFrame } from '@/domain/mocap/landmarks'
import {
  BONE_AXIS,
  betweenVectors,
  conjugate,
  frameFrom,
  mid,
  mulQuat,
  rotate,
  sub,
  unit,
} from '@/domain/mocap/maths'
import { type MocapSkeleton, type Placed, place, restRotations } from '@/domain/mocap/skeleton'

/**
 * A bone pointed along the line between two landmarks.
 *
 * Note that `wrist.l` and `wrist.r` are absent while `hand.l` and `hand.r` are
 * here. The two sit in a chain - lower arm, wrist, hand - and both would be
 * driven by the same line from the wrist joint to the base of the index
 * finger, so keying both would apply that one turn twice and bend the hand
 * back on itself. The wrist keeps its rest rotation and the hand carries the
 * angle.
 */
const LIMBS: { bone: string; from: LandmarkName; to: LandmarkName }[] = [
  { bone: 'upperarml', from: 'shoulderL', to: 'elbowL' },
  { bone: 'lowerarml', from: 'elbowL', to: 'wristL' },
  { bone: 'handl', from: 'wristL', to: 'indexL' },
  { bone: 'upperarmr', from: 'shoulderR', to: 'elbowR' },
  { bone: 'lowerarmr', from: 'elbowR', to: 'wristR' },
  { bone: 'handr', from: 'wristR', to: 'indexR' },
  { bone: 'upperlegl', from: 'hipL', to: 'kneeL' },
  { bone: 'lowerlegl', from: 'kneeL', to: 'ankleL' },
  { bone: 'footl', from: 'ankleL', to: 'footL' },
  { bone: 'upperlegr', from: 'hipR', to: 'kneeR' },
  { bone: 'lowerlegr', from: 'kneeR', to: 'ankleR' },
  { bone: 'footr', from: 'ankleR', to: 'footR' },
]

/**
 * A bone given a whole orientation, from a line across it and a line up it.
 *
 * `spine` is deliberately not here. The hips take the pelvis frame and the
 * chest takes the shoulder frame, so the twist between them - which is the
 * only thing a torso reads as - lands on the chest as a difference from the
 * hips. Driving the spine as well would spend that twist twice and leave the
 * shoulders over-rotated by however much the spine took.
 */
const FRAMES: {
  bone: string
  across: [LandmarkName, LandmarkName]
  up: [from: [LandmarkName, LandmarkName], to: [LandmarkName, LandmarkName]]
}[] = [
  {
    bone: 'hips',
    // Left hip first: the dummy's `+X` is its own left, so this vector and the
    // model's X axis point the same way. Getting this backwards is a figure
    // that faces away from the camera and is otherwise perfectly animated.
    across: ['hipL', 'hipR'],
    up: [['hipL', 'hipR'], ['shoulderL', 'shoulderR']],
  },
  {
    bone: 'chest',
    across: ['shoulderL', 'shoulderR'],
    up: [['hipL', 'hipR'], ['shoulderL', 'shoulderR']],
  },
  {
    bone: 'head',
    across: ['earL', 'earR'],
    up: [['shoulderL', 'shoulderR'], ['earL', 'earR']],
  },
]

/** Bones whose position decides where the floor is. */
const FEET = ['toesl', 'toesr', 'footl', 'footr']

export interface RetargetOptions {
  /**
   * Stand the figure on the floor.
   *
   * On by default. The feed carries no height (see `./landmarks`), so without
   * this a crouch is a figure whose legs fold while its hips stay put and its
   * feet sink through the ground. With it, the lowest foot is held at the
   * height it has in the bind pose and the body is moved to suit, which turns
   * the same joint angles into a crouch, a lunge or a step-up.
   */
  ground?: boolean
  /**
   * How sure the model has to be about a landmark before a bone is driven by
   * it.
   *
   * A limb the person has moved out of frame comes back with low confidence
   * and a plausible-looking guess. Driving a bone from the guess is worse than
   * leaving it at rest: rest is obviously "not captured" and a guess is a
   * wrong take you have to notice.
   */
  minVisibility?: number
}

const MIN_VISIBILITY = 0.5

/**
 * One frame of landmarks, as a `Pose` the animator can key.
 *
 * Bones nothing drove keep their rest rotation, which is what makes a partly
 * visible person produce a partly posed figure rather than a broken one.
 */
export function retarget(
  frame: PoseFrame,
  skeleton: MocapSkeleton,
  options: RetargetOptions = {},
): Pose {
  const { ground = true, minVisibility = MIN_VISIBILITY } = options
  const { points, visible } = frame

  const seen = (name: LandmarkName) => (visible[LM[name]] ?? 0) >= minVisibility
  const at = (name: LandmarkName) => points[LM[name]]

  /** The direction each driven bone should point, in the model's space. */
  const aims = new Map<string, Vec3>()
  for (const limb of LIMBS) {
    if (!seen(limb.from) || !seen(limb.to)) continue
    const aim = unit(sub(at(limb.to), at(limb.from)))
    if (aim) aims.set(limb.bone, aim)
  }

  /** ...and the full orientation, for the three that have one. */
  const orientations = new Map<string, Quat>()
  for (const spec of FRAMES) {
    const [a, b] = spec.across
    const [from, to] = spec.up
    if (!seen(a) || !seen(b) || !seen(from[0]) || !seen(from[1]) || !seen(to[0]) || !seen(to[1])) {
      continue
    }
    const across = sub(at(a), at(b))
    const up = sub(mid(at(to[0]), at(to[1])), mid(at(from[0]), at(from[1])))
    const orientation = frameFrom(across, up)
    if (orientation) orientations.set(spec.bone, orientation)
  }

  // One pass down the tree. Every bone's parent is already placed by the time
  // we reach it - that is what `skeletonOf` ordered the list for - which is
  // what lets a target expressed in the model's space be turned into the local
  // rotation the document stores.
  const rotations: Record<string, Quat> = {}
  const world: Record<string, Placed> = {}

  // The bind pose, placed. Two things need it: an orientation is a rotation of
  // where a bone *rests* in the world, and standing the figure on the floor
  // needs to know where the floor was.
  const rest = place(skeleton, restRotations(skeleton))

  for (const name of skeleton.order) {
    const bone = skeleton.bones[name]
    const parent = bone.parent ? world[bone.parent] : undefined
    const parentQuat = parent?.quat ?? [0, 0, 0, 1]

    let local = bone.rest

    const orientation = orientations.get(name)
    const aim = aims.get(name)
    if (orientation) {
      // The frame says how the *body* is turned, so it turns the bone out of
      // its bind-pose orientation - `rest[name]`, the whole chain resolved,
      // not the posed parent. Using the posed parent instead reads as a chest
      // that turns twice as far as the hips it hangs from, because the hips'
      // own turn is already in it.
      const desired = mulQuat(orientation, rest[name].quat)
      local = mulQuat(conjugate(parentQuat), desired)
    } else if (aim) {
      // Where the bone points now, in its parent's space, and where it should.
      const from = rotate(bone.rest, BONE_AXIS)
      const to = rotate(conjugate(parentQuat), aim)
      local = mulQuat(betweenVectors(from, to), bone.rest)
    }

    rotations[name] = local
    world[name] = parent
      ? {
          quat: mulQuat(parentQuat, local),
          pos: [
            parent.pos[0] + rotate(parentQuat, bone.offset)[0],
            parent.pos[1] + rotate(parentQuat, bone.offset)[1],
            parent.pos[2] + rotate(parentQuat, bone.offset)[2],
          ],
        }
      : { quat: local, pos: bone.offset }
  }

  const rootBone = skeleton.bones[skeleton.root]
  const lift = ground ? floorGap(rest, world) : 0
  const root: Vec3 = rootBone
    ? [rootBone.offset[0], rootBone.offset[1] + lift, rootBone.offset[2]]
    : [0, lift, 0]

  // The root's own rotation is not part of a pose - `capture` in the animator
  // skips it for the same reason, it is the node the whole rig hangs from and
  // turning it would turn the floor with it.
  const bones: Record<string, Quat> = {}
  for (const name of skeleton.order) {
    if (name === skeleton.root) continue
    bones[name] = rotations[name]
  }

  return { root, bones }
}

/**
 * How far the posed figure has to move to stand where the bind pose stands.
 *
 * Measured from the lowest foot rather than from both, so one foot lifting
 * leaves the body where it was and both bending lowers it. Measuring the mean
 * would sink a figure by half of every step it takes.
 */
function floorGap(rest: Record<string, Placed>, posed: Record<string, Placed>): number {
  const lowest = (places: Record<string, Placed>) => {
    let low = Infinity
    for (const name of FEET) {
      const found = places[name]
      if (found) low = Math.min(low, found.pos[1])
    }
    return low
  }

  const restFloor = lowest(rest)
  const posedFloor = lowest(posed)
  if (!Number.isFinite(restFloor) || !Number.isFinite(posedFloor)) return 0
  return restFloor - posedFloor
}
