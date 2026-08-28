'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { entityBox, worldTransform, type Blueprint, type EntityWorld } from '@kxb/xp/engine'
import type { Hurt } from '@/app/xp/_runtime/match/hurt'

/**
 * A bar over anything you have hit.
 *
 * The feedback that was missing: a crate with `hp` took damage and the only
 * visible event was the moment it broke, so "I am hitting this" and "I am
 * hitting a wall" looked identical — and on every other screen it looked like
 * an untouched box, because damage did not cross the wire either.
 *
 * ---------------------------------------------------------------------------
 * The sibling of ./health-bars, and not the same component
 * ---------------------------------------------------------------------------
 * That one draws bars over *people*: keyed by account id, placed from the crowd
 * buffer's interpolated samples, driven by the arbiter's health map. This draws
 * bars over *things*: keyed by entity id, placed from the entity world's own
 * transform, driven by the props in it.
 *
 * They look the same on screen and share nothing underneath, which is why they
 * are two files rather than one with a mode. The one thing deliberately copied
 * is the geometry and the two colours — a bar that meant health in one place and
 * something else in another would be worse than either.
 *
 * ---------------------------------------------------------------------------
 * Above the thing, by the thing's own size
 * ---------------------------------------------------------------------------
 * `health-bars` takes a `top` because every body is the same height. These are
 * not: a barrel and a wall want the bar in different places, and one number
 * would sit inside the big things and float over the small ones. So the height
 * comes from the entity's own box.
 */

const WIDTH = 0.5
const HEIGHT = 0.07
const EDGE = 0.025
/** Clear of the model rather than touching it, so a full box does not clip. */
const LIFT = 0.25

const FULL = new THREE.Color('#4ade80')
const GONE = new THREE.Color('#ef4444')

export function HurtBars({
  hurt,
  world,
  blueprints,
}: {
  /** Who to draw and how much is left. See ./hurt. */
  hurt: readonly Hurt[]
  /**
   * The live world, as a ref: a thing being pushed moves every frame and the
   * list of hurt things changes about once a hit.
   */
  world: { readonly current: EntityWorld | null }
  blueprints: Readonly<Record<string, Blueprint>>
}) {
  const camera = useThree((state) => state.camera)
  const groups = useRef<Map<number, THREE.Group>>(new Map())

  const geometry = useMemo(
    () => ({
      plate: new THREE.PlaneGeometry(WIDTH + EDGE, HEIGHT + EDGE),
      fill: new THREE.PlaneGeometry(WIDTH, HEIGHT),
    }),
    [],
  )

  useFrame(() => {
    const live = world.current
    for (const [id, node] of groups.current) {
      /**
       * A thing that has stopped existing is hidden rather than left where it
       * was. The list is a frame behind the world by construction — it is
       * computed once and then the frame runs — so the entity a bar belongs to
       * can die between the two.
       */
      if (!live || !live.alive.has(id)) {
        node.visible = false
        continue
      }

      const at = worldTransform(live, id, blueprints)
      const blueprint = blueprints[live.blueprint.get(id) ?? '']
      /**
       * The top of the thing's own box, not a fixed height.
       *
       * `health-bars` takes one number because every body is the same size.
       * These are not: one number would sit inside a wall and float over a
       * coin. The box is already in world units and already accounts for the
       * scale, so its own ceiling is the answer.
       */
      const box = blueprint ? entityBox(blueprint, at, at.rotation, at.scale) : null
      node.visible = true
      node.position.set(at.x, (box?.maxY ?? at.y + 1) + LIFT, at.z)
      // Square to the camera, roll and all: a bar is a label rather than a thing
      // in the world, and one that kept its own facing would be edge-on half the
      // time. Same reason ./health-bars does it.
      node.quaternion.copy(camera.quaternion)
    }
  })

  return (
    <>
      {hurt.map((one) => (
        <group
          key={one.id}
          ref={(node) => {
            if (node) groups.current.set(one.id, node)
            else groups.current.delete(one.id)
          }}
          visible={false}
        >
          <mesh geometry={geometry.plate} renderOrder={6} raycast={() => null}>
            <meshBasicMaterial
              color="#0b0d12"
              transparent
              opacity={0.6}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
          {/*
            Drained from the right, which is why the scale carries an offset: a
            plane scales about its own centre, so scaling alone would shrink the
            bar towards the middle from both ends and lose the one thing a bar is
            for — a left edge that does not move.
          */}
          <mesh
            geometry={geometry.fill}
            renderOrder={7}
            raycast={() => null}
            scale={[Math.max(one.left, 0.001), 1, 1]}
            position={[-(WIDTH * (1 - one.left)) / 2, 0, 0.001]}
          >
            <meshBasicMaterial
              color={FULL.clone().lerp(GONE, 1 - one.left)}
              transparent
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </>
  )
}
