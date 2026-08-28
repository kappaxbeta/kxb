/**
 * Copied from `src/domain/animator/presets.ts`.
 *
 * `src/app/xp/` owns what it draws, and the copy is the rule rather than an
 * accident: docs/xp-creator.md §1.2, enforced by `no-restricted-imports` in
 * eslint.config.mjs. The backoffice's animator is a live surface and this
 * editor is a prototype; sharing one would mean the prototype either drags
 * the product about or waits behind it, and the two are allowed to differ.
 *
 * Verbatim as of this commit, so a diff against the original is the honest
 * way to see how far the two have drifted. Fix things here when they are
 * this editor's problem; the other copy does not hear about it.
 */

import type { SkeletonId } from '@kxb/xp/packs'
import {
  type AnimationDoc,
  type Ease,
  type Pose,
  type Quat,
  type Vec3,
  putKey,
  samplePose,
  snapTime,
} from '@/app/xp/_editor/animator/clip'

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

/**
 * The presets for one rig.
 *
 * A hard split rather than a filter with a fallback, and the reason is what a
 * preset *is*: a bag of bone names. Every name in the dummy's walk - `upperlegl`,
 * `lowerlegr` - is absent from a peep, so offering it there is a button that
 * writes eight keys, changes nothing on screen, and leaves a document full of
 * names that will never bind. Showing a peep only the peep's moves is the whole
 * of the fix.
 */
export function presetsFor(rig: SkeletonId): Preset[] {
  return rig === 'peepz' ? PEEPZ_PRESETS : PRESETS
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
]

// ---------------------------------------------------------------------------
// The peeps
// ---------------------------------------------------------------------------

/**
 * The animals' moves, read off the clips the pack already ships.
 *
 * ---------------------------------------------------------------------------
 * Measured out of the glTFs, not invented
 * ---------------------------------------------------------------------------
 * Every animal carries `walk`, `run`, `idle` and `dance` inside its own file,
 * and those are the authoritative statement of how a peep moves - Kenney's own
 * numbers, on Kenney's own rig, already correct. Guessing a second set beside
 * them would be inventing a different animal.
 *
 * So the numbers below are the euler angles pulled straight out of
 * `animal-fox.glb`'s rotation samplers, keyed at the extremes rather than at
 * every sample. That is deliberately not a copy of the clip: a preset is a
 * *starting point you push around*, and fifteen keys a cycle is a strip nobody
 * can edit. Four is.
 *
 * ---------------------------------------------------------------------------
 * What the axes turn out to be
 * ---------------------------------------------------------------------------
 * Read off the same samplers, and none of it is guessable either:
 *
 *   leg    ±X swings it forward and back, and that is the *only* axis any leg
 *          uses in any shipped clip. There is no knee to bend - a peep's leg is
 *          one rigid piece - so a stride is one number.
 *   body   Y and Z in equal and opposite amounts is a roll from side to side;
 *          X on its own is a pitch, which only the run uses.
 *   tail   ±Z sweeps it side to side, -X lifts it.
 *
 * ---------------------------------------------------------------------------
 * Front pair together, back pair against them
 * ---------------------------------------------------------------------------
 * The gait, and the thing worth knowing before editing any of this. `run` has
 * `leg-front-left` and `leg-front-right` on identical tracks, with both back
 * legs exactly opposite - a bound, not a trot. Diagonal pairing is what a real
 * quadruped does at a walk and it is not what this pack draws, so a preset that
 * "corrected" it would put the peeps out of step with their own eight clips the
 * moment a level played one.
 */

/** One phase of the gait: front legs at `front`, back legs opposite. */
function gait(front: number): Record<string, Turn> {
  return {
    'leg-front-left': [front, 0, 0],
    'leg-front-right': [front, 0, 0],
    'leg-back-left': [-front, 0, 0],
    'leg-back-right': [-front, 0, 0],
  }
}

/** The body's side-to-side roll: Y and Z equal and opposite, as the clips have it. */
function roll(amount: number): Record<string, Turn> {
  return { body: [0, amount, -amount] }
}

