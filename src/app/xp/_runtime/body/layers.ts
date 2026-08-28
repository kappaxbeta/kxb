import * as THREE from 'three'
import type { SkeletonId } from '@kxb/xp/packs'

/**
 * The upper body, so a punch can happen while the legs keep walking.
 *
 * The thing `./motion` has been promising in a comment since bodies could
 * animate: *"it replaces the whole body rather than blending onto the arms,
 * which is the honest limit of one mixer and one clip - a proper version masks
 * the upper body and leaves the legs running. That is a bigger idea and this is
 * the shape it grows from."* This is that idea.
 *
 * Reported as the symptom it produces: *"mix when u walk and hit, because the
 * legs do t pose"*. A one-shot played on the whole skeleton does not merely
 * fail to walk - the attack clips are authored standing, so their leg tracks
 * hold a body still while it slides across the floor at running pace, which
 * reads as a T-pose being dragged around.
 *
 * ---------------------------------------------------------------------------
 * Two layers, not two mixers
 * ---------------------------------------------------------------------------
 * One `AnimationMixer` per body still, because a mixer owns time and two of
 * them would be two clocks to keep in step. What changes is that the body plays
 * **two actions at once**: a stance on every bone, and a gesture on the bones
 * above the hips.
 *
 * ---------------------------------------------------------------------------
 * Additive, and that is the part worth understanding
 * ---------------------------------------------------------------------------
 * The obvious version - filter the gesture to the arms and play it at full
 * weight - does not do what it sounds like. three.js blends every action bound
 * to a property by weight, so an arm driven by both actions lands halfway
 * between a walk swing and a punch: a body that gestures at half strength and
 * walks with half an arm.
 *
 * So the gesture is made **additive** against its own first frame, and what
 * gets added is the *difference* the animator authored - the wind-up and the
 * swing, as an offset from standing. Added onto a walking arm that is a punch
 * thrown while walking; added onto a still arm it is exactly the original clip,
 * because the still arm is what it was authored over.
 *
 * ---------------------------------------------------------------------------
 * The pure half, for the usual reason
 * ---------------------------------------------------------------------------
 * The Browser pane never fires a frame, so nothing here can be watched. Which
 * tracks survive a mask and whether an additive clip is actually relative to
 * its own rest pose are both questions a function can answer and a screenshot
 * cannot.
 */

/**
 * Every bone at or above the spine, by the names three.js gives them.
 *
 * `GLTFLoader` strips the dots - `upperarm.r` in the file arrives as
 * `upperarmr` - so these are runtime names, the same convention `HANDS` in
 * ./skinned already follows. Kept as its own list rather than derived from
 * `DUMMY_BONES` by group: that table is the *animator's* view, where `hips`
 * sits in the torso group because it is the handle you drag to make a figure
 * crouch. Here the hips are the thing a gesture must not touch, or a punch
 * thrown mid-stride lifts the whole body off its feet.
 */
export const UPPER_BODY: ReadonlySet<string> = new Set([
  'spine',
  'chest',
  'head',
  'upperarml',
  'lowerarml',
  'wristl',
  'handl',
  'upperarmr',
  'lowerarmr',
  'wristr',
  'handr',
  // The slots a weapon hangs from. They are children of the hands and are
  // rarely animated, but a clip that does move one is a clip that means to.
  'handslotl',
  'handslotr',
])

/**
 * The bone a track drives, or null for a track that drives something else.
 *
 * A track is named `<node>.<property>` - `chest.quaternion`, `handr.position` -
 * and a node name can itself contain dots in the general case, so the split is
 * at the **last** one. Morph targets are named `<node>.morphTargetInfluences[i]`
 * and land on the node either way, which is right: a face that belongs to the
 * head is masked with the head.
 */
export function boneOf(trackName: string): string | null {
  const at = trackName.lastIndexOf('.')
  if (at <= 0) return null
  return trackName.slice(0, at)
}

/**
 * A gesture, ready to be laid over a stance.
 *
 * Two steps that have to happen in this order. Masking first, because
 * `makeClipAdditive` walks every track it is given and there is no reason to
 * convert leg tracks that are about to be thrown away. Additive second, against
 * frame zero of the clip itself - the standing pose the animator wound up from,
 * which is exactly the pose the offset should be measured against.
 *
 * Returns null when nothing survives the mask. That is not a defensive
 * flourish: a clip of pure locomotion has no upper-body tracks at all, and an
 * empty action played at full weight is a body that quietly stops being
 * animated. Better to lay nothing over the stance and say so in the type.
 *
 * The clip is cloned, because `makeClipAdditive` **mutates**. Skipping that
 * would convert the shared clip every body in the room is playing, once, on the
 * first punch anybody threw - and every walk after it would be an offset from a
 * pose rather than a walk.
 */
export function gestureOf(
  clip: THREE.AnimationClip,
  rig: SkeletonId = 'dummy',
): THREE.AnimationClip | null {
  return layerOf(clip, rig === 'peepz' ? PEEP_UPPER : UPPER_BODY, 'upper')
}

/**
 * A peep's "upper body": everything that is not a leg.
 *
 * The same idea and a much shorter list, because a peep is six rigid parts. What
 * makes it work is that the pack's two gesture clips - a nod and a shake - are
 * mostly *body* and *tail* anyway: masked to these and made additive they lay
 * over a walk exactly the way a punch lays over the dummy's, and the four legs
 * carry on stepping underneath.
 *
 * The legs are the thing being excluded and the reason is the dummy's reason
 * word for word: they are what carries the animal along, and a gesture that
 * touched them would stop a walking peep mid-stride to nod.
 *
 * All nine names, though no animal has all nine - a fish has no legs to exclude
 * and a bunny no tail to include. A mask is a set test per track, so naming a
 * part the loaded body does not have costs one lookup that misses.
 */
