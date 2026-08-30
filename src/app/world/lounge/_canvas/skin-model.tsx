'use client'

import { useAnimations, useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { type AvatarClip } from '@/domain/lounge/avatars'

/**
 * A bought skin, standing in the lounge.
 *
 * ---------------------------------------------------------------------------
 * Why this is a second component and not a branch inside AvatarModel
 * ---------------------------------------------------------------------------
 * The two bodies are different in the one way a renderer cares about. A peep
 * is seven nodes animated by transform, so a plain `clone(true)` is enough and
 * the clips ride inside the animal's own file. A skin is a *skinned* mesh on
 * the dummy's 23-joint rig, which needs `SkeletonUtils.clone` to rebind, and
 * its clips live in a separate pack shared by every character - so the two
 * disagree about how to clone, where clips come from, and what a clip is
 * called. One component doing both would be two components sharing a name.
 *
 * Provenance: the loading half is the lobby's `XpBody`
 * (src/app/tenants/lobby.tsx), which drew the first skinned character outside
 * the XP runtime. The rim and the clip cross-fade are `AvatarModel`'s, next
 * door. This is the copy-do-not-import rule the creator doc sets out for the
 * two engines, applied to a body that has to stand in the lounge's scene while
 * being made of the games' parts.
 */

type SkinModelProps = {
  /** A qualified catalogue id: `adventurers/Knight`. */
  model: string
  clip?: AvatarClip
  fade?: number
  ignoreRay?: boolean
  rim?: THREE.Color | null
}

/**
 * The lounge's four clips, in the rig's vocabulary.
 *
 * The rig has no dance, and `Cheering` is the closest thing it does have -
 * arms up, on the spot, unmistakably pleased - which is what dancing is for
 * here. Better a gesture that reads than a T-pose that does not.
 */
const CLIP_FILES = {
  general: '/xp/packs/animation/Rig_Medium/Rig_Medium_General.glb',
  movement: '/xp/packs/animation/Rig_Medium/Rig_Medium_MovementBasic.glb',
  simulation: '/xp/packs/animation/Rig_Medium/Rig_Medium_Simulation.glb',
} as const

const RIG_CLIP: Record<AvatarClip, string> = {
  idle: 'Idle_A',
  walk: 'Walking_A',
  run: 'Running_A',
  dance: 'Cheering',
}

/**
 * How fast to play each clip, so a skin steps at the cadence the world moves.
 *
 * The two packs disagree, and by a lot. A peep's walk cycle is 0.5s and its
 * run is 0.25s; the rig's are 1.067s and 0.8s - so a Knight played at 1x takes
 * less than half the steps a fox takes to cross the same floor, which is the
 * feet-sliding, stuttering gait this fixes. The clips are in-place (measured:
 * no net root translation over either loop), so cadence is the only thing that
 * ties the animation to the movement, and nothing else can compensate.
 *
 * The peep is the reference rather than a speed in metres, because the peeps
 * are what the lounge has always looked like: matching them makes a skin walk
 * the way everybody in the room already walks, at every speed the world runs
 * at. Idle and the cheer are left alone - neither is tied to going anywhere.
 *
 *   walk  1.067 / 0.5  = 2.13
 *   run   0.8   / 0.25 = 3.2
 */
const CLIP_RATE: Record<AvatarClip, number> = {
  idle: 1,
  walk: 2.13,
  run: 3.2,
  dance: 1,
}

/**
 * How much a skin shrinks to stand beside a peep.
 *
 * `BUILT_IN_BODY_SCALE` from the XP engine, written out rather than imported
 * for the reason at the top: 0.75 puts the dummy's 2.4 units at a person's
 * height, and the peeps are already drawn at theirs. A skin at authored size
 * stands a head taller than everybody it is talking to.
 */
const SKIN_SCALE = 0.75

/**
 * Keyed by the model, for the reason `AvatarModel` gives at length: a mixer
 * caches its bindings under the root it was handed, so a re-dressed body keeps
 * driving the skeleton it no longer has and stands stone still.
 */
export function SkinModel(props: SkinModelProps) {
  return <SkinBody key={props.model} {...props} />
}

function SkinBody({
  model,
  clip = 'idle',
  fade = 0.2,
  ignoreRay = false,
  rim = null,
}: SkinModelProps) {
  /**
   * The catalogue's path scheme is its id - `adventurers/Knight` is that file -
   * so no lookup table is needed, and none is imported.
   */
  const dressed = useGLTF(`/xp/packs/${model}.glb`)

  // Three files, because the rig splits its clips by kind and the lounge wants
  // one from each: idle from the general set, walk and run from movement,
  // cheering from simulation.
  const general = useGLTF(CLIP_FILES.general)
  const movement = useGLTF(CLIP_FILES.movement)
  const simulation = useGLTF(CLIP_FILES.simulation)

  const animations = useMemo(
    () => [...general.animations, ...movement.animations, ...simulation.animations],
    [general.animations, movement.animations, simulation.animations],
  )

  /**
   * `SkeletonUtils.clone`, not `scene.clone(true)`.
   *
   * A skinned mesh holds references to the bones it is weighted to. A plain
   * clone copies the mesh and the bones separately and leaves the copy pointing
   * at the *original's* skeleton, so every body wearing the same skin collapses
   * onto whichever one moved last. This is the difference the file header calls
   * out, and it is the whole reason a peep can get away with the cheaper call.
   */
  const body = useMemo(() => {
    const copy = cloneSkinned(dressed.scene)
    if (ignoreRay) {
      copy.traverse((node) => {
        node.userData.ignoreRay = true
      })
    }
    return copy
  }, [dressed.scene, ignoreRay])

  /**
   * The party rim, on this body's own materials.
   *
   * Same argument and the same shader as `AvatarModel`'s: clones share
   * materials, so without copying first one person lighting up lights up
   * everybody wearing that skin, in their colour.
   */
  useEffect(() => {
    if (!rim) return

    const restore: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = []

    body.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh) return

      const source = mesh.material
      if (Array.isArray(source)) return

      const material = source.clone()
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uRimColour = { value: rim }
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\nuniform vec3 uRimColour;`)
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
  }, [body, rim])

  const group = useRef<THREE.Group>(null)
  const { actions } = useAnimations(animations, group)

  useEffect(() => {
    const action = actions[RIG_CLIP[clip]]
    if (!action) return

    // Set before playing, so the first frame is already at the right cadence
    // rather than stepping once slowly and then catching up.
    action.setEffectiveTimeScale(CLIP_RATE[clip])
    action.reset().fadeIn(fade).play()
    // Fading out rather than stopping, so walk -> idle does not snap mid-stride.
    return () => {
      action.fadeOut(fade)
    }
  }, [actions, clip, fade])

  return (
    <group ref={group} scale={SKIN_SCALE}>
      <primitive object={body} />
    </group>
  )
}
