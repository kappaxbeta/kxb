'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { rebased, withSample, withSampleEase, withoutSample, type XpClip } from '@kxb/xp/clips'
import type { SkeletonId } from '@kxb/xp/packs'
import { EASES, type Ease, type XpTimeline } from '@kxb/xp/movie'
import { GROUP_LABELS, RIGS, type BoneGroup } from '@/app/xp/_editor/animator/rig'
import { useLocale } from '@/app/i18n/locale-context'
import { xpEditorDict } from '@/app/i18n/xp-editor'
import { Add, Pick, Slide, Turns } from '@/app/xp/_editor/movie/parts'
import { Hint } from '@/app/xp/_editor/chrome'

/**
 * Posing a body without leaving the movie.
 *
 * ---------------------------------------------------------------------------
 * Why this exists beside the animator rather than instead of it
 * ---------------------------------------------------------------------------
 * There was a button here that opened the animator, and the reasoning was
 * sound: the animator is drag-IK on a rig with pins and joint limits, and a
 * second, worse poser would be a second thing to keep in step forever.
 *
 * What that reasoning missed is the *interruption*. Asked for directly - "you
 * can open in the movie inspector to edit the pose in flight, not open an extra
 * window" - and the objection is about tempo rather than capability: a shot is
 * composed by looking at the frame, and leaving the frame to bend an elbow and
 * coming back is not the same act as bending it while you watch.
 *
 * So both. Sliders here for *this arm, a bit lower*, which is nine tenths of
 * what a shot needs; the animator for a walk cycle, which is not something
 * anybody builds in a 320px column. They write the same thing - a clip in the
 * document - so neither owns the result.
 *
 * ---------------------------------------------------------------------------
 * A pose is a one-sample clip, and that is the whole trick
 * ---------------------------------------------------------------------------
 * The format already has everywhere for this to live. `XpClip` is times and
 * quaternions; a *pose* is that with one time in it. So posing writes a clip
 * named after the body, the clip picker offers it like any other, and a `play`
 * action holds it for as long as the author drags the block out to.
 *
 * The alternative was per-bone tracks on the timeline - twenty-three bones
 * times three axes of new format, a second key model, and a second sampler.
 * `./clips` already argues this out for the animator's own output: a clip is
 * numbers, and a document has carried numbers since it existed.
 *
 * ---------------------------------------------------------------------------
 * Saved is not the same as *shown*, and the first version confused them
 * ---------------------------------------------------------------------------
 * This claimed that writing the clip was the preview, on the grounds that
 * `SkinnedBody` binds clips by name out of the document. Half true, and the
 * missing half is the one that matters: a clip in `clips` is a clip nothing is
 * *playing*. The screenshot proved it - the pose was in the file, correct, one
 * sample, and the body stood in its bind pose looking exactly as if nothing had
 * happened.
 *
 * So the first bone that gets turned also places a `play` at the playhead. From
 * then on the body wears the pose while it is edited, which is what "in flight"
 * meant. Only the first, because after that there is already an action and
 * placing a second every time a slider moved would bury the strip.
 */

export interface PoseProps {
  /** Whose pose this is. The clip is named after them. */
  entity: string
  rig: SkeletonId
  /** The clips the document carries, so this can read its own back. */
  clips: Readonly<Record<string, XpClip>> | undefined
  onClips: (clips: Readonly<Record<string, XpClip>>) => void
  /**
   * Save the pose *and* put it on the body, in one edit.
   *
   * Used for the first bone turned. Two separate calls lost the clip: both
   * writers start from the same render's state, so the second discards the
   * first - see the note on `onPose` in ../editor.
   */
  onPose: (clips: Readonly<Record<string, XpClip>>, clip: string, start: number) => void
  /** Put a `play` of this pose at the playhead. */
  onCue: (clip: string) => void
  /**
   * Which bone is being turned, held above this component.
   *
   * Controlled rather than local, because the selection now has two doors: the
   * select here, and clicking a joint on the body in the viewport. Two copies
   * of "which bone" would let the panel show a shoulder while the highlighted
   * dot is a knee, and the sliders would be about neither.
   */
  bone: string | null
  onBone: (bone: string | null) => void
  /** The playhead, and where this body's pose clip is cued. See `useBoneTurn`. */
  at: number
  start: number | null
  /** Read the body's pose as drawn. See `poseNow` in `useBoneTurn`. */
  poseNow?: () => Record<string, number[]> | null
  /** Put the playhead on a moment. Clicking one is a request to see it. */
  onSeek: (seconds: number) => void
  /**
   * Where this body is standing, and what there is to look at.
   *
   * Resolved by the caller rather than read here, because "the cameras and the
   * rest of the cast, at this moment" is a question about the timeline and this
   * component only knows about one body's bones.
   */
  look?: {
    from: { x: number; y: number; z: number }
    facing: number
    targets: readonly { name: string; label: string; at: { x: number; y: number; z: number } }[]
  }
}