export const PEEP_UPPER: ReadonlySet<string> = new Set([
  'body',
  'tail',
  'wing-left',
  'wing-right',
])

/**
 * The named groups a level can aim a clip at, and the bones in each.
 *
 * The rig's own grouping, written here rather than imported from
 * `domain/animator`: `src/app/xp/` may not reach into it - the creator owns its
 * own renderer, docs/xp-creator.md §1.3 - and the two answers are allowed to
 * differ anyway. The animator panel puts `hips` under the torso because it is
 * the handle you drag to make a figure crouch; here the hips belong to the
 * *legs*, because a clip aimed at somebody's arms must not move where they are
 * standing.
 *
 * Names are what an author types, so they are the words people use rather than
 * the bone names underneath. A part list may also name a bone directly - `handr`
 * - for the case a group is too coarse, which costs nothing: the resolver takes
 * whatever it is given and looks for a group first.
 */
export const BODY_PARTS: Readonly<Record<string, readonly string[]>> = {
  head: ['head'],
  torso: ['spine', 'chest'],
  arms: [
    'upperarml', 'lowerarml', 'wristl', 'handl', 'handslotl',
    'upperarmr', 'lowerarmr', 'wristr', 'handr', 'handslotr',
  ],
  'arm.l': ['upperarml', 'lowerarml', 'wristl', 'handl', 'handslotl'],
  'arm.r': ['upperarmr', 'lowerarmr', 'wristr', 'handr', 'handslotr'],
  legs: ['hips', 'upperlegl', 'lowerlegl', 'footl', 'toesl', 'upperlegr', 'lowerlegr', 'footr', 'toesr'],
  'leg.l': ['upperlegl', 'lowerlegl', 'footl', 'toesl'],
  'leg.r': ['upperlegr', 'lowerlegr', 'footr', 'toesr'],
  upper: [...UPPER_BODY],
}

/**
 * Which bones a part list means.
 *
 * A group name, or a bone name for the case a group is too coarse. An entry
 * matching neither is dropped rather than refused, which is the same contract
 * every other name in this format has: `blueprint.pose` naming a clip nothing
 * loaded plays nothing, and the editor is what stops it happening. A list where
 * *nothing* matched comes back empty, and the caller treats that as "no layer"
 * rather than as "the whole body" - a typo should do nothing, not everything.
 */
export function bonesFor(parts: readonly string[], rig: SkeletonId = 'dummy'): Set<string> {
  const table = rig === 'peepz' ? PEEP_PARTS : BODY_PARTS
  const bones = new Set<string>()
  for (const part of parts) {
    const group = table[part]
    if (group) for (const bone of group) bones.add(bone)
    else bones.add(part)
  }
  return bones
}

/**
 * The same vocabulary for a peep, and it is a different vocabulary.
 *
 * `head`, `arms` and `arm.r` do not mean anything on a fox, and `legs` means
 * four things rather than two. Reusing the dummy's table would have been a
 * `parts: ['arms']` that matched nothing, came back empty, and - per `bonesFor`'s
 * own contract - produced no layer at all: a `runAnimation` with a `parts` list
 * that silently did nothing.
 *
 * `wings` is here even though only four animals have any. A group that resolves
 * to two names the loaded body does not have is a mask that matches no tracks,
 * which `layerOf` already reports as "no layer" - the same answer a bunny gives
 * for `tail`. Naming them costs nothing and leaves the vocabulary the same for
 * all twenty-four, which is what makes a document portable between them.
 */
export const PEEP_PARTS: Readonly<Record<string, readonly string[]>> = {
  body: ['body'],
  tail: ['tail'],
  wings: ['wing-left', 'wing-right'],
  'wing.l': ['wing-left'],
  'wing.r': ['wing-right'],
  legs: ['leg-front-left', 'leg-front-right', 'leg-back-left', 'leg-back-right'],
  front: ['leg-front-left', 'leg-front-right'],
  back: ['leg-back-left', 'leg-back-right'],
  upper: [...PEEP_UPPER],
}

/**
 * A clip masked to some bones and made additive, ready to lay over a stance.
 *
 * The general form of `gestureOf`, and the two steps have to happen in this
 * order. Masking first, because `makeClipAdditive` walks every track it is given
 * and there is no reason to convert tracks that are about to be thrown away.
 * Additive second, against frame zero of the clip itself - the pose the animator
 * wound up from, which is exactly what the offset should be measured against.
 *
 * Returns null when nothing survives the mask: an empty action played at full
 * weight is a body that quietly stops being animated, which is worse than laying
 * nothing over the stance at all.
 *
 * The clip is cloned, because `makeClipAdditive` **mutates**. Skipping that
 * would convert the shared clip every body in the room is playing, once, on the
 * first call anybody made - and every walk after it would be an offset from a
 * pose rather than a walk.
 */
export function layerOf(
  clip: THREE.AnimationClip,
  bones: ReadonlySet<string>,
  label: string,
): THREE.AnimationClip | null {
  if (bones.size === 0) return null
  const tracks = clip.tracks.filter((track) => {
    const bone = boneOf(track.name)
    return bone !== null && bones.has(bone)
  })
  if (tracks.length === 0) return null

  const masked = new THREE.AnimationClip(
    `${clip.name}::${label}`,
    clip.duration,
    tracks.map((track) => track.clone()),
  )
  return THREE.AnimationUtils.makeClipAdditive(masked)
}
