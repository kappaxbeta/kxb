import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { poseFor, type Motion } from '@/app/xp/_runtime/body/motion'

/**
 * The clips really do move the body, proved without a screen.
 *
 * This started as a caveat - "animation is the one thing here nobody can check,
 * it needs eyes on `dev.kxb.team`" - and most of that turned out to be false.
 * three.js's scene graph, skeleton binding and `AnimationMixer` are all plain
 * arithmetic over objects; **none of it needs WebGL**. What needs eyes is
 * whether it looks *good*. Whether it works at all is a test.
 *
 * That distinction matters more here than usual, because the failure mode is
 * silent. A clip whose tracks bind to nothing throws nothing, warns nothing, and
 * plays nothing - the body simply stands in its bind pose like a shop dummy, and
 * the only symptom is that the game looks unfinished.
 *
 * ---------------------------------------------------------------------------
 * The trap this caught: three renames the bones
 * ---------------------------------------------------------------------------
 * The glTF files call the joints `lowerleg.r`, `upperarm.l`, `handslot.r`.
 * `GLTFLoader` strips the dots on load - a dot is a property separator in an
 * animation track path, so `lowerleg.r.quaternion` would be unparseable - and
 * the bone arrives named `lowerlegr`.
 *
 * Both sides go through the same sanitising, so the names still match each
 * other and everything works. But the *file* comparison in ./motion.test.ts is
 * comparing names that no longer exist at runtime, which means it proves the
 * two packs agree without proving that anything binds. This is the half that
 * proves the binding.
 */

const PACKS = path.join(import.meta.dir, '..', '..', '..', '..', '..', 'public', 'xp', 'packs')

