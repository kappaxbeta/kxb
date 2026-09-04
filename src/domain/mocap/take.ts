/**
 * A recording, turned into a document the animator can open.
 *
 * ---------------------------------------------------------------------------
 * Why the take is landmarks and not poses
 * ---------------------------------------------------------------------------
 * Recording stores what the camera saw, frame by frame at whatever irregular
 * rate the machine managed, and retargets afterwards. Retargeting live *and*
 * keeping the poses would be one pass fewer, and it would freeze every choice
 * - the smoothing, the floor, the frame rate - at the moment of recording, so
 * changing your mind about any of them would mean performing the move again.
 * Landmarks are also a twentieth of the size of a pose, which is what makes it
 * reasonable to keep a minute of them in memory.
 *
 * ---------------------------------------------------------------------------
 * A key on every frame, and then fewer
 * ---------------------------------------------------------------------------
 * The document's own note argues that a key is a whole pose because that is
 * what a person edits. A capture is the opposite case - nobody posed these,
 * there are hundreds, and what arrives is a sampled curve rather than a set of
 * decisions. So the take is resampled onto the document's frame grid, one key
 * per frame, and then thinned: keys that a straight blend between their
 * neighbours would have produced anyway are dropped.
 *
 * That thinning is what makes the result editable. A hundred and twenty keys
 * on a strip is a wall of diamonds nobody can grab; the same movement at a
 * two-degree tolerance is usually twenty or thirty, sitting where the body
 * actually changed direction - which is roughly where a person would have put
 * them.
 */
import {
  type AnimationDoc,
  CLIP_VERSION,
  type Keyframe,
  MAX_DURATION,
  MAX_FPS,
  MIN_FPS,
  type Pose,
  type Quat,
  slerp,
} from '@/domain/animator/clip'
import type { PoseFrame } from '@/domain/mocap/landmarks'
import { MAX_CLIP_SAMPLES } from '@/domain/thingiverse/clip-events'
import { angleBetween } from '@/domain/mocap/maths'
import { type MocapSkeleton, restPose } from '@/domain/mocap/skeleton'
import { retarget } from '@/domain/mocap/retarget'

/** One reading, and when it arrived. Seconds from the start of the take. */
export interface TakeFrame {
  time: number
  frame: PoseFrame
}

export interface TakeOptions {
  fps?: number
  name?: string
  loop?: boolean
  /** Stand the figure on the floor. Passed straight through to `retarget`. */
  ground?: boolean
  /**
   * How far a key may sit from the blend that would replace it, in degrees.
   *
   * Zero keeps every frame. Two is a good default: below the angle anybody can
   * see on a limb this size, and it still throws away most of a capture.
   */
  thin?: number
}

const DEFAULT_FPS = 24
const DEFAULT_THIN = 2

/**
 * The camera's reading at a moment that falls between two frames.
 *
 * Interpolated rather than snapped to the nearest, because a webcam's frames
 * do not arrive on a grid: at 24fps out of a camera managing 21, a nearest
 * match repeats some readings and drops others, and a repeated frame in the
 * middle of a movement is a visible hitch. Blending is also what lets a
 * recording made at 15fps be keyed at 24 without looking like it was.
 */
export function sampleFrame(frames: readonly TakeFrame[], time: number): PoseFrame | null {
  if (frames.length === 0) return null
  if (time <= frames[0].time) return frames[0].frame
  const last = frames[frames.length - 1]
  if (time >= last.time) return last.frame

  let after = 1
  while (after < frames.length - 1 && frames[after].time < time) after += 1
  const a = frames[after - 1]
  const b = frames[after]
  const span = b.time - a.time
  const t = span > 1e-6 ? (time - a.time) / span : 0

  const points = a.frame.points.map((point, index) => {
    const other = b.frame.points[index] ?? point
    return [
      point[0] + (other[0] - point[0]) * t,
      point[1] + (other[1] - point[1]) * t,
      point[2] + (other[2] - point[2]) * t,
    ] as [number, number, number]
  })
  // The lower of the two confidences, so a bone is dropped for the whole span
  // in which either end of it was a guess rather than fading in halfway.
  const visible = a.frame.visible.map((value, index) =>
    Math.min(value, b.frame.visible[index] ?? value),
  )

  return { points, visible }
}

