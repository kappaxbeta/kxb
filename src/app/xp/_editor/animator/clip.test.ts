/**
 * Copied from `src/domain/animator/clip.test.ts`, with the code it guards.
 *
 * The copy is the rule (docs/xp-creator.md §1.2), and a copy of the code
 * without a copy of its tests would be the worst of both: duplicated logic
 * that nothing holds still. See the note at the top of the file it tests.
 */

import { describe, expect, test } from 'bun:test'
import {
  type AnimationDoc,
  type Pose,
  type Quat,
  bake,
  emptyDoc,
  keyAt,
  moveKey,
  parseDoc,
  putKey,
  removeKey,
  rootMoves,
  samplePose,
  setDuration,
  setEase,
  setFps,
  slerp,
  snapTime,
} from '@/app/xp/_editor/animator/clip'

const REST: Pose = {
  root: [0, 0, 0],
  bones: { hips: [0, 0, 0, 1], 'lowerarm.r': [0, 0, 0, 1], head: [0, 0, 0, 1] },
}

/** A quarter turn about Y, as a quaternion. */
const TURNED: Quat = [0, Math.SQRT1_2, 0, Math.SQRT1_2]

const posed = (patch: Record<string, Quat> = {}, root: Pose['root'] = [0, 0, 0]): Pose => ({
  root,
  bones: { ...REST.bones, ...patch },
})

describe('keys', () => {
  test('a new document has one key holding the rest pose', () => {
    const doc = emptyDoc(REST)
    expect(doc.keys).toHaveLength(1)
    expect(doc.keys[0].time).toBe(0)
    expect(doc.keys[0].pose).toEqual(REST)
  })

  test('the pose is copied in, not referenced', () => {
    const rest = posed()
    const doc = putKey(emptyDoc(REST), 1, rest)
    rest.bones.head = TURNED
    expect(doc.keys[1].pose.bones.head).toEqual([0, 0, 0, 1])
  })

  test('keying the same frame twice replaces rather than stacks', () => {
    let doc = putKey(emptyDoc(REST), 1, posed({ head: TURNED }))
    doc = putKey(doc, 1, posed({ head: [0, 0, 0, 1] }))
    expect(doc.keys).toHaveLength(2)
    expect(doc.keys[1].pose.bones.head).toEqual([0, 0, 0, 1])
  })

  test('re-keying a frame keeps the ease that was already on it', () => {
    let doc = putKey(emptyDoc(REST), 1, posed())
    doc = setEase(doc, 1, 'hold')
    doc = putKey(doc, 1, posed({ head: TURNED }))
    expect(doc.keys[1].ease).toBe('hold')
  })

  test('keys stay sorted however they are added', () => {
    let doc = emptyDoc(REST)
    for (const time of [2, 0.5, 1.25]) doc = putKey(doc, time, posed())
    expect(doc.keys.map((key) => key.time)).toEqual([0, 0.5, 1.25, 2])
  })

  test('a key past the end lengthens the clip', () => {
    const doc = putKey(emptyDoc(REST), 5, posed())
    expect(doc.duration).toBe(5)
  })

  test('times land on frame boundaries', () => {
    const doc = putKey(emptyDoc(REST), 1.011, posed())
    // 24fps: the nearest frame to 1.011s is frame 24, which is 1s exactly.
    expect(doc.keys[1].time).toBe(1)
    expect(snapTime(1.011, 24)).toBe(1)
  })

  test('the last key cannot be deleted', () => {
    const doc = removeKey(emptyDoc(REST), 0)
    expect(doc.keys).toHaveLength(1)
  })

  test('deleting takes the key on that frame', () => {
    let doc = putKey(emptyDoc(REST), 1, posed({ head: TURNED }))
    doc = removeKey(doc, 1)
    expect(doc.keys.map((key) => key.time)).toEqual([0])
  })

  test('a key dragged onto another takes its place', () => {
    let doc = putKey(emptyDoc(REST), 1, posed({ head: TURNED }))
    doc = moveKey(doc, 1, 0)
    expect(doc.keys).toHaveLength(1)
    expect(doc.keys[0].pose.bones.head).toEqual(TURNED)
  })

  test('a key dragged to a free frame keeps its pose and re-sorts', () => {
    let doc = putKey(emptyDoc(REST), 0.5, posed({ head: TURNED }))
    doc = putKey(doc, 1, posed())
    doc = moveKey(doc, 0.5, 1.5)
    expect(doc.keys.map((key) => key.time)).toEqual([0, 1, 1.5])
    expect(doc.keys[2].pose.bones.head).toEqual(TURNED)
  })

  test('keyAt is frame-exact rather than nearest', () => {
    const doc = putKey(emptyDoc(REST), 1, posed())
    expect(keyAt(doc, 1)).toBe(1)
    expect(keyAt(doc, 1 + 1 / 24)).toBe(-1)
  })
})