const load = (file: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> =>
  new Promise((resolve, reject) => {
    const buffer = readFileSync(file)
    new GLTFLoader().parse(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      '',
      // `as` because the loader's own type is the full glTF result and this
      // needs two fields of it.
      (gltf) => resolve(gltf as unknown as { scene: THREE.Group; animations: THREE.AnimationClip[] }),
      reject,
    )
  })

const dummy = await load(path.join(PACKS, 'dummy', 'Dummy.glb'))
const basic = await load(path.join(PACKS, 'animation', 'Rig_Medium', 'Rig_Medium_MovementBasic.glb'))
const general = await load(path.join(PACKS, 'animation', 'Rig_Medium', 'Rig_Medium_General.glb'))

const clips = new Map<string, THREE.AnimationClip>()
for (const clip of [...basic.animations, ...general.animations]) clips.set(clip.name, clip)

/** The bones of a fresh copy of the body, by the names three gives them. */
function boned() {
  const body = clone(dummy.scene)
  const bones = new Map<string, THREE.Object3D>()
  body.traverse((node) => {
    if ((node as THREE.Bone).isBone) bones.set(node.name, node)
  })
  return { body, bones }
}

describe('the body a clip is played on', () => {
  test('is skinned, and three renames its bones on the way in', () => {
    const { bones } = boned()
    expect(bones.size).toBeGreaterThan(20)
    // The dots are gone. This is the fact that makes a file-level name check
    // insufficient on its own.
    expect(bones.has('lowerlegr')).toBe(true)
    expect(bones.has('lowerleg.r')).toBe(false)
  })

  test('and each copy has its own skeleton, not a shared one', () => {
    /**
     * `useGLTF` hands every caller the same cached scene. A plain `scene.clone()`
     * copies the meshes and leaves them bound to the *original* skeleton, so two
     * people in a room share one pose and whoever moves last drags the other
     * with them. This is what `SkeletonUtils.clone` is for, and it is invisible
     * until there are two of somebody.
     */
    const a = boned()
    const b = boned()
    const bone = 'lowerlegr'
    expect(a.bones.get(bone)).toBeDefined()
    expect(a.bones.get(bone)).not.toBe(b.bones.get(bone))
  })
})

describe('every clip we name actually drives the skeleton', () => {
  for (const motion of ['idle', 'walk', 'run', 'air', 'land'] as const) {
    test(`${motion} moves the body`, () => {
      /**
       * The whole point. A clip that binds to nothing plays silently and leaves
       * the body in its bind pose - no exception, no warning, nothing in a
       * console - so "it moved" is the only evidence that exists.
       */
      const clip = clips.get(poseFor(motion as Motion).clip)
      expect(clip).toBeDefined()
      if (!clip) return

      const { body, bones } = boned()
      const mixer = new THREE.AnimationMixer(body)
      mixer.clipAction(clip).play()

      const watched = ['lowerlegr', 'upperarml', 'chest']
      const before = watched.map((name) => bones.get(name)!.quaternion.clone())

      // A tick to bind, then a third of a second - enough of any of these clips
      // to have gone somewhere.
      mixer.update(0.001)
      mixer.update(0.33)

      const turned = watched.map((name, i) => before[i].angleTo(bones.get(name)!.quaternion))
      expect(Math.max(...turned)).toBeGreaterThan(0.05)
    })
  }
})

describe('nothing in a clip binds to a bone that is not there', () => {
  test('every track of every clip we use finds its target', () => {
    /**
     * The strongest check available, and the one that would catch a body model
     * being swapped for a differently-boned one. A track whose path names a node
     * the body does not have is *dropped* by the mixer - so an arm can quietly
     * stop animating while everything else still works, which looks like a bad
     * clip rather than a mismatched rig.
     *
     * Tracks are `<node>.<property>`, and the node half is what has to resolve.
     */
    const { bones } = boned()

    for (const motion of ['idle', 'walk', 'run', 'air', 'land'] as const) {
      const clip = clips.get(poseFor(motion as Motion).clip)!
      const missing = clip.tracks
        .map((track) => track.name.slice(0, track.name.lastIndexOf('.')))
        .filter((node) => !bones.has(node))

      expect({ motion, missing: [...new Set(missing)] }).toEqual({ motion, missing: [] })
    }
  })
})

describe('the walk cycle is a walk cycle', () => {
  test('it loops in about a second, not a frame and not a minute', () => {
    // Not a tautology about the file: it is the number the playback rate is
    // scaled against, so a clip that turned out to be eight seconds long would
    // make `rateFor` nonsense without anything failing.
    const walk = clips.get(poseFor('walk').clip)!
    expect(walk.duration).toBeGreaterThan(0.4)
    expect(walk.duration).toBeLessThan(2.5)
  })

  test('and it comes back to where it started, so a loop does not jump', () => {
    /**
     * A cycle whose last frame is not its first is a body that snaps every time
     * it repeats - once a second, forever. Checked on the hips, which carry the
     * gait.
     */
    const walk = clips.get(poseFor('walk').clip)!
    const { body, bones } = boned()
    const mixer = new THREE.AnimationMixer(body)
    mixer.clipAction(walk).play()

    mixer.update(0.001)
    const start = bones.get('hips')!.quaternion.clone()
    mixer.update(walk.duration)

    expect(start.angleTo(bones.get('hips')!.quaternion)).toBeLessThan(0.05)
  })
})

describe('something held follows the hand', () => {
  test('the dummy has a bone authored to hold things', () => {
    // `handslot.r` in the file; the dot is stripped on load. A body without one
    // simply does not get to hold anything, which is why the name matters.
    const { bones } = boned()
    expect(bones.has('handslotr')).toBe(true)
  })

  test('a thing parented to it moves when the arm does', () => {
    /**
     * The claim the whole change rests on, and it is exactly the kind that would
     * otherwise be assumed. A blueprint `socket` is a fixed offset from the
     * body's origin - the shooter's `hand` is (0.32, 1.15, 0.34), a decent guess
     * at where a hand is while the body stands still and a completely wrong one
     * the moment it swings an arm.
     *
     * Parented to the bone, the gun inherits the pose for free. This drives the
     * walk and asserts the held thing's *world* position actually travels - a
     * gun that stayed put while the arm moved would look worse than the fixed
     * offset it replaced.
     */
    const { body, bones } = boned()
    const hand = bones.get('handslotr')!
    const gun = new THREE.Object3D()
    hand.add(gun)

    const mixer = new THREE.AnimationMixer(body)
    mixer.clipAction(clips.get(poseFor('walk').clip)!).play()

    mixer.update(0.001)
    body.updateMatrixWorld(true)
    const before = new THREE.Vector3().setFromMatrixPosition(gun.matrixWorld)

    mixer.update(0.4)
    body.updateMatrixWorld(true)
    const after = new THREE.Vector3().setFromMatrixPosition(gun.matrixWorld)

    expect(before.distanceTo(after)).toBeGreaterThan(0.05)
  })

  test('and it is somewhere a hand is, not at the body’s feet', () => {
    /**
     * A sanity check on the bone rather than on the code: if a future body model
     * called something `handslotr` that was not a hand, the test above would
     * still pass while the gun came out of somebody's ankle.
     */
    const { body, bones } = boned()
    body.updateMatrixWorld(true)
    const hand = new THREE.Vector3().setFromMatrixPosition(bones.get('handslotr')!.matrixWorld)
    const hips = new THREE.Vector3().setFromMatrixPosition(bones.get('hips')!.matrixWorld)

    // Roughly hip height or above, and off to one side rather than dead centre.
    expect(hand.y).toBeGreaterThan(hips.y * 0.5)
    expect(Math.abs(hand.x)).toBeGreaterThan(0.05)
  })
})