/** The take, as a document. */
export function toDoc(
  frames: readonly TakeFrame[],
  skeleton: MocapSkeleton,
  options: TakeOptions = {},
): AnimationDoc {
  const fps = Math.round(Math.min(Math.max(options.fps ?? DEFAULT_FPS, MIN_FPS), MAX_FPS))
  const name = options.name ?? 'capture'
  const loop = options.loop ?? false
  const thin = options.thin ?? DEFAULT_THIN

  const rest = restPose(skeleton)
  if (frames.length === 0) {
    return {
      version: CLIP_VERSION,
      name,
      fps,
      duration: 1 / fps,
      loop,
      keys: [{ time: 0, ease: 'linear', pose: rest }],
    }
  }

  const duration = Math.min(frames[frames.length - 1].time, MAX_DURATION)
  /*
    Frames, capped at what a clip is allowed to carry anywhere on the platform.

    `bake` writes `count + 1` samples, and a space's shelf refuses a clip with
    more than `MAX_CLIP_SAMPLES` of them - so the honest place to lose the tail
    is here, where somebody can see it, rather than at the far end of a save
    they have already paid attention to. It is easy to reach by accident: half
    a minute at 60fps is already past it, where nobody hand-keying a clip has
    ever come close.

    The number is imported and not restated. Two of it is two limits to
    discover.
  */
  const count = Math.min(Math.max(1, Math.round(duration * fps)), MAX_CLIP_SAMPLES - 1)

  const keys: Keyframe[] = []
  for (let index = 0; index <= count; index += 1) {
    const time = index / fps
    const frame = sampleFrame(frames, time)
    keys.push({
      time,
      // Linear, not the editor's default smoothstep. Smoothstep between keys a
      // frame apart is easing applied to something that was already sampled
      // from a continuous movement - it would ease in and out of every
      // twenty-fourth of a second, which reads as a soft stutter.
      ease: 'linear',
      pose: frame ? retarget(frame, skeleton, { ground: options.ground }) : rest,
    })
  }

  return thinKeys(
    { version: CLIP_VERSION, name, fps, duration: count / fps, loop, keys },
    thin,
  )
}

/**
 * The same animation with the keys that were saying nothing taken out.
 *
 * One greedy pass, which is the Douglas-Peucker idea without the recursion: a
 * key is dropped when a straight blend from the last key that was *kept* to
 * the next one would have put every bone within `tolerance` of where it
 * actually is. Greedy rather than optimal because the error is measured
 * against the keys that will really be there, which is the thing that has to
 * be true - an optimal split measured against the original curve can leave a
 * pair of neighbours that between them miss a corner.
 *
 * The first and last keys are never dropped: they are where the clip starts
 * and where it ends.
 */
export function thinKeys(doc: AnimationDoc, tolerance: number): AnimationDoc {
  if (tolerance <= 0 || doc.keys.length < 3) return doc

  const kept: Keyframe[] = [doc.keys[0]]
  for (let index = 1; index < doc.keys.length - 1; index += 1) {
    const previous = kept[kept.length - 1]
    const next = doc.keys[index + 1]
    const key = doc.keys[index]
    const span = next.time - previous.time
    const t = span > 1e-6 ? (key.time - previous.time) / span : 0
    if (!within(previous.pose, next.pose, key.pose, t, tolerance)) kept.push(key)
  }
  kept.push(doc.keys[doc.keys.length - 1])

  return { ...doc, keys: kept }
}

/** Whether the blend between two poses is close enough to a third to replace it. */
function within(a: Pose, b: Pose, actual: Pose, t: number, tolerance: number): boolean {
  for (const bone of Object.keys(actual.bones)) {
    const from = a.bones[bone]
    const to = b.bones[bone]
    if (!from || !to) return false
    if (angleBetween(slerp(from, to, t) as Quat, actual.bones[bone]) > tolerance) return false
  }

  // The root is a distance, not an angle, and it is the one thing in a capture
  // that moves the whole body: a centimetre of it - about a degree's worth of
  // limb at this size - is where the two measures meet.
  const limit = (tolerance / 180) * 0.6
  for (const axis of [0, 1, 2]) {
    const blended = a.root[axis] + (b.root[axis] - a.root[axis]) * t
    if (Math.abs(blended - actual.root[axis]) > limit) return false
  }

  return true
}
