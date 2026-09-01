'use client'

import * as THREE from 'three'
import { type BakedClip, rootMoves } from '@/domain/animator/clip'
import { ALL_SPECS, groupsIn, isPartial, ROOT_BONE } from '@/domain/animator/rig'

/**
 * A stored clip, as something a mixer can play.
 *
 * Moved out of the animator's exporter, which was its only caller until a
 * *world* wanted one: the same numbers that go into a `.glb` are the numbers a
 * body in the lounge binds, and having two builders of one object is how the
 * downloaded clip and the played clip start disagreeing about the root.
 *
 * Here rather than in `@/domain/animator/clip` beside `bake`, because this is
 * the one step that needs three.js. The document half is arithmetic on plain
 * numbers and stays that way - which is what lets it be tested without a
 * renderer and shipped to a server that has none.
 */
export function toClip(baked: BakedClip): THREE.AnimationClip {
  const times = new Float32Array(baked.times)
  const tracks: THREE.KeyframeTrack[] = []

  for (const name of Object.keys(baked.bones)) {
    tracks.push(
      new THREE.QuaternionKeyframeTrack(
        `${name}.quaternion`,
        times,
        new Float32Array(baked.bones[name]),
      ),
    )
  }

  // Only when it goes somewhere. A clip that pins the root at the origin every
  // frame is a clip that cannot be placed anywhere by whatever plays it.
  if (rootMoves(baked)) {
    tracks.push(
      new THREE.VectorKeyframeTrack(
        `${ROOT_BONE}.position`,
        times,
        new Float32Array(baked.root),
      ),
    )
  }

  const clip = new THREE.AnimationClip(baked.name || 'clip', baked.duration, tracks)

  /**
   * A clip that leaves part of the body alone plays *over* the gait.
   *
   * Additive: what the mixer adds is the *difference* from a reference pose,
   * per bone, so a wave lifts the arm from wherever the walk has it rather
   * than snapping it to where the wave was keyed. Without this a wave stops
   * the walk - two actions crossfading is one action winning, and somebody
   * waving while crossing the room would stand still to do it.
   *
   * See `isPartial`, and note the decision is read off the tracks rather than
   * off a switch: a clip with no leg tracks cannot drive the legs whatever
   * anybody ticked.
   *
   * -------------------------------------------------------------------------
   * What the difference is measured *from*, and why it used to be wrong
   * -------------------------------------------------------------------------
   * `makeClipAdditive` defaults to subtracting the clip's own first frame, and
   * this used to take that default on the reasoning that frame one is the rest
   * pose "because that is what the editor opens on". That is an assumption
   * about how somebody authored a clip rather than anything the format
   * guarantees, and it is false for the ordinary case of posing a bone at
   * frame one and holding it: the roll is then subtracted out of every frame
   * and the clip plays with no roll in it at all. Reported as exactly that - a
   * held roll going missing in the lounge - and only for the clips that layer,
   * because a whole-body clip replaces the gait and is never made additive.
   *
   * So the baker now records the pose it measured from and this subtracts
   * *that*. A clip saved before it did falls back to the old reference rather
   * than to a wrong one: those play as they always have, and re-saving one in
   * the animator is what gives it the honest reference.
   */
  if (isPartial(groupsIn(Object.keys(baked.bones), ALL_SPECS))) {
    const reference = restClip(baked)
    if (reference) THREE.AnimationUtils.makeClipAdditive(clip, 0, reference)
    else THREE.AnimationUtils.makeClipAdditive(clip)
    clip.blendMode = THREE.AdditiveAnimationBlendMode
  }

  return clip
}


/**
 * The rest pose as a one-frame clip, to subtract from an additive one.
 *
 * Every track the target has, or nothing at all: `makeClipAdditive` walks the
 * *reference's* tracks and leaves any target track it cannot match alone, so a
 * partial reference would make some bones relative and leave the rest absolute
 * - a body half-additive, which is worse than either. Null when the clip
 * carries no rest, and the caller then keeps the old behaviour.
 */
function restClip(baked: BakedClip): THREE.AnimationClip | null {
  const rest = baked.rest
  if (!rest) return null

  const tracks: THREE.KeyframeTrack[] = []
  const at = new Float32Array([0])

  for (const name of Object.keys(baked.bones)) {
    const value = rest.bones[name]
    if (!value || value.length !== 4) return null
    tracks.push(
      new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, at, new Float32Array(value)),
    )
  }

  // The root moves by translation rather than rotation, and only when the clip
  // says so - see `rootMoves`. Matched here so a hop that layers is measured
  // from where the body stands rather than from its own first frame.
  if (baked.root.length >= 3 && rest.root.length === 3) {
    tracks.push(
      new THREE.VectorKeyframeTrack(`${ROOT_BONE}.position`, at, new Float32Array(rest.root)),
    )
  }

  return new THREE.AnimationClip('rest', 0, tracks)
}

/**
 * A clip as a mirror should play it: over the gait wherever that is possible.
 *
 * ---------------------------------------------------------------------------
 * The problem this exists to fix
 * ---------------------------------------------------------------------------
 * `toClip` decides layering from what the tracks touch, and the rule is right
 * about *rooms*: a clip that drives all three parts of a body is a sit-down, and
 * a sit-down has to replace the walk or somebody sits down while striding.
 *
 * It is wrong about a mirror. A clip keyed in the pose editor very often ends up
 * touching all three - dragging a hand solves up the arm, nudging the hips moves
 * the root, and one stray leg key is enough - so most authored clips came back
 * whole-body, and a whole-body clip switches the gait off. The four chips under
 * the body then did nothing at all while a clip played, which is what "the
 * mixing with dance and walk is not working" is: not a bad blend, an absent one.
 *
 * ---------------------------------------------------------------------------
 * The arms, and nothing else
 * ---------------------------------------------------------------------------
 * So a clip that would replace the gait is cut down to its arm tracks and
 * layered instead. Arms because that is the half of a body a gait does not
 * claim: legs are the walk, the root is where the walk puts you, and the two
 * fighting over either is the thing that reads as broken. What survives is the
 * part somebody keyed on purpose - a wave is arms - playing over a walk, a run
 * or a dance without arguing with any of them.
 *
 * A clip that already layers is returned untouched, torso tracks and all: it was
 * authored as something that plays over a gait and there is nothing to fix. And
 * a clip with no arm tracks has nothing to cut down to, so it replaces the gait
 * as before. That is every peep clip, which is correct rather than a gap: an
 * animal has four legs, a body and a tail, and no arms group at all - so a peep
 * can never reach three parts, and its clips were already layering.
 *
 * Only a *mirror* wants this. The lounge builds its clips with `toClip` and must
 * keep doing so, because sitting in a chair is exactly the whole-body clip whose
 * point is to stop the walk. See `BodyStage`.
 */
export function toLayered(baked: BakedClip): THREE.AnimationClip {
  const whole = toClip(baked)
  if (whole.blendMode === THREE.AdditiveAnimationBlendMode) return whole

  const arms = Object.keys(baked.bones).filter((bone) => ALL_SPECS[bone]?.group === 'arms')
  if (arms.length === 0) return whole

  return toClip({
    ...baked,
    bones: Object.fromEntries(arms.map((bone) => [bone, baked.bones[bone]])),
    /*
      Pinned, so the layer cannot move the body.
      
      `toClip` only writes a root track when the samples actually go somewhere,
      so zeroing them is how a layer says "the walk decides where I am" - and it
      says it in the one vocabulary the builder already reads. Left alone, a clip
      keyed with a hop in it would add that hop on top of every stride.
    */
    root: baked.root.map(() => 0),
  })
}
