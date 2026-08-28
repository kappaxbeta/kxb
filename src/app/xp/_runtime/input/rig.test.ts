import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { rigSpot, SNAP_DEGREES, snapTurn } from '@/app/xp/_runtime/input/vr'
import { facingFrom } from '@/app/xp/_runtime/camera'

/**
 * What parenting the camera actually does, checked against three rather than
 * against my reading of it.
 *
 * The rig is the one change in this runtime that alters the camera path for
 * **everybody** rather than only for the people wearing a headset - a player on
 * a laptop is now looking through a camera that has a parent, where before it
 * had none. There is no headset here and the Browser pane issues no frames, so
 * the honest thing is to test the load-bearing assumption directly: that a
 * camera inside a group is where the group is, and that a turned group turns
 * what the controller thinks forward means.
 *
 * This is not a test of the React wiring. It is a test of the three.js
 * behaviour that wiring is built on, which is the half I would otherwise be
 * taking on faith.
 */

const built = () => {
  const scene = new THREE.Scene()
  const rig = new THREE.Group()
  const camera = new THREE.PerspectiveCamera()
  scene.add(rig)
  rig.add(camera)
  return { scene, rig, camera }
}

describe('a camera with a parent', () => {
  test('is wherever the rig is', () => {
    /**
     * The whole substitution. Every `camera.position.set(...)` in the controller
     * became `rig.position.set(...)`, and this is the assertion that the two
     * mean the same thing to everything downstream.
     */
    const { rig, camera } = built()
    camera.position.set(0, 0, 0)
    rig.position.set(4, 2, -7)
    rig.updateMatrixWorld(true)

    const at = camera.getWorldPosition(new THREE.Vector3())
    expect([at.x, at.y, at.z]).toEqual([4, 2, -7])
  })

  test('and its own offset would be added on top, which is why it is zeroed', () => {
    /**
     * The bug prevented by one line in the effect that does the parenting.
     * Whatever the camera was holding when it acquired a parent is composed with
     * the rig's transform, so a camera left at its old position puts the player
     * twice as far from the origin as they asked - and only from the first frame
     * onward, which makes it look like a physics problem rather than a graph
     * one.
     */
    const { rig, camera } = built()
    camera.position.set(4, 2, -7)
    rig.position.set(4, 2, -7)
    rig.updateMatrixWorld(true)

    const at = camera.getWorldPosition(new THREE.Vector3())
    expect([at.x, at.y, at.z]).toEqual([8, 4, -14])
  })

  test('a turned rig turns what forward means', () => {
    /**
     * Why snap turning can be applied to the rig at all. The controller builds
     * its movement basis from `camera.getWorldDirection`, so if that did not
     * account for the parent, a player who snap-turned would face one way and
     * walk another - which is the worst possible outcome in a headset and would
     * look like a physics bug rather than a matrix one.
     */
    const { rig, camera } = built()
    camera.rotation.set(0, 0, 0)
    rig.rotation.y = Math.PI / 2
    rig.updateMatrixWorld(true)

    const look = camera.getWorldDirection(new THREE.Vector3())
    // A camera looks down -z, so a quarter turn left points it down -x.
    expect(look.x).toBeCloseTo(-1, 5)
    expect(look.z).toBeCloseTo(0, 5)
  })

  test('and the mouse composes with it rather than replacing it', () => {
    // Outside a session the camera's own rotation is `PointerLockControls`'
    // business and the rig's is the headset's. They have to add up, or one of
    // the two silently stops working the moment the other is used.
    const { rig, camera } = built()
    camera.rotation.set(0, Math.PI / 2, 0, 'YXZ')
    rig.rotation.y = Math.PI / 2
    rig.updateMatrixWorld(true)

    const look = camera.getWorldDirection(new THREE.Vector3())
    // Two quarter turns is a half turn: a camera that looked down -z now looks
    // down +z.
    expect(look.z).toBeCloseTo(1, 5)
  })

  test('six flicks face you the other way', () => {
    /**
     * `snapTurn` and the rig, together, in the document's own units. End to end
     * because the two halves use different ones - degrees out of `snapTurn`,
     * radians onto an `Object3D` - and a missing conversion there would turn a
     * player a fifty-seventh of the distance they asked for.
     *
     * Six, not four. The first version of this test said four and so did the
     * comment on `SNAP_DEGREES`, which is what a twelfth of a circle is not:
     * 360/30 is twelve flicks round, so half of that is six. Worth leaving the
     * arithmetic visible below rather than trusting either of us again.
     */
    const { rig, camera } = built()
    const half = 180 / SNAP_DEGREES
    expect(half).toBe(6)

    const facingNow = () => {
      rig.updateMatrixWorld(true)
      const look = camera.getWorldDirection(new THREE.Vector3())
      return facingFrom(look.x, look.z)
    }
    const before = facingNow()

    let armed = true
    for (let flick = 0; flick < half; flick++) {
      const step = snapTurn(1, armed)
      armed = snapTurn(0, step.armed).armed
      rig.rotation.y += (step.degrees * Math.PI) / 180
    }

    // Turned by half a circle, however that lands in the -180..180 the document
    // reports headings in.
    const turned = Math.abs(((facingNow() - before + 540) % 360) - 180)
    expect(turned).toBeCloseTo(180, 4)
  })

  test('outside a session the rig sits exactly where the camera used to', () => {
    // The compatibility claim, stated as a test: a player on a laptop must be
    // looking from the same point they were before the rig existed.
    const eye = { x: 3, y: 1.6, z: -2 }
    expect(rigSpot(eye, false)).toEqual(eye)
  })
})