describe('the grid', () => {
  test('changing the frame rate keeps the timing in seconds', () => {
    let doc = putKey(emptyDoc(REST), 1, posed())
    doc = setFps(doc, 12)
    expect(doc.fps).toBe(12)
    expect(doc.keys.map((key) => key.time)).toEqual([0, 1])
  })

  test('two keys that collide on a coarser grid become one', () => {
    let doc = emptyDoc(REST)
    doc = putKey(doc, 1 / 24, posed({ head: TURNED }))
    doc = setFps(doc, 6)
    // A 24fps frame 1 is 0.0417s, which on a 6fps grid is frame 0 - where the
    // key at zero already is. The last one written wins.
    expect(doc.keys).toHaveLength(1)
    expect(doc.keys[0].pose.bones.head).toEqual(TURNED)
  })

  test('shortening the clip keeps the keys past the end', () => {
    let doc = putKey(emptyDoc(REST), 3, posed())
    doc = setDuration(doc, 1)
    expect(doc.duration).toBe(1)
    expect(doc.keys).toHaveLength(2)
  })
})

describe('sampling', () => {
  test('holds before the first key and after the last', () => {
    const doc = putKey(emptyDoc(REST), 1, posed({ head: TURNED }))
    expect(samplePose(doc, -5).bones.head).toEqual([0, 0, 0, 1])
    expect(samplePose(doc, 99).bones.head).toEqual(TURNED)
  })

  test('a linear blend is halfway at the midpoint', () => {
    let doc = putKey(emptyDoc(REST), 1, posed({ head: TURNED }))
    doc = setEase(doc, 0, 'linear')
    const half = samplePose(doc, 0.5).bones.head
    // Half of a quarter turn about Y is an eighth of a turn: 22.5 degrees.
    const angle = 2 * Math.acos(half[3])
    expect(angle).toBeCloseTo(Math.PI / 4, 5)
  })

  test('a hold does not move until the next key', () => {
    let doc = putKey(emptyDoc(REST), 1, posed({ head: TURNED }))
    doc = setEase(doc, 0, 'hold')
    expect(samplePose(doc, 0.99).bones.head).toEqual([0, 0, 0, 1])
    expect(samplePose(doc, 1).bones.head).toEqual(TURNED)
  })

  test('a smooth ease is still halfway at the midpoint but slower at the ends', () => {
    const doc = putKey(emptyDoc(REST), 1, posed({ head: TURNED }))
    const at = (time: number) => 2 * Math.acos(samplePose(doc, time).bones.head[3])
    expect(at(0.5)).toBeCloseTo(Math.PI / 4, 5)
    expect(at(0.1)).toBeLessThan(at(0.5) * 0.2)
  })

  test('the root position interpolates', () => {
    let doc = putKey(emptyDoc(REST), 1, posed({}, [0, 2, 0]))
    doc = setEase(doc, 0, 'linear')
    expect(samplePose(doc, 0.5).root[1]).toBeCloseTo(1, 6)
  })

  test('a bone missing from a key falls back to the rest pose', () => {
    const doc: AnimationDoc = {
      ...emptyDoc(REST),
      keys: [{ time: 0, ease: 'linear', pose: { root: [0, 0, 0], bones: {} } }],
    }
    expect(samplePose(doc, 0, REST).bones.head).toEqual([0, 0, 0, 1])
  })
})

