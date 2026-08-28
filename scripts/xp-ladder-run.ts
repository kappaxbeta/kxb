#!/usr/bin/env bun
/**
 * Composes `ladder-run.xp.json`.
 *
 * A generator rather than hand-written JSON because the course is arithmetic -
 * every rise has to be inside the measured jump and every gap inside the
 * measured span, and one wrong number out of sixty makes a race nobody can
 * finish. The output is checked in; this is scaffolding.
 *
 * Measured against the real controller at 60Hz (`step`):
 *   single jump rise   1.29 cells      walk jump span    4.43 cells
 *   double jump rise   2.17 cells      sprint jump span  8.23 cells
 * and STEP_HEIGHT is 1.05, so a one-cell rise is walked rather than jumped.
 *
 * Everything is laid out by *edge-to-edge gap* rather than by centre, because
 * the kit's slabs are centred on their footprint and "six apart" between two
 * centres is a different jump for a 4-wide slab than for a 6-wide one. That
 * mistake is what the first draft of this file got wrong, and it produced a last
 * jump nothing could clear.
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
 * A slab, by the kit's own W x D x H naming, and where its edges are.
 *
 * Returns the far edge on each axis so the next piece can be placed a stated gap
 * beyond it rather than a guessed distance from its middle.
 */
const slab = (colour: string, w: number, d: number, x: number, y: number, z: number) => {
  put(`platformer-${colour}/platform_${w}x${d}x1_${colour}`, x, y, z)
  return {
    top: y + 1,
    minX: x - w / 2,
    maxX: x + w / 2,
    minZ: z - d / 2,
    maxZ: z + d / 2,
  }
}

// ---------------------------------------------------------------------------
// Nothing under the course
// ---------------------------------------------------------------------------
/**
 * No floor, no boundary wall, and no ground.
 *
 * There was a field of wooden tiles down here and `world.ground` on, with a
 * barrier round the lot to stop you walking off the invisible plane. None of
 * that was a design decision - it was the only thing the runtime could do,
 * because nothing could put the player back at the start.
 *
 * `world.restart` is that thing now, so the bottom of the world is where a run
 * ends rather than where it continues. A miss costs the run, which is the thing
 * a platformer is a game about, and the wall is unnecessary because there is no
 * longer anything out there to walk onto.
 */

// ---------------------------------------------------------------------------
// Leg one, green: the run-up, and a staircase that is walked
// ---------------------------------------------------------------------------
let leg = slab('green', 6, 6, 0, 1, 0)
leg = slab('green', 6, 6, 6, 1, 0)
put('platformer-neutral/signage_arrows_right', 11, 2, -4)

// One-cell rises, which STEP_HEIGHT walks. The first thing the course says is
// that it will not make you jump for nothing.
leg = slab('green', 4, 4, 11, 1, 0)
leg = slab('green', 4, 4, 15, 2, 0)
leg = slab('green', 4, 4, 19, 3, 0)

// ---------------------------------------------------------------------------
// Leg two, yellow: three gaps, each one jump. Gap 3, rise 2.
// ---------------------------------------------------------------------------
const GAP = 3
/** Where each yellow gap is, so something can be put in one of them. */
const gaps: { x: number; y: number }[] = []
for (let i = 0; i < 3; i++) {
  const width = 4
  // Placed so its near edge is GAP beyond the last far edge.
  const x = leg.maxX + GAP + width / 2
  gaps.push({ x: leg.maxX + GAP / 2, y: leg.top })
  leg = slab('yellow', width, 4, x, leg.top + 1, 0)
  // A rail on the outside, so an edge reads as an edge.
  put('platformer-yellow/barrier_4x1x1_yellow', x, leg.top, 2)
}

/**
 * Spikes in the middle of the run-up, where you are already sprinting.
 *
 * The first draft put these on a *stair*, which made the staircase impassable:
 * a 4x4 patch on a 4x4 step covers the whole step, so walking up the course
 * killed you and there was no way past. A hazard that blocks the only route is
 * not a hazard, it is a wall that lies about what it is.
 *
 * So: the wide flat slab instead, six across, with a two-cell patch in the
 * middle of it. Two clear cells either side means the patch can be jumped or
 * walked round, and the run-up is the right leg for the first lethal thing -
 * being sent back from there costs a few seconds rather than the whole climb.
 */
entities.push({
  blueprint: 'spikes',
  name: 'spikes_1',
  x: 6,
  // On top of the second run-up slab, which stands at y=1 and is a cell thick.
  y: 2,
  z: 0,
  rotation: 0,
  scale: 1,
  props: {},
})

