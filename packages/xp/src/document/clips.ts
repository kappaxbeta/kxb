/**
 * `@kxb/xp/clips` - a clip a level carries, rather than one a pack lends it.
 *
 * ---------------------------------------------------------------------------
 * The gap this closes
 * ---------------------------------------------------------------------------
 * Reported as *"you can't save the clip to your document"*, and the animator
 * panel said so itself: it made a clip, handed back a file, and there was
 * nowhere in an XP to put it. So every animation a level could play came out of
 * the pack we ship - 139 clips of somebody else's idea of walking - and a body
 * doing anything specific was a body somebody had to talk out of it.
 *
 * The panel's own note gave the reason, and the reason was wrong: *"an XP that
 * carries its own art is `xp/2`'s `assets` block, and until that exists there is
 * nowhere for the bytes to live."* True of a `.glb`, which is bytes. A clip is
 * **numbers** - times and quaternions - and a document has carried numbers since
 * it existed. There was nothing to wait for.
 *
 * ---------------------------------------------------------------------------
 * Baked, not keyed
 * ---------------------------------------------------------------------------
 * The animator's own format is a list of *keys*, each a whole pose, with an
 * easing between them. That is the right shape for editing and the wrong one to
 * ship: it means every reader has to agree about what `smooth` means, and the
 * moment two do not, one level looks different on two machines.
 *
 * So what lands here is what `bake` produces - one dense sample a frame, with
 * the easing already in the samples. Every player agrees about a straight line
 * between two numbers. It is also exactly the shape three.js binds, so the
 * runtime builds an `AnimationClip` from it without interpreting anything.
 *
 * The cost is size, and it is worth stating: a two-second clip at 24fps is 49
 * samples of up to 23 quaternions - about 18KB of JSON, before the rounding the
 * editor does on the way in. `MAX_CLIP_SAMPLES` is what stops that becoming a
 * document nobody can load.
 *
 * ---------------------------------------------------------------------------
 * The keys are the names, and the names are what everything else already says
 * ---------------------------------------------------------------------------
 * `blueprint.pose`, the `animate` verb and an `AnimationGraph`'s states all name
 * a clip and are all deliberately unchecked against any pack - because which
 * glTFs a host has loaded is the host's business. A clip *in the document* is
 * the one case that is not the host's business at all, so those three now have
 * something they can be checked against, and the editor's pickers have something
 * to offer beyond the pack.
 */

import type { SkeletonId } from '../assets/packs'
import { EASES, type Ease } from './movie'

/** How many clips one level may carry, and how long each may be. */
export const MAX_XP_CLIPS = 32

/**
 * Samples in one clip.
 *
 * 1,440 is a minute at 24fps, which is far longer than anything anybody keys by
 * hand and still only a few hundred kilobytes on a full rig. The bound is here
 * because the number that produces it - duration times frame rate - is two
 * fields somebody can type, and a document is loaded before it is looked at.
 */
export const MAX_CLIP_SAMPLES = 1440

/** Tracks in one clip. The dummy has 23 bones and a peep has 8. */
export const MAX_CLIP_TRACKS = 64

/**
 * A clip the document owns.
 *
 * Dense samples, one per frame, with the easing already applied. See above for
 * why it is not the animator's keyed form.
 */
export interface XpClip {
  /**
   * Which skeleton it was authored on.
   *
   * The same field `AnimationGraph` carries and for the same reason: the two
   * rigs share not one bone name, so a dummy clip bound to a peep does not play
   * wrongly, it plays *nothing* - every track binds to a name the body does not
   * have and the animal stands perfectly still. Here it is checkable against the
   * body that names the clip, which is the whole point of the clip being in the
   * document rather than in a pack.
   */
  rig: SkeletonId
  /** Seconds. Always the last sample's time. */
  duration: number
  /**
   * Whether it repeats when something plays it without saying.
   *
   * A hint rather than a rule: `animate` and `runAnimation` both take their own
   * `loop`, and a caller that says nothing gets this. A walk that looped by
   * default and a death that did not is the difference between the two being
   * usable without reading them.
   */
  loop?: boolean
  /** Sample times in seconds, ascending, starting at zero. */
  times: readonly number[]
  /**
   * How each sample leaves for the next one, when it is not a straight line.
   *
   * Absent on everything baked, which is every clip that came out of the
   * animator or a pack: those are already dense - a sample a frame - and a
   * shape between two frames means nothing. It is the **sparse** clips a movie
   * writes, one sample per pose somebody keyed, where the gap between two
   * moments is a second long and how it is crossed is the whole performance.
   *
   * One entry per sample, so it stays square with `times` the way every track
   * does. The last is unused - nothing leaves the final sample - and kept
   * rather than special-cased, because a list one shorter than the others is
   * the off-by-one this file spends its length avoiding.
   */
  eases?: readonly Ease[]
  /**
   * Bone name to a flat run of quaternions - four numbers a sample, in three's
   * `x, y, z, w` order.
   *
   * Flat rather than an array of quadruples, because that is what a
   * `QuaternionKeyframeTrack` takes: nesting them would be a shape the runtime
   * has to undo on every load for no reader's benefit.
   *
   * Bones that never move are absent. On a clip that only waves that is twenty
   * of twenty-three tracks gone, and a body with nothing bound for its legs
   * leaves them where the model's own rest pose put them - which is where they
   * were.
   */
  bones: Readonly<Record<string, readonly number[]>>
  /**
   * Where the root stands, three numbers a sample.
   *
   * Absent when it never leaves where it started, which is every clip that is
   * not a jump. A track pinning the root at the origin every frame is a clip
   * that cannot be placed anywhere by whatever plays it.
   */
  root?: readonly number[]
}

