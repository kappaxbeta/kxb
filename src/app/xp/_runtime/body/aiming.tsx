'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * What you are about to act on, and where it would end up.
 *
 * ---------------------------------------------------------------------------
 * Two rings, and they are not the same ring
 * ---------------------------------------------------------------------------
 * A press with a `within` is aimed by standing somewhere, and the board game is
 * the level where that stopped being self-evident: forty identical fields,
 * sixteen pieces, and a cursor that is itself a ring. So the highlight has to
 * say two different things without either being mistaken for the cursor or for
 * the other.
 *
 * **The pick pulses and the destination does not.** The thing under your cursor
 * is a live answer to where you are - it moves as you move, and a pulse is what
 * makes a thing read as *tracking you* rather than as painted on. Where it
 * would go is a fact about the roll, not about your hand, and a second pulsing
 * ring beside the first would read as a second cursor.
 *
 * **And the destination is bigger and thinner.** Same reason a target reticle
 * is not the same shape as the thing it is over: at a glance the eye has to
 * separate "this one" from "to there", and two rings differing only in position
 * make you read the board to work out which is which.
 *
 * ---------------------------------------------------------------------------
 * Drawn through the floor
 * ---------------------------------------------------------------------------
 * `depthTest={false}`, the same decision `rings.tsx` makes about team rings and
 * for the same reason: a highlight that disappears behind the piece it is
 * highlighting is a highlight you cannot rely on, and knowing what you are
 * about to do matters more than strict occlusion.
 */

/** Around a piece: wide enough to clear the cursor's own ring, thin enough not to be it. */
const PICK = { inner: 0.62, outer: 0.74 }

/** Where it would go: wider still, and a hairline. */
const LANDING = { inner: 0.68, outer: 0.76 }

/** A hair above whatever it is over, so it does not fight for the same pixels. */
const HOVER = 0.05

/** How far the pick's ring breathes, and how fast. */
const PULSE = 0.14
const RATE = 3.4

export interface Spot {
  x: number
  y: number
  z: number
}

export function Aiming({ at, to }: { at: Spot | null; to: Spot | null }) {
  const pick = useRef<THREE.Mesh>(null)

  const rings = useMemo(
    () => ({
      pick: new THREE.RingGeometry(PICK.inner, PICK.outer, 48),
      landing: new THREE.RingGeometry(LANDING.inner, LANDING.outer, 48),
    }),
    [],
  )

  /**
   * The pulse, on the mesh rather than in React.
   *
   * Sixty state updates a second to breathe a ring would re-render the scene
   * sixty times a second, which is the trade every moving thing in this folder
   * makes the same way.
   */
  useFrame(({ clock }) => {
    const node = pick.current
    if (!node) return
    const beat = 1 + Math.sin(clock.elapsedTime * RATE) * PULSE
    node.scale.set(beat, beat, 1)
  })

  return (
    <>
      {at ? (
        <mesh
          ref={pick}
          geometry={rings.pick}
          position={[at.x, at.y + HOVER, at.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={3}
        >
          <meshBasicMaterial
            color="#fde68a"
            transparent
            opacity={0.95}
            depthTest={false}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ) : null}

      {to ? (
        <mesh
          geometry={rings.landing}
          position={[to.x, to.y + HOVER, to.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          renderOrder={3}
        >
          <meshBasicMaterial
            color="#fde68a"
            transparent
            // Dimmer than the pick: it is where the piece *would* go, and a
            // destination as bright as the thing you are holding reads as two
            // things selected.
            opacity={0.55}
            depthTest={false}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ) : null}
    </>
  )
}
