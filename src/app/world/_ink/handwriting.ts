/**
 * Handwriting, made up.
 *
 * The recogniser's whole job is to be forgiving about a hand, so testing it
 * with mathematically perfect shapes would be testing the wrong thing: a
 * circle to eight decimal places is not what anybody draws. Every generator
 * here takes a wobble, and the wobble is deterministic - the same seed draws
 * the same shaky O every run, so a failure is a real one rather than the
 * afternoon the random numbers came up badly.
 *
 * Not a test helper, though the tests are its loudest customer: the spellbook
 * draws its worked examples with the same two functions, so what a new player
 * is shown and what the recogniser is proved against are the same shapes. A
 * demonstration that drifts from what the code accepts is worse than no
 * demonstration.
 */

import type { Pt } from '@/app/world/_ink/points'

/**
 * A small deterministic wobble in (-1, 1), as two parts.
 *
 * `drift` is slow - a couple of cycles across the whole shape - and is what a
 * hand actually does: a circle comes out as a slightly wrong oval, not as a
 * hedgehog. `jitter` is the per-sample noise on top, kept small, because that
 * is the other half of what a hand does and the half a tangent-based renderer
 * is most easily upset by.
 *
 * The split matters because these shapes are drawn as well as tested (see the
 * spellbook): per-sample noise at a believable amplitude looks fine as a
 * polyline and terrible as a ribbon, since every sample turns the normal.
 */
const drift = (phase: number, seed: number) => Math.sin(phase * 2.3 + seed)
const jitter = (seed: number) => ((Math.sin(seed * 12.9898) * 43758.5453) % 1) * 0.25

export function circle(cx: number, cy: number, r: number, shake = 0, points = 40): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2
    const radius = r + (drift(angle, cx) + jitter(i + cx)) * shake
    out.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius })
  }
  return out
}

export function line(from: Pt, to: Pt, shake = 0, points = 20): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= points; i++) {
    const ratio = i / points
    // The ends are held still: a hand wobbles in the middle of a line and is
    // precise about where it started and stopped.
    const bow = Math.sin(ratio * Math.PI) * shake
    out.push({
      x: from.x + (to.x - from.x) * ratio + (drift(ratio * 6, 1) + jitter(i)) * bow,
      y: from.y + (to.y - from.y) * ratio + (drift(ratio * 6, 4) + jitter(i + 7)) * bow,
    })
  }
  return out
}

/** Several pieces drawn without lifting the finger. */
export function joined(...parts: Pt[][]): Pt[] {
  return parts.flatMap((part, index) => (index === 0 ? part : part.slice(1)))
}
