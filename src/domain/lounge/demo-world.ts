import type { BlockPlacement } from '@/domain/lounge/events'

/**
 * The world the public demo is standing in.
 *
 * A template in every sense except that it is not in `WORLD_TEMPLATES`, and
 * that difference is the whole point. The catalogue's grounds are *starting
 * points* - a bare floor, a marked pitch - and they are laid into a real world
 * by a real command, so they have to be plain enough that somebody's first act
 * is building on them. This one is the opposite: nobody keeps it, nothing is
 * written down, and it exists to be walked into and photographed. So it is
 * allowed to be finished.
 *
 * Pure and deterministic, like every planner in ./templates.ts, and for a
 * sharper reason here: the demo builds this on the client at mount. There is no
 * log to reconcile against, so "the same world every time" is not a nicety - it
 * is the only thing making a screenshot, a bug report and a second visit
 * describe the same place. Nothing in here calls `Math.random`.
 *
 * Kept well under the block caps in ./events.ts without needing to check them:
 * an island this size is a few thousand cells, and the caps are counted in tens
 * of thousands. They are not imported because nothing here is validated against
 * them - these blocks never reach a command.
 */

/** How far the grass reaches from the middle, in cells. Beyond it is the void. */
const ISLAND_RADIUS = 21

/** The paved circle inside the grass. */
const PLAZA_RADIUS = 12

/**
 * The ring of darker paving inside the plaza edge.
 *
 * Cosmetic, and load-bearing anyway: a disc of one block reads as a texture bug
 * at a distance, and one inlaid ring is enough to make it read as a floor
 * somebody laid.
 */
const INLAY_RADIUS = 7

const GRASS = 'dirt_with_grass'
const PAVING = 'stone'
const INLAY = 'stone_dark'
const RIM = 'gravel_with_grass'

/**
 * The square you arrive on, kept clear of anything you could spawn inside.
 *
 * The scene puts you on the surface of the column at the origin (see
 * `surfaceAt`), so anything standing there would be something you begin the
 * demo perched on top of. Everything worth looking at is arranged *around*
 * this instead, which is also the better shot: you land in the middle of a
 * place rather than on its one feature.
 */
const ARRIVAL_CLEARANCE = 3

/** North, where the fountain is. Negative z is forward from the entry camera. */
const FOUNTAIN = { x: 0, z: -9 }

/** South, where the stage is. */
const STAGE = { x: 0, z: 10 }

/**
 * Whether a cell is close enough to the arrival square to be left bare.
 *
 * Chebyshev rather than Euclidean distance, so the protected patch is a square.
 * A circle of clearance leaves diagonal corners just inside a structure's
 * footprint, which is exactly where a pillar would end up half a block from
 * your face.
 */
function nearArrival(x: number, z: number): boolean {
  return Math.max(Math.abs(x), Math.abs(z)) <= ARRIVAL_CLEARANCE
}

/** The island floor: paving in the middle, grass around it, a gravel shore. */
function floor(): BlockPlacement[] {
  const blocks: BlockPlacement[] = []

  for (let x = -ISLAND_RADIUS; x <= ISLAND_RADIUS; x++) {
    for (let z = -ISLAND_RADIUS; z <= ISLAND_RADIUS; z++) {
      const distance = Math.hypot(x, z)
      if (distance > ISLAND_RADIUS) continue

      // Rounded, not floored, so the boundary between two surfaces is the same
      // circle the wall in `planCage` is drawn on - one notion of "a circle of
      // blocks" across the whole codebase.
      const ring = Math.round(distance)

      const model =
        ring >= ISLAND_RADIUS - 1
          ? RIM
          : distance > PLAZA_RADIUS
            ? GRASS
            : ring === INLAY_RADIUS || ring === PLAZA_RADIUS
              ? INLAY
              : PAVING

      blocks.push({ x, y: 0, z, model })
    }
  }

  return blocks
}

