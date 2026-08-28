'use client'

import { useGLTF } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import {
  propUrl,
  type PropDef,
  type PropExtra,
} from '@/domain/cafe/catalog'
import { ITEMS, type ItemId } from '@/domain/cafe/recipes'

/**
 * One model out of the restaurant pack.
 *
 * Cloned for the same reason the lounge clones avatars: `useGLTF` hands back one
 * cached `Object3D` per URL, and a single object cannot be in two places in the
 * scene graph. Without this, a café with four counters would show one counter
 * that teleports between the four positions.
 *
 * The pack is static geometry with no skinning and no animation, so a shallow
 * `clone(true)` is the whole story - no SkeletonUtils, no clip retargeting.
 */
export function Model({
  model,
  ghost = false,
}: {
  model: string
  /** Draw it translucent, for the build-mode preview. */
  ghost?: boolean
}) {
  const { scene } = useGLTF(propUrl(model))

  const object = useMemo(() => {
    const copy = scene.clone(true)
    if (!ghost) return copy


    /**
     * Ghosting has to clone the *material* as well as the object.
     *
     * Materials are shared across every clone of a model, so setting
     * `transparent` on the preview's material would fade every counter already
     * in the room. This is the one place the shallow clone is not enough.
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

/** A catalog entry drawn whole: its base model plus any composed extras. */
export function PropModel({
  def,
  ghost = false,
}: {
  def: PropDef
  ghost?: boolean
}) {
  /**
   * The scale wraps the extras too.
   *
   * A shrunk oven with a full-size tray on it is worse than an oven that clips
   * its neighbour, so the composition scales as one object - which also means an
   * extra's offsets stay in the base model's units and do not have to be
   * re-measured every time a `scale` is tweaked.
   */
  return (
    <group scale={def.scale ?? 1}>
      <Model model={def.model} ghost={ghost} />
      {def.extras?.map((extra, index) => (
        <ExtraModel key={index} extra={extra} ghost={ghost} />
      ))}
    </group>
  )
}

function ExtraModel({ extra, ghost }: { extra: PropExtra; ghost?: boolean }) {
  return (
    <group
      position={[extra.x ?? 0, extra.y ?? 0, extra.z ?? 0]}
      rotation={[0, extra.rotY ?? 0, 0]}
      scale={extra.scale ?? 1}
    >
      <Model model={extra.model} ghost={ghost} />
    </group>
  )
}

/**
 * A loose ingredient or dish.
 *
 * Food in this pack is modelled at the size it would really be next to a
 * counter, which is small - a tomato is 0.7 units against a 2-unit square. That
 * reads fine on a worktop and is nearly invisible in the chef's hands, so the
 * caller scales rather than this component guessing.
 */
export function ItemModel({ item }: { item: ItemId }) {
  const def = ITEMS[item]

  if (!def) return null
  return (
    <>
      <Model model={def.model} />
      {/**
       * The toppings on a half-made thing.
       *
       * Only the unbaked pizzas and the cake batter have these, and it is what
       * makes them readable: two raw pizzas are the same dough base, and the
       * only way to tell which oven is about to produce which is the handful of
       * cheese or pepperoni sitting on top.
       */}
      {def.extras?.map((extra, index) => (
        <group
          key={index}
          position={[extra.x ?? 0, extra.y ?? 0, extra.z ?? 0]}
          scale={extra.scale ?? 1}
        >
          <Model model={extra.model} />
        </group>
      ))}
    </>
  )
}

/** Warm the cache for the things that are on screen from the first frame. */
export function preloadProps(models: string[]) {
  for (const model of models) useGLTF.preload(propUrl(model))
}