/** How many samples this clip has, which every track has to agree with. */
export function clipSamples(clip: XpClip): number {
  return clip.times.length
}

/**
 * Whether every track in this clip is the length its times say.
 *
 * The one thing about a baked clip that is worth checking and cannot be checked
 * by looking: a bone track one sample short binds fine and then plays the whole
 * animation shifted by a frame against every other bone, which reads as a body
 * coming apart rather than as a file being wrong.
 */
export function clipIsSquare(clip: XpClip): boolean {
  const samples = clip.times.length
  if (samples === 0) return false
  if (clip.root !== undefined && clip.root.length !== samples * 3) return false
  return Object.values(clip.bones).every((track) => track.length === samples * 4)
}


/**
 * One pose written into a clip at a moment, keeping every track square.
 *
 * ---------------------------------------------------------------------------
 * What makes a pose clip an animation
 * ---------------------------------------------------------------------------
 * A pose written by the editor has always been **one sample**: `times: [0]`,
 * four numbers a bone, and the runtime holds it. The format never required
 * that - `QuaternionKeyframeTrack` takes as many samples as you give it - so
 * the difference between a pose and an animation is only ever how many times
 * somebody has written into it.
 *
 * This is that writer. Pose the body, key it at a moment, move the playhead,
 * pose it again: the clip grows a sample and the body moves between them.
 *
 * ---------------------------------------------------------------------------
 * Squareness, which is the whole difficulty
 * ---------------------------------------------------------------------------
 * `clipIsSquare` is not a formality. A bone track one sample short binds
 * without complaint and then plays the whole animation shifted by a frame
 * against every other bone, which reads as a body coming apart rather than as
 * a file being wrong. So two things have to happen on every write:
 *
 * - A **new time** appends a sample to *every* existing track, not only the
 *   bones this pose mentions. A bone left out of this pose is a bone that
 *   holds its previous value, so it is filled with the sample before it.
 * - A **new bone** back-fills every earlier sample. It was at its rest
 *   orientation for all of them, and the identity quaternion is what says so.
 *
 * Writing to a time that already exists replaces that sample rather than
 * stacking a second one at the same instant - the rule keys already follow,
 * and for the same reason: two samples a hundredth apart is never meant and is
 * invisible afterwards.
 */
export function withSample(
  clip: XpClip | undefined,
  rig: SkeletonId,
  at: number,
  /** Bone name to a quaternion. Bones absent hold whatever they had. */
  pose: Readonly<Record<string, readonly number[]>>,
): XpClip | null {
  if (!Number.isFinite(at) || at < 0) return null
  for (const values of Object.values(pose)) {
    if (values.length !== 4 || !values.every((one) => Number.isFinite(one))) return null
  }

  const base: XpClip = clip ?? { rig, duration: 0, times: [], bones: {} }
  if (base.rig !== rig) return null

  const t = Math.round(at * 1000) / 1000
  const times = [...base.times]
  // Replacing rather than stacking - see the note above.
  let index = times.findIndex((one) => Math.abs(one - t) <= 0.001)
  const fresh = index < 0
  if (fresh) {
    index = times.findIndex((one) => one > t)
    if (index < 0) index = times.length
    times.splice(index, 0, t)
  }
  if (times.length > MAX_CLIP_SAMPLES) return null

  const names = new Set([...Object.keys(base.bones), ...Object.keys(pose)])
  if (names.size > MAX_CLIP_TRACKS) return null

  const bones: Record<string, number[]> = {}
  for (const name of names) {
    const was = base.bones[name]
    const track: number[] = []
    for (let i = 0; i < times.length; i += 1) {
      // Where this bone's old sample for this row lives: rows after a freshly
      // inserted one have shifted along by exactly one.
      const from = fresh ? (i < index ? i : i - 1) : i
      const had = was && from >= 0 && from * 4 + 4 <= was.length
        ? was.slice(from * 4, from * 4 + 4)
        : undefined

      if (i === index && pose[name]) {
        track.push(...pose[name]!)
      } else if (had) {
        track.push(...had)
      } else {
        // A bone this clip has never carried was at rest for every sample
        // before the one that introduces it.
        track.push(0, 0, 0, 1)
      }
    }
    bones[name] = track
  }

  /**
   * And the eases, which are as parallel to `times` as any track.
   *
   * A new moment inherits `smooth`, which is what the rest of the editor writes
   * and what a person keying two poses means by it. Forgetting this list is the
   * same off-by-one as forgetting a bone: the shapes would slide onto the wrong
   * segments and every gap after the new one would be crossed by somebody
   * else's instruction.
   */
  let eases: Ease[] | undefined
  if (base.eases || fresh) {
    const was = base.eases ?? base.times.map(() => 'smooth' as Ease)
    eases = [...was]
    if (fresh) eases.splice(index, 0, 'smooth')
  }

  return {
    ...base,
    rig,
    times,
    bones,
    ...(eases ? { eases } : {}),
    // Always the last sample's time, which is what `XpClip.duration` promises.
    duration: times[times.length - 1] ?? 0,
  }
}


