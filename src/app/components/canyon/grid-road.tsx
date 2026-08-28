'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { AURORA_GLSL } from '@/app/components/canyon/aurora-glsl'
import { AURORA_SCALE, BACKDROP } from '@/app/components/canyon/aurora-sky'
import { wearFog, windClock } from '@/app/components/canyon/canyon-blocks'

/**
 * The road, and the sky lying on it.
 *
 * Two things at once, and the second is the one worth reading about. The floor
 * is a mirror, and a mirror in three.js normally costs a second render of the
 * whole scene into a target - which for one flat plane reflecting one flat
 * backdrop is an enormous amount of machinery for something that can be solved
 * on paper.
 *
 * So it is solved on paper. Mirror the view ray about the floor's own up, walk
 * it to the plane the backdrop hangs on, and ask <AuroraSky>'s function what
 * colour it is there. Exact, one texture-free sample per fragment, and it
 * cannot drift out of step with the sky because it *is* the sky.
 *
 * What it deliberately does not reflect is the canyon. The walls are near-black
 * and their reflection would be a dark smear over the one bright thing on the
 * floor, which is why the reference picture this is after has a road that
 * glows rather than a road with buildings in it.
 */

/** Wide enough to run under the verges, so the grid does not end in mid-air. */
const ROAD_WIDTH = 300
/**
 * And stopping just short of the backdrop.
 *
 * Not arbitrary: a fragment further from the camera than the plane it is
 * reflecting has no reflection to compute - the bounced ray is already past it
 * - so a road that ran on to the horizon would end in a band of dead black
 * exactly where the picture is meant to be brightest.
 */
const ROAD_FAR = -228
const ROAD_NEAR = 70

function createRoadMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFogColour: { value: new THREE.Color('#0a0616') },
      uFogDensity: { value: 0 },
      uBackdrop: {
        value: new THREE.Vector4(BACKDROP.width / 2, BACKDROP.height / 2, BACKDROP.y, BACKDROP.z),
      },
      uScale: { value: AURORA_SCALE },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vDepth;

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vec4 view = viewMatrix * world;

        vWorld = world.xyz;
        vDepth = -view.z;

        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uFogColour;
      uniform float uFogDensity;
      /** Half-width, half-height, centre height and distance of the backdrop. */
      uniform vec4 uBackdrop;
      uniform float uScale;

      varying vec3 vWorld;
      varying float vDepth;

      ${AURORA_GLSL}

      void main() {
        vec3 toHere = vWorld - cameraPosition;
        vec3 look = normalize(toHere);
        // The same ray with its climb reversed: what the floor sees is what
        // you would see from under it.
        vec3 bounced = vec3(look.x, -look.y, look.z);

        vec3 mirrored = vec3(0.0);
        // Only where the bounced ray actually travels away and reaches the
        // plane. Behind the backdrop, or aimed back over your shoulder, there
        // is nothing hanging to reflect.
        if (bounced.z < -0.001) {
          float travel = (uBackdrop.w - vWorld.z) / bounced.z;
          if (travel > 0.0) {
            vec3 landed = vWorld + bounced * travel;
            // Inside the plane's own edges, and then in the sky's coordinates,
            // which are metres rather than the plane's uv - see AURORA_SCALE.
            if (abs(landed.x) < uBackdrop.x && abs(landed.y - uBackdrop.z) < uBackdrop.y) {
              mirrored = auroraSky(vec2(landed.x, landed.y - uBackdrop.z) / uScale, uTime);
            }
          }
        }

        // A mirror seen edge-on returns nearly everything and one seen from
        // above returns almost nothing, which is why the road is a lake at the
        // vanishing point and asphalt under your feet.
        float grazing = pow(1.0 - min(abs(look.y), 1.0), 3.0);
        vec3 colour = vec3(0.020, 0.013, 0.048) + mirrored * (0.09 + 0.60 * grazing);

        // The grid, scrolling toward you. Two of them: a metre lattice and a
        // heavier one every eighth line, both measured against the derivative
        // so a line is one pixel wide at any distance instead of aliasing into
        // a moire the moment the road tilts away.
        vec2 run = vec2(vWorld.x, vWorld.z - uTime * 4.0) * 0.30;
        vec2 fine = abs(fract(run) - 0.5) / fwidth(run);
        float thin = 1.0 - min(min(fine.x, fine.y), 1.0);

        vec2 coarse = run * 0.125;
        vec2 wide = abs(fract(coarse) - 0.5) / fwidth(coarse);
        float thick = 1.0 - min(min(wide.x, wide.y), 1.0);

        // The lines take their colour from the sky above them, so the road is
        // magenta on the left and blue on the right without a second palette -
        // pulled well toward white, because a neon line reads as light rather
        // than as paint only if its core is close to blown out.
        vec3 neon = mix(auroraTint(clamp(vWorld.x / 90.0 + 0.5, 0.0, 1.0)), vec3(1.0), 0.55);

        colour += neon * thin * 0.22;
        colour += neon * thick * 0.75;

        // Fogged toward the sky lying on it rather than toward the flat fog
        // colour. Atmosphere scatters the light that is already there, and the
        // difference is the whole far half of the picture: fog to near-black
        // and the road dies a hundred metres short of the vanishing point, with
        // a hard seam where it meets a sky that is still bright.
        float fogged = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
        colour = mix(colour, mix(uFogColour, mirrored * 0.55, 0.65), fogged);

        gl_FragColor = vec4(colour, 1.0);
      }
    `,
  })
}

/** The floor, laid flat and wound forward with everything else. */
export function GridRoad({ still }: { still: boolean }) {
  const material = useMemo(() => createRoadMaterial(), [])

  useEffect(() => () => material.dispose(), [material])

  // Fog on the frame loop rather than in an effect - see `wearFog`, which owns
  // the reason.
  useFrame((state) => {
    windClock(material, still, state.clock.elapsedTime)
    wearFog(material, state.scene.fog)
  })

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -1.6, (ROAD_NEAR + ROAD_FAR) / 2]}
      material={material}
    >
      <planeGeometry args={[ROAD_WIDTH, ROAD_NEAR - ROAD_FAR]} />
    </mesh>
  )
}
