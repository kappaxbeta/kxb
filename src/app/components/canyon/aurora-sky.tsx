'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { AURORA_GLSL } from '@/app/components/canyon/aurora-glsl'
import { windClock } from '@/app/components/canyon/canyon-blocks'

/**
 * The nebula at the end of the corridor.
 *
 * A flat plane rather than a sky sphere or a cube map, and that is the whole
 * trick of this scene: the camera never leaves the road, so the sky is only
 * ever seen through the gap between the two walls. A backdrop hung across that
 * gap is the same picture as a dome for a tenth of the fragments, and - unlike
 * a dome - it is a *plane*, which is what lets the road reflect it in closed
 * form instead of with a second render pass. See <GridRoad>.
 *
 * Exported because both the road and the scene's framing need its dimensions:
 * the road to aim its mirrored ray at it, the camera to know what it is
 * looking at.
 */
export const BACKDROP = {
  width: 900,
  height: 620,
  /**
   * Centred just above the horizon, which is lower than it sounds.
   *
   * The corridor only shows a wedge of this plane - roughly the middle third
   * across and the bottom half up - so hanging it high puts the brightest part
   * of the fall above the walls, where nobody can see it. This is the one
   * number to move if the aurora ever looks like it is happening somewhere
   * else.
   */
  y: 42,
  z: -244,
}

/**
 * How many metres one unit of the aurora's own coordinates is worth.
 *
 * The sky is defined in world metres rather than in the backdrop's uv, so that
 * the plane can be made bigger - to cover a wider frame, say - without the
 * pattern on it changing size. The road reads the same constant, which is what
 * keeps the reflection registered with the thing it is reflecting.
 */
export const AURORA_SCALE = 110

/**
 * The backdrop's material.
 *
 * `depthWrite` off and drawn first, so it can sit closer than the far plane
 * without ever occluding anything - it is a background, and the only reason it
 * has a position at all is the reflection maths.
 *
 * No fog and no tone mapping. Fog would pull the sky toward the fog colour,
 * which is the sky's own colour, which is a slow way of drawing nothing; tone
 * mapping would take the saturation out of exactly the thing the picture is of.
 */
function createSkyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uScale: { value: AURORA_SCALE },
      uCentre: { value: BACKDROP.y },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uScale;
      uniform float uCentre;

      varying vec3 vWorld;

      ${AURORA_GLSL}

      void main() {
        vec2 place = vec2(vWorld.x, vWorld.y - uCentre) / uScale;
        gl_FragColor = vec4(auroraSky(place, uTime), 1.0);
      }
    `,
  })
}

/**
 * The sky, wound forward on the frame loop.
 *
 * `still` freezes it at a fixed instant rather than unmounting the animation,
 * so somebody who has asked for reduced motion gets the same picture without
 * the drift - a frozen aurora is still an aurora, an absent one is a black
 * rectangle. See `windClock`.
 */
export function AuroraSky({ still }: { still: boolean }) {
  const material = useMemo(() => createSkyMaterial(), [])
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    windClock(material, still, state.clock.elapsedTime)
  })

  return (
    <mesh
      position={[0, BACKDROP.y, BACKDROP.z]}
      material={material}
      renderOrder={-1}
      frustumCulled={false}
    >
      <planeGeometry args={[BACKDROP.width, BACKDROP.height]} />
    </mesh>
  )
}