/**
 * A clip moved so its first sample is at zero, and where it used to start.
 *
 * `XpClip.times` promises to start at zero, and the runtime binds those times
 * literally: a clip whose first sample is at 3 played from a cue at 0 holds the
 * rest pose for three seconds and then moves. So the offset cannot live in the
 * clip - it belongs on the `play` action, which is the thing that says *when*.
 *
 * Written as a pair rather than as two functions because the two halves are
 * only correct together: a caller that rebased and forgot to move the cue has
 * silently retimed the animation, which is exactly the failure the promise
 * exists to prevent.
 */
export function rebased(clip: XpClip): { clip: XpClip; start: number } {
  const start = clip.times[0] ?? 0
  if (start === 0) return { clip, start: 0 }
  const times = clip.times.map((one) => Math.round((one - start) * 1000) / 1000)
  return {
    clip: { ...clip, times, duration: times[times.length - 1] ?? 0 },
    start,
  }
}


/**
 * A clip with one of its moments taken out.
 *
 * `null` when there is nothing left afterwards, rather than an empty clip: a
 * clip with no samples is one `readClip` refuses, so producing one would leave
 * the editor holding a document it cannot save. Removing the last pose is
 * deleting the clip, and that is the caller's word to use.
 *
 * Every track loses the same row, for the reason `withSample` fills them: one
 * track a sample shorter than the rest binds fine and plays the animation
 * shifted against every other bone.
 */
export function withoutSample(clip: XpClip, row: number): XpClip | null {
  if (!Number.isInteger(row) || row < 0 || row >= clip.times.length) return null
  if (clip.times.length <= 1) return null

  const times = clip.times.filter((_, i) => i !== row)
  const bones: Record<string, number[]> = {}
  for (const [name, track] of Object.entries(clip.bones)) {
    bones[name] = [...track.slice(0, row * 4), ...track.slice(row * 4 + 4)]
  }

  const root = clip.root
    ? [...clip.root.slice(0, row * 3), ...clip.root.slice(row * 3 + 3)]
    : undefined

  return {
    ...clip,
    times,
    bones,
    ...(clip.eases ? { eases: clip.eases.filter((_, i) => i !== row) } : {}),
    ...(root ? { root } : {}),
    duration: times[times.length - 1] ?? 0,
  }
}


/**
 * The shortest way from one orientation to another, part-way along.
 *
 * Written here rather than borrowed from three, because this file is the
 * document's and has no renderer in it - the same reason `boneKey` reimplements
 * a sanitiser. The negation is the part that matters: a quaternion and its
 * negative are the same orientation, so without picking the closer of the two a
 * shoulder turning thirty degrees sometimes goes three hundred and thirty the
 * other way, which is the classic and very recognisable spin.
 */
