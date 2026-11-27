import * as THREE from 'three'

/**
 * Things a body wears on its own materials: the party rim, and the glitch.
 *
 * ---------------------------------------------------------------------------
 * Why a body has to be given its own materials first
 * ---------------------------------------------------------------------------
 * Every clone of an animal - `scene.clone(true)` or `SkeletonUtils.clone` -
 * shares its materials with every other clone of the same file. That is what
 * makes a room of six pandas cheap, and it is why nothing here may touch a
 * material it was handed: one person lighting up would light up everybody who
 * picked the same animal, in their colour. So the first thing `wear` does is
 * give *this* body copies, and the last thing it does, on the way out, is put
 * the shared originals back and dispose the copies - so a switch thrown a
 * hundred times leaves a hundred materials fewer behind than it would.
 *
 * ---------------------------------------------------------------------------
 * Why both effects are one function
 * ---------------------------------------------------------------------------
 * The rim used to be applied in three places with the same block of code -
 * the animal, the skin, and the studio's posed body - and the glitch would
 * have been a fourth copy in each. Worse, two effects that each clone the
 * material cannot be stacked: a clone does not carry `onBeforeCompile`, so
 * whichever ran second would silently drop the first. One function, one
 * clone, one shader patch that includes whichever of the two is wanted.
 *
 * ---------------------------------------------------------------------------
 * The rim
 * ---------------------------------------------------------------------------
 * A Fresnel term on the body's *own* material rather than a second copy of the
 * mesh. The obvious way to draw an outline - clone the model, scale it up a
 * hair, render it back-faces-only - would mean a second animated skeleton per
 * person, and the mixer binds clip tracks by node name, so the copy would
 * either freeze in its bind pose or steal the original's bindings. One extra
 * line in a shader that is already running follows every frame of the
 * animation for free.
 *
 * Added at the very end, after tone mapping and colour space, so the edge
 * stays the neon it was asked for instead of being rolled back toward white
 * by the tone mapper. `vViewPosition` is the fragment-to-camera vector every
 * lit material in three declares; its dot with the normal is one at the centre
 * of a surface facing you and zero at its edge, so one minus that, raised to a
 * power, is a band that hugs the silhouette.
 *
 * ---------------------------------------------------------------------------
 * The glitch
 * ---------------------------------------------------------------------------
 * What a bad connection looks like, drawn on the person who has one. Three
 * parts, all scaled by `strength`:
 *
 *   * **Tearing.** The body is cut into horizontal bands by its world-space
 *     height, and each band decides a few dozen times a second whether to
 *     shove itself sideways. The shove is in *clip* space - a screen-space
 *     shift, applied after projection - because a glitch is a thing that
 *     happens to the picture of a body, not to the body, and because the
 *     bands then need no inverse model matrix to find their way back.
 *   * **Hue.** Torn bands rotate their hue a random amount, and the whole body
 *     wobbles its hue with a slow sine, both in the final colour after tone
 *     mapping so the shift is what you see rather than what the tone mapper
 *     lets through. Rotation about the grey axis rather than a round trip
 *     through HSV: three lines and no branches. Rotation alone is invisible
 *     on grey, and most of the animals are black and white, so the same
 *     angle also tints - a torn band strongly, the rest of the body faintly.
 *   * **Scanlines.** A faint rolling darkening across the fragment rows, so
 *     even an untorn frame at low strength reads as a bad signal.
 *
 * Everything is driven from two uniforms the caller mutates - a strength and
 * a clock - and a seed that keeps two bodies from tearing in lock-step. No
 * rebuild, ever: the material compiles once and the frame loop writes numbers.
 * The clock is *handed in* rather than read from a wall clock so the studio can
 * feed it the shot's playhead and record the same glitch twice.
 */

/** The uniforms one glitching body reads. Mutate them; never replace them. */
export interface GlitchUniforms {
  /** Zero is no glitch at all; one is a link that has gone. */
  strength: { value: number }
  /** Seconds. Any monotonic clock; the studio passes the playhead. */
  time: { value: number }
  /** Something in [0, 1) that differs per body. */
  seed: { value: number }
}

export function newGlitch(seed = 0): GlitchUniforms {
  return { strength: { value: 0 }, time: { value: 0 }, seed: { value: seed } }
}

/**
 * A stable seed in [0, 1) for anything with an id.
 *
 * The same small hash `hueFor` uses for the party colour, folded to a unit
 * fraction rather than a hue. Stable across a session so a peer's bands are
 * theirs.
 */
export function seedFrom(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index++) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0
  }
  return (Math.abs(hash) % 1000) / 1000
}

export interface Worn {
  /** A neon edge in this colour, or null for none. */
  rim: THREE.Color | null
  /** The glitch's uniforms, or null for a body that is not glitching. */
  glitch: GlitchUniforms | null
}

/**
 * Put the rim and/or the glitch on every mesh under `root`.
 *
 * Returns the undo. With neither wanted it does nothing and the undo is a
 * no-op, so a caller can hand it whatever it has without checking first.
 */
