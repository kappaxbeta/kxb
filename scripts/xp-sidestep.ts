#!/usr/bin/env bun
/**
 * Composes `sidestep.xp.json` — the first side-on course.
 *
 * ---------------------------------------------------------------------------
 * Why this is a new document rather than a retrofit
 * ---------------------------------------------------------------------------
 * The board used to claim `ladder-run` would work side-on almost unchanged. It
 * will not: measured, its legs run `x x x x x x x x z z z z` — forty-eight
 * cells along +x and then thirty-nine along -z. An L. A camera that reads one
 * world axis shows the first half correctly and then the player walks into the
 * screen.
 *
 * None of the four documents we shipped before this one is a straight line, so
 * the honest thing was a course built to be one. That is also the only way to
 * find out whether a single `axis` is enough, which is the open question on the
 * camera block.
 *
 * ---------------------------------------------------------------------------
 * Everything happens along +x, and inside twenty cells of height
 * ---------------------------------------------------------------------------
 * `DEFAULT_SPAN` is 20 — how many cells tall the view is — and the width
 * follows from the aspect ratio. So a course laid out for a wide screen shows
 * *less horizontally* on a phone rather than more vertically, and the thing to
 * keep inside twenty is the height. Every platform here sits between y=1 and
 * y=17, which frames on anything.
 *
 * The jump budget is the one measured against the real controller, unchanged:
 *
 *     single jump rise   1.29 cells      walk jump span    4.43 cells
 *     double jump rise   2.17 cells      sprint jump span  8.23 cells
 *
 * so a rise is never more than 2, a gap is never more than 6, and no jump is
 * ever both — the height is bought out of the same arc as the distance.
 */

import { writeFileSync } from 'node:fs'
import path from 'node:path'

type Placement = { model: string; x: number; y: number; z: number; rotation: number; scale: number }

const placements: Placement[] = []
const entities: Record<string, unknown>[] = []

const put = (model: string, x: number, y: number, z: number, rotation = 0, scale = 1) => {
  placements.push({ model, x, y, z, rotation, scale })
}

/**
 * A slab, and where its edges are.
 *
 * Deep in z even though nothing asks the player to move that way: a side-on
 * course still runs the same character controller, so a body that drifts half a
 * cell off the centre line must not fall off the world for it. Four cells of
 * depth is two body widths of forgiveness either side.
 */
const depthFor = (w: number) => (w === 6 ? 6 : 4)
const slab = (colour: string, w: number, x: number, y: number) => {
  // The kit ships 6x2, 6x6, 4x4, 4x2 and 2x2 - there is no 6x4 - so the depth
  // is chosen from what exists rather than from a constant. The parser catches
  // an invented one by name, which is how this was found.
  put(`platformer-${colour}/platform_${w}x${depthFor(w)}x1_${colour}`, x, y, 0)
  return { top: y + 1, minX: x - w / 2, maxX: x + w / 2 }
}

/** Rise and gap, from the measured budget. Never both on one jump. */
const RISE = 2
const GAP = 3
const LONG = 6

let leg = slab('green', 6, 0, 1)

// ---------------------------------------------------------------------------
// A flat run, so the first thing is not a jump
// ---------------------------------------------------------------------------
leg = slab('green', 6, 6, 1)
put('platformer-neutral/signage_arrows_right', 10, 2, -3)

// ---------------------------------------------------------------------------
// Three rises, walked rather than jumped - STEP_HEIGHT takes a single cell
// ---------------------------------------------------------------------------
for (let i = 0; i < 3; i++) {
  leg = slab('green', 4, leg.maxX + 2, leg.top)
}

// ---------------------------------------------------------------------------
// Then the jumps: gap 3, rise 2, three times
// ---------------------------------------------------------------------------
for (let i = 0; i < 3; i++) {
  leg = slab('yellow', 4, leg.maxX + GAP + 2, leg.top + RISE - 1)
  put('platformer-yellow/barrier_4x1x1_yellow', leg.minX + 2, leg.top, 2)
}

// ---------------------------------------------------------------------------
// A spike patch to clear, on a wide slab so it can be jumped or walked round
// ---------------------------------------------------------------------------
const wide = slab('red', 6, leg.maxX + GAP + 3, leg.top - 1)
entities.push({
  blueprint: 'spikes',
  name: 'spikes_1',
  x: wide.minX + 3,
  y: wide.top,
  z: 0,
  rotation: 0,
  scale: 1,
  props: {},
})
leg = wide

// ---------------------------------------------------------------------------
// The long one, flat, which is where the sprint key earns itself
// ---------------------------------------------------------------------------
leg = slab('red', 4, leg.maxX + LONG + 2, leg.top - 1)

