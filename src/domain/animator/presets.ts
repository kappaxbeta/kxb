import {
  type AnimationDoc,
  type Ease,
  type Pose,
  type Quat,
  type Vec3,
  putKey,
  samplePose,
  snapTime,
} from '@/domain/animator/clip'

/**
 * Canned motion, stamped onto the strip.
 *
 * A blank timeline and twenty-three bones is a lot of nothing to start from.
 * These are the things everybody needs and nobody wants to key by hand: a walk
 * cycle, a wave, a bounce. Stamped at the playhead rather than replacing the
 * document, so they are a starting point you then push around, not a canned
 * animation you either take or leave.
 *
 * ---------------------------------------------------------------------------
 * Why a preset only names some bones
 * ---------------------------------------------------------------------------
 * The walk is legs. Not legs *and a neutral upper body* - legs, and nothing
 * said about anything else. Stamping it over a pose whose arms are folded
 * leaves them folded, and stamping the arm swing on top of it afterwards
 * builds the whole walk out of two pieces you can accept separately.
 *
 * That is what makes them worth having rather than a menu of finished clips:
 * each one is a layer. `stamp` reads the document at each instant it is about
 * to write and keeps every bone the preset does not mention, so layering is
 * the default rather than a mode.
 *
 * ---------------------------------------------------------------------------
 * Where the numbers come from
 * ---------------------------------------------------------------------------
 * Measured off the bind pose, not guessed, because none of the signs are
 * guessable. This model stands in a T-pose facing +Z, every bone runs down its
 * own +Y, and the directions that fall out of that are:
 *
 *   thigh     -X swings the leg forward       (both legs, same sign)
 *   knee      +X folds it, heel backwards     (both legs, same sign)
 *   shoulder  -X lowers the arm from the T    (both arms, same sign)
 *   shoulder  +Z swings it forward on the right, -Z on the left
 *   elbow     +Z folds the right, -Z the left
 *   spine     +X leans forward, +Y turns left, +Z leans right
 *
 * Angles are degrees off the bind pose, which is also what the editor's own
 * pitch/turn/roll sliders show - so a number here can be read straight off a
 * pose you liked, and a pose can be checked against a number here.
 *
 * `presets.test.ts` runs forward kinematics over the real skeleton and asserts
 * what the feet and hands actually do. Every sign above is checked there,
 * because "the walk moonwalks" is not something a type can catch.
 */

/** Degrees about the bone's own x, y, z, relative to the bind pose. */
export type Turn = [number, number, number]

export interface PresetFrame {
  /** Where in the cycle, 0 to 1. */
  at: number
  ease: Ease
  bones: Record<string, Turn>
  /**
   * Height of the root above where it rests, in model units.
   *
   * Only the presets that leave the floor set it. Absent means "whatever the
   * document already has there", which is what keeps a leg preset from
   * flattening a jump somebody stamped underneath it.
   */
  lift?: number
}

export interface Preset {
  id: string
  label: string
  /** One line, shown under the button. Say what it touches. */
  hint: string
  /** How long one pass takes at its natural speed. */
  seconds: number
  frames: PresetFrame[]
}

// ---------------------------------------------------------------------------
// Quaternion maths, again by hand
// ---------------------------------------------------------------------------

/**
 * Three.js's XYZ euler-to-quaternion, reimplemented.
 *
 * Same reason `slerp` is hand-written next door: this module is the document's
 * and must not import a renderer. It has to match three's XYZ convention
 * exactly, because the editor's own sliders go through `THREE.Euler` - a
 * different order here would mean a preset's 30 degrees and a slider's 30
 * degrees were different poses.
 */
function fromTurn([x, y, z]: Turn): Quat {
  const rad = Math.PI / 180
  const c1 = Math.cos((x * rad) / 2)
  const c2 = Math.cos((y * rad) / 2)
  const c3 = Math.cos((z * rad) / 2)
  const s1 = Math.sin((x * rad) / 2)
  const s2 = Math.sin((y * rad) / 2)
  const s3 = Math.sin((z * rad) / 2)

  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ]
}

function times(a: Quat, b: Quat): Quat {
  return [
    a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1],
    a[1] * b[3] + a[3] * b[1] + a[2] * b[0] - a[0] * b[2],
    a[2] * b[3] + a[3] * b[2] + a[0] * b[1] - a[1] * b[0],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ]
}

const IDENTITY: Quat = [0, 0, 0, 1]

