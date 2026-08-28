/**
 * Copied from `src/app/ovaloffice/animator/ik.test.ts`, with the code it guards.
 *
 * The copy is the rule (docs/xp-creator.md §1.2), and a copy of the code
 * without a copy of its tests would be the worst of both: duplicated logic
 * that nothing holds still. See the note at the top of the file it tests.
 */

import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { chainAbove, preBend, reachFor } from '@/app/xp/_editor/animator/ik'
import { type BoneSpec, ROOT_BONE } from '@/app/xp/_editor/animator/rig'

/**
 * The solver, on a stand-in for one arm.
 *
 * Three bones of 0.25 each, stacked up +Y, under a node called `root` - the
 * same shape and the same naming as the dummy's arm, because that is what
 * `chainAbove` stops at. Built here rather than loaded from the GLB: parsing a
 * binary glTF outside a browser drags in a loader that wants a DOM for its
 * textures, and none of what is being tested is about the file.
 */
function arm(): { root: THREE.Object3D; hand: THREE.Bone; bones: THREE.Bone[] } {
  const root = new THREE.Object3D()
  root.name = 'root'

  const bones = ['upperarm', 'lowerarm', 'wrist'].map((name) => {
    const bone = new THREE.Bone()
    bone.name = name
    bone.position.y = 0.25
    return bone
  })

  const hand = new THREE.Bone()
  hand.name = 'hand'
  hand.position.y = 0.25

  root.add(bones[0])
  bones[0].add(bones[1])
  bones[1].add(bones[2])
  bones[2].add(hand)
  root.updateMatrixWorld(true)

  return { root, hand, bones }
}

const SPECS: Record<string, BoneSpec> = {
  hand: { name: 'hand', glb: 'hand', label: 'Hand', group: 'arms', reach: 3 },
  wrist: { name: 'wrist', glb: 'wrist', label: 'Wrist', group: 'arms', reach: 2 },
  lowerarm: {
    name: 'lowerarm',
    glb: 'lowerarm',
    label: 'Elbow',
    group: 'arms',
    reach: 1,
    hinge: { axis: 'z', min: -150, max: 4 },
  },
  upperarm: { name: 'upperarm', glb: 'upperarm', label: 'Shoulder', group: 'arms', reach: 1 },
}

const restOf = (bones: THREE.Bone[]) =>
  new Map(bones.map((bone) => [bone.name, bone.quaternion.clone()]))

const reached = (hand: THREE.Object3D, target: THREE.Vector3) =>
  hand.getWorldPosition(new THREE.Vector3()).distanceTo(target)

describe('chainAbove', () => {
  test('walks up from the parent and stops before the root', () => {
    const { hand } = arm()
    expect(chainAbove(hand, 3, ROOT_BONE).map((bone) => bone.name)).toEqual(['wrist', 'lowerarm', 'upperarm'])
  })

  test('stops at the reach it was given', () => {
    const { hand } = arm()
    expect(chainAbove(hand, 1, ROOT_BONE).map((bone) => bone.name)).toEqual(['wrist'])
  })

  test('never turns the root, however far the reach', () => {
    const { hand } = arm()
    expect(chainAbove(hand, 99, ROOT_BONE).map((bone) => bone.name)).not.toContain('root')
  })
})

