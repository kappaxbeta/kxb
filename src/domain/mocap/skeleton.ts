/**
 * A rig, as the numbers retargeting needs and nothing more.
 *
 * The editor's rig is a live `THREE.Object3D` tree; this is the same tree as
 * plain data - a name, a parent, and the local transform the model shipped
 * with. Two reasons for the copy rather than reaching into three:
 *
 * - Retargeting is arithmetic, and arithmetic that can be tested against the
 *   bytes of `Dummy.glb` without a renderer is arithmetic that gets tested.
 *   `./retarget.test.ts` builds one of these straight out of the glTF's node
 *   table.
 * - The live tree is being drawn while we compute. Reading rest rotations off
 *   it mid-pose would give the *posed* rotation, which is the sort of bug that
 *   only shows up once somebody records a second take without reloading.
 *
 * `offset` is the bind-pose translation and never changes: bones carry
 * rotation alone, so a length here is a fact about the model. It is here at
 * all because standing the figure on the floor needs to know where its feet
 * ended up, which means walking the whole chain, which means the lengths.
 */
import type { Pose, Quat, Vec3 } from '@/domain/animator/clip'
import { ROOT_BONE } from '@/domain/animator/rig'
import { IDENTITY, ZERO, add, mulQuat, rotate } from '@/domain/mocap/maths'

export interface SkeletonBone {
  name: string
  /** The nearest ancestor that is also a bone here, or null for the root. */
  parent: string | null
  /** Local rotation in the bind pose. */
  rest: Quat
  /** Local translation in the bind pose, in the parent's space. */
  offset: Vec3
}

export interface MocapSkeleton {
  /** Which bone the document's one translation belongs to. */
  root: string
  /** Parents before children, so one pass forward is a full solve. */
  order: string[]
  bones: Record<string, SkeletonBone>
}

/** A bone's place in the world, once the chain above it has been resolved. */
export interface Placed {
  quat: Quat
  pos: Vec3
}

/**
 * The skeleton, with its bones put in an order a single pass can solve.
 *
 * Depth-first from the root rather than a general topological sort, because a
 * skeleton is a tree and the recursive shape is the one that reads. Anything
 * whose parent is not in the list is dropped: a bone with a dangling parent
 * cannot be placed, and keeping it would put a NaN into the pose instead.
 */
export function skeletonOf(bones: readonly SkeletonBone[], root = ROOT_BONE): MocapSkeleton {
  const byName: Record<string, SkeletonBone> = {}
  for (const bone of bones) byName[bone.name] = bone

  const children = new Map<string | null, SkeletonBone[]>()
  for (const bone of bones) {
    const key = bone.parent && byName[bone.parent] ? bone.parent : null
    const list = children.get(key)
    if (list) list.push(bone)
    else children.set(key, [bone])
  }

  const order: string[] = []
  const walk = (name: string | null) => {
    for (const child of children.get(name) ?? []) {
      order.push(child.name)
      walk(child.name)
    }
  }
  walk(null)

  return { root, order, bones: byName }
}

/**
 * Where every bone ends up, for a pose.
 *
 * Forward kinematics, and the only reason this file knows about lengths at
 * all: a pose is rotations, and "is this foot on the floor" is a question
 * about a position.
 */
export function place(
  skeleton: MocapSkeleton,
  rotations: Record<string, Quat>,
  rootPosition: Vec3 = ZERO,
): Record<string, Placed> {
  const out: Record<string, Placed> = {}
  for (const name of skeleton.order) {
    const bone = skeleton.bones[name]
    const local = rotations[name] ?? bone.rest
    const offset = name === skeleton.root ? add(bone.offset, rootPosition) : bone.offset
    const parent = bone.parent ? out[bone.parent] : undefined
    if (!parent) {
      out[name] = { quat: local, pos: offset }
      continue
    }
    out[name] = {
      quat: mulQuat(parent.quat, local),
      pos: add(parent.pos, rotate(parent.quat, offset)),
    }
  }
  return out
}

/**
 * The bind pose as a `Pose`, for the moments there is nothing to capture.
 *
 * The same shape `RigHandle.rest` has in the editor, built from data instead
 * of from a loaded model, so a document can be made before - or without - a
 * camera ever producing a frame.
 */
export function restPose(skeleton: MocapSkeleton): Pose {
  const bones: Record<string, Quat> = {}
  for (const name of skeleton.order) {
    if (name === skeleton.root) continue
    bones[name] = skeleton.bones[name].rest
  }
  const root = skeleton.bones[skeleton.root]
  return { root: root ? [...root.offset] : [0, 0, 0], bones }
}

/** The bind pose as a rotation map, which is what a bone nobody drove keeps. */
export function restRotations(skeleton: MocapSkeleton): Record<string, Quat> {
  const out: Record<string, Quat> = {}
  for (const name of skeleton.order) out[name] = skeleton.bones[name].rest ?? IDENTITY
  return out
}
