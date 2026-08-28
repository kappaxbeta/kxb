import * as THREE from 'three'

/**
 * The cartridge, traced in neon.
 *
 * ---------------------------------------------------------------------------
 * Why lines and not a brighter rim
 * ---------------------------------------------------------------------------
 * The Fresnel halo in `rim.ts` lights the *silhouette* - the outer boundary,
 * and nothing else. It is what makes a cartridge sit on a lit stage, and turned
 * up far enough to read as neon it just becomes a smudge round the outside,
 * because there is no line in it to be bright.
 *
 * Neon is a line. So this draws the model's actual edges - the outline, the
 * step down into the sticker well, the shoulder, and every fin of the pin comb -
 * as additive line segments over the shell. That is what gives the effect its
 * shape: the glow follows the *object*, so the thing you recognise from across
 * a shelf is the cartridge's own outline rather than a rectangle of light.
 *
 * The two together are what a real tube looks like: a hard bright core with a
 * soft bloom around it. Neither half reads as neon on its own.
 *
 * ---------------------------------------------------------------------------
 * The threshold, and the bevel underneath it
 * ---------------------------------------------------------------------------
 * `EdgesGeometry` keeps an edge when the two faces meeting at it disagree by
 * more than `THRESHOLD`. The shell is bevelled in two segments, so what was one
 * ninety-degree corner is now two thirty-degree ones - which means a threshold
 * above thirty draws no corners at all, and one below it draws both.
 *
 * Both is the right answer and not a compromise: the pair sits about four
 * screen pixels apart at the size a cartridge is drawn, and additively blended
 * they read as one line with a bright middle. Which is a neon tube.
 *
 * ---------------------------------------------------------------------------
 * Built once per geometry, not per cartridge
 * ---------------------------------------------------------------------------
 * Every cartridge on every shelf shares the two `BufferGeometry` instances that
 * come out of the GLB, and extracting edges means walking every triangle. A
 * `WeakMap` keyed on the source means that walk happens twice for the life of
 * the document rather than twice per cartridge - and lets the entry go when the
 * loader's cache does.
 */

/** Degrees of disagreement before an edge is drawn. Below the bevel's own angle. */
const THRESHOLD = 18

const cache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>()

export function neonEdges(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const found = cache.get(source)
  if (found) return found

  const edges = new THREE.EdgesGeometry(source, THRESHOLD)
  cache.set(source, edges)
  return edges
}

/**
 * The tube itself.
 *
 * `linewidth` is deliberately not set: the WebGL renderer ignores it on every
 * platform that matters and always draws one pixel, which is a fact worth
 * writing down rather than leaving as a mysterious absence. One *device* pixel
 * is right anyway - on the retina screens this is drawn at it is a hairline,
 * which is what a lit tube seen across a room is.
 *
 * Additive, so a line crossing a bright cover washes toward white instead of
 * cutting a coloured stripe through the picture. Depth is read so a cartridge
 * in front still hides the one behind, and never written, so the lines cannot
 * occlude each other into a mess.
 */
export function neonMaterial(hue: number): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    // Well past full saturation on purpose. Additive blending against a
    // near-black page eats a lot of the colour, and a neon line that is merely
    // the shell's own hue reads as a seam rather than as light.
    color: new THREE.Color().setHSL(hue / 360, 1, 0.68, THREE.SRGBColorSpace),
    transparent: true,
    opacity: 0.75,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // Not tone mapped, for the reason the world's rainbow gives: tone mapping
    // pulls a saturated emissive back toward white, and being unmistakably lit
    // is the whole job.
    toneMapped: false,
  })
}

/** Opacity at rest, and how much of that the pointer adds on top. */
export const NEON_REST = 0.75
export const NEON_LIT = 0.6

/**
 * How hard the lines burn, per finish.
 *
 * One number rather than a second material, because the only finish that wants
 * a different answer is `neon` - where the lines are not decoration on a solid,
 * they are the object. Full brightness at rest there, so a neon cartridge is
 * lit before anybody points at it; everything else keeps a line that describes
 * the shape without competing with the cover.
 */
export function neonRest(finish: string): number {
  return finish === 'neon' ? 1 : NEON_REST
}
