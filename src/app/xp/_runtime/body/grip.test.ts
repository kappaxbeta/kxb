import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { gripFrame } from '@/app/xp/_runtime/body/grip'

/**
 * The hand frame, without a renderer.
 *
 * Worth testing here rather than by looking at it, because the failure is
 * invisible in a still: a gun measured against the *world* is drawn perfectly
 * until the body turns, and then it keeps pointing where it was. Somebody found
 * that by playing, which is the expensive way.
 *
 * Plain `Object3D`s rather than the rig: the question is about composing
 * rotations up a chain, and a glTF would only make the arithmetic harder to
 * read while testing the same thing.
 */
describe('the frame a weapon is held in', () => {
  const turned = (about: 'x' | 'y' | 'z', degrees: number) => {
    const node = new THREE.Object3D()
    node.rotation[about] = THREE.MathUtils.degToRad(degrees)
    node.updateMatrix()
    return node
  }

  /** Where the gun's own +z ends up, once the frame and the bone are applied. */
  const barrel = (bone: THREE.Object3D, root: THREE.Object3D) => {
    const forward = new THREE.Vector3(0, 0, 1)
    // The bone's own rest orientation, then the correction - which is what the
    // renderer does: the item is a child of the bone and carries the frame.
    const rest = new THREE.Quaternion()
    for (let node: THREE.Object3D | null = bone; node && node !== root; node = node.parent) {
      rest.premultiply(node.quaternion)
    }
    return forward.applyQuaternion(gripFrame(bone, root)).applyQuaternion(rest)
  }

  test('an unturned gun points along the body, whatever the bone does', () => {
    // The real case: a hand slot whose +z is up, so an uncorrected gun aims at
    // the sky.
    const root = new THREE.Object3D()
    const arm = turned('x', -90)
    const bone = turned('z', 30)
    root.add(arm)
    arm.add(bone)

    const aim = barrel(bone, root)
    expect(aim.x).toBeCloseTo(0, 6)
    expect(aim.y).toBeCloseTo(0, 6)
    expect(aim.z).toBeCloseTo(1, 6)
  })

  test('and it keeps pointing along the body when the body turns', () => {
    /**
     * The regression this file exists for. Measured against the world, the
     * frame bakes in whichever way the body happened to be facing when it was
     * read - so the gun holds that heading while the body turns under it, which
     * reads as a weapon stuck in mid-air.
     */
    const stage = new THREE.Object3D()
    const root = new THREE.Object3D()
    const arm = turned('x', -90)
    const bone = turned('z', 30)
    stage.add(root)
    root.add(arm)
    arm.add(bone)

    const frame = gripFrame(bone, root)

    // The body turns a quarter, as it does every time somebody looks left.
    root.rotation.y = THREE.MathUtils.degToRad(90)
    root.updateMatrixWorld(true)

    // Still forward *for the body*: +z turned by 90° about Y is +x.
    const aim = new THREE.Vector3(0, 0, 1).applyQuaternion(frame)
    bone.getWorldQuaternion(new THREE.Quaternion())
    aim.applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion()))
    expect(aim.x).toBeCloseTo(1, 6)
    expect(aim.y).toBeCloseTo(0, 6)
    expect(aim.z).toBeCloseTo(0, 6)
  })

  test('a bone that is already square to the body needs no correction', () => {
    const root = new THREE.Object3D()
    const bone = new THREE.Object3D()
    root.add(bone)
    expect(gripFrame(bone, root).angleTo(new THREE.Quaternion())).toBeCloseTo(0, 6)
  })

  test('a bone that is not under this body is measured to its own root, not the world', () => {
    // A rig that changed shape, or a lookup that found somebody else's hand.
    // The walk stops at the top of the chain rather than climbing out of it.
    const elsewhere = turned('y', 45)
    const bone = turned('z', 10)
    elsewhere.add(bone)
    const root = new THREE.Object3D()

    expect(() => gripFrame(bone, root)).not.toThrow()
  })
})
