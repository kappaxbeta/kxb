/**
 * Copied from `src/domain/animator/clip.ts`.
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

/**
 * An animation, as a document.
 *
 * The world builder's sibling in spirit - a working file in the browser, saved
 * to a `.json` you keep wherever you keep things, with no table and no
 * permission story behind it. See the note at the top of
 * `@/domain/builder/world` for why an admin-only editor is allowed to be that.
 *
 * ---------------------------------------------------------------------------
 * Why a key is a whole pose
 * ---------------------------------------------------------------------------
 * The obvious shape for this is what three.js stores: one track per bone, each
 * with its own times, so a wave can key the arm at ten places and leave the
 * legs alone at two. That is the right shape for a *player* and the wrong one
 * for this editor.
 *
 * Per-bone tracks mean the timeline is 23 rows, "delete this key" has to ask
 * *which bone*, and scrubbing to 1.5s shows a pose that exists in no key and
 * cannot be corrected by nudging one - you would have to know which of 23
 * tracks the shoulder's nearest key lives in. Every one of those is a question
 * the person animating has to answer before they can move a hand.
 *
 * So a key here is the whole body at one instant, exactly like a frame of
 * stop-motion: one diamond on one strip, and what you see at the playhead is
 * either a key you can edit or a blend of the two around it. The cost is a
 * fatter file - 23 quaternions per key instead of the one that changed - which
 * for a document that is never larger than a few dozen keys is nothing.
 *
 * The per-bone shape comes back at export: `bake` flattens the blend into one
 * dense track per bone, which is what three.js and glTF both want, and which
 * also means the easing below survives the trip. glTF has no easing curves -
 * only LINEAR, STEP and CUBICSPLINE - so anything smoother than a straight
 * line between two keys has to be baked into samples or lost.
 */

import type { SkeletonId } from '@kxb/xp/packs'
import { DEFAULT_RIG, isRigId } from '@/app/xp/_editor/animator/rig'

export type Vec3 = [number, number, number]
/** `[x, y, z, w]`, three.js's order. */
export type Quat = [number, number, number, number]

/** The whole rig at one instant. */
export interface Pose {
  /**
   * Where the root node stands, in local units.
   *
   * The only translation in the document. Bones carry rotation alone, which is
   * what keeps a pose valid for a skeleton whose limbs are a different length -
   * the reason skeletal animation is worth doing at all. The root is the
   * exception because a jump has to leave the floor.
   */
  root: Vec3
  /** Bone name to local rotation. Absent bones fall back to the rest pose. */
  bones: Record<string, Quat>
}

/**
 * How the blend *out of* a key behaves.
 *
 * Named for what it does to the motion leaving the key, so reading down the
 * timeline reads in the order things happen.
 */
export type Ease = 'linear' | 'smooth' | 'hold'

export const EASES: Ease[] = ['linear', 'smooth', 'hold']

export interface Keyframe {
  /** Seconds from the start of the clip. Always on a frame boundary. */
  time: number
  ease: Ease
  pose: Pose
}

export interface AnimationDoc {
  /**
   * What shape this document is in. See `CLIP_VERSION`.
   *
   * Always `CLIP_VERSION` in memory: `parseDoc` upgrades on the way in, so
   * nothing downstream ever has to branch on it. It is written to the file so
   * that a *later* version of this editor can tell what it is holding, and so
   * that this one can say something useful about a file from the future rather
   * than opening it as a silently wrong animation.
   */
  version: number
  /** The clip name. This is what `useAnimations` will key on after export. */
  name: string
  /**
   * Which skeleton this clip was authored against.
   *
   * ---------------------------------------------------------------------------
   * A pose is only meaningful next to the rig it was taken on
   * ---------------------------------------------------------------------------
   * Every key here is a bag of bone names and quaternions. On the dummy those
   * names are `upperarml`, `lowerlegr`, `chest`; on a peep they are `leg-back-left`,
   * `wing-right`, `tail`. The two sets do not overlap at all, which is worth
   * saying plainly: a dummy clip opened on a peep does not come out *wrong*, it
   * comes out **empty** - twenty-one names that bind to nothing, an animal
   * standing perfectly still, and no error anywhere to say why.
   *
   * That is the failure this field exists to make impossible. The editor reads
   * it on open and switches the rig to match, rather than dropping a file onto
   * whichever body happened to be on screen.
   *
   * ---------------------------------------------------------------------------
   * Why this is not a version bump
   * ---------------------------------------------------------------------------
   * `CLIP_VERSION`'s own rule: bump when a change would make an older file open
   * as something other than what it was saved as. Every file written before this
   * existed was authored on the dummy, because the dummy was the only rig - so
   * `rig` absent reading as `'dummy'` opens each of them as exactly what it is.
   * A field with a correct default is the case the version note explicitly says
   * does not need one.
   */
  rig: SkeletonId
  fps: number
  /** Seconds. Never shorter than the last key. */
  duration: number
  loop: boolean
  /** Sorted by time, and never two at the same frame. */
  keys: Keyframe[]
}