/** A turn off the bind pose, as the absolute local rotation a `Pose` holds. */
export function turned(rest: Pose, bone: string, turn: Turn): Quat {
  return times(rest.bones[bone] ?? IDENTITY, fromTurn(turn))
}

// ---------------------------------------------------------------------------
// Stamping
// ---------------------------------------------------------------------------

/**
 * A preset, written onto the document starting at `at`.
 *
 * `speed` scales the length: two makes the walk twice as quick, and is how the
 * run is a run rather than a second set of numbers.
 *
 * Each frame is built on what the document *already says* at that instant, so
 * a preset is a layer over whatever is underneath it. The base is re-read from
 * the accumulating document rather than the original, which matters when two
 * of the preset's own frames land close together: the second one then blends
 * from the first rather than from what was there before either.
 */
export function stamp(
  doc: AnimationDoc,
  preset: Preset,
  at: number,
  rest: Pose,
  speed = 1,
): AnimationDoc {
  const length = preset.seconds / Math.max(speed, 0.05)
  let next = doc

  for (const frame of preset.frames) {
    const time = snapTime(at + frame.at * length, doc.fps)
    const base = samplePose(next, time, rest)

    const bones = { ...base.bones }
    for (const bone of Object.keys(frame.bones)) {
      bones[bone] = turned(rest, bone, frame.bones[bone])
    }

    const root: Vec3 =
      frame.lift === undefined
        ? base.root
        : [base.root[0], rest.root[1] + frame.lift, base.root[2]]

    next = putKey(next, time, { root, bones }, frame.ease)
  }

  return next
}

/** How long a stamp will run, so the editor can say so before doing it. */
export function stampLength(preset: Preset, speed = 1): number {
  return preset.seconds / Math.max(speed, 0.05)
}

// ---------------------------------------------------------------------------
// The legs
// ---------------------------------------------------------------------------

/**
 * One leg's four positions in a walk, as [thigh, knee] about X.
 *
 * A walk is these four, and the other leg is the same four starting two along.
 * Written once and phase-shifted rather than as eight poses, because eight
 * poses is eight chances for the two legs to end up subtly different lengths
 * of stride - which reads as a limp and is miserable to find by eye.
 */
const WALK: [number, number][] = [
  [-24, 6], // contact: heel down, leg forward and nearly straight
  [2, 8], // support: underneath the body, carrying the weight
  [20, 14], // toe off: behind, pushing away
  [-14, 52], // swing: knee up, foot clearing the floor
]

const RUN: [number, number][] = [
  [-32, 22],
  [4, 16],
  [28, 30],
  [-26, 95],
]

/**
 * The ankle that keeps a foot pointing where a foot points.
 *
 * The foot is at the end of two bones that have both just turned about the
 * same axis, so it arrives rotated by their sum. Undoing that sum keeps it
 * flat to the floor; the extra per phase is the part that is actually ankle -
 * toe up as the heel lands, heel up as the toe pushes off.
 *
 * Positive is toe *down*, which is the opposite of what it reads as and was
 * wrong here first time round: the pushing-off foot lifted its toe off the
 * floor and pointed it at the sky. Measured, not reasoned - see the note at
 * the top about where the numbers come from.
 */
const ANKLE = [-14, 0, 26, -6]

function legs(phase: number, cycle: [number, number][]): Record<string, Turn> {
  const out: Record<string, Turn> = {}

  for (const [side, offset] of [
    ['r', 0],
    ['l', 2],
  ] as const) {
    const step = (phase + offset) % 4
    const [thigh, knee] = cycle[step]
    out[`upperleg${side}`] = [thigh, 0, 0]
    out[`lowerleg${side}`] = [knee, 0, 0]
    out[`foot${side}`] = [-(thigh + knee) + ANKLE[step], 0, 0]
  }

  return out
}

function cycleFrames(cycle: [number, number][]): PresetFrame[] {
  return [0, 1, 2, 3, 0].map((phase, index) => ({
    at: index / 4,
    // Linear throughout: a cycle eased at every key is a walk that hesitates
    // four times a stride. Smoothness comes from the poses, not the curve.
    ease: 'linear' as const,
    bones: legs(phase, cycle),
  }))
}

// ---------------------------------------------------------------------------
// The arms
// ---------------------------------------------------------------------------

