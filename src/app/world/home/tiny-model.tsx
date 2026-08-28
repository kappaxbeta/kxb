'use client'

import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import {
  depthOf,
  type HomeProp,
  type HomeExtra,
  modelUrl,
  widthOf,
} from '@/domain/home/catalog'
import { drawOffset } from '@/domain/home/game'

/**
 * One model out of the Tiny Treats pack.
 *
 * Cloned for the same reason the lounge clones avatars and the café clones
 * counters: `useGLTF` hands back one cached `Object3D` per URL, and a single
 * object cannot be in two places in the scene graph. Without this, a house with
 * four pot plants would show one plant teleporting between four squares.
 *
 * The pack is static geometry with no skinning and no animation, so a shallow
 * `clone(true)` is the whole story.
 */
export function TinyModel({
  model,
  ghost = false,
}: {
  model: string
  /** Draw it translucent, for the decorate-mode preview. */
  ghost?: boolean
}) {
  const { scene } = useGLTF(modelUrl(model))

  const object = useMemo(() => {
    const copy = scene.clone(true)
    if (!ghost) return copy

    /**
     * Ghosting has to clone the *material* as well as the object.
     *
     * Materials are shared across every clone of a model, so setting
     * `transparent` on the preview's material would fade every sofa already in
     * the house. This is the one place the shallow clone is not enough.
     */
    copy.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return
      const source = node.material as THREE.Material
      const faded = source.clone()
      faded.transparent = true
      faded.opacity = 0.5
      faded.depthWrite = false
      node.material = faded
    })
    return copy
  }, [scene, ghost])

  return <primitive object={object} />
}

/**
 * A catalogue entry drawn whole: its model, its extras, and the shove that puts
 * it where it belongs inside its footprint.
 *
 * The offset is applied inside the caller's rotation, in the prop's own space,
 * so it slides along whichever way the thing is facing without this component
 * having to know what that direction came out as.
 */
export function HomePropModel({
  def,
  ghost = false,
}: {
  def: HomeProp
  ghost?: boolean
}) {
  const offset = drawOffset(def)

  return (
    <group position={[offset.x, 0, offset.z]}>
      <TinyModel model={def.model} ghost={ghost} />
      {def.extras?.map((extra, index) => (
        <ExtraModel key={index} extra={extra} ghost={ghost} />
      ))}
    </group>
  )
}

function ExtraModel({ extra, ghost }: { extra: HomeExtra; ghost?: boolean }) {
  return (
    <group
      position={[extra.x ?? 0, extra.y ?? 0, extra.z ?? 0]}
      rotation={[0, extra.rotY ?? 0, 0]}
    >
      <TinyModel model={extra.model} ghost={ghost} />
    </group>
  )
}

/** Squares a prop covers, for anything that needs to draw a footprint. */
export function footprintOf(def: HomeProp): number {
  return depthOf(def) * widthOf(def)
}

/** Warm the cache for the things on screen from the first frame. */
export function preloadTiny(models: string[]): void {
  for (const model of models) useGLTF.preload(modelUrl(model))
}