/** What a body's own pose clip is called. One per actor, derived not typed. */
export const poseClipName = (entity: string) => `pose-${entity}`

/**
 * When this body's pose clip is cued, in the shot's own time.
 *
 * `null` when it has never been posed. A clip's times start at zero - see
 * `rebased` - so the cue is the only thing that says *when* the animation
 * happens, and both the panel and the corner have to ask the same question to
 * agree about which sample the playhead is on.
 */
export function poseStart(timeline: XpTimeline, entity: string): number | null {
  const name = poseClipName(entity)
  for (const one of timeline.actions) {
    if (one.entity === entity && one.kind === 'play' && one.clip === name) return one.t
  }
  return null
}

/**
 * The angles, per bone, in degrees.
 *
 * Held as euler here and stored as quaternions, which is the right way round:
 * a person thinks in "turn the shoulder down thirty", and three.js binds
 * quaternions. Converting on the way out is one line; the other direction is
 * lossy and ambiguous, which is why the *editor's* copy is the euler one.
 */
type Angles = Record<string, { x: number; y: number; z: number }>

/**
 * Which sample of a clip a moment falls on.
 *
 * The last one at or before it, which is the one a body is *holding* at that
 * moment - so posing at 1.4s in a clip keyed at 0 and 2 edits the sample at 0,
 * because that is the pose you can see. Keying a *new* moment is what moves the
 * playhead somewhere no sample is and turns a bone; `withSample` inserts it.
 */
function rowAt(clip: XpClip | undefined, at: number): number {
  if (!clip || clip.times.length === 0) return 0
  let row = 0
  for (let i = 0; i < clip.times.length; i += 1) {
    if (clip.times[i]! <= at + 0.001) row = i
  }
  return row
}

/** A pose clip, read back into angles the sliders can hold. */
function anglesOf(clip: XpClip | undefined, row = 0): Angles {
  if (!clip) return {}
  const out: Angles = {}
  const euler = new THREE.Euler()
  for (const [bone, values] of Object.entries(clip.bones)) {
    const at = row * 4
    if (at + 4 > values.length) continue
    const [x, y, z, w] = values.slice(at, at + 4) as [number, number, number, number]
    euler.setFromQuaternion(new THREE.Quaternion(x, y, z, w))
    out[bone] = {
      x: Math.round((euler.x * 180) / Math.PI),
      y: Math.round((euler.y * 180) / Math.PI),
      z: Math.round((euler.z * 180) / Math.PI),
    }
  }
  return out
}

/** And back: the angles as the one-sample clip the runtime binds. */
/**
 * The angles as quaternions, one bone at a time.
 *
 * Split out of `clipOf` because `withSample` wants the same conversion without
 * a whole clip around it - it is writing one moment into a clip that already
 * exists rather than building a new one - and two spellings of euler-to-
 * quaternion is how a pose comes to look different depending on which button
 * wrote it.
 */
function quatsOf(angles: Angles): Record<string, number[]> {
  const out: Record<string, number[]> = {}
  const quaternion = new THREE.Quaternion()
  for (const [bone, turn] of Object.entries(angles)) {
    quaternion.setFromEuler(
      new THREE.Euler(
        (turn.x * Math.PI) / 180,
        (turn.y * Math.PI) / 180,
        (turn.z * Math.PI) / 180,
      ),
    )
    // Rounded, because a pose written from a slider does not need seventeen
    // digits and a document is a file somebody reads.
    out[bone] = [quaternion.x, quaternion.y, quaternion.z, quaternion.w].map(
      (value) => Math.round(value * 10000) / 10000,
    )
  }
  return out
}