describe('reaching', () => {
  test('folds the arm onto a target well inside its reach', () => {
    const { hand, bones } = arm()
    const rest = restOf(bones)
    const chain = chainAbove(hand, 3, ROOT_BONE)
    // Off to the side and near the body, so a rigid arm cannot get there
    // however it is aimed - the joints have to bend.
    const target = new THREE.Vector3(0.3, 0.3, 0)

    preBend(chain, SPECS, rest)
    reachFor(hand, chain, target, SPECS, rest)

    expect(reached(hand, target)).toBeLessThan(0.005)
  })

  test('closes most of the way on a target near full extension', () => {
    // The hard case: 0.8 of a 1.0 arm, out to the side the elbow is not
    // allowed to fold towards, so the shoulder has to do all of it. This one
    // converges slowly and asymptotically - stated as a real number rather
    // than as a claim that everything is exact.
    const { hand, bones } = arm()
    const rest = restOf(bones)
    const chain = chainAbove(hand, 3, ROOT_BONE)
    const target = new THREE.Vector3(0.7, 0.4, 0)

    preBend(chain, SPECS, rest)
    reachFor(hand, chain, target, SPECS, rest)

    expect(reached(hand, target)).toBeLessThan(0.05)
  })

  test('a two-bone limb cannot fold at all without the pre-bend', () => {
    /**
     * Why `preBend` exists, as a test rather than as a claim in a comment.
     *
     * A leg is the case that proves it: hip, knee, foot, where the knee is the
     * only hinge and the hip is the only free joint. From dead straight, every
     * rotation the knee is asked for is across its axis, the clamp throws all
     * of it away, and the leg stays a stick that can only be aimed. The arm
     * hides this - its wrist is free, so the hand can get there with a bent
     * wrist and a straight elbow, which reaches the target and looks wrong.
     */
    const leg = () => {
      const root = new THREE.Object3D()
      root.name = 'root'
      const bones = ['upperleg', 'lowerleg'].map((name) => {
        const bone = new THREE.Bone()
        bone.name = name
        bone.position.y = 0.25
        return bone
      })
      const foot = new THREE.Bone()
      foot.name = 'foot'
      foot.position.y = 0.25
      root.add(bones[0])
      bones[0].add(bones[1])
      bones[1].add(foot)
      root.updateMatrixWorld(true)
      return { foot, bones }
    }

    const specs: Record<string, BoneSpec> = {
      upperleg: { name: 'upperleg', glb: 'upperleg', label: 'Hip', group: 'legs', reach: 1 },
      lowerleg: {
        name: 'lowerleg',
        glb: 'lowerleg',
        label: 'Knee',
        group: 'legs',
        reach: 1,
        hinge: { axis: 'x', min: -4, max: 150 },
      },
    }
    const target = new THREE.Vector3(0.25, 0.25, 0)

    const stiff = leg()
    reachFor(stiff.foot, chainAbove(stiff.foot, 2, ROOT_BONE), target, specs, restOf(stiff.bones))
    expect(reached(stiff.foot, target)).toBeGreaterThan(0.2)

    const bent = leg()
    const rest = restOf(bent.bones)
    const chain = chainAbove(bent.foot, 2, ROOT_BONE)
    preBend(chain, specs, rest)
    reachFor(bent.foot, chain, target, specs, rest)
    expect(reached(bent.foot, target)).toBeLessThan(0.005)
  })

  test('the elbow only ever bends the way an elbow bends', () => {
    const { hand, bones } = arm()
    const rest = restOf(bones)
    const chain = chainAbove(hand, 3, ROOT_BONE)
    const elbow = bones[1]

    // Pulled to the side the hinge does *not* open towards, which is exactly
    // where an unconstrained solver would break the joint.
    for (const target of [
      new THREE.Vector3(-0.3, 0.3, 0),
      new THREE.Vector3(0.2, -0.2, 0.2),
      new THREE.Vector3(0, 0.2, 0.35),
    ]) {
      preBend(chain, SPECS, rest)
      reachFor(hand, chain, target, SPECS, rest, { iterations: 30 })

      const relative = rest.get('lowerarm')!.clone().invert().multiply(elbow.quaternion)
      const angle = THREE.MathUtils.radToDeg(2 * Math.atan2(relative.z, relative.w))
      expect(angle).toBeLessThanOrEqual(SPECS.lowerarm.hinge!.max + 0.5)
      expect(angle).toBeGreaterThanOrEqual(SPECS.lowerarm.hinge!.min - 0.5)
      // A hinge is a rotation about one axis and nothing else. Any x or y in
      // the elbow's rotation off its bind pose is a joint bending sideways.
      expect(Math.abs(relative.x)).toBeLessThan(1e-6)
      expect(Math.abs(relative.y)).toBeLessThan(1e-6)
    }
  })

  test('a target beyond reach straightens the arm towards it rather than breaking', () => {
    const { hand, bones } = arm()
    const target = new THREE.Vector3(0, 40, 0)
    reachFor(hand, chainAbove(hand, 3, ROOT_BONE), target, SPECS, restOf(bones), { iterations: 30 })

    const at = hand.getWorldPosition(new THREE.Vector3())
    expect(Number.isFinite(at.x + at.y + at.z)).toBe(true)
    // One metre of arm, pointed straight up.
    expect(at.y).toBeCloseTo(1, 2)
  })

  test('an empty chain is a no-op rather than a throw', () => {
    const { hand } = arm()
    const before = hand.getWorldPosition(new THREE.Vector3())
    reachFor(hand, [], new THREE.Vector3(1, 1, 1), SPECS, new Map())
    expect(hand.getWorldPosition(new THREE.Vector3())).toEqual(before)
  })

  test('a target sitting exactly on the joint does not produce NaN', () => {
    const { hand, bones } = arm()
    reachFor(hand, chainAbove(hand, 3, ROOT_BONE), new THREE.Vector3(0, 0, 0), SPECS, restOf(bones))
    for (const bone of bones) {
      expect(Number.isFinite(bone.quaternion.x + bone.quaternion.w)).toBe(true)
    }
  })
})