/**
 * Arms down out of the T-pose, swung by `swing`, elbows bent by `bend`.
 *
 * The two shoulders are mirrored - forward is +Z on the right and -Z on the
 * left - so which sign goes on which side is the difference between two arms
 * doing the same thing and two arms doing opposite things, and it is not the
 * sign you would guess:
 *
 *   `together`  right +swing, left -swing  -> both arms forward
 *   `opposed`   right +swing, left +swing  -> right forward, left back
 *
 * Negating for the left is what makes them *match*. The first version of the
 * arm swing negated, on the reasoning that mirrored bones want mirrored
 * numbers, and produced two arms swinging forward in unison - which is not a
 * walk, it is a zombie. The elbow negates in both cases, because folding
 * forwards is -Z on the left either way.
 */
function armsTogether(swing: number, bend: number, down = -72): Record<string, Turn> {
  return {
    upperarmr: [down, 0, swing],
    lowerarmr: [0, 0, bend],
    upperarml: [down, 0, -swing],
    lowerarml: [0, 0, -bend],
  }
}

function armsOpposed(swing: number, bend: number, down = -72): Record<string, Turn> {
  return {
    upperarmr: [down, 0, swing],
    lowerarmr: [0, 0, bend],
    upperarml: [down, 0, swing],
    lowerarml: [0, 0, -bend],
  }
}

/**
 * Standing up straight, naming every bone the jump ever touches.
 *
 * Both ends of a cycle have to name the *same* bones, not just hold the same
 * numbers. A bone the last frame sets and the first does not is a bone that
 * keeps the landing's value when the clip loops round - which on the jump was
 * a figure that stood back up with its ankles still braced for impact, and got
 * a degree more crouched every time round.
 */