export const MIN_FPS = 6
export const MAX_FPS = 60
export const MAX_DURATION = 60

/**
 * The document format's version.
 *
 * Bump it when a change would make an older file open as something other than
 * what it was saved as - a renamed field, a re-scaled number, a different
 * meaning for an existing one. Adding a field with a sensible default does not
 * need a bump: `parseDoc` already fills those in, and every file ever written
 * by this editor stays openable.
 *
 * Version 1 is the first, and files written before this existed - there were a
 * few hours of them - declare nothing at all. Those are read as version 1 too,
 * because that is exactly what they are.
 */
export const CLIP_VERSION = 1

// ---------------------------------------------------------------------------
// Making one
// ---------------------------------------------------------------------------

export function emptyDoc(rest: Pose, name = 'clip', rig: SkeletonId = DEFAULT_RIG): AnimationDoc {
  return {
    version: CLIP_VERSION,
    name,
    rig,
    fps: 24,
    duration: 2,
    loop: true,
    // One key at zero rather than none, because an empty strip has nowhere to
    // put the first pose: with no key at all, posing the rig would have to
    // silently invent a time, and the time it would invent is this one.
    keys: [{ time: 0, ease: 'smooth', pose: clonePose(rest) }],
  }
}

export function clonePose(pose: Pose): Pose {
  const bones: Record<string, Quat> = {}
  for (const name of Object.keys(pose.bones)) {
    const q = pose.bones[name]
    bones[name] = [q[0], q[1], q[2], q[3]]
  }
  return { root: [pose.root[0], pose.root[1], pose.root[2]], bones }
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/**
 * The nearest frame boundary, in seconds.
 *
 * Everything that writes a time goes through this. Two keys a thousandth of a
 * second apart are two keys nobody can click on separately, and a key at
 * 0.4999s in a 24fps clip is a key that will not survive a bake.
 */
export function snapTime(time: number, fps: number): number {
  return Math.round(time * fps) / fps
}

export function clampTime(time: number, duration: number): number {
  return Math.min(Math.max(time, 0), duration)
}

/** Where a key sits on the strip, or -1. Frame-exact, so it is a real index. */
export function keyAt(doc: AnimationDoc, time: number): number {
  const frame = Math.round(time * doc.fps)
  return doc.keys.findIndex((key) => Math.round(key.time * doc.fps) === frame)
}

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

/**
 * The pose, keyed at this time. Replaces whatever was on that frame.
 *
 * Returns a new document; nothing here mutates, so undo is a stack of these.
 */
export function putKey(doc: AnimationDoc, time: number, pose: Pose, ease?: Ease): AnimationDoc {
  const at = snapTime(clampTime(time, MAX_DURATION), doc.fps)
  const existing = keyAt(doc, at)
  const key: Keyframe = {
    time: at,
    // Keeping the ease that was already on this frame, so re-keying a pose you
    // have nudged does not quietly throw away a hold you set earlier.
    ease: ease ?? (existing >= 0 ? doc.keys[existing].ease : 'smooth'),
    pose: clonePose(pose),
  }

  const keys = existing >= 0
    ? doc.keys.map((old, index) => (index === existing ? key : old))
    : [...doc.keys, key].sort((a, b) => a.time - b.time)

  // A key past the end silently lengthens the clip rather than being dropped
  // or refusing: the alternative is a key you placed, cannot see, and are not
  // told about.
  return { ...doc, keys, duration: Math.max(doc.duration, at) }
}

export function removeKey(doc: AnimationDoc, time: number): AnimationDoc {
  const at = keyAt(doc, time)
  // The last key never goes. A document with no keys has no pose to show, and
  // the editor would have to invent one - see `emptyDoc`.
  if (at < 0 || doc.keys.length <= 1) return doc
  return { ...doc, keys: doc.keys.filter((_, index) => index !== at) }
}

/**
 * A key, dragged to another frame.
 *
 * Landing on an occupied frame takes it over, which is what dragging one thing
 * onto another means everywhere else. The alternative - refusing the drop - is
 * a drag that snaps back for a reason the strip does not show.
 */
export function moveKey(doc: AnimationDoc, from: number, to: number): AnimationDoc {
  const at = keyAt(doc, from)
  if (at < 0) return doc

  const target = snapTime(clampTime(to, MAX_DURATION), doc.fps)
  const frame = Math.round(target * doc.fps)
  const moved: Keyframe = { ...doc.keys[at], time: target }
  const keys = doc.keys
    .filter((key, index) => index !== at && Math.round(key.time * doc.fps) !== frame)
    .concat(moved)
    .sort((a, b) => a.time - b.time)

  return { ...doc, keys, duration: Math.max(doc.duration, target) }
}

export function setEase(doc: AnimationDoc, time: number, ease: Ease): AnimationDoc {
  const at = keyAt(doc, time)
  if (at < 0) return doc
  return {
    ...doc,
    keys: doc.keys.map((key, index) => (index === at ? { ...key, ease } : key)),
  }
}

/**
 * The same document at a different frame rate.
 *
 * Key times are re-snapped rather than rescaled: the animation keeps its
 * timing in seconds and only loses whatever precision the coarser grid cannot
 * hold. Rescaling - so frame 12 stays frame 12 - would make the clip play at a
 * different speed than the one you just watched, which is not what changing
 * the grid is for.
 *
 * Two keys can land on one frame going down, and the later one wins.
 */
export function setFps(doc: AnimationDoc, fps: number): AnimationDoc {
  const next = Math.round(Math.min(Math.max(fps, MIN_FPS), MAX_FPS))
  const seen = new Map<number, Keyframe>()
  for (const key of doc.keys) seen.set(Math.round(key.time * next), { ...key, time: snapTime(key.time, next) })
  const keys = [...seen.values()].sort((a, b) => a.time - b.time)
  return { ...doc, fps: next, keys }
}

/**
 * The end of the clip, moved.
 *
 * Keys past the new end are kept, not cut. Shortening a clip to look at the
 * first half of it is a thing you do constantly while animating, and a
 * duration that eats work is a duration nobody will touch. `bake` and the
 * player both stop at `duration`, so the tail is simply not played.
 */
export function setDuration(doc: AnimationDoc, duration: number): AnimationDoc {
  const frame = 1 / doc.fps
  return { ...doc, duration: Math.min(Math.max(snapTime(duration, doc.fps), frame), MAX_DURATION) }
}

// ---------------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------------

function ease(kind: Ease, t: number): number {
  if (kind === 'hold') return 0
  if (kind === 'linear') return t
  // smoothstep: leaves and arrives at rest, which is what almost every pose
  // change in a body actually does.
  return t * t * (3 - 2 * t)
}

/**
 * Two quaternions, blended the short way round.
 *
 * Hand-written rather than three.js's, because this module is the document and
 * the document has no business importing a renderer - it is what the tests
 * run against and what the `.json` is made of.
 */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b
  const [ax, ay, az, aw] = a

  let cos = ax * bx + ay * by + az * bz + aw * bw
  // Every rotation has two quaternions, q and -q. Flipping to the nearer one
  // is what stops a 10 degree turn from being taken as the 350 degree one.
  if (cos < 0) {
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
    cos = -cos
  }

  // Nearly parallel: the sine below goes to zero and the division with it, so
  // blend straight and re-normalise. Indistinguishable at this angle.
  if (cos > 0.9995) {
    const q: Quat = [ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t, aw + (bw - aw) * t]
    const length = Math.hypot(q[0], q[1], q[2], q[3]) || 1
    return [q[0] / length, q[1] / length, q[2] / length, q[3] / length]
  }

  const theta = Math.acos(cos)
  const sin = Math.sin(theta)
  const wa = Math.sin((1 - t) * theta) / sin
  const wb = Math.sin(t * theta) / sin
  return [ax * wa + bx * wb, ay * wa + by * wb, az * wa + bz * wb, aw * wa + bw * wb]
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * The rig at a moment, whether or not there is a key there.
 *
 * Before the first key and after the last it holds - a clip does not fade to
 * nothing at its edges, it stands where it was told to stand.
 *
 * `rest` fills in bones a key does not mention, which is what makes an older
 * `.json` openable after a bone is added to the rig.
 */
export function samplePose(doc: AnimationDoc, time: number, rest?: Pose): Pose {
  if (doc.keys.length === 0) return rest ? clonePose(rest) : { root: [0, 0, 0], bones: {} }

  let before = doc.keys[0]
  let after = doc.keys[doc.keys.length - 1]
  if (time <= before.time) return withRest(before.pose, rest)
  if (time >= after.time) return withRest(after.pose, rest)

  for (let index = 0; index < doc.keys.length - 1; index += 1) {
    if (doc.keys[index].time <= time && time < doc.keys[index + 1].time) {
      before = doc.keys[index]
      after = doc.keys[index + 1]
      break
    }
  }

  const span = after.time - before.time
  const t = span <= 0 ? 0 : ease(before.ease, (time - before.time) / span)

  const bones: Record<string, Quat> = {}
  const names = new Set([
    ...Object.keys(before.pose.bones),
    ...Object.keys(after.pose.bones),
    ...(rest ? Object.keys(rest.bones) : []),
  ])
  for (const name of names) {
    const from = before.pose.bones[name] ?? rest?.bones[name] ?? IDENTITY
    const to = after.pose.bones[name] ?? rest?.bones[name] ?? IDENTITY
    bones[name] = slerp(from, to, t)
  }

  return {
    root: [
      mix(before.pose.root[0], after.pose.root[0], t),
      mix(before.pose.root[1], after.pose.root[1], t),
      mix(before.pose.root[2], after.pose.root[2], t),
    ],
    bones,
  }
}

const IDENTITY: Quat = [0, 0, 0, 1]

function withRest(pose: Pose, rest?: Pose): Pose {
  const copy = clonePose(pose)
  if (rest) {
    for (const name of Object.keys(rest.bones)) {
      if (!copy.bones[name]) copy.bones[name] = [...rest.bones[name]] as Quat
    }
  }
  return copy
}

// ---------------------------------------------------------------------------
// Exporting
// ---------------------------------------------------------------------------

export interface BakedClip {
  name: string
  duration: number
  times: number[]
  /** Bone name to flattened `[x,y,z,w, x,y,z,w, ...]`, one per time. */
  bones: Record<string, number[]>
  /** Flattened `[x,y,z, ...]`, one per time. */
  root: number[]
}

/**
 * The document, flattened to one sample per frame.
 *
 * Dense rather than sparse, and that is the point: glTF can only interpolate
 * linearly between the keys it is given, so a `smooth` ease or a `hold`
 * exported as two keys would arrive somewhere else as a straight blend. Baking
 * makes the curve out of samples, which every player agrees about.
 *
 * A 24fps two-second clip is 49 samples of 23 quaternions - about 18KB before
 * the exporter quantises anything. Sparseness is not worth a format's worth of
 * disagreement about easing.
 *
 * Bones that never move are dropped. On a clip that only waves, that is 20 of
 * the 23 tracks gone, and a player with nothing to bind for the legs leaves
 * them wherever the model's own rest pose put them - which is where they were.
 */
export function bake(doc: AnimationDoc, rest?: Pose): BakedClip {
  const frames = Math.max(1, Math.round(doc.duration * doc.fps))
  const times: number[] = []
  const samples: Pose[] = []

  for (let frame = 0; frame <= frames; frame += 1) {
    const time = Math.min(frame / doc.fps, doc.duration)
    times.push(time)
    samples.push(samplePose(doc, time, rest))
  }

  const names = new Set<string>()
  for (const sample of samples) for (const name of Object.keys(sample.bones)) names.add(name)

  const bones: Record<string, number[]> = {}
  for (const name of names) {
    const values: number[] = []
    let moves = false
    const first = samples[0].bones[name] ?? IDENTITY
    for (const sample of samples) {
      const q = sample.bones[name] ?? IDENTITY
      values.push(q[0], q[1], q[2], q[3])
      if (!moves && !same(q, first)) moves = true
    }
    if (moves) bones[name] = values
  }

  const root: number[] = []
  for (const sample of samples) root.push(sample.root[0], sample.root[1], sample.root[2])

  return { name: doc.name, duration: doc.duration, times, bones, root }
}

function same(a: Quat, b: Quat): boolean {
  const epsilon = 1e-5
  return (
    Math.abs(a[0] - b[0]) < epsilon &&
    Math.abs(a[1] - b[1]) < epsilon &&
    Math.abs(a[2] - b[2]) < epsilon &&
    Math.abs(a[3] - b[3]) < epsilon
  )
}

/** Whether the root ever leaves where it started. See `bake` on dropped tracks. */
export function rootMoves(baked: BakedClip): boolean {
  for (let index = 3; index < baked.root.length; index += 3) {
    if (
      Math.abs(baked.root[index] - baked.root[0]) > 1e-5 ||
      Math.abs(baked.root[index + 1] - baked.root[1]) > 1e-5 ||
      Math.abs(baked.root[index + 2] - baked.root[2]) > 1e-5
    ) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------

/**
 * What version a file *says* it is, before anything is done to it.
 *
 * Separate from `parseDoc` on purpose. Parsing is forgiving by design - it has
 * to be, see below - and a forgiving parser cannot also be the thing that
 * warns you, because by the time it has finished the evidence is gone. This
 * reads the raw claim so the caller can say "that was written by a newer
 * animator" before showing you what it made of it.
 *
 * Zero for a file that declares nothing, which is every file written before
 * the field existed.
 */
export function declaredVersion(value: unknown): number {
  const raw = (value ?? {}) as Record<string, unknown>
  return typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 0
}

/**
 * A `.json` from disk or the clipboard, read as forgivingly as the studio
 * reads a hero.
 *
 * Anything unreadable becomes the default rather than a throw, because the
 * thing on the other side of this is a file picker and a paste box, and the
 * failure mode of a throw is an editor that will not open.
 *
 * What comes out is always at `CLIP_VERSION`, whatever went in.
 */
export function parseDoc(value: unknown, rest: Pose): AnimationDoc {
  const raw = (value ?? {}) as Record<string, unknown>
  const base = emptyDoc(
    rest,
    typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 60) : 'clip',
    // Absent is the dummy, because every file written before the field existed
    // was authored on it. A name we do not ship is the dummy too - it is the
    // same forgiving read every other field here gets, and an unopenable file is
    // a worse answer than one that opens on the wrong body.
    isRigId(raw.rig) ? raw.rig : DEFAULT_RIG,
  )

  const fps = Math.round(number(raw.fps, base.fps, MIN_FPS, MAX_FPS))
  const keys = Array.isArray(raw.keys)
    ? raw.keys
        .map((entry) => parseKey(entry, fps, rest))
        .filter((key): key is Keyframe => key !== null)
        .sort((a, b) => a.time - b.time)
    : []

  const last = keys.length ? keys[keys.length - 1].time : 0

  return {
    version: CLIP_VERSION,
    name: base.name,
    rig: base.rig,
    fps,
    duration: Math.max(number(raw.duration, base.duration, 1 / fps, MAX_DURATION), last),
    loop: typeof raw.loop === 'boolean' ? raw.loop : base.loop,
    keys: keys.length ? keys : base.keys,
  }
}

function parseKey(value: unknown, fps: number, rest: Pose): Keyframe | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const pose = raw.pose as Record<string, unknown> | undefined
  if (!pose || typeof pose !== 'object') return null

  const bones: Record<string, Quat> = {}
  const source = (pose.bones ?? {}) as Record<string, unknown>
  for (const name of Object.keys(rest.bones)) {
    bones[name] = quat(source[name]) ?? ([...rest.bones[name]] as Quat)
  }

  return {
    time: snapTime(number(raw.time, 0, 0, MAX_DURATION), fps),
    ease: EASES.includes(raw.ease as Ease) ? (raw.ease as Ease) : 'smooth',
    pose: { root: vec3(pose.root) ?? ([...rest.root] as Vec3), bones },
  }
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(Math.max(value, min), max)
    : fallback
}

function vec3(value: unknown): Vec3 | null {
  if (!Array.isArray(value) || value.length < 3) return null
  const out = value.slice(0, 3).map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0))
  return out as Vec3
}

