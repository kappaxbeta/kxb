/**
 * What the camera hands over, in the units the dummy is built in.
 *
 * MediaPipe's pose landmarker returns 33 points twice over: once in image
 * space, which is what you draw on the video, and once as `worldLandmarks` -
 * metres, right-handed, with the origin exactly between the hips. The second
 * set is the one a skeleton wants, because it is already free of where the
 * person is standing and how far away they are.
 *
 * ---------------------------------------------------------------------------
 * Hip-centred means there is no such thing as walking across the room
 * ---------------------------------------------------------------------------
 * The origin follows the person. Whatever they do, the midpoint of their hips
 * is at `[0, 0, 0]`, so this feed carries every joint angle in the body and no
 * global position at all. That is not a limitation of this code and cannot be
 * smoothed away - it is what the model returns. The root's height is put back
 * by standing the posed skeleton on the floor (see `ground` in `./retarget`),
 * and travel across the floor is something you key by hand afterwards.
 *
 * ---------------------------------------------------------------------------
 * The axes
 * ---------------------------------------------------------------------------
 * MediaPipe: `x` to the right of the image, `y` down it, `z` towards the
 * camera *negative* - smaller is nearer.
 *
 * The dummy: `+Y` up, `+X` towards the model's own left (`upperleg.l` sits at
 * `x = +0.17` in the bind pose), `+Z` out of the model's chest towards the
 * viewer (the node called `Dummy_TargetOnHisBack` is at `z = -0.28`).
 *
 * So `x` passes straight through, and `y` and `z` both flip. Flipping two axes
 * leaves the handedness alone, which is why nothing downstream has to mirror a
 * rotation afterwards.
 *
 * Note what `x` passing through means: the person's left hand, which a camera
 * photographs on the right of the frame, drives the dummy's left hand. The
 * video is drawn mirrored because looking at an unmirrored picture of yourself
 * is disorienting, but that is CSS on the preview and never touches these
 * numbers.
 */
import type { Vec3 } from '@/domain/animator/clip'

/**
 * The landmarks this page actually uses, by the index MediaPipe gives them.
 *
 * The model returns 33 and most of them are face detail - four points around
 * each eye, the corners of the mouth - which say nothing about a body a
 * 23-bone dummy can be posed into. Naming the seventeen that matter keeps the
 * mapping in `./retarget` readable as English rather than as a list of numbers
 * that has to be checked against a diagram every time it is edited.
 */
export const LM = {
  nose: 0,
  earL: 7,
  earR: 8,
  shoulderL: 11,
  shoulderR: 12,
  elbowL: 13,
  elbowR: 14,
  wristL: 15,
  wristR: 16,
  indexL: 19,
  indexR: 20,
  hipL: 23,
  hipR: 24,
  kneeL: 25,
  kneeR: 26,
  ankleL: 27,
  ankleR: 28,
  footL: 31,
  footR: 32,
} as const

export type LandmarkName = keyof typeof LM

/** How many the model returns. A frame shorter than this is a frame to drop. */
export const LANDMARK_COUNT = 33

/**
 * One reading of a body.
 *
 * `points` are in the dummy's space already - `toModelSpace` has run - and
 * `visible` is MediaPipe's own confidence per point, kept because a bone whose
 * landmarks are a guess should be left at rest rather than driven by the
 * guess. See `MIN_VISIBILITY` in `./retarget`.
 */
export interface PoseFrame {
  points: Vec3[]
  visible: number[]
}

/** What the landmarker gives us, before any of this file has touched it. */
export interface RawLandmark {
  x: number
  y: number
  z: number
  visibility?: number
}

/**
 * A frame of world landmarks, turned round into the dummy's axes.
 *
 * See the note above for why `x` passes through and the other two flip.
 */
export function toModelSpace(landmarks: readonly RawLandmark[]): PoseFrame {
  const points: Vec3[] = []
  const visible: number[] = []
  for (const landmark of landmarks) {
    points.push([landmark.x, -landmark.y, -landmark.z])
    // Absent means "the model did not say", and the models that do not say are
    // the ones that are confident about every point they return. Treating that
    // as fully visible is what keeps this working across model versions; a
    // default of zero would silently leave the whole skeleton at rest.
    visible.push(landmark.visibility ?? 1)
  }
  return { points, visible }
}

/** Whether a frame is worth retargeting at all. */
export function isUsable(frame: PoseFrame): boolean {
  return frame.points.length >= LANDMARK_COUNT
}
