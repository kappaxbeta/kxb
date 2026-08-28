'use client'

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { AuroraSky } from '@/app/components/canyon/aurora-sky'
import { Canyon } from '@/app/components/canyon/canyon-blocks'
import { GridRoad } from '@/app/components/canyon/grid-road'
import { useMediaQuery } from '@/app/world/lounge/_hud/touch-controls'


/**
 * A canyon of black glass with an aurora falling into the end of it.
 *
 * Scenery, not a world: nobody walks here, nothing is loaded from a document
 * and there is no server on the other end of it. It is one picture, drawn from
 * one spot, and everything in it is either a box or a plane. Four files:
 * ./aurora-glsl is the sky as a function, ./aurora-sky hangs it across the gap,
 * ./canyon-blocks piles up the rock, ./grid-road lays the floor and reflects
 * the first one in it.
 *
 * The whole thing is unlit. There is no lamp in the scene and no material here
 * asks for one - a canyon at night is lit by the sky at the end of it, so the
 * shaders compute that directly and skip the diffuse term entirely. That is
 * also why it costs so little: no shadow map, no light loop, no textures, two
 * draw calls for the rock and one each for the sky and the floor.
 */

/**
 * The colour distance dissolves into.
 *
 * Not the app's own `SKY`, which is very nearly black. This corridor is full of
 * light and its far end should be full of haze, so the fog is a lifted violet -
 * dark enough that a wall two hundred metres off is a silhouette, light enough
 * that it is a silhouette against something.
 */
const HAZE = '#160b30'

/** Where you stand: low, in the middle of the road, looking down it. */
const EYE: [number, number, number] = [0, 4, 34]
/**
 * And what you are looking at: the gap, well above the horizon.
 *
 * About eleven degrees up, which is the one framing decision the whole picture
 * turns on. Level with the road, the walls run to a vanishing point in the
 * middle of the frame and the thing reads as a street. Tilted up, the horizon
 * drops to the bottom third, the walls lean in over you and the aurora gets the
 * top two thirds to fall through - which is the difference between a corridor
 * and a canyon.
 */
const GAZE = new THREE.Vector3(0, 42, -200)

/**
 * The camera's small life.
 *
 * A slow rise and fall, and a lean toward wherever the pointer is. Both are
 * tiny on purpose - a degree or two - because the picture is symmetrical and
 * the symmetry is what makes it read as a corridor. Move the camera any real
 * distance off the centre line and it becomes a photograph of some buildings.
 *
 * The pointer is followed on `window` rather than on the canvas: the scene is
 * usually behind something, and a parallax that stops the moment you touch the
 * card in front of it is worse than none.
 */
function CameraDrift({ still }: { still: boolean }) {
  const camera = useThree((state) => state.camera)
  const lean = useRef({ x: 0, y: 0, toX: 0, toY: 0 })

  useEffect(() => {
    if (still) return

    const follow = (event: PointerEvent) => {
      lean.current.toX = (event.clientX / window.innerWidth) * 2 - 1
      lean.current.toY = (event.clientY / window.innerHeight) * 2 - 1
    }

    window.addEventListener('pointermove', follow, { passive: true })
    return () => window.removeEventListener('pointermove', follow)
  }, [still])

  useFrame((state, delta) => {
    const drift = lean.current
    // Eased rather than followed, so a flick of the mouse is a lean and not a
    // jolt. Frame-rate independent: the same constant at 30fps and at 144.
    const ease = 1 - Math.pow(0.001, delta)
    drift.x += (drift.toX - drift.x) * ease
    drift.y += (drift.toY - drift.y) * ease

    const breath = still ? 0 : Math.sin(state.clock.elapsedTime * 0.35) * 0.7

    camera.position.set(EYE[0] + drift.x * 2.2, EYE[1] + breath - drift.y * 1.4, EYE[2])
    camera.lookAt(GAZE)
  })

  return null
}

/**
 * The scene, and the canvas it lives in.
 *
 * Absolutely positioned to fill its parent rather than the viewport, so the
 * same component can be a page and a page's background. Nothing in it is
 * interactive, so it takes no pointer events at all - the lean above listens on
 * the window, which means anything sitting on top of this keeps its own clicks.
 */
export function CanyonScene() {
  // Held still rather than switched off for anybody who has asked for less
  // motion: a frozen aurora is still an aurora, and an unmounted one is a
  // black rectangle where the page's art used to be.
  const still = useMediaQuery('(prefers-reduced-motion: reduce)')

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      <Canvas
        camera={{ position: EYE, fov: 62, near: 0.5, far: 900 }}
        // Capped rather than uncapped: this is fill-rate bound like every other
        // scene in the app, and a retina panel at full density is four times the
        // fragments for a background.
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        {/* The corridor's haze, in the sky's own colour, so the far end of the
            road dissolves into the backdrop instead of ending at it. */}
        <fogExp2 attach="fog" args={[HAZE, 0.0052]} />
        <CameraDrift still={still} />
        <AuroraSky still={still} />
        <Canyon still={still} />
        <GridRoad still={still} />
      </Canvas>
    </div>
  )
}