function clipOf(rig: SkeletonId, angles: Angles): XpClip {
  const bones: Record<string, number[]> = {}
  const quaternion = new THREE.Quaternion()

  for (const [bone, turn] of Object.entries(angles)) {
    quaternion.setFromEuler(
      new THREE.Euler(
        (turn.x * Math.PI) / 180,
        (turn.y * Math.PI) / 180,
        (turn.z * Math.PI) / 180,
      ),
    )
    // Rounded, because a pose written from a slider does not need seventeen
    // digits and a document is a file somebody reads.
    bones[bone] = [quaternion.x, quaternion.y, quaternion.z, quaternion.w].map(
      (value) => Math.round(value * 10000) / 10000,
    )
  }

  return {
    rig,
    // A pose has no length. `duration` cannot be zero - `readClip` refuses it,
    // because a clip a player divides by is a clip that produces NaN - so it is
    // the smallest thing that is honestly not a length.
    duration: 0.001,
    times: [0],
    bones,
    loop: false,
  }
}

/**
 * Roughly where a body's eyes are, in cells above its feet.
 *
 * An approximation on purpose. The exact head position is a fact about the
 * *drawn* skeleton, which lives in the stage and changes every frame, and
 * fetching it here would put a frame loop in a panel to gain a few degrees on
 * a control whose whole point is that you adjust it afterwards.
 */
const EYE_HEIGHT = 1.45

/** How far a neck actually turns before a person turns their chest instead. */
/** The bone a look-at turns. Both rigs call it this - see `rig.test.ts`. */
const HEAD_BONE = 'head'

const HEAD_YAW = 70
const HEAD_PITCH = 40

/**
 * The head angles that point a body's face at a spot.
 *
 * ---------------------------------------------------------------------------
 * Why a button and not three sliders
 * ---------------------------------------------------------------------------
 * "Looking at the camera" is the single most common thing a head does in a
 * shot, and finding it by hand is two angles that have to be right *together*
 * - a yaw that is close and a pitch that is not reads as a figure staring past
 * you, which is worse than one plainly facing forward. The maths knows the
 * answer exactly; what it cannot know is how much of it you want, which is why
 * this writes ordinary pose angles that the pads then adjust.
 *
 * ---------------------------------------------------------------------------
 * In the body's frame, and clamped to a neck
 * ---------------------------------------------------------------------------
 * The direction is taken into the body's own frame first, because a head turn
 * is relative to the shoulders and the shoulders are wherever the body is
 * facing. A body at `rotation: 0` faces +z.
 *
 * Then clamped, because a head is not a turret. Past about seventy degrees a
 * person turns their chest, and a rig that obliges by spinning the skull round
 * produces the single most recognisable way for a pose to look wrong. Clamping
 * means a target behind the body gives a head turned as far as it goes, which
 * is what a person does, rather than an owl.
 */
