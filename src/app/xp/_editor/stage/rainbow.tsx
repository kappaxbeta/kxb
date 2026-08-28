'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/**
 * The held look, for a piece that has not been put down yet.
 *
 * ---------------------------------------------------------------------------
 * Why this is a copy and not an import
 * ---------------------------------------------------------------------------
 * The lounge has this material already, in `src/app/world/rainbow.tsx`, where it
 * does two jobs: a block whose glTF has not arrived yet, and rainbow mode. This
 * is the third job and it is in the other half of the app, where the rule is the
 * one `docs/xp/README.md` states and lint enforces - **`src/app/xp/**` must not
 * import the lounge; copy a component in and own it.**
 *
 * Owning it is not a formality here, and the differences are the argument for
 * the rule rather than against it:
 *
 * - **No fog.** The lounge applies the scene's fog by hand, because a
 *   `ShaderMaterial` gets none of three's fog chunks for free and a rainbow that
 *   ignores the fog hangs in front of a world that has already faded. The
 *   editor stage has no fog at all, so those two uniforms would be a knob
 *   permanently set to zero - which is the one thing this codebase refuses to
 *   ship. They are gone rather than carried.
 * - **The swell is the point here, not a flourish.** In the lounge the breathing
 *   is what makes a field of loading blocks read as one thing. Here it is the
 *   *suspense*: a piece being held above the grid, not yet placed. So it is
 *   slightly stronger and phase-shifted by position exactly as the lounge's is,
 *   because a row of previewed cells pumping in unison reads as a fault.
 *
 * What is deliberately identical is the Fresnel and the spectrum. Somebody who
 * has seen a block loading in the lounge should recognise a piece being held in
 * the editor as the same substance, and two hand-tuned rainbows that nearly
 * match would be worse than one shared or one honestly copied.
 */

/**
 * The look.
 *
 * One Fresnel term doing all the work: the dot of the normal with the direction
 * to the camera is one where a face points at you and zero at its silhouette, so
 * its inverse is a band hugging every edge. That is what makes a box read as
 * glass rather than as a solid that happens to glow - and a glass box at the
 * piece's true extent is exactly what a preview wants to be, because you can see
 * the level through it while still reading its size.
 *
 * The hue is a function of world position and time, so it runs *through* the
 * preview as a band instead of every cell cycling together. A forty-cell stroke
 * blinking in unison looks like a fault; a wave travelling along it looks like
 * one held thing.
 */
function createGhostMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    /*
     * Off, for the two reasons the lounge gives and one of its own: these
     * overlap constantly, an InstancedMesh cannot sort per instance anyway, and
     * a preview must never occlude the level it is a preview *of*.
     */
    depthWrite: false,
    // Taken from `abs(dot(...))`, so a back face lights its edge exactly like a
    // front one - which is what lets you see the far side of the box through
    // the near one, and therefore how deep the piece is.
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;

      varying vec3 vGhostNormal;
      varying vec3 vGhostView;
      varying vec3 vGhostWorld;

      void main() {
        // Always instanced here - the ghost is one InstancedMesh per stroke -
        // but guarded anyway, because a material that throws when somebody
        // reuses it on a plain mesh is a trap laid for the next person.
        mat4 instance = mat4(1.0);
        #ifdef USE_INSTANCING
          instance = instanceMatrix;
        #endif

        vec4 anchor = modelMatrix * instance * vec4(0.0, 0.0, 0.0, 1.0);

        // Breathing, phase-shifted by where the cell stands, so the swell
        // crosses a stroke as a wave rather than pumping all at once.
        float wave = sin(uTime * 2.2 - (anchor.x + anchor.z) * 0.32 + anchor.y * 0.55);
        vec3 swollen = position * (1.0 + wave * 0.055);

        vec4 world = modelMatrix * instance * vec4(swollen, 1.0);
        vec4 view = viewMatrix * world;

        vGhostWorld = world.xyz;
        /*
         * The normal, un-stretched by hand.
         *
         * The lounge's copy takes mat3(modelMatrix) * mat3(instance) * normal
         * and says why it can: uniform scale throughout, so the rotation part is
         * enough. That is false here - a preview box is the piece's *extent*, so
         * a four-by-one wall is a deliberately stretched cube, and a normal
         * carried through that lands off the real silhouette.
         *
         * The honest fix is the inverse transpose, and it is not available: a
         * ShaderMaterial compiles as GLSL ES 1.00 unless it is told otherwise,
         * and inverse() is not in that version - it would compile to nothing
         * on the machine and to a black preview here, which is the failure this
         * editor is least able to see, the pane never drawing a frame.
         *
         * What makes the short way exact rather than a compromise: these
         * instances are composed with an identity quaternion (see Ghost), so
         * the matrix is a translation and an axis-aligned scale and nothing
         * else. Dividing the normal by that scale *is* the inverse transpose for
         * a diagonal matrix. The comment is here because the day somebody turns
         * a preview box, this stops being true.
         */
        vec3 stretch = vec3(
          length(instance[0].xyz),
          length(instance[1].xyz),
          length(instance[2].xyz)
        );
        vGhostNormal = normalize(mat3(modelMatrix) * (normal / max(stretch, vec3(1e-4))));
        vGhostView = normalize(cameraPosition - world.xyz);

        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;

      varying vec3 vGhostNormal;
      varying vec3 vGhostView;
      varying vec3 vGhostWorld;

      /** Hue to RGB, full saturation and value. Six ramps, no branches. */
      vec3 spectrum(float hue) {
        return clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
      }

      void main() {
        float facing = abs(dot(normalize(vGhostNormal), normalize(vGhostView)));
        float edge = pow(1.0 - facing, 2.2);

        // Diagonal in x/z with a steeper climb in y, so a tower is a gradient
        // and a floor is a slow sweep. Negative time so the band travels
        // outward rather than at you.
        float hue = fract(
          (vGhostWorld.x + vGhostWorld.z) * 0.035 + vGhostWorld.y * 0.09 - uTime * 0.12
        );
        vec3 colour = spectrum(hue);

        /*
         * Fainter in the faces than the lounge's and brighter at the edges.
         *
         * The editor stage is a dark grid with the level on it, and the thing a
         * preview has to answer is "how big, and where" - so the silhouette does
         * the work and the faces stay glassy enough to read the level through.
         * The lounge tunes the other way because there the faces *are* the
         * block.
         */
        vec3 lit = mix(colour * 0.35, colour * 1.8 + 0.2, edge);
        float alpha = 0.13 + edge * 0.72;

        gl_FragColor = vec4(lit, alpha);
      }
    `,
  })
}

/**
 * The uniform write, out here rather than inline in the frame callback.
 *
 * Copied along with the material, because the reason travels with it: a uniform
 * is mutable state on a long-lived object, which is the one thing a hook body is
 * not allowed to touch - `react-hooks/immutability` refuses a memo value
 * modified after render, and it caught this on the first lint. A plain function
 * taking the material as an argument is neither a memo nor a ref, and it is
 * honest about what it does: imperative renderer state written from a frame
 * callback, which is what three.js is.
 */
function windSweep(material: THREE.ShaderMaterial, seconds: number) {
  material.uniforms.uTime!.value = seconds
}

/**
 * One long-lived material, wound forward every frame.
 *
 * Memoised and disposed rather than made per render: a `ShaderMaterial` compiles
 * a program the first time it is drawn, and a new one each frame would recompile
 * on every mouse move over the grid.
 */
export function useGhostMaterial(): THREE.ShaderMaterial {
  const material = useMemo(() => createGhostMaterial(), [])

  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => windSweep(material, state.clock.elapsedTime))

  return material
}
