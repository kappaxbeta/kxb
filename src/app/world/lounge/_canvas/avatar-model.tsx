'use client'

import { useAnimations, useGLTF } from '@react-three/drei'
import { type RefObject, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { type GlitchUniforms, wear } from '@/app/world/_canvas/body-shader'
import { LEGS, splitForFeet, UPPER } from '@/app/world/lounge/_canvas/feet'
import { lead } from '@/app/world/lounge/_canvas/lead'
import { AVATAR_CLIPS, type AvatarClip, avatarUrl, type Gait } from '@/domain/lounge/avatars'

type AvatarModelProps = {
  model: string
  clip?: AvatarClip
  /** What the legs do while `clip` is the dance. See `BodyModel.feet`. */
  feet?: Gait
  /** A clip the space made, ready to play. See `BodyModel`. */
  pose?: THREE.AnimationClip | null
  /** Seconds to cross-fade when the clip changes. Zero snaps. */
  fade?: number
  /**
   * Hide from the crosshair raycast. Needed wherever the model can end up
   * between the camera and the world - otherwise you target your own back
   * instead of the block behind it.
   */
  ignoreRay?: boolean
  /**
   * A neon edge around the silhouette, in this colour. Null is off.
   *
   * Party mode's outline, and it is on the body's *own* material rather than
   * on a second copy of the mesh. The obvious way to draw an outline - clone
   * the model, scale it up a hair, render it back-faces-only - would mean a
   * second animated skeleton per person, and the mixer binds clip tracks by
   * node name, so the copy would either freeze in its bind pose or steal the
   * original's bindings. A Fresnel term costs one extra line in a shader that
   * is already running and follows every frame of the animation for free.
   *
   * Pass one long-lived `THREE.Color` and mutate it to animate: the uniform
   * holds the reference, so the host's rainbow is a `setHSL` a frame rather
   * than a material rebuild. See `usePartyColour`.
   */
  rim?: THREE.Color | null
  /**
   * A bad connection, drawn on the body. Null is a body that is fine.
   *
   * Uniforms rather than a number, for the reason `rim` is a `Color`: the
   * strength and the clock are written by a frame loop, and the material must
   * not be rebuilt for either. A *ref* to them rather than the object, because
   * a frame loop may write into a ref and the compiler's rules say it may not
   * write into anything else it was handed. See `wear` in
   * ../_canvas/body-shader.
   */
  glitch?: RefObject<GlitchUniforms> | null
}

/**
 * Keyed by the model, so choosing a different animal builds a fresh body rather
 * than re-dressing the old one.
 *
 * The mixer binds each clip track to a node by name, once, and caches that
 * binding under the root it was handed. Every animal in the pack names its nodes
 * the same - root, body, leg-back-left - so a mixer that outlived the swap would
 * answer the new animal's `body` track with the *previous* animal's node, which
 * is no longer in the scene: the clip runs, drives a detached object, and the
 * body you can actually see stands stone still. The stable wrapping group is what
 * makes the root - and therefore the cache key - survive the swap, so the cure is
 * to stop the body surviving it. A key per animal gives each its own mixer, bound
 * to its own skeleton and nothing else.
 */
export function AvatarModel(props: AvatarModelProps) {
  return <AvatarBody key={props.model} {...props} />
}

/**
 * One animal, playing one clip.
 *
 * Shared by the settings picker and the lounge so the preview cannot drift from
 * the thing it is previewing - the whole point of a picker is that what you see
 * is what you get.
 *
 * The pack is unskinned: seven nodes per animal, animated by transform rather
 * than by bones. That is why a plain `clone(true)` is enough here, where a
 * skinned model would have needed SkeletonUtils - the clips address nodes by
 * name, and clone preserves names.
 */
function AvatarBody({
  model,
  clip = 'idle',
  feet,
  pose = null,
  fade = 0.2,
  ignoreRay = false,
  rim = null,
  glitch = null,
}: AvatarModelProps) {
  const { scene, animations: whole } = useGLTF(avatarUrl(model))

  /**
   * The animal's clips, and its dance cut at the waist - or rather at the
   * shoulder, since a peep's legs are four nodes and the rest is body and
   * tail. Same cut, same reason, same names as the skinned body: see
   * `splitForFeet`, and `SkinModel` for why the halves ride in this array.
   */
  const animations = useMemo(() => {
    const named = (name: string) => whole.find((one) => one.name === name)
    const gaits = [named(AVATAR_CLIPS.walk), named(AVATAR_CLIPS.run)].filter(
      (one): one is THREE.AnimationClip => one !== undefined,
    )
    return [...whole, ...splitForFeet(gaits, named(AVATAR_CLIPS.dance))]
  }, [whole])

  /**
   * useGLTF caches one scene per URL, and a single Object3D cannot sit in two
   * places in the graph at once. Without the clone, two members who picked the
   * same animal would tear the same mesh back and forth between their positions.
   *
   * The ray flag is stamped on every descendant here rather than on the wrapping
   * group, because three.js does not inherit userData - <Targeting> reads it off
   * whichever mesh the ray actually hit, so the leaves are what has to carry it.
   */
  const cloned = useMemo(() => {
    const copy = scene.clone(true)
    if (ignoreRay) {
      copy.traverse((node) => {
        node.userData.ignoreRay = true
      })
    }
    return copy
  }, [scene, ignoreRay])

  /**
   * The rim and the glitch, applied to this clone's materials and taken off
   * again. Why a body needs its own copies first, and why the two are one
   * patch, is argued in `wear`.
   */
  useEffect(() => wear(cloned, { rim, glitch: glitch?.current ?? null }), [cloned, rim, glitch])

  const group = useRef<THREE.Group>(null)

  /**
   * The pack's clips, plus whatever the space made.
   *
   * Appended rather than substituted, so the gait is still there to fall back
   * to the moment the pose ends - and so the mixer keeps one set of bindings
   * for the body rather than rebuilding them as somebody sits down.
   *
   * A clip keyed on a *person* has bone names an animal has never heard of;
   * three.js binds what it can and ignores the rest, which is why this is safe
   * to hand any clip at all. What it looks like is an animal standing still,
   * which is the honest drawing of "that animation is not for you".
   */
  /**
   * The pack's clips only. The space's is bound by hand below.
   *
   * `useAnimations` rebuilds every action when the array it is handed changes
   * identity, and this array used to gain and lose the space's clip as `pose`
   * came and went - so a clip starting threw the gait away along with
   * everything else, leaving nothing to blend from. See the same block in
   * `SkinModel`, which argues it at length.
   */
  const { actions, mixer } = useAnimations(animations, group)

  /** What is playing now, so the next thing can fade *from* it. */
  const playing = useRef<THREE.AnimationAction | null>(null)

  /** The dance's top half while the feet walk. See the same ref in `SkinModel`. */
  const upperPlaying = useRef<THREE.AnimationAction | null>(null)

  useEffect(() => {
    // The gait, the pose, or both. See the same block in `SkinModel`, which
    // explains why a clip that leaves part of the body alone is a layer.
    const layered = pose?.blendMode === THREE.AdditiveAnimationBlendMode
    const wholeBody = !pose || layered

    // Dancing on the move: legs from the gait, everything else from the dance.
    // The same cut `SkinModel` makes, argued there and in `splitForFeet`.
    const onTheMove = clip === 'dance' && feet !== undefined && wholeBody
    const gait = onTheMove ? actions[feet + LEGS] : wholeBody ? actions[clip] : null
    const upper = onTheMove ? (actions[AVATAR_CLIPS.dance + UPPER] ?? null) : null

    /**
     * The space's own clip, bound here rather than added to the list above.
     *
     * `mixer.clipAction` is exactly what `useAnimations` does internally, so
     * this shares the body's one mixer, one clock and one blend - it is only
     * kept off the array so that the array never changes identity. Bound inside
     * the effect because it needs the group, and a ref may not be read while
     * rendering.
     */
    const root = group.current
    const extra = pose && root ? mixer.clipAction(pose, root) : null

    if (gait) lead(gait, playing, fade)
    if (upperPlaying.current !== upper) {
      upperPlaying.current?.fadeOut(fade)
      if (upper) upper.reset().fadeIn(fade).play()
      upperPlaying.current = upper
    }
    if (extra) {
      // A layer rides on top and never becomes what the next change fades from:
      // a wave ending hands back to the walk that was underneath it.
      if (layered) extra.reset().fadeIn(fade).play()
      else lead(extra, playing, fade)
    }

    // Fading out rather than stopping, so walk -> idle does not snap mid-stride.
    return () => {
      if (layered) extra?.fadeOut(fade)
    }
  }, [actions, clip, fade, feet, mixer, pose])

  return (
    <group ref={group}>
      <primitive object={cloned} />
    </group>
  )
}