export function wear(root: THREE.Object3D, worn: Worn): () => void {
  const { rim, glitch } = worn
  if (!rim && !glitch) return () => {}

  /**
   * Three caches compiled programs by, among other things, the *text* of
   * `onBeforeCompile`. Every closure below has the same text whether it adds
   * one chunk or two, so without a key of its own a rim-only body and a
   * rim-and-glitch body would be handed the same program, and one of them
   * would be drawn with the other's shader.
   */
  const key = `body-shader:${rim ? 'rim' : ''}${glitch ? 'glitch' : ''}`

  const restore: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = []

  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return

    const source = mesh.material
    if (Array.isArray(source)) return

    const material = source.clone()
    material.customProgramCacheKey = () => key
    material.onBeforeCompile = (shader) => {
      if (rim) {
        shader.uniforms.uRimColour = { value: rim }
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\nuniform vec3 uRimColour;`)
          .replace(
            '#include <dithering_fragment>',
            `#include <dithering_fragment>
  float rimFacing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
  float rimBand = pow(1.0 - rimFacing, 2.4);
  gl_FragColor.rgb += uRimColour * rimBand * 1.6;`,
          )
      }

      if (glitch) {
        shader.uniforms.uGlitch = glitch.strength
        shader.uniforms.uGlitchTime = glitch.time
        shader.uniforms.uGlitchSeed = glitch.seed

        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${GLITCH_HEAD}`)
          .replace('#include <project_vertex>', GLITCH_VERTEX)

        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\n${GLITCH_HEAD}`)
          .replace('#include <dithering_fragment>', GLITCH_FRAGMENT)
      }
    }
    material.needsUpdate = true

    restore.push({ mesh, material: source })
    mesh.material = material
  })

  return () => {
    for (const entry of restore) {
      const worn = entry.mesh.material
      entry.mesh.material = entry.material
      if (!Array.isArray(worn)) worn.dispose()
    }
  }
}

/** Declared in both stages: the uniforms, the varying, and one hash. */
const GLITCH_HEAD = /* glsl */ `
uniform float uGlitch;
uniform float uGlitchTime;
uniform float uGlitchSeed;
varying float vGlitchTorn;
float glitchHash(float n) { return fract(sin(n * 12.9898 + 78.233) * 43758.5453123); }
`

/**
 * Bands are cut by world-space height before projection, then shoved in clip
 * space after it. Six bands to the unit, which on an animal a unit and a half
 * tall is about nine slices; the clock steps twenty-four times a second so a
 * band holds its decision long enough to be seen. The chance a band tears
 * grows with the strength, and so does how far it goes.
 */
const GLITCH_VERTEX = /* glsl */ `
vec4 glitchWorld = modelMatrix * vec4(transformed, 1.0);
#include <project_vertex>
float glitchTick = floor(uGlitchTime * 24.0);
float glitchBand = floor(glitchWorld.y * 6.0 + uGlitchSeed * 7.0);
float glitchRoll = glitchHash(glitchBand * 3.1 + glitchTick * 13.7 + uGlitchSeed * 101.0);
float glitchTorn = step(1.0 - uGlitch * 0.55, glitchRoll) * step(0.001, uGlitch);
float glitchShift = (glitchHash(glitchRoll * 91.3 + glitchTick) - 0.5) * 0.3 * uGlitch;
// And now and then the whole body jumps, which is the frame that was dropped.
float glitchJump = step(0.9, glitchHash(glitchTick * 0.37 + uGlitchSeed)) * (glitchHash(glitchTick) - 0.5) * 0.06 * uGlitch;
gl_Position.x += (glitchTorn * glitchShift + glitchJump) * gl_Position.w;
vGlitchTorn = glitchTorn;
`

/**
 * After tone mapping and colour space, like the rim, so the hue lands on the
 * colour that reaches the screen.
 */
const GLITCH_FRAGMENT = /* glsl */ `
#include <dithering_fragment>
if (uGlitch > 0.001) {
  float glitchTick = floor(uGlitchTime * 24.0);
  // A torn band swings its hue anywhere; the rest of the body drifts with the
  // clock. Both scale with the strength, so a mild link is a tint and a dead
  // one is a body in the wrong colours.
  float glitchAngle = vGlitchTorn * (glitchHash(glitchTick + uGlitchSeed * 17.0) - 0.5) * 6.2832
    + sin(uGlitchTime * 7.0 + uGlitchSeed * 6.2832) * 0.9 * uGlitch;
  const vec3 glitchGrey = vec3(0.57735);
  float glitchCos = cos(glitchAngle);
  float glitchSin = sin(glitchAngle);
  vec3 glitchColour = gl_FragColor.rgb * glitchCos
    + cross(glitchGrey, gl_FragColor.rgb) * glitchSin
    + glitchGrey * dot(glitchGrey, gl_FragColor.rgb) * (1.0 - glitchCos);
  // A torn band also swaps its channels, which is the closest a forward
  // material can get to the red-and-blue fringing of a broken picture.
  glitchColour = mix(glitchColour, glitchColour.gbr, vGlitchTorn * 0.6);
  // And a cast in the colour the angle points at. Rotating the hue of grey
  // changes nothing - most of the animals are black and white - so a torn
  // band is tinted outright, and the whole body carries a faint one that
  // drifts with the sine. That is what makes the distortion visible on a
  // panda rather than only on a parrot.
  vec3 glitchCast = vec3(cos(glitchAngle), cos(glitchAngle + 2.094), cos(glitchAngle + 4.189)) * 0.5 + 0.5;
  glitchColour = mix(glitchColour, glitchColour * glitchCast * 1.7, (vGlitchTorn * 0.7 + 0.2) * uGlitch);
  // Rolling scanlines, faint, so a quiet frame still looks like a bad signal.
  float glitchLine = step(0.5, fract(gl_FragCoord.y * 0.25 + uGlitchTime * 10.0));
  glitchColour *= 1.0 - glitchLine * 0.25 * uGlitch;
  gl_FragColor.rgb = glitchColour;
}
`
