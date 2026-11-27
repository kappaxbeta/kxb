import type { ColourMode } from '@/app/components/ink/ink-settings'

/**
 * The colour modes.
 *
 * A mode is a palette for the fish and a palette for the water, plus how
 * hard the fish glow. Every fish carries two hues of its own, picked at
 * birth, and its patches are one of three kinds - light, deep, dark - so a
 * mode is really a function from (kind, hue) to a colour, and swapping modes
 * recolours a fish without respawning it.
 *
 * - koi: what a pond has. Pearl white, persimmon red, sumi black; the water
 *   stays the red of the projection this piece is after.
 * - rainbow: the same shapes in iridescence. Pastel light, saturated deep,
 *   and the hue walks along the body and drifts with time, so a fish is
 *   never one colour and never the colour it was.
 * - neon: tubes. Fully saturated, thin bright rings, a wide glow, and the
 *   water goes electric with it - magenta and cyan fume, blooms in whatever
 *   the fish are wearing.
 */

export type RGB = readonly [number, number, number]
export type PatchKind = 'light' | 'deep' | 'dark'

export type Palette = {
  /** A patch's colour, given the fish's hue for that kind, in 0..1 rgb. */
  patch(kind: PatchKind, hue: number): RGB
  /** How much the light and deep patches shift hue per joint down the body. */
  drift: number
  /** How bright the aura round each circle is, 0..1+. */
  aura: number
  /** How far the aura reaches past the circle, in radii. */
  reach: number
  /** Alpha of the ring at the circle's edge. */
  ring: number
  /** Alpha of the body fill, per kind. */
  fill: Record<PatchKind, number>
  /** What the fume sources put in the water. */
  fume: readonly RGB[]
  /** What a bloom is made of. */
  bloom: readonly RGB[]
  /** How much of the water's own iridescence the display adds. */
  iris: number
  /** Gain on the water's glow. */
  glow: number
}

const RED: RGB = [1.0, 0.03, 0.09]
const CRIMSON: RGB = [0.72, 0.0, 0.12]
const SCARLET: RGB = [1.0, 0.12, 0.05]

const PALETTES: Record<ColourMode, Palette> = {
  koi: {
    patch(kind, hue) {
      if (kind === 'light') return hsl(hue, 0.18, 0.9)
      if (kind === 'deep') return [1.0, 0.32, 0.08]
      return [0.09, 0.04, 0.06]
    },
    drift: 0,
    aura: 0.5,
    reach: 1.8,
    ring: 0.22,
    fill: { light: 0.3, deep: 0.5, dark: 0.85 },
    fume: [RED, CRIMSON],
    bloom: [RED, CRIMSON, SCARLET],
    iris: 0.9,
    glow: 0.7,
  },
  rainbow: {
    patch(kind, hue) {
      if (kind === 'light') return hsl(hue, 0.55, 0.8)
      if (kind === 'deep') return hsl(hue, 0.95, 0.58)
      return hsl(hue, 0.7, 0.14)
    },
    drift: 0.035,
    aura: 0.65,
    reach: 2.0,
    ring: 0.2,
    fill: { light: 0.28, deep: 0.45, dark: 0.8 },
    fume: [RED, CRIMSON],
    bloom: [RED, CRIMSON, SCARLET],
    iris: 1.2,
    glow: 0.6,
  },
  neon: {
    patch(kind, hue) {
      if (kind === 'light') return hsl(hue, 1.0, 0.68)
      if (kind === 'deep') return hsl(hue, 1.0, 0.55)
      return hsl(hue, 1.0, 0.22)
    },
    drift: 0.02,
    aura: 1.1,
    reach: 2.6,
    ring: 0.85,
    fill: { light: 0.1, deep: 0.16, dark: 0.5 },
    fume: [hsl(0.86, 1, 0.5), hsl(0.52, 1, 0.5), hsl(0.72, 1, 0.5)],
    bloom: [hsl(0.86, 1, 0.55), hsl(0.52, 1, 0.55), hsl(0.15, 1, 0.55), hsl(0.33, 1, 0.55)],
    iris: 1.2,
    glow: 1.3,
  },
}

export function palette(mode: ColourMode): Palette {
  return PALETTES[mode]
}

/** Hue, saturation and lightness in 0..1 to rgb in 0..1. */
export function hsl(h: number, s: number, l: number): RGB {
  const hue = ((h % 1) + 1) % 1
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((hue * 6) % 2) - 1))
  const m = l - c / 2
  const sector = Math.floor(hue * 6)
  const [r, g, b] =
    sector === 0
      ? [c, x, 0]
      : sector === 1
        ? [x, c, 0]
        : sector === 2
          ? [0, c, x]
          : sector === 3
            ? [0, x, c]
            : sector === 4
              ? [x, 0, c]
              : [c, 0, x]
  return [r + m, g + m, b + m]
}

/** A colour as the `r, g, b` a canvas `rgba()` wants. */
export function css([r, g, b]: RGB): string {
  return `${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}`
}
