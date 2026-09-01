'use client'

import { useAnimations, useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { lead } from '@/app/world/lounge/_canvas/lead'
import { type AvatarClip, avatarUrl } from '@/domain/lounge/avatars'

type AvatarModelProps = {
  model: string
  clip?: AvatarClip
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
  pose = null,
  fade = 0.2,
  ignoreRay = false,
  rim = null,
}: AvatarModelProps) {
  const { scene, animations } = useGLTF(avatarUrl(model))

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
   * The rim, applied to this clone's materials and taken off again.
   *
   * `scene.clone(true)` shares materials with every other clone of the same
   * animal - that is what makes a room of six pandas cheap - so the first thing
   * this does is give *this* body its own copies. Without that, one person
   * lighting up would light up everybody who picked the same animal, in their
   * colour.
   *
   * The originals are kept so switching the party off puts the shared materials
   * back rather than leaving a cloned set behind per body per toggle.
   */
  useEffect(() => {
    if (!rim) return

    const restore: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = []

    cloned.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return

      const source = mesh.material
      if (Array.isArray(source)) return

      const material = source.clone()
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uRimColour = { value: rim }

        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>\nuniform vec3 uRimColour;`,
          )
          /**
           * Added at the very end, after tone mapping and colour space, so the
           * edge stays the neon it was asked for instead of being rolled back
           * toward white by the tone mapper - which is exactly what "cyber
           * neon" must not happen to.
           *
           * `vViewPosition` is the fragment-to-camera vector every lit material
           * in three declares; the dot of it with the normal is one at the
           * centre of a surface facing you and zero at its edge, so one minus
           * that, raised to a power, is a band that hugs the silhouette.
           */
          .replace(
            '#include <dithering_fragment>',
            `#include <dithering_fragment>
  float rimFacing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
  float rimBand = pow(1.0 - rimFacing, 2.4);
  gl_FragColor.rgb += uRimColour * rimBand * 1.6;`,
          )
      }
      material.needsUpdate = true

      restore.push({ mesh, material: source })
      mesh.material = material
    })

    return () => {
      for (const entry of restore) {
        const worn = entry.mesh.material
        entry.mesh.material = entry.material
        if (!Array.isArray(worn)) worn.dispose()
      }
    }
  }, [cloned, rim])

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

  useEffect(() => {
    // The gait, the pose, or both. See the same block in `SkinModel`, which
    // explains why a clip that leaves part of the body alone is a layer.
    const layered = pose?.blendMode === THREE.AdditiveAnimationBlendMode
    const gait = !pose || layered ? actions[clip] : null

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
  }, [actions, clip, fade, mixer, pose])

  return (
    <group ref={group}>
      <primitive object={cloned} />
    </group>
  )
}
