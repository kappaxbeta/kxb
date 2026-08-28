'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/**
 * The rainbow, as a thing in a level can be made of.
 *
 * ---------------------------------------------------------------------------
 * The fourth copy, and why it is a copy again
 * ---------------------------------------------------------------------------
 * This substance exists three times already: `src/app/world/rainbow.tsx` for a
 * block whose glTF has not arrived and for the lounge's rainbow mode, and
 * `src/app/xp/_editor/rainbow.tsx` for a piece held over the editor's grid. The
 * rule `docs/xp/README.md` states and lint enforces is that `src/app/xp/**`
 * must not import the lounge, so the editor copied it in and owns it - and this
 * is the runtime's own, for the same reason and with its own tuning.
 *
 * The tuning is the argument for copying rather than sharing, and it is a real
 * difference rather than a drifted one:
 *
 * - **The editor's is a ghost; this is a material.** A preview is glass you
 *   read the level *through*, so its faces are nearly clear and its silhouette
 *   does the work. A ball that has been kicked is a ball - it has to occlude
 *   what is behind it, take part in the depth buffer, and read as solid from
 *   across a park. So the faces carry most of the colour here and the Fresnel
 *   is the highlight rather than the whole look.
 * - **It is drawn opaque.** Which is not a knob: a transparent instanced group
 *   cannot sort per instance, so twenty rainbow apples drawn transparently pop
 *   in front of each other as the camera turns. Opaque is both the honest look
 *   and the only one that survives being instanced.
 *
 * What is deliberately identical to all three is the Fresnel term and the
 * spectrum. Somebody who has seen the lounge in rainbow mode should recognise a
 * glowing thing in a level as the same substance.
 */
function createRainbowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    // See the note above: opaque so the instanced group needs no sorting, and
    // so a glowing thing occludes what is behind it like every other solid.
    transparent: false,
    depthWrite: true,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;

      varying vec3 vRainbowNormal;
      varying vec3 vRainbowView;
      varying vec3 vRainbowWorld;

      void main() {
        // Always instanced where this is used today, and guarded anyway: a
        // material that throws on a plain mesh is a trap for the next person.
        mat4 instance = mat4(1.0);
        #ifdef USE_INSTANCING
          instance = instanceMatrix;
        #endif

        vec4 world = modelMatrix * instance * vec4(position, 1.0);
        vec4 view = viewMatrix * world;

        vRainbowWorld = world.xyz;
        /*
         * The normal through the instance's scale, the short way.
         *
         * The editor's copy explains why this is exact rather than a
         * compromise and where it stops being true: an instance composed with a
         * rotation makes the inverse transpose necessary, and inverse() is not
         * in GLSL ES 1.00 - which is what a ShaderMaterial compiles as unless
         * told otherwise.
         *
         * Here the instances *are* rotated - a level turns its crates - so the
         * rotation is carried through and only the scale is divided out. That is
         * correct for a rotation composed with a uniform scale, which is what
         * an entity's transform is unless it is stretched. A stretched rainbow
         * entity lights its edges slightly off; a stretched one is rare, and the
         * alternative is a shader that does not compile on half the machines.
         */
        vec3 stretch = vec3(
          length(instance[0].xyz),
          length(instance[1].xyz),
          length(instance[2].xyz)
        );
        mat3 turn = mat3(
          instance[0].xyz / max(stretch.x, 1e-4),
          instance[1].xyz / max(stretch.y, 1e-4),
          instance[2].xyz / max(stretch.z, 1e-4)
        );
        vRainbowNormal = normalize(mat3(modelMatrix) * turn * normal);
        vRainbowView = normalize(cameraPosition - world.xyz);

        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;

      varying vec3 vRainbowNormal;
      varying vec3 vRainbowView;
      varying vec3 vRainbowWorld;

      /** Hue to RGB, full saturation and value. Six ramps, no branches. */
      vec3 spectrum(float hue) {
        return clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      }

      void main() {
        float facing = abs(dot(normalize(vRainbowNormal), normalize(vRainbowView)));
        float edge = pow(1.0 - facing, 2.2);

        // Diagonal in x/z with a steeper climb in y, so a tower is a gradient
        // and a floor is a slow sweep. Negative time so the band travels
        // outward rather than at you.
        float hue = fract(
          (vRainbowWorld.x + vRainbowWorld.z) * 0.035 + vRainbowWorld.y * 0.09 - uTime * 0.12
        );
        vec3 colour = spectrum(hue);

        // The faces carry it and the rim adds a highlight, which is the
        // opposite balance to the editor's preview - see the note at the top.
        gl_FragColor = vec4(mix(colour * 0.85, colour * 1.6 + 0.35, edge), 1.0);
      }
    `,
  })
}

/**
 * The uniform write, out here rather than inline in the frame callback.
 *
 * Copied along with the material because the reason travels with it: a uniform
 * is mutable state on a long-lived object, and `react-hooks/immutability`
 * refuses a memo value modified after render. A plain function taking the
 * material as an argument is neither a memo nor a ref.
 */
function windSweep(material: THREE.ShaderMaterial, seconds: number) {
  material.uniforms.uTime!.value = seconds
}

/**
 * One long-lived material for the whole level, wound forward every frame.
 *
 * One rather than one per group, and that is what makes the band continuous: the
 * hue is a function of world position, so two groups sharing this material are
 * two things standing in the same rainbow rather than two things each running
 * their own. It also means a `ShaderMaterial`'s program is compiled once.
 */
export function useRainbowMaterial(): THREE.ShaderMaterial {
  const material = useMemo(() => createRainbowMaterial(), [])

  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => windSweep(material, state.clock.elapsedTime))

  return material
}