function quat(value: unknown): Quat | null {
  if (!Array.isArray(value) || value.length < 4) return null
  const out = value.slice(0, 4).map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0))
  const length = Math.hypot(out[0], out[1], out[2], out[3])
  // A zero quaternion is not a rotation. Anything degenerate becomes identity
  // rather than propagating NaN through every frame that touches it.
  if (length < 1e-6) return [0, 0, 0, 1]
  // Anything already unit length is passed through untouched. Dividing by a
  // length of 0.9999999999999999 changes the last digit of every component,
  // which is enough to make saving and reopening a file not a round trip.
  if (Math.abs(length - 1) < 1e-9) return out as Quat
  return [out[0] / length, out[1] / length, out[2] / length, out[3] / length]
}

// ---------------------------------------------------------------------------
// A collection of them
// ---------------------------------------------------------------------------

/**
 * Several clips in one file, which is what a body's worth of animation is.
 *
 * ---------------------------------------------------------------------------
 * Why one clip per file was the wrong unit
 * ---------------------------------------------------------------------------
 * Nobody animates a walk. They animate a *character*: a walk, an idle, a wave,
 * a death - four clips that share a rig, a frame rate and a house style, are
 * authored in one sitting, and are only useful together. One file each meant
 * four working files, four downloads, four things to keep in step, and an editor
 * that could hold exactly one of them at a time.
 *
 * So the working file is a library and the timeline shows one of its clips.
 * Everything below the collection - `putKey`, `bake`, `stamp`, the whole
 * timeline - still works on a single `AnimationDoc` and did not change.
 *
 * ---------------------------------------------------------------------------
 * The rig is the library's, not the clip's
 * ---------------------------------------------------------------------------
 * `AnimationDoc.rig` stays, because a clip on its own still has to say what it
 * is for - it can be pasted, mailed, or read by something that has never seen a
 * library. But a *collection* of clips for two different skeletons is not a
 * collection of anything: they share no bone name, so nothing about them could
 * be edited together. So the library declares one rig, every clip in it agrees,
 * and `parseLibrary` is what makes that true rather than merely intended.
 */
