import type { XpClip } from '@kxb/xp/clips'
import { bake, type ClipLibrary, type Pose, rootMoves } from '@/app/xp/_editor/animator/clip'

/**
 * Turning a working file into the clips a level carries.
 *
 * Its own module rather than an addition to ./clip, whose header promises it is
 * a verbatim copy of `src/domain/animator/clip.ts` so that a diff against the
 * original shows how far the two have drifted. Something only this editor needs
 * would make that diff lie.
 *
 * Lifted out of the Save button in ./animator, where it was ninety lines inside
 * a 1,377-line component. Both of the rules below are here because somebody hit
 * them, and neither would have raised anything.
 */

/** Four decimal places, which is more than a bone angle can be seen at. */
const round = (value: number) => Math.round(value * 10_000) / 10_000

export interface ForLevel {
  /** What to write, this library's clips merged over the level's other rigs. */
  clips: Record<string, XpClip>
  /** How many of this library's clips went in. */
  saved: number
  /** The ones that turned out to be nothing, **by name**. See below. */
  skipped: string[]
}

/**
 * @param library  the working file being saved
 * @param rest     the rig's rest pose, which is what `bake` measures against
 * @param existing what the level already carries, across every rig
 */
export function clipsForLevel(
  library: ClipLibrary,
  rest: Pose,
  existing: Readonly<Record<string, XpClip>> | undefined,
): ForLevel {
  const next: Record<string, XpClip> = {}
  const skipped: string[] = []

  for (const one of library.clips) {
    const baked = bake(one, rest)

    const bones: Record<string, number[]> = {}
    for (const [bone, track] of Object.entries(baked.bones)) bones[bone] = track.map(round)

    /**
     * A clip nobody has posed is skipped rather than saved.
     *
     * `bake` drops bones that never move — which is right, and which means a
     * fresh clip, whose only key is the rest pose, bakes to **nothing**. Saved,
     * that is a document the parser refuses, so the panel would be holding a
     * level it could not save. Found by pressing Save on a new clip.
     *
     * Skipped and *named*, rather than skipped quietly: a button that reports
     * success and writes two of your three clips is worse than one that
     * refuses.
     */
    if (Object.keys(bones).length === 0) {
      skipped.push(one.name)
      continue
    }

    next[one.name] = {
      rig: library.rig,
      duration: baked.duration,
      times: baked.times.map(round),
      bones,
      ...(one.loop ? { loop: true } : {}),
      // Only when it goes somewhere. A track pinning the root at the origin
      // every frame is a clip that cannot be placed anywhere by whatever plays
      // it — the same rule the GLB export follows.
      ...(rootMoves(baked) ? { root: baked.root.map(round) } : {}),
    }
  }

  /**
   * Merged with whatever the level already had, rather than replacing it.
   *
   * Writing the whole block is right for *this* library — a clip the animator
   * no longer has is one somebody deleted. It is wrong across libraries: the
   * dummy's clips and the peeps' live in two working files, and saving one must
   * not delete the other.
   *
   * Keyed on `rig` rather than on the name, because two rigs may both have an
   * `idle` and they are different animations.
   */
  const kept = Object.fromEntries(
    Object.entries(existing ?? {}).filter(([, one]) => one.rig !== library.rig),
  )

  return { clips: { ...kept, ...next }, saved: Object.keys(next).length, skipped }
}
