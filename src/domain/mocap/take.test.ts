import { describe, expect, test } from 'bun:test'
import { bake, type Vec3 } from '@/domain/animator/clip'
import { decide, initialClipState } from '@/domain/thingiverse/clip-aggregate'
import { LANDMARK_COUNT, type PoseFrame } from '@/domain/mocap/landmarks'
import { smoothFrame } from '@/domain/mocap/smooth'
import { restPose, type SkeletonBone, skeletonOf } from '@/domain/mocap/skeleton'
import { sampleFrame, type TakeFrame, thinKeys, toDoc } from '@/domain/mocap/take'

/**
 * The recording half, which is about time rather than about geometry.
 *
 * A two-bone skeleton is enough for all of it: nothing here cares what the
 * body looks like, only that frames arriving at whatever rate a webcam managed
 * come out on the document's grid, and that keys saying nothing are dropped.
 * The geometry is `./retarget.test.ts`, against the real dummy.
 */
const BONES: SkeletonBone[] = [
  { name: 'root', parent: null, rest: [0, 0, 0, 1], offset: [0, 0, 0] },
  { name: 'hips', parent: 'root', rest: [0, 0, 0, 1], offset: [0, 1, 0] },
]
const SKELETON = skeletonOf(BONES)

function frameAt(x: number): PoseFrame {
  const points: Vec3[] = Array.from({ length: LANDMARK_COUNT }, () => [x, 0, 0])
  return { points, visible: points.map(() => 1) }
}

const TAKE: TakeFrame[] = [
  { time: 0, frame: frameAt(0) },
  { time: 0.5, frame: frameAt(10) },
  { time: 1, frame: frameAt(20) },
]

describe('sampling a take', () => {
  test('blends between the two frames a moment falls between', () => {
    expect(sampleFrame(TAKE, 0.25)?.points[0][0]).toBeCloseTo(5, 6)
    expect(sampleFrame(TAKE, 0.75)?.points[0][0]).toBeCloseTo(15, 6)
  })

  test('holds at both ends rather than running off the take', () => {
    expect(sampleFrame(TAKE, -1)?.points[0][0]).toBe(0)
    expect(sampleFrame(TAKE, 99)?.points[0][0]).toBe(20)
  })

  test('takes the lower confidence of the two, so a guess is never blended in', () => {
    const frames: TakeFrame[] = [
      { time: 0, frame: { ...frameAt(0), visible: [1, 1] } },
      { time: 1, frame: { ...frameAt(1), visible: [0, 1] } },
    ]
    expect(sampleFrame(frames, 0.5)?.visible[0]).toBe(0)
  })

  test('has nothing to say about an empty take', () => {
    expect(sampleFrame([], 0)).toBeNull()
  })
})

describe('the document a take becomes', () => {
  test('lands one key on every frame of the grid, at the rate asked for', () => {
    const doc = toDoc(TAKE, SKELETON, { fps: 12, thin: 0 })
    expect(doc.fps).toBe(12)
    expect(doc.duration).toBeCloseTo(1, 6)
    expect(doc.keys).toHaveLength(13)
    for (const [index, key] of doc.keys.entries()) expect(key.time).toBeCloseTo(index / 12, 6)
  })

  test('keys linearly, because a key every frame must not ease into the next', () => {
    for (const key of toDoc(TAKE, SKELETON, { thin: 0 }).keys) expect(key.ease).toBe('linear')
  })

  test('an empty take is a document with one rest key, not a crash', () => {
    const doc = toDoc([], SKELETON)
    expect(doc.keys).toHaveLength(1)
    expect(doc.keys[0].pose.bones.hips).toEqual([0, 0, 0, 1])
  })

  test('never carries more samples than a clip may hold', () => {
    // A minute at 60fps is 3,601 samples once baked, and the shelf takes
    // 1,440. The tail goes; the clip is keepable.
    const doc = toDoc([{ time: 0, frame: frameAt(0) }, { time: 60, frame: frameAt(1) }], SKELETON, {
      fps: 60,
      thin: 0,
    })
    expect(doc.keys.length).toBeLessThanOrEqual(1440)
    expect(doc.duration).toBeCloseTo(1439 / 60, 6)
  })

  test('never runs past the longest clip the editor can hold', () => {
    const doc = toDoc([{ time: 0, frame: frameAt(0) }, { time: 900, frame: frameAt(1) }], SKELETON, {
      fps: 12,
      thin: 0,
    })
    expect(doc.duration).toBeLessThanOrEqual(60)
  })
})