function slerp(
  a: readonly number[],
  b: readonly number[],
  u: number,
): [number, number, number, number] {
  let [bx, by, bz, bw] = [b[0]!, b[1]!, b[2]!, b[3]!]
  const [ax, ay, az, aw] = [a[0]!, a[1]!, a[2]!, a[3]!]
  let dot = ax * bx + ay * by + az * bz + aw * bw

  if (dot < 0) {
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
    dot = -dot
  }

  // Almost the same orientation: the angle is too small for the trigonometry to
  // be worth anything, and a straight blend is indistinguishable and safe.
  if (dot > 0.9995) {
    const out: [number, number, number, number] = [
      ax + (bx - ax) * u,
      ay + (by - ay) * u,
      az + (bz - az) * u,
      aw + (bw - aw) * u,
    ]
    const length = Math.hypot(...out) || 1
    return [out[0] / length, out[1] / length, out[2] / length, out[3] / length]
  }

  const angle = Math.acos(Math.min(1, dot))
  const sin = Math.sin(angle)
  const from = Math.sin((1 - u) * angle) / sin
  const to = Math.sin(u * angle) / sin
  return [ax * from + bx * to, ay * from + by * to, az * from + bz * to, aw * from + bw * to]
}

/** Leaves and arrives at rest, which is what almost every pose change wants. */
const smoothstep = (u: number) => u * u * (3 - 2 * u)

/** Extra samples a second, when a segment has to be drawn rather than crossed. */
const DENSITY = 12

/**
 * A clip with its eased segments filled in, ready for a renderer.
 *
 * ---------------------------------------------------------------------------
 * Why easing a pose needs samples rather than a flag
 * ---------------------------------------------------------------------------
 * Position keys carry an `Ease` and `sampleKeys` honours it, because that is
 * *this* code doing the interpolation. A clip is handed to three, which
 * interpolates quaternion tracks linearly and has no smooth mode for them - so
 * a `smooth` written on a pose sample would be a field nothing reads, and an
 * authored animation would move at one flat speed however it was marked.
 *
 * So the shape is baked into the *times*: a smooth segment becomes a dozen
 * samples a second placed along a smoothstep, and the linear interpolation
 * between them adds up to the curve. A hold becomes two samples with the same
 * value, so the body sits still and then arrives at the next pose at once.
 *
 * Done at **load** rather than on the way into the document. The file keeps one
 * sample per pose somebody actually keyed, which is what makes it editable and
 * readable; a baked clip is a wall of numbers nobody can find a shoulder in.
 * `bake` in the animator does the opposite for the opposite reason: its output
 * is an export, not a thing anybody opens again.
 *
 * A clip with no eases is handed straight back, which is every baked clip and
 * every pack clip - so this costs nothing for the clips that do not need it.
 */
export function denser(clip: XpClip): XpClip {
  const eases = clip.eases
  if (!eases || clip.times.length < 2) return clip
  if (!eases.some((one) => one === 'smooth' || one === 'hold')) return clip

  const names = Object.keys(clip.bones)
  const times: number[] = []
  const bones: Record<string, number[]> = Object.fromEntries(names.map((one) => [one, []]))

  const put = (at: number, read: (name: string) => readonly number[]) => {
    times.push(Math.round(at * 10000) / 10000)
    for (const name of names) bones[name]!.push(...read(name))
  }
  const sampleOf = (name: string, row: number) =>
    clip.bones[name]!.slice(row * 4, row * 4 + 4)

  for (let row = 0; row < clip.times.length - 1; row += 1) {
    const from = clip.times[row]!
    const to = clip.times[row + 1]!
    const span = to - from
    const ease = eases[row] ?? 'linear'

    put(from, (name) => sampleOf(name, row))

    if (ease === 'hold' && span > 0.002) {
      // Held right up to the next moment, then straight there. Two samples with
      // one value is what a hold *is*; a single one would glide as before.
      put(to - 0.001, (name) => sampleOf(name, row))
      continue
    }

    if (ease !== 'smooth' || span <= 0) continue

    const steps = Math.max(2, Math.round(span * DENSITY))
    for (let step = 1; step < steps; step += 1) {
      const u = step / steps
      put(from + u * span, (name) =>
        slerp(sampleOf(name, row), sampleOf(name, row + 1), smoothstep(u)),
      )
    }
  }

  // And the last authored moment, which no segment leaves.
  put(clip.times[clip.times.length - 1]!, (name) =>
    sampleOf(name, clip.times.length - 1),
  )

  const { eases: _spent, root: _root, ...rest } = clip
  return { ...rest, times, bones }
}


/**
 * How one moment of a clip leaves for the next.
 *
 * The pose counterpart of `setKeyEase`, and separate from `withSample` for the
 * same reason that one is separate from `putEntityKey`: a pose is written on
 * every drag of a pad, a shape is chosen once.
 */
export function withSampleEase(clip: XpClip, row: number, ease: Ease): XpClip | null {
  if (!Number.isInteger(row) || row < 0 || row >= clip.times.length) return null
  if (!EASES.includes(ease)) return null

  const was = clip.eases ?? clip.times.map(() => 'smooth' as Ease)
  if (was[row] === ease) return null

  const eases = [...was]
  eases[row] = ease
  return { ...clip, eases }
}