export interface ClipLibrary {
  version: number
  rig: SkeletonId
  /**
   * The clips, in the order the list shows them. Never empty.
   *
   * An empty library is a screen with a timeline and nothing to put on it, and
   * every caller would need a branch for it. A new library holds one new clip,
   * which is what the editor used to be.
   */
  clips: AnimationDoc[]
  /** Which one the timeline and the viewport are showing. Always in range. */
  at: number
}

/** A library holding one empty clip - what the editor opens on. */
export function emptyLibrary(rest: Pose, rig: SkeletonId = DEFAULT_RIG): ClipLibrary {
  return { version: CLIP_VERSION, rig, clips: [emptyDoc(rest, 'idle', rig)], at: 0 }
}

/** The clip the timeline is showing. */
export function currentClip(library: ClipLibrary): AnimationDoc {
  return library.clips[library.at] ?? library.clips[0]!
}

/** The library with the shown clip replaced. Everything else untouched. */
export function withClip(library: ClipLibrary, doc: AnimationDoc): ClipLibrary {
  if (doc === currentClip(library)) return library
  return { ...library, clips: library.clips.map((one, at) => (at === library.at ? doc : one)) }
}

/**
 * A name nothing else in this library is using.
 *
 * Clips are named, played by name, and written into a document keyed by name -
 * so two called `walk` is two things one lookup cannot tell apart. Numbered
 * rather than refused, because the moment somebody wants a second walk they
 * want it *now* and naming it is what the field above the timeline is for.
 */
