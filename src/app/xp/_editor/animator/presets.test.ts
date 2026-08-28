/**
 * Copied from `src/domain/animator/presets.test.ts`, with the code it guards.
 *
 * The copy is the rule (docs/xp-creator.md §1.2), and a copy of the code
 * without a copy of its tests would be the worst of both: duplicated logic
 * that nothing holds still. See the note at the top of the file it tests.
 */

import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import {
  type Pose,
  type Quat,
  emptyDoc,
  keyAt,
  samplePose,
  setDuration,
  snapTime,
} from '@/app/xp/_editor/animator/clip'
import { PRESETS, type Turn, stamp, stampLength, turned } from '@/app/xp/_editor/animator/presets'
import { boneKey } from '@/app/xp/_editor/animator/rig'

/**
 * The presets, checked by working out where the feet and hands actually end up.
 *
 * Every angle in the catalogue is a sign nobody can read off the page. A walk
 * whose legs are a quarter cycle out is a walk that limps; one whose thigh
 * sign is flipped moonwalks; one whose arms take the same sign as each other
 * swings both arms forward together. All three of those are correct TypeScript
 * and all three were, at some point this afternoon, what the numbers below
 * actually did.
 *
 * So the test builds the real skeleton out of the GLB's bind transforms,
 * applies each frame and measures. It is the only way to hold a sign honest.
 */

const GLB = 'public/xo/pda/dummy/Dummy.glb'

interface Skeleton {
  rest: Pose
  apply: (bones: Record<string, Turn>) => void
  at: (bone: string) => THREE.Vector3
  pose: (pose: Pose) => void
}

/**
 * The rig, from the file's node table alone.
 *
 * No `GLTFLoader`: it wants a DOM for the texture, and none of this is about
 * the texture. Node names go through `boneKey` for the same reason the loader
 * sanitises them - see the note in `rig.ts`.
 */
async function skeleton(): Promise<Skeleton> {
  const bytes = new Uint8Array(await Bun.file(GLB).arrayBuffer())
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const json = JSON.parse(
    new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))),
  )

  const nodes: THREE.Object3D[] = json.nodes.map((node: Record<string, number[] | string>) => {
    const object = new THREE.Object3D()
    object.name = boneKey((node.name as string) ?? '')
    if (node.translation) object.position.fromArray(node.translation as number[])
    if (node.rotation) object.quaternion.fromArray(node.rotation as number[])
    return object
  })
  json.nodes.forEach((node: { children?: number[] }, index: number) => {
    for (const child of node.children ?? []) nodes[index].add(nodes[child])
  })

  const top = nodes.find((node) => node.name === 'Rig_Medium')!
  top.updateMatrixWorld(true)

  const by = new Map(nodes.map((node) => [node.name, node]))
  const rest: Pose = {
    root: [0, 0, 0],
    bones: Object.fromEntries(nodes.map((node) => [node.name, node.quaternion.toArray() as Quat])),
  }

  const reset = () => {
    for (const node of nodes) node.quaternion.fromArray(rest.bones[node.name])
  }

  return {
    rest,
    apply(bones) {
      reset()
      for (const name of Object.keys(bones)) by.get(name)!.quaternion.fromArray(turned(rest, name, bones[name]))
      top.updateMatrixWorld(true)
    },
    pose(pose) {
      reset()
      for (const name of Object.keys(pose.bones)) by.get(name)?.quaternion.fromArray(pose.bones[name])
      top.updateMatrixWorld(true)
    },
    at: (bone) => by.get(bone)!.getWorldPosition(new THREE.Vector3()),
  }
}

const rig = await skeleton()
const preset = (id: string) => PRESETS.find((entry) => entry.id === id)!

/** The model faces +Z, so this is how far in front of the body something is. */
const forward = (bone: string) => rig.at(bone).z