// ---------------------------------------------------------------------------
// A saw over the last gap: the only thing here that is about *when*
// ---------------------------------------------------------------------------
const sawGap = leg.maxX + GAP / 2
leg = slab('red', 4, leg.maxX + GAP + 2, leg.top - 1)
/**
 * The saw rises and falls rather than sweeping across.
 *
 * `ladder-run`'s sweeps in z, which is right when you are looking down at it
 * and useless here: across the run is *into the screen* on a side-on camera, so
 * the blade would vanish and reappear with nothing to read. Up and down is the
 * same timing problem rendered in the plane you can actually see.
 */
const SAW_BASE = leg.top + 1
entities.push({
  blueprint: 'saw',
  name: 'saw_1',
  x: sawGap,
  y: SAW_BASE,
  z: 0,
  rotation: 0,
  scale: 1,
  props: {},
})

// ---------------------------------------------------------------------------
// Down to the gate. Dropping is free - only the climb was ever rationed.
// ---------------------------------------------------------------------------
const finish = slab('blue', 6, leg.maxX + GAP + 3, leg.top - 3)
put('platformer-neutral/signage_finish_wide', finish.minX + 3, finish.top, -2)
put('platformer-blue/flag_A_blue', finish.minX + 1, finish.top, 1)
put('platformer-blue/flag_A_blue', finish.maxX - 1, finish.top, 1)

const document = {
  format: 'xp/1',
  id: 'sidestep',
  name: 'Sidestep',
  blurb:
    'A run seen from the side, the way a platformer is meant to be. Everything happens along one axis and inside one screen of height — walk the steps, jump the gaps, sprint the long one, time the saw, and drop to the gate. Miss and you are back at the start; there is nothing under it to land on.',
  packs: [
    { id: 'dummy' },
    { id: 'platformer-neutral' },
    { id: 'platformer-green' },
    { id: 'platformer-yellow' },
    { id: 'platformer-red' },
    { id: 'platformer-blue' },
  ],
  capabilities: ['freeplay', 'competition'],
  rules: { preset: 'parkour' },
  /**
   * Only `kind`, and that is the advert.
   *
   * `axis` defaults to `x`, `distance` to 24 and `span` to 20, so a course that
   * has not had to tune anything says so by carrying nothing - and a document
   * whose camera block is one word is the best argument the block has.
   */
  camera: { kind: 'side' },
  spawn: { x: 0, y: 2, z: 0, facing: 90 },
  player: { blueprint: 'runner' },
  scripts: {
    sweep: `
// Up and down over the gap, so the way through opens and shuts. Driven from
// world.time rather than integrated per frame, so every client agrees where the
// blade is without anybody sending it.
const BASE = ${SAW_BASE}
const REACH = 2.4
const PACE = 2.6

function onTick() {
  self.y = BASE + Math.sin(world.time * PACE) * REACH
  self.rotation = (world.time * 360) % 360
}
`,
  },
  blueprints: {
    runner: {
      model: 'dummy/Dummy',
      collider: 'none',
      tags: ['player'],
      props: { hp: 1 },
      triggers: [],
    },
    spikes: {
      // Walk into them, not onto them: anything solid enough to stand on is
      // something the controller steps you up onto.
      model: 'platformer-neutral/floor_spikes_2x2x1',
      collider: 'none',
      tags: ['hazard'],
      props: {},
      triggers: [{ on: 'enter', do: [{ op: 'damage', target: 'other', amount: 99 }] }],
    },
    saw: {
      model: 'platformer-neutral/sawblade',
      collider: { w: 5, h: 1.4, d: 3 },
      tags: ['hazard'],
      props: {},
      script: 'sweep',
      triggers: [{ on: 'enter', do: [{ op: 'damage', target: 'other', amount: 99 }] }],
    },
  },
  entities,
  world: {
    /**
     * Well under the course, with `restart` on.
     *
     * A fall needs long enough to read as a fall rather than as a teleport -
     * that lesson came from `ladder-run`, where the line sat two cells under the
     * lowest platform and being sent back looked like the game glitching.
     */
    floorY: -12,
    ground: false,
    restart: true,
    placements,
    marks: [
      { kind: 'start', x: 0, y: 2, z: 0, facing: 90, width: 6, height: 4 },
      {
        kind: 'finish',
        x: Math.round(finish.minX + 3),
        y: finish.top,
        z: 0,
        facing: 90,
        width: 6,
        height: 4,
      },
    ],
  },
}

const out = path.join(import.meta.dir, '..', 'public', 'xp', 'xps', 'sidestep.xp.json')
writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`)

const ys = placements.map((p) => p.y)
console.log(
  `${placements.length} placements, ${entities.length} entities -> ${out}\n` +
    `runs x 0..${Math.round(finish.maxX)}, height ${Math.min(...ys)}..${Math.max(...ys) + 1} (span is 20)`,
)
