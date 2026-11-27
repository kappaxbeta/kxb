'use client'

import { useAnimations, useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import type { TellyClip } from '@/app/world/_buddy/telly-model'

/**
 * A Gridbot buddy's body, playing one of the lounge's four gait/idle clips.
 *
 * Unlike `TellyModel`, Gridbot's GLB rig uses capitalized clip names
 * (`Idle`, `Walk`, `Attack`, `Surprise`, `Dance`), authors its `CTRL_*` nodes
 * at `[0, 0, 0]` in the bind pose (relying on the active clip to lift the
 * core, head, eyes, arms, and legs into standing position), stands ~3.26m tall
 * at authored scale, and uses metallic/clearcoat PBR materials that need an
 * environment map to match the studio look.
 */

const GRIDBOT_SCALE = 0.52

const GRIDBOT_CLIP: Record<TellyClip, 'Idle' | 'Walk' | 'Dance'> = {
  idle: 'Idle',
  walk: 'Walk',
  run: 'Walk',
  dance: 'Dance',
}

const GRIDBOT_RATE: Record<TellyClip, number> = {
  idle: 1,
  walk: 1.3,
  run: 2.1,
  dance: 1,
}

const envCache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>()

function gridbotEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const existing = envCache.get(renderer)
  if (existing) return existing
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const target = pmrem.fromScene(room, 0.04)
  room.dispose()
  pmrem.dispose()
  envCache.set(renderer, target.texture)
  return target.texture
}

export function GridbotModel({ model, clip }: { model: string; clip: TellyClip }) {
  const { scene, animations } = useGLTF(model)
  const { gl } = useThree()

  const body = useMemo(() => {
    const copy = scene.clone(true)
    copy.traverse((node) => {
      node.userData.ignoreRay = true
      if ((node as THREE.Mesh).isMesh) node.castShadow = true
    })
    return copy
  }, [scene])

  // Give Gridbot's metallic and clearcoat surfaces an IBL environment map
  // locally without altering the lounge scene's own environment.
  useEffect(() => {
    const envMap = gridbotEnvironment(gl)
    const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
    const clones: THREE.Material[] = []

    const applyEnv = (source: THREE.Material): THREE.Material => {
      const cloned = source.clone()
      if ('envMap' in cloned) {
        ;(cloned as THREE.MeshStandardMaterial).envMap = envMap
        ;(cloned as THREE.MeshStandardMaterial).envMapIntensity = 0.85
        cloned.needsUpdate = true
      }
      clones.push(cloned)
      return cloned
    }

    body.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh || !mesh.material) return
      originals.set(mesh, mesh.material)
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(applyEnv)
        : applyEnv(mesh.material)
    })

    return () => {
      for (const [mesh, original] of originals) mesh.material = original
      for (const material of clones) material.dispose()
    }
  }, [body, gl])

  const group = useRef<THREE.Group>(null)
  const { actions, mixer } = useAnimations(animations, group)
  const playing = useRef<THREE.AnimationAction | null>(null)

  useEffect(() => {
    return () => {
      playing.current = null
    }
  }, [actions])

  useEffect(() => {
    const action = actions[GRIDBOT_CLIP[clip]]
    if (!action) return

    action.setEffectiveTimeScale(GRIDBOT_RATE[clip])

    const current = playing.current
    if (current === action) {
      if (!action.isRunning()) action.play()
      return
    }

    action.reset().play()
    if (current && current.isRunning()) {
      action.crossFadeFrom(current, 0.2, true)
    } else {
      // Snap on the first pose so Gridbot never renders in its collapsed [0,0,0] bind pose.
      action.setEffectiveWeight(1)
      mixer.update(0)
    }
    playing.current = action
  }, [actions, clip, mixer])

  return (
    <group ref={group} scale={GRIDBOT_SCALE}>
      <primitive object={body} />
    </group>
  )
}