export function freeName(library: ClipLibrary, wanted: string): string {
  const taken = new Set(library.clips.map((one) => one.name))
  const stem = wanted.trim() || 'clip'
  if (!taken.has(stem)) return stem
  for (let n = 2; n < 1000; n += 1) {
    const tried = `${stem}-${n}`
    if (!taken.has(tried)) return tried
  }
  return `${stem}-${taken.size + 1}`
}

/** One more clip, added after the one showing and shown. */
export function addClip(library: ClipLibrary, rest: Pose, name = 'clip'): ClipLibrary {
  const doc = emptyDoc(rest, freeName(library, name), library.rig)
  const clips = [...library.clips.slice(0, library.at + 1), doc, ...library.clips.slice(library.at + 1)]
  return { ...library, clips, at: library.at + 1 }
}

/**
 * The shown clip again under a new name, next to it.
 *
 * The move people actually make: a run is a walk with longer strides, and a
 * death is a fall you then push about. Starting either from an empty timeline
 * is starting from nothing twice.
 */
export function copyClip(library: ClipLibrary): ClipLibrary {
  const doc = currentClip(library)
  const copy: AnimationDoc = { ...doc, name: freeName(library, doc.name), keys: doc.keys.map((key) => ({ ...key, pose: clonePose(key.pose) })) }
  const clips = [...library.clips.slice(0, library.at + 1), copy, ...library.clips.slice(library.at + 1)]
  return { ...library, clips, at: library.at + 1 }
}