function aimHead(
  from: { x: number; y: number; z: number },
  facing: number,
  to: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  const dx = to.x - from.x
  const dy = to.y - (from.y + EYE_HEIGHT)
  const dz = to.z - from.z

  const r = (-facing * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  const lx = dx * c + dz * s
  const lz = -dx * s + dz * c

  const yaw = (Math.atan2(lx, lz) * 180) / Math.PI
  const pitch = (Math.atan2(dy, Math.hypot(lx, lz)) * 180) / Math.PI

  return {
    x: Math.round(Math.max(-HEAD_PITCH, Math.min(HEAD_PITCH, -pitch))),
    y: Math.round(Math.max(-HEAD_YAW, Math.min(HEAD_YAW, yaw))),
    z: 0,
  }
}

/**
 * Turning one bone of one body, wherever the control happens to be.
 *
 * ---------------------------------------------------------------------------
 * Why a hook rather than a block inside the panel
 * ---------------------------------------------------------------------------
 * Two places turn a bone now: this panel, and a small set of pads in the
 * corner of the stage - because clicking a joint in the picture and then
 * walking to a 320px column to bend it is a trip across the screen for a thing
 * you are looking straight at.
 *
 * Both need the *same* rules, and they are not obvious ones: whole degrees
 * with the fraction carried, clamped to the joint's hinge, and one write that
 * saves and cues together the first time. A second copy of that is correct on
 * the day it is written and wrong the first time either is touched.
 */
export function useBoneTurn({
  entity,
  rig,
  clips,
  bone,
  onClips,
  onPose,
  at,
  start,
  poseNow,
}: {
  entity: string
  rig: SkeletonId
  clips: Readonly<Record<string, XpClip>> | undefined
  /** Which bone, already decided by the caller. `null` makes the writers no-ops. */
  bone: string | null
  onClips: (clips: Readonly<Record<string, XpClip>>) => void
  onPose: (clips: Readonly<Record<string, XpClip>>, clip: string, start: number) => void
  /** The playhead, in the shot's own time. Poses are keyed here. */
  at: number
  /**
   * The body's pose as it is drawn, asked for at the moment one is started.
   *
   * A body idles until somebody poses it, and the first turn used to write a
   * clip holding *one* bone - so every other bone bound to the model's own rest
   * and the figure snapped into a T. The report was exact: "an avatar starts in
   * idle, and when I change a bone it switches to T pose, can we start with
   * what we see".
   *
   * So the first sample is seeded with what is on screen. After that the clip
   * holds every bone and there is nothing to seed.
   */
  poseNow?: () => Record<string, number[]> | null
  /**
   * Where this body's pose clip is cued, in the shot's time.
   *
   * `null` when it has never been posed. A clip's own times start at zero -
   * see `rebased` - so this is what turns a moment on the strip into a moment
   * in the clip, and back.
   */
  start: number | null
}) {
  const skeleton = RIGS[rig]
  const clipName = poseClipName(entity)
  const clip = clips?.[clipName]

  /** Where the playhead falls inside the clip's own time. */
  const inClip = at - (start ?? at)
  const row = rowAt(clip, inClip)
  const angles = useMemo(() => anglesOf(clips?.[clipName], row), [clips, clipName, row])

  /**
   * Which axes this bone offers.
   *
   * A hinge gets *one*, and that is the whole reason the rig table carries the
   * constraint: without it, a straight limb turns in whatever plane the maths
   * lands in and knees bend sideways - the most recognisable way for a posed
   * figure to look wrong. Offering three axes on a knee is offering two ways
   * to make it wrong.
   */
  const spec = bone ? skeleton.specs[bone] : undefined
  const axes: ('x' | 'y' | 'z')[] = spec?.hinge ? [spec.hinge.axis] : ['x', 'y', 'z']
  const limits = spec?.hinge ?? { min: -180, max: 180 }

  /**
   * The sub-degree remainder of a pad push, per axis.
   *
   * A ref rather than state: it is read and written inside one drag and
   * nothing on screen shows it, so a render per fortieth of a second would be
   * forty renders that draw the same thing.
   */
  const carry = useRef({ x: 0, y: 0, z: 0 })

  // Dropped when the selection moves, or a fraction left over from a shoulder
  // arrives as the first degree of a knee.
  useEffect(() => {
    carry.current = { x: 0, y: 0, z: 0 }
  }, [bone])

  /**
   * The whole pose, written.
   *
   * The first turn saves *and* cues, in one edit. Two separate calls lost the
   * clip: both writers start from the same render's state, so the second
   * discards the first - see the note on `onPose` in ../editor.
   */
  /**
   * The pose, written at the playhead.
   *
   * ---------------------------------------------------------------------------
   * In the shot's time, then rebased
   * ---------------------------------------------------------------------------
   * The clip is put back into shot time, the sample is written where the
   * playhead is, and the whole thing is rebased to start at zero again with the
   * cue moved to match. Doing it in the clip's own time instead cannot express
   * *"key a pose before the first one"* - the time would be negative - and that
   * is an ordinary thing to want.
   *
   * `onPose` rather than `onClips` every time, because the cue has to follow:
   * the clip's start moves whenever a pose is keyed before it, and one left
   * behind plays the animation from the wrong moment. It replaces rather than
   * stacks, so calling it on every write costs nothing.
   */
  const write = (next: Angles) => {
    /*
      The pose that is already on the body, for the very first sample only.

      Restricted to the bones this rig calls poseable: a glTF carries helpers
      and twist bones that nobody poses, and a clip naming sixty of them is a
      clip nothing can edit and `MAX_CLIP_TRACKS` would refuse anyway.
    */
    const seed: Record<string, number[]> = {}
    if (!clip) {
      const drawn = poseNow?.() ?? null
      if (drawn) {
        for (const one of skeleton.bones) {
          const q = drawn[one.name]
          if (q) seed[one.name] = q
        }
      }
    }

    const quats = { ...seed, ...quatsOf(next) }
    const inShot: XpClip | undefined = clip
      ? { ...clip, times: clip.times.map((one) => one + (start ?? 0)) }
      : undefined
    const grown = withSample(inShot, rig, Math.max(0, at), quats)
    if (!grown) return
    const { clip: settled, start: from } = rebased(grown)
    onPose({ ...(clips ?? {}), [clipName]: settled }, clipName, from)
  }

  /** One axis, to a value. What a slider calls. */
  const set = (axis: 'x' | 'y' | 'z', value: number) => {
    if (!bone) return
    const was = angles[bone] ?? { x: 0, y: 0, z: 0 }
    write({ ...angles, [bone]: { ...was, [axis]: value } })
  }

  /**
   * By a delta rather than to a value, which is what a pad reports.
   *
   * Clamped to the same limits the sliders use, so a hinge cannot be pushed
   * past its stop by holding the pad.
   */
  const turnBy = (
    by: Partial<Record<'x' | 'y' | 'z', number>>,
    /** Axes this control is pinning. Held by the control, not by this. */
    locked: ReadonlySet<'x' | 'y' | 'z'> = EMPTY_LOCK,
  ) => {
    if (!bone) return
    const next: Angles = { ...angles }
    const was = next[bone] ?? { x: 0, y: 0, z: 0 }
    const moved = { ...was }

    for (const axis of ['x', 'y', 'z'] as const) {
      const delta = by[axis]
      if (delta === undefined || locked.has(axis)) continue
      if (!axes.includes(axis)) continue

      /*
       * Whole degrees only, with the fraction carried to the next tick.
       *
       * Not fussiness. `anglesOf` reads the stored quaternion back and rounds
       * to whole degrees, so a whole degree is a **fixed point** of the round
       * trip and a fraction is not: write 1.18 and it comes back 1. Every bone
       * in the pose goes through that conversion on every write, so a
       * fractional pad does not just lose its own precision - it nudges every
       * *other* bone by up to half a degree each time, and a locked axis
       * drifts while locked.
       */
      carry.current[axis] += delta
      const step = Math.trunc(carry.current[axis])
      if (step === 0) continue
      carry.current[axis] -= step
      moved[axis] = Math.max(limits.min, Math.min(limits.max, was[axis] + step))
    }

    if (moved.x === was.x && moved.y === was.y && moved.z === was.z) return
    next[bone] = moved
    write(next)
  }

  /** How the moment being edited leaves for the next. See `withSampleEase`. */
  const easeMoment = (which: number, ease: Ease) => {
    if (!clip) return
    const shaped = withSampleEase(clip, which, ease)
    if (!shaped) return
    onPose({ ...(clips ?? {}), [clipName]: shaped }, clipName, start ?? 0)
  }

  /** Take this moment out. Refused when it is the only one - see `withoutSample`. */
  const dropMoment = (which: number) => {
    if (!clip) return
    const smaller = withoutSample(clip, which)
    if (!smaller) return
    const { clip: settled, start: from } = rebased({
      ...smaller,
      times: smaller.times.map((one) => one + (start ?? 0)),
    })
    onPose({ ...(clips ?? {}), [clipName]: settled }, clipName, from)
  }

  return {
    angles,
    axes,
    limits,
    set,
    turnBy,
    write,
    clipName,
    row,
    /** Every moment this pose has, in the shot's own time. */
    moments: (clip?.times ?? []).map((one) => one + (start ?? 0)),
    /** How each moment leaves. `smooth` is what an unmarked clip means. */
    eases: clip?.eases ?? (clip?.times ?? []).map(() => 'smooth' as Ease),
    dropMoment,
    easeMoment,
  }
}

/** One shared empty set, so the default argument is not a new object per call. */
const EMPTY_LOCK: ReadonlySet<'x' | 'y' | 'z'> = new Set()

export function Pose({
  entity,
  rig,
  clips,
  onClips,
  onPose,
  onCue,
  bone,
  onBone,
  at,
  start,
  onSeek,
  poseNow,
  look,
}: PoseProps) {
  const t = xpEditorDict(useLocale()).movie
  const skeleton = RIGS[rig]

  const [tab, setTab] = useState<BoneGroup>(skeleton.groups[0] ?? 'torso')

  /**
   * Which group is showing.
   *
   * The selected bone's own group wins over the tab that was last pressed. A
   * hand clicked in the viewport belongs to `arms`, and a panel still showing
   * `torso` while an arm joint is lit is a panel disagreeing with the thing it
   * is about.
   */
  const owning = bone ? skeleton.bones.find((one) => one.name === bone)?.group : undefined
  const group = owning ?? tab

  /**
   * Axes the pad is not allowed to touch.
   *
   * A pad is two axes at once and that is its whole value, right up until one
   * of them is already where you want it - then every attempt to fix the other
   * spoils it. A lock is the cheapest possible answer: the pad still reports
   * both, and this drops the half that was pinned.
   *
   * It does not disable the *sliders*. A lock is about the gesture that moves
   * two things by accident, and typing a number is never that.
   */
  const [locked, setLocked] = useState<ReadonlySet<'x' | 'y' | 'z'>>(new Set())

  /** What the aim button will point the head at. A choice, not a constraint. */
  const [aimAt, setAimAt] = useState('')

  const inGroup = skeleton.bones.filter((one) => one.group === group)
  const chosen = bone && inGroup.some((one) => one.name === bone) ? bone : (inGroup[0]?.name ?? null)

  const {
    angles,
    axes,
    limits,
    set,
    turnBy,
    write,
    clipName,
    row,
    moments,
    eases,
    dropMoment,
    easeMoment,
  } = useBoneTurn({
    entity,
    rig,
    clips,
    at,
    start,
    // The *effective* bone, not the prop: an empty selection falls back to the
    // first of the open group, and the writers must agree with the sliders
    // about which joint they are on.
    bone: chosen,
    onClips,
    onPose,
    ...(poseNow ? { poseNow } : {}),
  })

  const turn = (chosen ? angles[chosen] : undefined) ?? { x: 0, y: 0, z: 0 }

  /**
   * Point the head at the chosen target, once.
   *
   * Once rather than continuously: a pose is a clip, and a clip is angles. A
   * head that kept re-aiming would be a constraint the format has no way to
   * store, and a document that opened somewhere else would lose it - see the
   * note on `aimHead` about this being a starting point you then adjust.
   */
  const aim = () => {
    const spot = look?.targets.find((one) => one.name === aimAt)
    if (!spot || !look) return
    if (!skeleton.bones.some((one) => one.name === HEAD_BONE)) return

    write({ ...angles, [HEAD_BONE]: aimHead(look.from, look.facing, spot.at) })
    // Straight to the bone it just moved, so the pads are already on the thing
    // you are most likely to want a few degrees off.
    onBone(HEAD_BONE)
  }

  return (
    <div className="mt-1 flex flex-col gap-1.5 border-t border-neutral-900 pt-1.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-neutral-600">
        {t.pose}
      </span>

      {/*
        The moments this pose has, and which one you are editing.

        A pose clip can hold more than one now, and without this the panel is
        identical whether it holds one or six - you would turn a shoulder,
        scrub, turn it again, and have no way to tell you had made a second
        moment rather than changed the first. The lit one is the sample the
        playhead falls on, which is the pose on the body in front of you.

        Clicking a moment scrubs to it, because "show me that one" and "put the
        playhead there" are the same request.
      */}
      {moments.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="font-mono text-[9px] uppercase tracking-wider text-neutral-600">
            {t.moments}
          </span>
          {moments.map((when, index) => (
            <button
              key={`${when}-${index}`}
              type="button"
              onClick={() => onSeek(when)}
              title={t.goToMoment}
              className={`rounded px-1.5 py-0.5 font-mono text-[9px] transition-colors ${
                index === row
                  ? 'bg-violet-500/20 text-violet-200'
                  : 'text-neutral-600 hover:text-neutral-300'
              }`}
            >
              {when.toFixed(1)}s
            </button>
          ))}
          {/*
            How this moment leaves for the next, which is the difference
            between a body that glides and one that snaps. It reads the same as
            the strip's key chooser on purpose - it is the same question about
            a different kind of moment.
          */}
          {row < moments.length - 1
            ? EASES.map((one) => (
                <button
                  key={one}
                  type="button"
                  onClick={() => easeMoment(row, one)}
                  title={t.easeTitles[one]}
                  className={`rounded px-1 py-0.5 font-mono text-[9px] transition-colors ${
                    eases[row] === one
                      ? 'bg-violet-500/20 text-violet-200'
                      : 'text-neutral-700 hover:text-neutral-400'
                  }`}
                >
                  {t.easeNames[one]}
                </button>
              ))
            : null}
          <button
            type="button"
            onClick={() => dropMoment(row)}
            title={t.dropMomentTitle}
            className="ml-auto rounded px-1.5 py-0.5 font-mono text-[9px] text-neutral-600 transition-colors hover:text-red-400"
          >
            ×
          </button>
        </div>
      ) : null}

      {/*
        Looking at something, which is the one head angle worth a button.

        Only where there is a head and something to point it at: a rig without
        one, or a stage with a single body and no cameras, would get a picker
        whose every option is nothing.
      */}
      {look && look.targets.length > 0 && skeleton.bones.some((one) => one.name === HEAD_BONE) ? (
        <div className="flex items-end gap-1.5">
          <span className="min-w-0 flex-1">
            <Pick
              label={t.headLooksAt}
              value={aimAt}
              options={[
                ['', t.nothing] as const,
                ...look.targets.map((one) => [one.name, one.label] as const),
              ]}
              onChange={setAimAt}
            />
          </span>
          <Add disabled={aimAt === ''} onClick={aim} title={t.aimTitle}>
            {t.aim}
          </Add>
        </div>
      ) : null}

      {/* The groups this rig actually has - a peep has wings and a tail. */}
      <div className="flex flex-wrap gap-1">
        {skeleton.groups.map((one) => (
          <button
            key={one}
            type="button"
            onClick={() => {
              setTab(one)
              // Cleared, or `owning` would keep dragging the panel back to the
              // group of a bone the author has just navigated away from.
              onBone(null)
            }}
            className={`rounded px-1.5 py-0.5 font-mono text-[9px] transition-colors ${
              group === one
                ? 'bg-violet-500/15 text-violet-300'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {GROUP_LABELS[one]}
          </button>
        ))}
      </div>

      <select
        value={chosen ?? ''}
        onChange={(event) => onBone(event.target.value)}
        className="w-full rounded border border-neutral-800 bg-neutral-900/60 px-1.5 py-1 font-mono text-[10px] text-neutral-300 focus:border-neutral-600 focus:outline-none"
      >
        {inGroup.map((one) => (
          <option key={one.name} value={one.name}>
            {one.label}
            {angles[one.name] ? ' ·' : ''}
          </option>
        ))}
      </select>

      {chosen ? (
        <>
          {/*
            The pad only where it makes sense. A hinge has one axis - see the
            note on `axes` - and a two-axis pad over a one-axis joint is a
            control whose other direction silently does nothing.
          */}
          {axes.length === 3 ? (
            <div className="flex items-center gap-2">
              <Turns
                onSwing={(by) => turnBy({ x: by.x, y: by.y })}
                onTwist={(by) => turnBy({ z: by })}
              />
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-[8px] uppercase tracking-wider text-neutral-700">
                  {t.lock}
                </span>
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <button
                    key={axis}
                    type="button"
                    title={t.lockTitle}
                    onClick={() =>
                      setLocked((was) => {
                        const next = new Set(was)
                        if (next.has(axis)) next.delete(axis)
                        else next.add(axis)
                        return next
                      })
                    }
                    className={`rounded px-1.5 py-0.5 text-left font-mono text-[9px] transition-colors ${
                      locked.has(axis)
                        ? 'bg-amber-400/15 text-amber-300'
                        : 'text-neutral-600 hover:text-neutral-300'
                    }`}
                  >
                    {axis}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {axes.map((axis) => (
            <Slide
              key={axis}
              label={axis}
              value={turn[axis]}
              min={limits.min}
              max={limits.max}
              step={1}
              unit="°"
              onChange={(value) => set(axis, value)}
            />
          ))}
        </>
      ) : null}

      <div className="flex items-center gap-1.5">
        <Add
          disabled={Object.keys(angles).length === 0}
          title={t.cuePoseTitle}
          onClick={() => onCue(clipName)}
        >
          {t.cuePose}
        </Add>
        {Object.keys(angles).length > 0 ? (
          <button
            type="button"
            onClick={() => {
              const rest = { ...(clips ?? {}) }
              delete rest[clipName]
              onClips(rest)
            }}
            className="ml-auto shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] text-neutral-600 transition-colors hover:text-red-400"
          >
            {t.clearPose}
          </button>
        ) : null}
      </div>

      {/*
        Said once: there is no save button because there is nothing unsaved, and
        the body wears it from the moment the first bone turns.
      */}
      <Hint>{t.poseIsSaved}</Hint>
    </div>
  )
}