describe('slerp', () => {
  test('takes the short way round', () => {
    // q and -q are the same rotation. Blending towards the negated copy must
    // not go the long way about.
    const negated: Quat = [-TURNED[0], -TURNED[1], -TURNED[2], -TURNED[3]]
    const half = slerp([0, 0, 0, 1], negated, 0.5)
    expect(2 * Math.acos(Math.abs(half[3]))).toBeCloseTo(Math.PI / 4, 5)
  })

  test('stays unit length for nearly identical rotations', () => {
    const nudged: Quat = [0, 0.0001, 0, Math.sqrt(1 - 0.0001 ** 2)]
    const half = slerp([0, 0, 0, 1], nudged, 0.5)
    expect(Math.hypot(...half)).toBeCloseTo(1, 9)
  })
})

describe('baking', () => {
  test('produces one sample per frame, inclusive of the end', () => {
    const doc = setDuration(emptyDoc(REST), 1)
    const baked = bake(doc, REST)
    expect(baked.times).toHaveLength(25)
    expect(baked.times[24]).toBe(1)
  })

  test('drops bones that never move', () => {
    const doc = putKey(emptyDoc(REST), 1, posed({ head: TURNED }))
    const baked = bake(doc, REST)
    expect(Object.keys(baked.bones)).toEqual(['head'])
  })

  test('a smooth ease survives as samples', () => {
    const doc = putKey(setDuration(emptyDoc(REST), 1), 1, posed({ head: TURNED }))
    const baked = bake(doc, REST)
    const w = (frame: number) => baked.bones.head[frame * 4 + 3]
    // Frame 2 of 24 has barely left the first key; a linear blend would be a
    // twelfth of the way there already.
    expect(2 * Math.acos(w(2))).toBeLessThan((Math.PI / 2) * (2 / 24))
  })

  test('a still root is reported as still', () => {
    expect(rootMoves(bake(emptyDoc(REST), REST))).toBe(false)
    expect(rootMoves(bake(putKey(emptyDoc(REST), 1, posed({}, [0, 1, 0])), REST))).toBe(true)
  })
})

describe('the file', () => {
  test('round-trips through JSON', () => {
    let doc = putKey(emptyDoc(REST, 'wave'), 1, posed({ head: TURNED }, [0, 0.5, 0]))
    doc = setEase(doc, 1, 'hold')
    expect(parseDoc(JSON.parse(JSON.stringify(doc)), REST)).toEqual(doc)
  })

  test('rubbish opens as an empty clip rather than throwing', () => {
    expect(parseDoc({ keys: 'nope', fps: 'fast' }, REST).keys).toHaveLength(1)
    expect(parseDoc(null, REST).fps).toBe(24)
  })

  test('a bone added to the rig since the file was saved arrives at rest', () => {
    const doc = putKey(emptyDoc(REST), 1, posed())
    const older = JSON.parse(JSON.stringify(doc))
    for (const key of older.keys) delete key.pose.bones.head
    expect(parseDoc(older, REST).keys[1].pose.bones.head).toEqual([0, 0, 0, 1])
  })

  test('a degenerate quaternion becomes identity rather than NaN', () => {
    const doc = putKey(emptyDoc(REST), 1, posed())
    const broken = JSON.parse(JSON.stringify(doc))
    broken.keys[1].pose.bones.head = [0, 0, 0, 0]
    expect(parseDoc(broken, REST).keys[1].pose.bones.head).toEqual([0, 0, 0, 1])
  })

  test('the duration never ends up shorter than the last key it kept', () => {
    const parsed = parseDoc({ duration: 0.5, fps: 24, keys: [{ time: 3, pose: { root: [0, 0, 0], bones: {} } }] }, REST)
    expect(parsed.duration).toBe(3)
  })
})