/**
 * A fountain: a low stone kerb, water inside it, and a jet standing in the middle.
 *
 * Water is a solid block here like everything else - the lounge has no fluid -
 * so the jet is a column you could climb. That is fine and slightly charming;
 * making it unclimbable would mean a second kind of collision for one decoration.
 */
function fountain(): BlockPlacement[] {
  const blocks: BlockPlacement[] = []
  const radius = 3

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const distance = Math.hypot(dx, dz)
      if (distance > radius) continue

      const x = FOUNTAIN.x + dx
      const z = FOUNTAIN.z + dz

      if (Math.round(distance) === radius) {
        blocks.push({ x, y: 1, z, model: 'bricks_A' })
        continue
      }

      blocks.push({ x, y: 1, z, model: 'water' })
    }
  }

  // The jet, tapering: three of water and a last block of glass, which catches
  // the two neon point lights the scene is lit by.
  blocks.push({ x: FOUNTAIN.x, y: 2, z: FOUNTAIN.z, model: 'water' })
  blocks.push({ x: FOUNTAIN.x, y: 3, z: FOUNTAIN.z, model: 'water' })
  blocks.push({ x: FOUNTAIN.x, y: 4, z: FOUNTAIN.z, model: 'glass' })

  return blocks
}

/** How tall the four corner pillars stand, above the paving. */
const PILLAR_HEIGHT = 5

/**
 * Four lit pillars on the diagonals.
 *
 * They frame the plaza and, more usefully, give the eye something vertical to
 * judge distance against - a flat disc with a fountain on it reads as much
 * smaller than it is until there is something block-height to compare with.
 */
function pillars(): BlockPlacement[] {
  const blocks: BlockPlacement[] = []

  for (const x of [-8, 8]) {
    for (const z of [-8, 8]) {
      for (let y = 1; y <= PILLAR_HEIGHT; y++) {
        blocks.push({ x, y, z, model: y === 1 ? 'stone_dark' : 'metalframe' })
      }
      blocks.push({ x, y: PILLAR_HEIGHT + 1, z, model: 'colored_block_yellow' })
    }
  }

  return blocks
}

/**
 * A stepped platform with a table's worth of clutter on it.
 *
 * The thing people actually build first in a room like this is somewhere to
 * stand and be seen, so the demo has one already - and it doubles as the far
 * end of the walk, which is what makes the world feel like it has a there.
 */
function stage(): BlockPlacement[] {
  const blocks: BlockPlacement[] = []
  const half = 3

  // Two steps up on the near side, so it can be walked onto rather than jumped.
  for (let x = -half; x <= half; x++) {
    blocks.push({ x, y: 1, z: STAGE.z - half - 1, model: 'stone' })
  }

  for (let x = -half; x <= half; x++) {
    for (let z = STAGE.z - half; z <= STAGE.z + half; z++) {
      blocks.push({ x, y: 1, z, model: 'wood' })
      blocks.push({ x, y: 2, z, model: 'wood' })
    }
  }

  // What is on the table. Placed by hand rather than scattered, because four
  // objects in a deliberate arrangement read as somebody's desk and four
  // random ones read as debris.
  blocks.push({ x: -2, y: 3, z: STAGE.z, model: 'computer' })
  blocks.push({ x: 0, y: 3, z: STAGE.z, model: 'books_A' })
  blocks.push({ x: 2, y: 3, z: STAGE.z, model: 'chest' })
  blocks.push({ x: 1, y: 3, z: STAGE.z - 2, model: 'gift' })

  return blocks
}

/**
 * Where the trees stand, on the grass ring, as whole cells.
 *
 * A literal list rather than an angle sweep. Eight points around a circle at
 * radius 17 collapse onto six distinct cells once rounded, and the two that
 * collide leave a visible gap on one side - so the positions that survived
 * being looked at are simply written down.
 */
const TREES: readonly { x: number; z: number }[] = [
  { x: 0, z: -17 },
  { x: 12, z: -12 },
  { x: 17, z: 0 },
  { x: 12, z: 12 },
  { x: 0, z: 17 },
  { x: -12, z: 12 },
  { x: -17, z: 0 },
  { x: -12, z: -12 },
  { x: 7, z: -15 },
  { x: -7, z: 15 },
]

