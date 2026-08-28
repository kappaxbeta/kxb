import * as THREE from 'three'

/**
 * The light that hangs on a cartridge's edges.
 *
 * ---------------------------------------------------------------------------
 * What it is
 * ---------------------------------------------------------------------------
 * A second copy of the shell, a whisker larger, drawn inside-out and added to
 * whatever is already on screen. Because only the *back* faces are drawn, the
 * near side of the copy is culled and what survives is a thin band of the far
 * side peeking out all the way round the silhouette - so the cartridge gets a
 * soft edge of its own colour without a post-processing pass, a second render
 * target, or a single extra pixel of overdraw across its face.
 *
 * The Fresnel term shapes that band: `1 - |normal · view|` is zero where a face
 * points at you and one at the silhouette, so the glow is absent in the middle
 * and strongest exactly where the shell's outline is. The same trick the
 * lounge's party rim and its rainbow blocks use, which is why it looks like it
 * belongs to the same product.
 *
 * ---------------------------------------------------------------------------
 * Why it is on every finish rather than only the galaxy
 * ---------------------------------------------------------------------------
 * The galaxy shader draws its own halo, because that one *is* an atmosphere.
 * This is the other thing: it is what makes a shelf of ordinary plastic
 * cartridges read as objects on a lit stage rather than as boxes on a flat
 * page, and it is the whole of the difference between the first shelf and the
 * one that looks like it belongs on this site. It rises as the pointer nears,
 * so a shelf lights up under the hand.
 */

/** How far outside the shell the copy sits. Any more and the band detaches. */
export const RIM_SCALE = 1.03

export function rimMaterial(hue: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    // Added rather than blended, because this is light: over the near-black
    // page it is the colour itself, and over a bright cover it washes toward
    // white the way a real bloom would.
    blending: THREE.AdditiveBlending,
    // Inside-out, which is what leaves only the band. Depth is read so a rim
    // cannot be drawn over a cartridge standing in front of it, and never
    // written, so it cannot occlude the one behind.
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uColour: {
        value: new THREE.Color().setHSL(hue / 360, 0.85, 0.6, THREE.SRGBColorSpace),
      },
      /** Zero at rest. The cartridge drives it from the pointer's distance. */
      uStrength: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vViewW;

      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewW = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour;
      uniform float uStrength;

      varying vec3 vNormalW;
      varying vec3 vViewW;

      void main() {
        // The absolute value, because these are back faces: without it the
        // whole copy is dark and the band never appears.
        float facing = abs(dot(normalize(vNormalW), normalize(vViewW)));
        float edge = pow(1.0 - facing, 1.7);

        // A floor under the strength, so the shelf glows faintly at rest and
        // the pointer brightens it rather than switching it on. A rim that
        // only exists on hover reads as a selection state; one that is always
        // there reads as the light in the room.
        float lit = edge * (0.62 + uStrength * 1.5);

        gl_FragColor = vec4(uColour * lit, lit);
      }
    `,
  })
}
