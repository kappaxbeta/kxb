'use client'

import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { useSceneRefs } from '@/app/world/lounge/_scene/scene-refs'

/**
 * Hands the renderer out of the Canvas, and draws nothing.
 *
 * `useThree` is a hook into the R3F context, so the only way to reach the
 * renderer is from inside the tree - and the button that wants it is HUD, which
 * is deliberately outside. One mount-effect writing three references into a ref
 * is the whole bridge; a context or a store for this would be machinery around
 * a single assignment.
 *
 * Takes no props at all now. It used to be handed the ref to fill in, which was
 * one more value threaded through the scene for a component whose entire job is
 * to be inside the Canvas - see ./scene-refs.
 */
export function Shutter() {
  const { shotRef } = useSceneRefs()

  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)

  useEffect(() => {
    shotRef.current = { gl, scene, camera }
    return () => {
      shotRef.current = null
    }
  }, [shotRef, gl, scene, camera])

  return null
}
