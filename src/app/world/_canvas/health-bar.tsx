'use client'

import { Billboard } from '@react-three/drei'
import { useRef } from 'react'
import type * as THREE from 'three'
import { MAX_HEALTH } from '@/app/world/lounge/_sim/combat'

/**
 * What somebody has left, floating over their head.
 *
 * Lived inside `<RemoteAvatar>` until the demo's hosts became things you can
 * knock down. Two bodies in the same room drawing two different bars - one for
 * a person, one for a host - would be two answers to "how close is that to
 * going down", and the point of a bar is that the answer is the same shape
 * wherever it is asked.
 *
 * Driven through refs rather than props, which is the whole reason it is shaped
 * like this: health changes on a damage packet or a punch, several times a
 * second, and re-rendering an avatar to move a scale is a React render in the
 * middle of the one moment the frame rate is most visible. The owner holds a
 * `HealthBarRefs`, hands it here once, and calls `showHealth` from its own
 * frame loop.
 */

/** Clear of the tallest animal in the pack, so the bar never sits in a face. */
export const HEALTH_BAR_HEIGHT = 2.4
export const HEALTH_BAR_WIDTH = 1.2

/** How thick the track is, in world units. */
const HEALTH_BAR_THICKNESS = 0.12

export interface HealthBarRefs {
  group: React.RefObject<THREE.Group | null>
  fill: React.RefObject<THREE.Group | null>
  material: React.RefObject<THREE.MeshBasicMaterial | null>
}

/** Allocate the three refs one bar needs. */
export function useHealthBar(): HealthBarRefs {
  const group = useRef<THREE.Group>(null)
  const fill = useRef<THREE.Group>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  return { group, fill, material }
}

/**
 * Point the bar at a number. Call it every frame; it is three writes.
 *
 * Hidden at full health, because a room of full bars is noise - the bar
 * appearing is itself the thing that says "this is a fight now".
 */
export function showHealth(refs: HealthBarRefs, health: number) {
  const { group, fill, material } = refs
  if (!group.current || !fill.current || !material.current) return

  group.current.visible = health < MAX_HEALTH
  const fraction = Math.max(0, Math.min(1, health / MAX_HEALTH))
  fill.current.scale.x = fraction
  material.current.color.set(
    fraction > 0.5 ? '#4ade80' : fraction > 0.25 ? '#fbbf24' : '#ef4444',
  )
}

/**
 * The bar itself. Spread the owner's `HealthBarRefs` into it - `<HealthBar
 * {...bar} />` - rather than passing the bag as one prop: reading `bag.group`
 * in JSX is a ref access during render as far as the lint rule is concerned,
 * and it is right that the general shape is worth flagging.
 */
export function HealthBar({ group, fill, material }: HealthBarRefs) {
  return (
    <group ref={group} position={[0, HEALTH_BAR_HEIGHT, 0]} visible={false}>
      <Billboard>
        {/* The empty track. `depthTest` off so a bar is never swallowed by the
            block somebody is standing behind - knowing how close they are to
            going down matters more than strict occlusion. */}
        <mesh userData={{ ignoreRay: true }} renderOrder={10}>
          <planeGeometry args={[HEALTH_BAR_WIDTH, HEALTH_BAR_THICKNESS]} />
          <meshBasicMaterial color="#1e1b4b" transparent opacity={0.75} depthTest={false} />
        </mesh>

        {/*
          The fill, scaled from its left edge.

          Two nested groups rather than one scaled mesh: scaling a centred plane
          shrinks it toward the middle, so a half-full bar would float with a
          gap on both sides. Offsetting the outer group by half the width puts
          the scale origin on the left end, which is where a health bar drains
          from.
        */}
        <group position={[-HEALTH_BAR_WIDTH / 2, 0, 0.001]}>
          <group ref={fill}>
            <mesh
              position={[HEALTH_BAR_WIDTH / 2, 0, 0]}
              userData={{ ignoreRay: true }}
              renderOrder={11}
            >
              <planeGeometry args={[HEALTH_BAR_WIDTH, HEALTH_BAR_THICKNESS]} />
              <meshBasicMaterial ref={material} color="#4ade80" depthTest={false} />
            </mesh>
          </group>
        </group>
      </Billboard>
    </group>
  )
}