/**
 * One fewer, unless it is the last.
 *
 * Refused rather than emptied, and it is the same rule a motion's steps have:
 * a library is its clips, so removing the last would leave a timeline with
 * nothing on it and every reader needing a branch. Clearing the last clip is
 * what selecting all its keys and deleting them is for.
 */
export function removeClip(library: ClipLibrary, at: number): ClipLibrary {
  if (library.clips.length <= 1 || at < 0 || at >= library.clips.length) return library
  const clips = library.clips.filter((_, index) => index !== at)
  // Stay where you were looking when something above you goes, rather than
  // jumping to the top: removing clip three should leave you on what is now
  // clip three, which is what was under it.
  return { ...library, clips, at: Math.min(library.at > at ? library.at - 1 : library.at, clips.length - 1) }
}

/** Rename the shown clip, keeping the library's names distinct. */
export function renameClip(library: ClipLibrary, name: string): ClipLibrary {
  const doc = currentClip(library)
  const clean = name.trim().slice(0, 60)
  if (clean === doc.name) return library
  const others = { ...library, clips: library.clips.filter((_, at) => at !== library.at) }
  return withClip(library, { ...doc, name: freeName(others, clean || 'clip') })
}

/** Show a different one. Out of range is ignored rather than clamped silently. */
export function showClip(library: ClipLibrary, at: number): ClipLibrary {
  if (at < 0 || at >= library.clips.length || at === library.at) return library
  return { ...library, at }
}

