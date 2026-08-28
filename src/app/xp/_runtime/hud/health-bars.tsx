'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Crowd } from '@kxb/xp/engine'
import type { Bar } from '@/app/xp/_runtime/match/vitals'

/**
 * How much is left of everybody you can shoot, over the body it belongs to.
 *
 * Reported as "we should show the health bar, for the enemy": you could empty a
 * magazine into somebody and the only feedback was the kill that either came or
 * did not. Four hits and three hits looked exactly the same.
 *
 * ---------------------------------------------------------------------------
 * Over the body rather than in a corner
 * ---------------------------------------------------------------------------
 * The question a player is asking is *"is this one nearly down"*, and it is
 * asked while looking down a barrel at them. A HUD row would answer it about
 * whoever was hit last, which is a different question in any fight involving
 * three people, and it would put the answer somewhere the eye is not.
 *
 * ---------------------------------------------------------------------------
 * It is occluded, and that is the point
 * ---------------------------------------------------------------------------
 * The team rings under people are drawn *through* the floor (`depthTest: false`
 * in ./rings), because knowing which side somebody is on is worth more than
 * strict occlusion. A health bar is the opposite case: drawn through a wall it
 * would report where somebody is hiding and how hurt they are, which is a piece
 * of information nobody earned by aiming at them. So it obeys the depth buffer
 * exactly as the body does, and a bar you can see is a body you could have hit.
 *
 * ---------------------------------------------------------------------------
 * Nothing here decides anything
 * ---------------------------------------------------------------------------
 * The numbers are the arbiter's, joined and clamped by ./vitals; the positions
 * are the same interpolated buffer the bodies are drawn from, so a bar cannot
 * drift away from the person it is about. This file owns the geometry and
 * nothing else.
 */

/** Wide enough to read across a room, narrow enough not to be a placard. */
const WIDTH = 0.62
const HEIGHT = 0.085
/** The dark plate behind it, so an empty bar is still a shape. */
const EDGE = 0.03

/** Full and empty. Everything between is a mix of the two. */
const FULL = new THREE.Color('#4ade80')
const GONE = new THREE.Color('#ef4444')

/**
 * The colour of a bar with `left` of it remaining.
 *
 * A blend rather than three bands. A band means a bar that reads as "fine"
 * right up until it reads as "nearly dead", and the number this is standing in
 * for is continuous - one more shot is always a bit more red.
 */
function colourFor(left: number): string {
  return new THREE.Color().lerpColors(GONE, FULL, left).getStyle()
}

export function HealthBars({
  crowd,
  bars,
  top,
}: {
  /**
   * The same buffer the bodies are drawn from, or null before the room is
   * joined. Read rather than subscribed to: a bar moves every frame and the
   * list of bars changes about once a hit.
   */
  crowd: { readonly current: Crowd | null }
  /** Who to draw and how much they have left. See ./vitals. */
  bars: readonly Bar[]
  /**
   * How far above a body's feet the bar hangs, in world units.
   *
   * Handed in because it is the *drawn* height of the avatar times the pack's
   * scale, and this component has never heard of either - the same reason
   * ./skinned takes `lift` rather than working it out.
   */
  top: number
}) {
  const camera = useThree((state) => state.camera)
  const groups = useRef<Map<string, THREE.Group>>(new Map())

  const geometry = useMemo(
    () => ({
      plate: new THREE.PlaneGeometry(WIDTH + EDGE, HEIGHT + EDGE),
      fill: new THREE.PlaneGeometry(WIDTH, HEIGHT),
    }),
    [],
  )

  useFrame(() => {
    const buffer = crowd.current
    const now = performance.now()
    for (const [id, node] of groups.current) {
      const placed = buffer?.at(id, now) ?? null
      /**
       * Somebody the arbiter knows and the room has not placed is hidden.
       *
       * That is not an edge case: the arbiter keeps a row for everybody who ever
       * joined the instance, so a player who closed their tab still has health.
       * A bar for them would hang at the origin over nobody, which reads as a
       * person standing in the middle of the level - the same rule the rings and
       * the bodies already follow.
       */
      node.visible = placed !== null
      if (!placed) continue
      node.position.set(placed.x, placed.y + top, placed.z)
      // Square to the camera, roll and all: a bar is a label rather than a thing
      // in the world, and one that kept its own facing would be edge-on to
      // whoever it is about half the time.
      node.quaternion.copy(camera.quaternion)
    }
  })

  return (
    <>
      {bars.map((bar) => (
        <group
          key={bar.id}
          ref={(node) => {
            if (node) groups.current.set(bar.id, node)
            else groups.current.delete(bar.id)
          }}
          // Hidden until the frame loop has placed it, so nothing appears at the
          // origin for the one frame between mounting and the first sample.
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
            Drained from the right, which is why the scale comes with an offset:
            a plane scales about its own centre, so scaling alone would shrink
            the bar towards the middle from both ends and lose the one thing a
            bar is for - a left edge that does not move.
          */}
          <mesh
            geometry={geometry.fill}
            position={[-(WIDTH * (1 - bar.left)) / 2, 0, 0.001]}
            scale={[bar.left, 1, 1]}
            renderOrder={7}
            raycast={() => null}
          >
            <meshBasicMaterial color={colourFor(bar.left)} depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </>
  )
}