export const PEEPZ_PRESETS: Preset[] = [
  {
    id: 'walk',
    label: 'Walk',
    hint: 'Legs and a roll. Four keys where the clip has fifteen.',
    // Half a second, which is what the shipped `walk` takes for one full swing.
    seconds: 0.5,
    frames: [
      { at: 0, ease: 'linear', bones: { ...gait(-50), ...roll(-4) }, lift: 0 },
      { at: 0.25, ease: 'linear', bones: { ...gait(0), ...roll(0) }, lift: 0.09 },
      { at: 0.5, ease: 'linear', bones: { ...gait(50), ...roll(4) }, lift: 0.035 },
      { at: 0.75, ease: 'linear', bones: { ...gait(0), ...roll(0) }, lift: 0.09 },
      { at: 1, ease: 'linear', bones: { ...gait(-50), ...roll(-4) }, lift: 0 },
    ],
  },
  {
    id: 'run',
    label: 'Run',
    hint: 'The bound: both fronts, both backs, and the body pitching with it.',
    // Quarter of a second, and the shipped `run` is exactly that - twice the
    // pace of the walk and half again the stride.
    seconds: 0.25,
    frames: [
      { at: 0, ease: 'linear', bones: { ...gait(-80), body: [6, 0, 0] }, lift: 0 },
      { at: 0.5, ease: 'linear', bones: { ...gait(55), body: [-4, 0, 0] }, lift: 0.14 },
      { at: 1, ease: 'linear', bones: { ...gait(-80), body: [6, 0, 0] }, lift: 0 },
    ],
  },
  {
    id: 'idle',
    label: 'Idle',
    hint: 'A slow sway, legs left alone. The thing to sit under everything else.',
    seconds: 2,
    frames: [
      { at: 0, ease: 'smooth', bones: { ...roll(2), tail: [0, 0, 10] } },
      { at: 0.5, ease: 'smooth', bones: { ...roll(-2), tail: [0, 0, -10] } },
      { at: 1, ease: 'smooth', bones: { ...roll(2), tail: [0, 0, 10] } },
    ],
  },
  {
    id: 'dance',
    label: 'Dance',
    hint: 'Body and tail, twice as far as the idle. Legs stay put.',
    seconds: 1,
    frames: [
      { at: 0, ease: 'smooth', bones: { ...roll(4), tail: [0, 0, 20] }, lift: 0 },
      { at: 0.25, ease: 'smooth', bones: { ...roll(1), tail: [0, 0, 3] }, lift: 0.12 },
      { at: 0.5, ease: 'smooth', bones: { ...roll(-3), tail: [0, 0, -19] }, lift: 0 },
      { at: 0.75, ease: 'smooth', bones: { ...roll(1), tail: [0, 0, -10] }, lift: 0.12 },
      { at: 1, ease: 'smooth', bones: { ...roll(4), tail: [0, 0, 20] }, lift: 0 },
    ],
  },
  {
    id: 'wag',
    label: 'Wag',
    hint: 'The tail and nothing else, so it layers over a walk.',
    seconds: 0.4,
    frames: [
      { at: 0, ease: 'linear', bones: { tail: [-6, 0, -22] } },
      { at: 0.5, ease: 'linear', bones: { tail: [-6, 0, 22] } },
      { at: 1, ease: 'linear', bones: { tail: [-6, 0, -22] } },
    ],
  },
  {
    id: 'flap',
    label: 'Flap',
    hint: 'Wings only. The four animals that have them; nothing on the rest.',
    seconds: 0.3,
    frames: [
      {
        at: 0,
        ease: 'smooth',
        // ±Z lifts a wing away from the body, mirrored, the same way the arms
        // are mirrored on the dummy. Nothing in the pack's own clips flaps -
        // the bee and the parrot hold their wings out - so unlike everything
        // above, this one is authored rather than measured, and says so.
        bones: { 'wing-left': [0, 0, -34], 'wing-right': [0, 0, 34] },
        lift: 0,
      },
      {
        at: 0.5,
        ease: 'smooth',
        bones: { 'wing-left': [0, 0, 28], 'wing-right': [0, 0, -28] },
        lift: 0.08,
      },
      {
        at: 1,
        ease: 'smooth',
        bones: { 'wing-left': [0, 0, -34], 'wing-right': [0, 0, 34] },
        lift: 0,
      },
    ],
  },
]