/**
 * A `.json` from disk, the clipboard or `localStorage`, read as a library
 * whatever shape it is in.
 *
 * ---------------------------------------------------------------------------
 * A single clip is a library of one, and that is the whole upgrade
 * ---------------------------------------------------------------------------
 * Every file this editor has ever written is one clip: a `name`, a `fps`, some
 * `keys`. Read as a library of one it means exactly what it meant, which is why
 * `CLIP_VERSION` does not move - the version note's own rule is that a bump is
 * for a change that would make an older file open as something *other* than what
 * it was saved as.
 *
 * The two shapes are told apart by `clips` being an array, which a single clip
 * has never had. Not by the version, deliberately: a hand-edited file with the
 * wrong number in it should still open as whatever it actually is.
 */
export function parseLibrary(value: unknown, rest: Pose): ClipLibrary {
  const raw = (value ?? {}) as Record<string, unknown>

  if (!Array.isArray(raw.clips)) {
    // One clip, from before this existed. Its own rig becomes the library's,
    // which is the only reading that keeps a peep file opening as a peep.
    const only = parseDoc(raw, rest)
    return { version: CLIP_VERSION, rig: only.rig, clips: [only], at: 0 }
  }

  const rig = isRigId(raw.rig) ? raw.rig : DEFAULT_RIG
  const clips: AnimationDoc[] = []
  const taken = new Set<string>()
  for (const entry of raw.clips) {
    const doc = parseDoc(entry, rest)
    /**
     * Every clip wears the library's rig, whatever it claimed.
     *
     * A library is one rig by construction - see the note on the type - so a
     * clip inside one claiming the other is a file somebody edited by hand or a
     * merge that went wrong. Taking the library's word is the reading that
     * leaves something editable; taking the clip's would put a dummy walk on a
     * fox's timeline, where every bone name binds to nothing.
     */
    const named = { ...doc, rig, name: taken.has(doc.name) ? `${doc.name}-${taken.size + 1}` : doc.name }
    taken.add(named.name)
    clips.push(named)
  }

  if (clips.length === 0) return emptyLibrary(rest, rig)

  const at = typeof raw.at === 'number' && Number.isInteger(raw.at) ? raw.at : 0
  return { version: CLIP_VERSION, rig, clips, at: Math.min(Math.max(at, 0), clips.length - 1) }
}