/** The clutter on the paving: crates and barrels somebody left about. */
const PROPS: readonly { x: number; z: number; model: string }[] = [
  { x: -6, z: 2, model: 'crate' },
  { x: -6, z: 3, model: 'barrel' },
  { x: -5, z: 3, model: 'crate' },
  { x: 6, z: -2, model: 'hay_bale' },
  { x: 7, z: -2, model: 'barrel' },
  { x: 6, z: 5, model: 'trashcan' },
  { x: -8, z: -3, model: 'anvil' },
]

function scenery(): BlockPlacement[] {
  const blocks: BlockPlacement[] = []

  for (const tree of TREES) {
    blocks.push({ ...tree, y: 1, model: 'tree' })
  }

  for (const prop of PROPS) {
    if (nearArrival(prop.x, prop.z)) continue
    blocks.push({ x: prop.x, y: 1, z: prop.z, model: prop.model })
  }

  return blocks
}

/**
 * The whole island.
 *
 * Later sections win on a collision, which is why the floor is generated first
 * and the structures after it - a fountain kerb is meant to sit on the paving,
 * not to be shadowed by it. Nothing here actually overlaps today; the ordering
 * is stated so that adding a section does not have to rediscover it.
 */
export function planDemoWorld(): BlockPlacement[] {
  const blocks = [...floor(), ...fountain(), ...pillars(), ...stage(), ...scenery()]

  // Last-wins deduplication, on the same key the world map is built from. The
  // scene renders from a Map anyway, so a duplicate would be harmless there -
  // but the count in the HUD is taken from this list, and a world that reports
  // more blocks than it has is a small lie in the one number on screen.
  const byCell = new Map<string, BlockPlacement>()
  for (const block of blocks) {
    byCell.set(`${block.x},${block.y},${block.z}`, block)
  }

  return [...byCell.values()]
}

/**
 * Where the two hosts stand, on the paving, facing the arrival square.
 *
 * Here rather than in the component that draws them, because "where somebody
 * stands in this world" is a fact about the world - it has to dodge the
 * fountain and the pillars, which are the constants above. The component knows
 * how to walk a body about; it should not have to know where the kerb is.
 */
export const DEMO_HOSTS = [
  {
    id: 'demo-host-mo',
    name: 'Mo',
    avatar: 'fox',
    x: -4.5,
    z: -4.5,
    greeting: 'Welcome! Cool you made it 👋',
    lines: [
      'Press E and put a block down — go on.',
      'Everything here is a demo. Nothing you build is saved.',
      'The real thing has your team standing in it.',
    ],
    /**
     * The first line is the one everybody hears, so it is the one that had to
     * be worth hearing: the joke lands, and it also answers the question a
     * stranger actually has about a 3D world in a browser tab.
     */
    punchLines: [
      'Ow! Oh god, I hope that is not a cryptominer.',
      'Nope, still just blocks. Carry on.',
      'You know Suri is right there, yes?',
      'Fine. Fine! I built that fountain, you know.',
    ],
    downLine: 'Right — I am having a lie down.',
    upLine: 'Up. Fine. Still no cryptominer.',
  },
  {
    id: 'demo-host-suri',
    name: 'Suri',
    avatar: 'panda',
    x: 4.5,
    z: -4.5,
    greeting: 'Hey! Nice, another one of us 🎉',
    lines: [
      'Mo built the fountain. I did the trees.',
      'Left click breaks, right click places.',
      'Ask for an invite and bring the whole team.',
    ],
    punchLines: [
      'Ouch — please tell me that is not a cryptominer.',
      'It is not. It is a demo. You can stop checking.',
      'F charges, Q kicks. Yes, I noticed.',
      'Right, I am telling Mo.',
    ],
    downLine: 'Okay. Okay! Down I go.',
    upLine: 'Back. That is going in the demo notes.',
  },
] as const