/**
 * A saw over the middle gap, sweeping across the run.
 *
 * The first thing on this course that is about *when* rather than about how
 * far. Everything before it is a jump you either reach or do not; this one you
 * can reach whenever you like and still get it wrong.
 *
 * It blocks rather than kills, which is the honest thing it can do today -
 * nothing reads `hp` reaching zero, so there is no death for it to cause (see
 * task.md). A solid blade sweeping across the only way forward is still a gate
 * you have to read: walk into it and you are stopped at the edge of a drop,
 * which on this course costs the run anyway.
 */
const sawAt = gaps[1]
entities.push({
  blueprint: 'saw',
  name: 'saw_1',
  x: sawAt.x,
  // Sunk so the blade rises through the gap rather than floating over it: the
  // model is pivoted at its middle, so its own centre is the axle.
  y: sawAt.y - 0.5,
  z: 0,
  rotation: 0,
  scale: 1,
  props: {},
})

// ---------------------------------------------------------------------------
// Leg three, red: the turn north, and the gaps that ask for the sprint key
// ---------------------------------------------------------------------------
const cornerX = leg.maxX + GAP + 3
const corner = slab('red', 6, 6, cornerX, leg.top - 1, 0)
put('platformer-neutral/signage_arrows_left', corner.maxX - 1, corner.top, 3)

// Six-cell gaps: outside the walk span of 4.43 and inside the sprint span of
// 8.23. Flat, because a rise and a long gap at once is the combination that
// stops being a challenge and starts being a wall.
const SPRINT_GAP = 6
let north = corner
for (let i = 0; i < 3; i++) {
  const depth = 4
  const z = north.minZ - SPRINT_GAP - depth / 2
  north = slab('red', 4, depth, cornerX, corner.top - 1, z)
}

// ---------------------------------------------------------------------------
// Leg four, blue: the last jump, and the gate
// ---------------------------------------------------------------------------
// One jump: gap 3, rise 2, which is the course's own vocabulary from leg two
// rather than a new demand at the finish.
const finish = slab('blue', 6, 6, cornerX, north.top, north.minZ - GAP - 3)
put('platformer-neutral/signage_finish_wide', cornerX, finish.top, finish.minZ + 0.5)
put('platformer-blue/flag_A_blue', finish.minX + 1, finish.top, finish.minZ + 2)
put('platformer-blue/flag_A_blue', finish.maxX - 1, finish.top, finish.minZ + 2)

// ---------------------------------------------------------------------------
// What is in the level rather than what it is made of
// ---------------------------------------------------------------------------
const stars: [number, number, number, string][] = [
  [15, 4, 0, 'green'],
  [33, 8, 0, 'yellow'],
  [cornerX, corner.top + 1, -14, 'red'],
]
stars.forEach(([x, y, z, colour], i) => {
  entities.push({
    blueprint: `star_${colour}`,
    name: `star_${i + 1}`,
    x,
    y,
    z,
    rotation: 0,
    scale: 1,
    props: {},
  })
})

const LEG = ['green', 'yellow', 'red', 'blue'] as const

