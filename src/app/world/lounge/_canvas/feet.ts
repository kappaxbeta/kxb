'use client'

import * as THREE from 'three'
import { ALL_SPECS } from '@/domain/animator/rig'

/**
 * A clip cut at the waist, so the legs can do one thing while the rest does
 * another.
 *
 * ---------------------------------------------------------------------------
 * Dancing across the room
 * ---------------------------------------------------------------------------
 * The dance is a whole-body clip and it used to *replace* the gait: press G and
 * walk, and the body glided across the floor cheering with its feet planted.
 * The ask was one sentence - "just the feet" - and that is exactly the cut this
 * makes: while somebody dances on the move, the legs play the walk or the run
 * and everything above them keeps dancing.
 *
 * ---------------------------------------------------------------------------
 * Two clips, disjoint tracks, one mixer
 * ---------------------------------------------------------------------------
 * three.js blends every action that touches a property by weight, and fills
 * whatever weight is missing from the bind pose. So the split has to be clean
 * on *both* sides: a legs-only gait and an upper-only dance, each at full
 * weight, and every bone driven by exactly one of them. Playing the whole
 * dance over a legs-only walk would average the arms between cheering and
 * swinging, which reads as a shrug; playing the whole walk under an upper-only
 * dance would do the same to the hips.
 *
 * The hips go with the dance, not the feet. They are the root the legs hang
 * from, and the ask was about the feet; the cheer's bounce is most of what
 * makes it read as dancing from behind.
 *
 * ---------------------------------------------------------------------------
 * Which bones are legs
 * ---------------------------------------------------------------------------
 * The animator's rig already says, for both bodies: `upperleg.l` down to
 * `toes.r` on the dummy, the four `leg-*` nodes on a peep. Read from
 * `ALL_SPECS` by the loaded node name - the one three.js writes into a track -
 * so the cut and the panel that draws bone groups can never disagree.
 */

/** Appended to a gait clip's name for its legs-only half. */
export const LEGS = '/legs'
/** Appended to the dance's name for its everything-else half. */
export const UPPER = '/upper'

/** Whether a track drives a leg bone, on either rig. */
export function isLegTrack(trackName: string): boolean {
  try {
    const { nodeName } = THREE.PropertyBinding.parseTrackName(trackName)
    return ALL_SPECS[nodeName]?.group === 'legs'
  } catch {
    // A name three.js cannot parse drives nothing, so it is not a leg.
    return false
  }
}

function half(
  clip: THREE.AnimationClip,
  suffix: string,
  keep: (track: THREE.KeyframeTrack) => boolean,
): THREE.AnimationClip {
  return new THREE.AnimationClip(
    clip.name + suffix,
    clip.duration,
    clip.tracks.filter(keep),
    clip.blendMode,
  )
}

/**
 * The legs of each gait and the rest of the dance, as clips of their own.
 *
 * Returned as a list to be appended to what a body already plays, under names
 * the renderer can look up (`Walking_A/legs`, `Cheering/upper`) - so they join
 * the mixer once, beside the whole clips, and never cost a rebuild of the
 * action set. See the note on `useAnimations` in `SkinModel`.
 */
export function splitForFeet(
  gaits: readonly THREE.AnimationClip[],
  dance: THREE.AnimationClip | undefined,
): THREE.AnimationClip[] {
  const parts = gaits.map((gait) => half(gait, LEGS, (track) => isLegTrack(track.name)))
  if (dance) parts.push(half(dance, UPPER, (track) => !isLegTrack(track.name)))
  return parts
}
