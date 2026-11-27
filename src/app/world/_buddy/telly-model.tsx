'use client'

import { useAnimations, useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import type * as THREE from 'three'

export type TellyClip = 'idle' | 'walk' | 'run' | 'dance'

/**
 * A buddy's body - Telly's or Kappa's, the same rig - playing one of four clips.
 *
 * Not `AvatarModel`, though it is built the same way and could almost be fed
 * through it: that one resolves its URL from an avatar id and splits a dance at
 * the waist for a body that walks while dancing, and Telly is neither an id on
 * the roster nor a body anybody steers. What is shared is the reasoning - an
 * unskinned model animated by node transforms, so `clone(true)` is a whole
 * second body (see `AvatarModel` on why the clone is needed at all).
 *
 * Hidden from the crosshair for the reason a peer is: standing between you and
 * the block you are aiming at, he should not be what you hit.
 */
export function TellyModel({ model, clip }: { model: string; clip: TellyClip }) {
  const { scene, animations } = useGLTF(model)

  const body = useMemo(() => {
    const copy = scene.clone(true)
    copy.traverse((node) => {
      node.userData.ignoreRay = true
      if ((node as THREE.Mesh).isMesh) node.castShadow = true
    })
    return copy
  }, [scene])

  const group = useRef<THREE.Group>(null)
  const { actions } = useAnimations(animations, group)

  useEffect(() => {
    const action = actions[clip]
    if (!action) return
    action.reset().fadeIn(0.2).play()
    return () => {
      action.fadeOut(0.2)
    }
  }, [actions, clip])

  return (
    <group ref={group}>
      <primitive object={body} />
    </group>
  )
}