const document = {
  format: 'xp/1',
  id: 'ladder-run',
  name: 'Ladder Run',
  blurb:
    'A race up a ladder of platforms. Four legs, each a different colour, each asking one more thing than the last: walk the stairs, jump the gaps, sprint the wide ones, then the gate. Miss a jump and you are back at the start — there is nothing under the course to land on, which is what makes it a platformer rather than a stroll.',
  packs: [
    // The body the runner is, which the player blueprint needs so it can carry
    // health - the built-in dummy has no blueprint entry, so a document that
    // does not declare one has nothing to take away.
    { id: 'dummy' },
    { id: 'platformer-neutral' },
    { id: 'platformer-green' },
    { id: 'platformer-yellow' },
    { id: 'platformer-red' },
    { id: 'platformer-blue' },
  ],
  capabilities: ['freeplay', 'competition'],
  /**
   * A parkour run, with nothing to end it but the gate.
   *
   * No `timeLimit` on purpose, and absent is not zero: a course is over when
   * somebody finishes it, and a clock would turn "did you get there" into "did
   * you get there fast enough", which is a different game and not this one.
   * `parkour` needs the `competition` capability, which needs a start and a
   * finish - both of which are below.
   */
  rules: { preset: 'parkour' },
  spawn: { x: 0, y: 2, z: 0, facing: 90 },
  // A body with health, because a hazard cannot take away what nobody has: a
  // missing property reads as zero, and `isDead` deliberately treats "no hp at
  // all" as alive rather than as a corpse.
  player: { blueprint: 'runner' },
  scripts: {
    sweep: `
// Across the run rather than along it, so the gap is open, then shut, then open.
const REACH = 4
const PACE = 3.4

function onTick() {
  // Driven from world.time rather than integrated per frame, so every client
  // agrees about where the blade is without anybody sending it.
  self.z = Math.sin(world.time * PACE / REACH) * REACH
  // Spun for the look of the thing. The collider is a box and does not turn
  // with it - a blade whose collision followed its teeth would be a blade you
  // could stand between.
  self.rotation = (world.time * 360) % 360
}
`,
    spin: `
// A star turns so it reads as a thing to take rather than as scenery.
const SPEED = 90

function onTick() {
  self.rotation = (world.time * SPEED) % 360
}
`,
  },
  blueprints: {
    runner: {
      model: 'dummy/Dummy',
      // The player's own body is never in the way of the player.
      collider: 'none',
      tags: ['player'],
      props: { hp: 1 },
      triggers: [],
    },
    spikes: {
      // The 2x2, not the 4x4. On a six-wide slab that leaves two clear cells
      // either side, so the patch can be jumped *or* walked round - a hazard
      // with one answer is a puzzle, and this is a run.
      model: 'platformer-neutral/floor_spikes_2x2x1',
      /**
       * Shallow, and that is the whole design of it.
       *
       * A cell-tall collider would be a wall you bump into; half a cell is a
       * thing you land *in*. The trigger fires on `enter`, so what kills you is
       * arriving in that space rather than touching a face of it - which is the
       * difference between spikes and a fence.
       */
      /**
       * Walk *into* them, not onto them.
       *
       * A solid collider half a cell tall is under `STEP_HEIGHT`, so the
       * controller helpfully steps you up onto the spikes and you stroll across
       * the top with your health untouched. Traced it: feet at 2.5 crossing a
       * patch whose box tops out at 2.5, hp never moving.
       *
       * `none` is the pickup's shape and it is the right one here - the trigger
       * is what the thing is *for*, and anything solid enough to stand on is
       * something you stand on.
       */
      collider: 'none',
      tags: ['hazard'],
      props: {},
      triggers: [{ on: 'enter', do: [{ op: 'damage', target: 'other', amount: 99 }] }],
    },
    saw: {
      model: 'platformer-neutral/sawblade',
      /**
       * A box, not the disc it is drawn as.
       *
       * Narrow in z so the gate is genuinely open between passes, and two cells
       * tall so it cannot be jumped over on the spot - the way past it is to
       * wait, not to out-jump it.
       */
      collider: { w: 6, h: 2, d: 0.9 },
      tags: ['hazard'],
      props: {},
      script: 'sweep',
      // It blocked and nothing more until there was a death for it to cause.
      // Now walking into it is the mistake, not the timing you got away with.
      triggers: [{ on: 'enter', do: [{ op: 'damage', target: 'other', amount: 99 }] }],
    },
    ...Object.fromEntries(
    LEG.map((colour) => [
      `star_${colour}`,
      {
        model: `platformer-${colour}/star_${colour}`,
        // Walk through it. A star you have to go around is a star nobody takes.
        collider: 'none',
        tags: ['pickup'],
        props: { value: 1 },
        script: 'spin',
        triggers: [{ on: 'enter', do: [{ op: 'score', amount: 1 }, { op: 'despawn' }] }],
      },
    ]),
  ),
  },
  entities,
  world: {
    /**
     * Twelve cells under the lowest platform, and that is the whole reason for
     * the number.
     *
     * It was 0, which is two cells below the first slab - so stepping off the
     * bottom of the course put you past the line before the fall had begun, and
     * being returned to the spawn read as a teleport rather than as a
     * consequence. Reported as exactly that: "I walk up the stairs and get
     * transported to the spawn".
     *
     * A fall needs long enough to be a fall. Twelve cells is about a second,
     * which is time to see the floor leave and know why you are back.
     */
    floorY: -12,
    /**
     * Off, with `restart` on: the pair is what makes this a platformer.
     *
     * Ground on would be a solid plane under the whole course - you could not
     * fall at all - and the parser refuses it alongside `restart` for exactly
     * that reason. Off with `restart` off is a catch forty cells down, which is
     * a walk back rather than a mistake.
     */
    ground: false,
    restart: true,
    placements,
    marks: [
      { kind: 'start', x: 0, y: 2, z: 0, facing: 90, width: 6, height: 4 },
      {
        kind: 'finish',
        x: cornerX,
        y: finish.top,
        z: Math.round(finish.minZ + 1),
        facing: 180,
        width: 6,
        height: 4,
      },
    ],
  },
}

const out = path.join(import.meta.dir, '..', 'public', 'xp', 'xps', 'ladder-run.xp.json')
writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`)
console.log(
  `${placements.length} placements, ${entities.length} entities -> ${out}\n` +
    `finish top y=${finish.top}, z=${finish.minZ}..${finish.maxZ}`,
)
