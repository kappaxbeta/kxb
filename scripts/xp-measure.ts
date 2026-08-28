#!/usr/bin/env bun
/**
 * How big is everything in an XP pack, and what is pivoted at its middle?
 *
 *     bun run xp:measure                 # every pack
 *     bun run xp:measure proto           # one pack
 *     bun run xp:measure proto wall cube # matching names only
 *
 * A readable report, for the questions a generated file cannot answer at a
 * glance: is this pack authored at the scale we think it is, did a re-export
 * change anything, and which models hang rather than stand.
 *
 * It does no measuring of its own - it formats what `xp-catalogue.ts` reads off
 * the geometry. That was two implementations for about ten minutes, which was
 * long enough to notice they could disagree about the one number the pack's
 * `scale` is justified by. One measurer, one report.
 *
 * The numbers printed are *authored units*, before the pack's scale, because
 * that is what you compare against the file in Blender. The catalogue holds the
 * same bounds put through `scale`, which is what the editor works in.
 */

import { PACK_ORDER, PACKS } from '@kxb/xp/packs'
import { readPack } from './xp-catalogue'

const args = process.argv.slice(2)
const wanted = args.filter((a) => PACK_ORDER.includes(a as (typeof PACK_ORDER)[number]))
const filters = args.filter((a) => !wanted.includes(a))
const packs = wanted.length > 0 ? wanted : [...PACK_ORDER]

const n = (v: number) => v.toFixed(3).padStart(8)

for (const packId of packs) {
  const pack = PACKS[packId]
  console.log(`\n${pack.label} (${packId}) - scale ${pack.scale}, lift ${pack.lift}\n`)

  const models = readPack(packId).filter(
    (m) => filters.length === 0 || filters.some((q) => m.name.toLowerCase().includes(q.toLowerCase())),
  )

  for (const m of models) {
    const flag = m.y0 < -0.01 ? '  centred' : ''
    console.log(
      `${m.name.padEnd(34)} w${n(m.w)}  h${n(m.h)}  d${n(m.d)}  floor${n(m.y0)}${flag}`,
    )
  }

  const centred = models.filter((m) => m.y0 < -0.01)
  console.log(`\n  ${models.length} models, ${models.length - centred.length} standing on y=0`)
  if (centred.length > 0) {
    console.log(`  ${centred.length} pivoted at their middle: ${centred.map((m) => m.name).join(', ')}`)
  }

  // The one number the pack's `scale` rests on, stated rather than implied.
  const tallest = models.reduce((a, b) => (b.h > a.h ? b : a), models[0])
  if (tallest) {
    console.log(
      `  tallest: ${tallest.name} at ${tallest.h} units = ${(tallest.h * pack.scale).toFixed(2)} cells`,
    )
  }
}