describe('a take against the shelf that has to hold it', () => {
  test('the longest, fastest take there is, is one a space will keep', () => {
    // The seam worth a test: the recorder decides `fps` and `duration`, and a
    // space's clip aggregate is what refuses a clip too long. A minute at 60fps
    // is past its limit by a factor of two and a half, so if the cap in `toDoc`
    // is ever removed this fails here rather than in front of somebody who has
    // just performed the move.
    const doc = toDoc([{ time: 0, frame: frameAt(0) }, { time: 60, frame: frameAt(2) }], SKELETON, {
      fps: 60,
      thin: 0,
    })

    expect(() =>
      decide(initialClipState, {
        type: 'DrawClip',
        name: 'capture',
        skeleton: 'dummy',
        clip: bake(doc, restPose(SKELETON)),
        doc,
        by: { actorId: 'a0000000-0000-4000-8000-000000000001', admin: false },
        visibility: 'private',
      }),
    ).not.toThrow()
  })
})

describe('thinning', () => {
  const pose = (angle: number) => ({
    root: [0, 0, 0] as Vec3,
    bones: { hips: [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)] as [number, number, number, number] },
  })

  const doc = (angles: number[]) => ({
    version: 1,
    name: 'x',
    fps: 24,
    loop: false,
    duration: (angles.length - 1) / 24,
    keys: angles.map((angle, index) => ({
      time: index / 24,
      ease: 'linear' as const,
      pose: pose(angle),
    })),
  })

  test('drops the middle of a straight run and keeps both ends', () => {
    const thinned = thinKeys(doc([0, 0.1, 0.2, 0.3, 0.4]), 2)
    expect(thinned.keys).toHaveLength(2)
    expect(thinned.keys[0].time).toBeCloseTo(0, 6)
    expect(thinned.keys[1].time).toBeCloseTo(4 / 24, 6)
  })

  test('keeps the corner in a movement that changes direction', () => {
    // Up and back down: the peak is not on the line between its neighbours,
    // and a thinning that lost it would flatten the whole gesture.
    const thinned = thinKeys(doc([0, 0.2, 0.4, 0.2, 0]), 2)
    expect(thinned.keys.map((key) => Math.round(key.time * 24))).toContain(2)
  })

  test('keeps everything when asked for no tolerance at all', () => {
    expect(thinKeys(doc([0, 0.1, 0.2, 0.3]), 0).keys).toHaveLength(4)
  })
})

describe('smoothing', () => {
  test('holds a still point almost still', () => {
    const was: PoseFrame = { points: [[0, 0, 0]], visible: [1] }
    const now: PoseFrame = { points: [[0.004, 0, 0]], visible: [1] }
    // Four millimetres in a thirtieth of a second is noise, so most of the old
    // value survives.
    expect(smoothFrame(was, now, 1, 1 / 30).points[0][0]).toBeLessThan(0.002)
  })

  test('lets a fast point through, so nothing lags behind a real movement', () => {
    const was: PoseFrame = { points: [[0, 0, 0]], visible: [1] }
    const now: PoseFrame = { points: [[0.1, 0, 0]], visible: [1] }
    expect(smoothFrame(was, now, 1, 1 / 30).points[0][0]).toBeCloseTo(0.1, 6)
  })

  test('passes the first frame through, having nothing to blend it with', () => {
    const now: PoseFrame = { points: [[1, 2, 3]], visible: [1] }
    expect(smoothFrame(null, now, 1)).toBe(now)
  })
})