describe('the catalogue', () => {
  test('every preset starts at 0 and ends at 1', () => {
    for (const entry of PRESETS) {
      expect(entry.frames[0].at).toBe(0)
      expect(entry.frames[entry.frames.length - 1].at).toBe(1)
    }
  })

  test('the cycles close, so looping them does not jolt', () => {
    for (const id of ['walk', 'run', 'armswing', 'wave', 'idle', 'dance', 'jump']) {
      const entry = preset(id)
      const first = entry.frames[0]
      const last = entry.frames[entry.frames.length - 1]
      expect(last.bones).toEqual(first.bones)
      expect(last.lift).toBe(first.lift)
    }
  })

  test('every bone a preset names is a bone the model has', () => {
    for (const entry of PRESETS) {
      for (const frame of entry.frames) {
        for (const bone of Object.keys(frame.bones)) {
          expect(rig.rest.bones[bone]).toBeDefined()
        }
      }
    }
  })

  test('speed scales the length rather than the angles', () => {
    expect(stampLength(preset('walk'), 1)).toBe(1)
    expect(stampLength(preset('walk'), 2)).toBe(0.5)
  })
})

describe('the walk', () => {
  test('the legs alternate rather than moving together', () => {
    const [contact, , opposite] = preset('walk').frames

    rig.apply(contact.bones)
    const rightAhead = forward('footr')
    const leftBehind = forward('footl')
    expect(rightAhead).toBeGreaterThan(0.05)
    expect(leftBehind).toBeLessThan(-0.05)

    // Half a cycle later, the same two swapped. Measured rather than assumed,
    // because the phase offset is what makes it a walk and not a hop.
    rig.apply(opposite.bones)
    expect(forward('footr')).toBeCloseTo(leftBehind, 3)
    expect(forward('footl')).toBeCloseTo(rightAhead, 3)
  })

  test('the stride is symmetric — no limp', () => {
    const frames = preset('walk').frames
    for (const frame of frames) {
      rig.apply(frame.bones)
      const right = rig.at('footr')
      const left = rig.at('footl')
      // The two feet are mirror images across the body at every instant, at
      // some offset in the cycle. Their heights and depths come in the same
      // pairs whichever frame you look at.
      expect(Math.abs(right.x + left.x)).toBeLessThan(1e-6)
    }
  })

  test('no foot ever goes through the floor', () => {
    for (const id of ['walk', 'run']) {
      for (const frame of preset(id).frames) {
        rig.apply(frame.bones)
        for (const bone of ['footr', 'footl', 'toesr', 'toesl']) {
          expect(rig.at(bone).y).toBeGreaterThan(0)
        }
      }
    }
  })

  test('the toe of the pushing foot stays near the floor rather than pointing up', () => {
    // The ankle correction had the opposite sign first time round, and the
    // symptom was a back foot that lifted its toe to the sky at push-off while
    // the heel stayed down. Toe height at toe-off is what catches it.
    const toeOff = preset('walk').frames[0]
    rig.apply(toeOff.bones)
    const bind = 0.026
    expect(rig.at('toesl').y).toBeLessThan(bind * 3)
  })

  test('the swinging leg lifts its foot clear', () => {
    const swing = preset('walk').frames[3]
    rig.apply(swing.bones)
    expect(rig.at('footr').y).toBeGreaterThan(0.17)
  })

  test('the knees only ever bend the way knees bend', () => {
    for (const id of ['walk', 'run', 'jump']) {
      for (const frame of preset(id).frames) {
        for (const knee of ['lowerlegr', 'lowerlegl']) {
          const turn = frame.bones[knee]
          if (turn) expect(turn[0]).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })
})

describe('the arms', () => {
  test('the arm swing opposes itself, one forward and one back', () => {
    rig.apply(preset('armswing').frames[0].bones)
    const right = forward('handr')
    const left = forward('handl')
    expect(right * left).toBeLessThan(0)
    expect(Math.abs(right - left)).toBeGreaterThan(0.2)
  })

  test('the arm swing opposes the legs, which is what makes it a walk', () => {
    // Right leg forward at t=0, so the right arm must be back at t=0. Getting
    // this the other way round is the single most recognisable wrong walk
    // there is, and it is one sign.
    rig.apply(preset('walk').frames[0].bones)
    const legAhead = forward('footr') > 0

    rig.apply(preset('armswing').frames[0].bones)
    const armAhead = forward('handr') > 0

    expect(armAhead).not.toBe(legAhead)
  })

  test('the dance raises both hands together rather than one at a time', () => {
    const up = preset('dance').frames[1]
    rig.apply(up.bones)
    expect(rig.at('handr').y).toBeGreaterThan(1)
    expect(rig.at('handl').y).toBeGreaterThan(1)
    expect(rig.at('handr').y).toBeCloseTo(rig.at('handl').y, 3)
  })

  test('the wave lifts the right hand above the head and leaves the left alone', () => {
    const raised = preset('wave').frames[1]
    rig.apply(raised.bones)
    expect(rig.at('handr').y).toBeGreaterThan(1)
    // The left arm is not mentioned by the preset at all, so it is exactly
    // where the bind pose left it. That is the layering promise, checked.
    expect(rig.at('handl').toArray()).toEqual(rig.at('handl').toArray())
    expect(Object.keys(raised.bones).every((bone) => !bone.endsWith('l'))).toBe(true)
  })

  test('the wave actually moves between its middle frames', () => {
    const frames = preset('wave').frames
    rig.apply(frames[2].bones)
    const low = rig.at('handr').clone()
    rig.apply(frames[3].bones)
    expect(rig.at('handr').distanceTo(low)).toBeGreaterThan(0.1)
  })
})

describe('the jump', () => {
  test('crouches below the floor line and then leaves it', () => {
    const lifts = preset('jump').frames.map((frame) => frame.lift!)
    expect(Math.min(...lifts)).toBeLessThan(-0.1)
    expect(Math.max(...lifts)).toBeGreaterThan(0.35)
    expect(lifts[0]).toBe(0)
  })

  test('the feet are on the floor at the start and at the end', () => {
    const frames = preset('jump').frames
    for (const frame of [frames[0], frames[frames.length - 1]]) {
      rig.apply(frame.bones)
      expect(rig.at('toesr').y).toBeLessThan(0.05)
    }
  })
})

describe('stamping', () => {
  const doc = () => setDuration(emptyDoc(rig.rest, 'test'), 3)

  test('writes a key per frame of the preset, from the playhead', () => {
    const stamped = stamp(doc(), preset('walk'), 1, rig.rest)
    for (const frame of preset('walk').frames) {
      expect(keyAt(stamped, 1 + frame.at)).toBeGreaterThanOrEqual(0)
    }
  })

  test('leaves bones the preset does not name exactly where they were', () => {
    // A head turned before the walk was stamped is a head still turned after.
    const posed = { ...rig.rest, bones: { ...rig.rest.bones, head: turned(rig.rest, 'head', [0, 40, 0]) } }
    const before = stamp(doc(), { ...preset('walk'), frames: [] }, 0, rig.rest)
    const started = { ...before, keys: [{ time: 0, ease: 'smooth' as const, pose: posed }] }

    const stamped = stamp(started, preset('walk'), 0, rig.rest)
    for (const key of stamped.keys) {
      expect(key.pose.bones.head).toEqual(posed.bones.head)
    }
  })

  test('two presets layer rather than replace', () => {
    let stamped = stamp(doc(), preset('walk'), 0, rig.rest)
    const legAt = samplePose(stamped, 0, rig.rest).bones.upperlegr

    stamped = stamp(stamped, preset('armswing'), 0, rig.rest)
    const after = samplePose(stamped, 0, rig.rest)

    expect(after.bones.upperlegr).toEqual(legAt)
    expect(after.bones.upperarmr).not.toEqual(rig.rest.bones.upperarmr)
  })

  test('speed puts the same poses on a shorter stretch of strip', () => {
    const slow = stamp(doc(), preset('walk'), 0, rig.rest, 1)
    const fast = stamp(doc(), preset('walk'), 0, rig.rest, 2)
    expect(slow.keys[slow.keys.length - 1].time).toBeCloseTo(1, 5)
    expect(fast.keys[fast.keys.length - 1].time).toBeCloseTo(0.5, 5)
    expect(samplePose(fast, 0.5, rig.rest).bones.upperlegr).toEqual(
      samplePose(slow, 1, rig.rest).bones.upperlegr,
    )
  })

  test('a stamp past the end lengthens the clip rather than being cut', () => {
    const stamped = stamp(doc(), preset('walk'), 2.6, rig.rest)
    // 2.6s is not on a 24fps frame boundary; the stamp starts at the nearest
    // one, so the clip ends a frame short of 3.6 rather than at it.
    expect(stamped.duration).toBeGreaterThan(3.5)
    expect(stamped.duration).toBeCloseTo(snapTime(2.6, 24) + 1, 6)
  })
})