const STANDING: Record<string, Turn> = {
  ...armsTogether(-14, 20),
  spine: [0, 0, 0],
  upperlegr: [0, 0, 0],
  lowerlegr: [0, 0, 0],
  footr: [0, 0, 0],
  upperlegl: [0, 0, 0],
  lowerlegl: [0, 0, 0],
  footl: [0, 0, 0],
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

export const PRESETS: Preset[] = [
  {
    id: 'walk',
    label: 'Walk',
    hint: 'Legs only. Stamp the arm swing over it.',
    seconds: 1,
    frames: cycleFrames(WALK),
  },
  {
    id: 'run',
    label: 'Run',
    hint: 'Legs only, longer stride and more knee.',
    seconds: 0.7,
    frames: cycleFrames(RUN),
  },
  {
    id: 'armswing',
    label: 'Arm swing',
    hint: 'Arms only. Opposite to the leg on the same side.',
    seconds: 1,
    frames: [
      // Starting back-on-the-right, because the right leg starts forward and
      // arms swing against the legs. Stamped at the same time as the walk,
      // the two line up without anybody having to think about it.
      { at: 0, ease: 'linear', bones: armsOpposed(-24, 22) },
      { at: 0.25, ease: 'linear', bones: armsOpposed(0, 16) },
      { at: 0.5, ease: 'linear', bones: armsOpposed(24, 22) },
      { at: 0.75, ease: 'linear', bones: armsOpposed(0, 16) },
      { at: 1, ease: 'linear', bones: armsOpposed(-24, 22) },
    ],
  },
  {
    id: 'wave',
    label: 'Wave',
    hint: 'Right arm up, forearm waving. Leaves everything else alone.',
    seconds: 1.4,
    frames: [
      { at: 0, ease: 'smooth', bones: { upperarmr: [-70, 0, 0], lowerarmr: [0, 0, 10] } },
      { at: 0.22, ease: 'smooth', bones: { upperarmr: [8, 0, 18], lowerarmr: [0, 0, 62] } },
      { at: 0.45, ease: 'smooth', bones: { upperarmr: [8, 0, 18], lowerarmr: [0, -34, 58] } },
      { at: 0.62, ease: 'smooth', bones: { upperarmr: [8, 0, 18], lowerarmr: [0, 30, 66] } },
      { at: 0.8, ease: 'smooth', bones: { upperarmr: [8, 0, 18], lowerarmr: [0, -34, 58] } },
      { at: 1, ease: 'smooth', bones: { upperarmr: [-70, 0, 0], lowerarmr: [0, 0, 10] } },
    ],
  },
  {
    id: 'dance',
    label: 'Dance',
    hint: 'The lot: bounce, arms up, and a head that is enjoying itself.',
    seconds: 1.6,
    frames: [
      {
        at: 0,
        ease: 'smooth',
        lift: 0,
        bones: {
          ...armsTogether(-30, 70, -46),
          spine: [0, -14, 8],
          chest: [4, -10, 6],
          head: [6, -12, 0],
          upperlegr: [-6, 0, 0],
          lowerlegr: [16, 0, 0],
          upperlegl: [-6, 0, 0],
          lowerlegl: [16, 0, 0],
        },
      },
      {
        at: 0.25,
        ease: 'smooth',
        lift: 0.11,
        bones: {
          ...armsTogether(10, 96, -14),
          spine: [0, 0, 0],
          chest: [-4, 0, 0],
          head: [-8, 0, 0],
          upperlegr: [-2, 0, 0],
          lowerlegr: [4, 0, 0],
          upperlegl: [-2, 0, 0],
          lowerlegl: [4, 0, 0],
        },
      },
      {
        at: 0.5,
        ease: 'smooth',
        lift: 0,
        bones: {
          ...armsTogether(-30, 70, -46),
          spine: [0, 14, -8],
          chest: [4, 10, -6],
          head: [6, 12, 0],
          upperlegr: [-6, 0, 0],
          lowerlegr: [16, 0, 0],
          upperlegl: [-6, 0, 0],
          lowerlegl: [16, 0, 0],
        },
      },
      {
        at: 0.75,
        ease: 'smooth',
        lift: 0.11,
        bones: {
          ...armsTogether(10, 96, -14),
          spine: [0, 0, 0],
          chest: [-4, 0, 0],
          head: [-8, 0, 0],
          upperlegr: [-2, 0, 0],
          lowerlegr: [4, 0, 0],
          upperlegl: [-2, 0, 0],
          lowerlegl: [4, 0, 0],
        },
      },
      {
        at: 1,
        ease: 'smooth',
        lift: 0,
        bones: {
          ...armsTogether(-30, 70, -46),
          spine: [0, -14, 8],
          chest: [4, -10, 6],
          head: [6, -12, 0],
          upperlegr: [-6, 0, 0],
          lowerlegr: [16, 0, 0],
          upperlegl: [-6, 0, 0],
          lowerlegl: [16, 0, 0],
        },
      },
    ],
  },
  {
    id: 'idle',
    label: 'Idle',
    hint: 'Standing, breathing, arms down. What a figure does when nothing does.',
    seconds: 2.8,
    frames: [
      {
        at: 0,
        ease: 'smooth',
        bones: { ...armsTogether(-2, 14), spine: [0, 0, 0], chest: [1, 0, 0], head: [0, 3, 0] },
      },
      {
        at: 0.5,
        ease: 'smooth',
        bones: { ...armsTogether(2, 10), spine: [1, 0, 2], chest: [-2, 0, -1], head: [-2, -4, 0] },
      },
      {
        at: 1,
        ease: 'smooth',
        bones: { ...armsTogether(-2, 14), spine: [0, 0, 0], chest: [1, 0, 0], head: [0, 3, 0] },
      },
    ],
  },
  {
    id: 'jump',
    label: 'Jump',
    hint: 'Crouch, launch, tuck, land. Moves the root, so it leaves the floor.',
    seconds: 1.1,
    frames: [
      { at: 0, ease: 'smooth', lift: 0, bones: STANDING },
      {
        // The crouch. Legs fold and the root drops, which is the whole reason
        // the root is a thing the document keys at all.
        at: 0.22,
        ease: 'smooth',
        lift: -0.2,
        bones: {
          ...armsTogether(-38, 44),
          spine: [12, 0, 0],
          upperlegr: [-38, 0, 0],
          lowerlegr: [62, 0, 0],
          footr: [-24, 0, 0],
          upperlegl: [-38, 0, 0],
          lowerlegl: [62, 0, 0],
          footl: [-24, 0, 0],
        },
      },
      {
        at: 0.45,
        ease: 'smooth',
        lift: 0.42,
        bones: {
          ...armsTogether(58, 8),
          spine: [-6, 0, 0],
          upperlegr: [-6, 0, 0],
          lowerlegr: [4, 0, 0],
          footr: [-18, 0, 0],
          upperlegl: [-6, 0, 0],
          lowerlegl: [4, 0, 0],
          footl: [-18, 0, 0],
        },
      },
      {
        at: 0.68,
        ease: 'smooth',
        lift: 0.5,
        bones: {
          ...armsTogether(34, 26),
          spine: [10, 0, 0],
          upperlegr: [-46, 0, 0],
          lowerlegr: [74, 0, 0],
          upperlegl: [-30, 0, 0],
          lowerlegl: [58, 0, 0],
        },
      },
      {
        at: 0.86,
        ease: 'smooth',
        lift: -0.16,
        bones: {
          ...armsTogether(-30, 36),
          spine: [14, 0, 0],
          upperlegr: [-32, 0, 0],
          lowerlegr: [54, 0, 0],
          footr: [-20, 0, 0],
          upperlegl: [-32, 0, 0],
          lowerlegl: [54, 0, 0],
          footl: [-20, 0, 0],
        },
      },
      { at: 1, ease: 'smooth', lift: 0, bones: STANDING },
    ],
  },

  // -------------------------------------------------------------------------
  // The performed beats
  // -------------------------------------------------------------------------
  // Everything above is locomotion - how a body gets somewhere. These are what
  // it does when it has arrived, and they exist because the scene language in
  // `src/domain/channels/scene.ts` can now ask for them by name: laugh, cry,
  // nod, shrug, point, hit, reach.
  //
  // Authored the same way as the rest and held to the same standard: every
  // number below was measured against the real skeleton before it was written
  // down, and `presets.test.ts` asserts where the hands actually end up. A
  // laugh whose head tips the wrong way is correct TypeScript.
  //
  // They name only the bones they mean, so they layer: a laugh over a walk is
  // somebody laughing as they walk, because the laugh says nothing about legs.
  {
    id: 'laugh',
    label: 'Laugh',
    hint: 'Head back, chest bouncing. Says nothing about the legs.',
    seconds: 1.2,
    frames: [
      // The bounce is the laugh. A head that tips back and holds is somebody
      // looking at the ceiling; it is the return, twice, that reads as
      // laughter - which is why the middle frames are not evenly spaced.
      { at: 0, ease: 'smooth', bones: { head: [0, 0, 0], chest: [0, 0, 0], ...armsTogether(-10, 26) } },
      { at: 0.18, ease: 'smooth', bones: { head: [-24, 0, 0], chest: [-11, 0, 0], ...armsTogether(-4, 40) } },
      { at: 0.38, ease: 'smooth', bones: { head: [-12, 0, 0], chest: [-4, 0, 0], ...armsTogether(-10, 30) } },
      { at: 0.56, ease: 'smooth', bones: { head: [-22, 0, 0], chest: [-10, 0, 0], ...armsTogether(-5, 38) } },
      { at: 0.76, ease: 'smooth', bones: { head: [-10, 0, 0], chest: [-3, 0, 0], ...armsTogether(-9, 30) } },
      { at: 1, ease: 'smooth', bones: { head: [0, 0, 0], chest: [0, 0, 0], ...armsTogether(-10, 26) } },
    ],
  },
  {
    id: 'nod',
    label: 'Nod',
    hint: 'Two nods of the head. Touches nothing else at all.',
    seconds: 0.9,
    frames: [
      // The smallest preset in the catalogue, and deliberately so: a nod that
      // also moved the chest would be a bow, and somebody stamping this over a
      // pose they have built wants their pose back with a nod in it.
      { at: 0, ease: 'smooth', bones: { head: [0, 0, 0] } },
      { at: 0.22, ease: 'smooth', bones: { head: [24, 0, 0] } },
      { at: 0.44, ease: 'smooth', bones: { head: [-2, 0, 0] } },
      { at: 0.66, ease: 'smooth', bones: { head: [20, 0, 0] } },
      { at: 1, ease: 'smooth', bones: { head: [0, 0, 0] } },
    ],
  },
  {
    id: 'shrug',
    label: 'Shrug',
    hint: 'Hands turn out, shoulders lift, head tips. Arms and head.',
    seconds: 1.1,
    frames: [
      { at: 0, ease: 'smooth', bones: { ...armsTogether(-10, 24), head: [0, 0, 0], chest: [0, 0, 0] } },
      // Hands out and forward at hip height - measured at (+/-0.40, 0.88,
      // 0.40), which is the palms-up "who knows" rather than arms raised.
      {
        at: 0.34,
        ease: 'smooth',
        bones: { upperarmr: [-55, 0, 20], lowerarmr: [0, 0, 55], upperarml: [-55, 0, -20], lowerarml: [0, 0, -55], head: [8, 0, 0], chest: [2, 0, 0] },
      },
      {
        at: 0.62,
        ease: 'hold',
        bones: { upperarmr: [-55, 0, 20], lowerarmr: [0, 0, 55], upperarml: [-55, 0, -20], lowerarml: [0, 0, -55], head: [8, 0, 0], chest: [2, 0, 0] },
      },
      { at: 1, ease: 'smooth', bones: { ...armsTogether(-10, 24), head: [0, 0, 0], chest: [0, 0, 0] } },
    ],
  },
  {
    id: 'point',
    label: 'Point',
    hint: 'Right arm out in front and held there. Right arm only.',
    seconds: 0.8,
    frames: [
      { at: 0, ease: 'smooth', bones: { upperarmr: [-72, 0, -10], lowerarmr: [0, 0, 22] } },
      // Hand ends at (-0.41, 1.08, 0.54): shoulder height, well in front.
      { at: 0.35, ease: 'smooth', bones: { upperarmr: [-10, 0, 70], lowerarmr: [0, 0, 6] } },
      // Held, because a point that snaps back is a flinch. The hold is what
      // makes this usable as "and he points at it" rather than a twitch.
      { at: 1, ease: 'hold', bones: { upperarmr: [-10, 0, 70], lowerarmr: [0, 0, 6] } },
    ],
  },
  {
    id: 'cry',
    label: 'Cry',
    hint: 'Hands to the face, shoulders going. Arms, head and chest.',
    seconds: 1.6,
    frames: [
      { at: 0, ease: 'smooth', bones: { ...armsTogether(-10, 26), head: [0, 0, 0], chest: [0, 0, 0] } },
      // Hands measured at (+/-0.06, 1.26, 0.06) - the head sits at 1.24, so
      // this is hands covering the face rather than somewhere near it.
      {
        at: 0.28,
        ease: 'smooth',
        bones: { upperarmr: [-30, 0, 100], lowerarmr: [0, 0, 110], upperarml: [-30, 0, -100], lowerarml: [0, 0, -110], head: [18, 0, 0], chest: [10, 0, 0] },
      },
      {
        at: 0.5,
        ease: 'smooth',
        bones: { upperarmr: [-30, 0, 100], lowerarmr: [0, 0, 110], upperarml: [-30, 0, -100], lowerarml: [0, 0, -110], head: [24, 0, 0], chest: [15, 0, 0] },
      },
      {
        at: 0.72,
        ease: 'smooth',
        bones: { upperarmr: [-30, 0, 100], lowerarmr: [0, 0, 110], upperarml: [-30, 0, -100], lowerarml: [0, 0, -110], head: [18, 0, 0], chest: [10, 0, 0] },
      },
      { at: 1, ease: 'smooth', bones: { ...armsTogether(-10, 26), head: [0, 0, 0], chest: [0, 0, 0] } },
    ],
  },
  {
    id: 'hit',
    label: 'Hit',
    hint: 'Wind up and swing the right arm. Right arm and chest.',
    seconds: 0.65,
    frames: [
      { at: 0, ease: 'smooth', bones: { upperarmr: [-72, 0, -10], lowerarmr: [0, 0, 22], chest: [0, 0, 0] } },
      // The wind-up takes longer than the swing, which is what makes it read
      // as a punch rather than a wave: hand goes back to z=-0.08, then through
      // to z=+0.62 in half the time.
      {
        at: 0.42,
        ease: 'smooth',
        bones: { upperarmr: [-30, 0, -35], lowerarmr: [0, 0, 80], chest: [0, -18, 0] },
      },
      {
        at: 0.62,
        ease: 'smooth',
        bones: { upperarmr: [-20, 0, 70], lowerarmr: [0, 0, 10], chest: [0, 14, 0] },
      },
      { at: 1, ease: 'smooth', bones: { upperarmr: [-72, 0, -10], lowerarmr: [0, 0, 22], chest: [0, 0, 0] } },
    ],
  },
  {
    id: 'reach',
    label: 'Reach',
    hint: 'Right arm out and held, body leaning after it. Right arm and spine.',
    seconds: 0.9,
    frames: [
      { at: 0, ease: 'smooth', bones: { upperarmr: [-72, 0, -10], lowerarmr: [0, 0, 22], spine: [0, 0, 0] } },
      // Held at the end, not returned. A reach *ends holding something* - see
      // the `reach` action in the scene language, which is one action for the
      // reach and the pick-up because nobody stages a reach that stops short.
      // Snapping the arm back would put the thing down again.
      {
        at: 0.55,
        ease: 'smooth',
        bones: { upperarmr: [-15, 0, 72], lowerarmr: [0, 0, 8], spine: [10, 0, 0] },
      },
      {
        at: 1,
        ease: 'hold',
        bones: { upperarmr: [-15, 0, 72], lowerarmr: [0, 0, 8], spine: [10, 0, 0] },
      },
    ],
  },
]
