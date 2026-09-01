import type { BuilderWorld } from '@/domain/builder/world'
import type { BlockSpec } from '@/domain/studio/scene'
import { toBlocks } from '@/domain/worlds/blocks'

/**
 * A built world, as a set for a scene.
 *
 * The studio composes on an empty patch of grass and two crates. Somebody has
 * usually already built the thing the shot wants to happen in - a pitch, a
 * café, an arena - and rebuilding it block by block in a panel of sliders is
 * not a serious proposition. So a world comes in as a backdrop.
 *
 * ---------------------------------------------------------------------------
 * What survives the trip
 * ---------------------------------------------------------------------------
 * Two filters, and neither is new. `toBlocks` is the same conversion a space
 * uses to walk around somebody's world: of the 1308 models the builder offers,
 * only the 58 in the lounge palette are blocks, and everything else is
 * furniture that gets left behind. Then the studio's own cap applies, because a
 * scene is a render and not a place - every block is a glTF, and a thousand of
 * them is a tab that stops responding while somebody is trying to frame a shot.
 *
 * ---------------------------------------------------------------------------
 * Which blocks are kept, when there are too many
 * ---------------------------------------------------------------------------
 * The nearest to the middle. `toBlocks` orders by the order things were built
 * in, so taking the first N gives whatever the builder happened to start with -
 * usually a corner of floor. A shot is framed on the middle of what it is
 * given, so the middle is what is worth keeping, and the result reads as a
 * fragment of the world rather than as a random handful of its blocks.
 *
 * The count that was dropped travels back with it, because a set that is
 * quietly a tenth of the world is worse than one you were told about.
 */

/** How many blocks a scene will hold *by hand*. Matches the cap in `parseScene`. */
export const SCENE_BLOCK_CAP = 120

/**
 * How many blocks a world may bring when it is standing in as the set.
 *
 * Two orders of magnitude above the hand-placed cap, because the two are
 * limited by different things. A hand-placed block is a cloned glTF in the
 * scene graph and it is written into the document, which is written into the
 * URL - a hundred of those is already generous. A set is neither: it is
 * referenced by id, so it costs the link nothing, and it is drawn as one
 * `InstancedMesh` per model, so a world is twenty-odd draw calls whether it is
 * two hundred blocks or eight thousand.
 *
 * What this number actually guards is the wire and the first frame: the blocks
 * come down as JSON when the scene opens, and a viewer on a phone should not
 * wait on several megabytes of coordinates. Worlds above it arrive as their
 * middle, and the picker says so.
 */
export const SET_BLOCK_CAP = 8_000

export interface ImportedWorld {
  blocks: BlockSpec[]
  /** Placements that were furniture rather than blocks, and never had a chance. */
  props: number
  /** Blocks that were real but did not fit under the cap. */
  dropped: number
}

export function blocksFromWorld(world: BuilderWorld, cap = SCENE_BLOCK_CAP): ImportedWorld {
  const { blocks, props } = toBlocks(world)

  const specs = blocks.map((placement) => ({
    model: placement.model,
    x: placement.x,
    // A lounge cell at `y` fills the space from y to y+1, and a scene's block
    // is named by its *top* face - so the same block is one higher here. Get
    // this wrong and an imported floor sits half a block into the grass.
    top: placement.y + 1,
    z: placement.z,
    rotation: 0,
    time: 0,
    // One cell. A lounge placement is a block in a cell and carries no size of
    // its own - the imported world is a grid, and everything in it is a cube.
    scale: 1,
    tint: null,
    pitch: 0,
    roll: 0,
  }))

  if (specs.length <= cap) return { blocks: specs, props, dropped: 0 }

  // The centre of what there is, rather than the origin: a world built off to
  // one side is still a world with a middle.
  const centre = specs.reduce(
    (sum, block) => ({ x: sum.x + block.x / specs.length, z: sum.z + block.z / specs.length }),
    { x: 0, z: 0 },
  )

  const nearest = [...specs].sort(
    (a, b) =>
      Math.hypot(a.x - centre.x, a.z - centre.z) - Math.hypot(b.x - centre.x, b.z - centre.z),
  )

  return {
    blocks: nearest.slice(0, cap),
    props,
    dropped: specs.length - cap,
  }
}

/**
 * Where a scene's camera should sit to see an imported world.
 *
 * Not a framing anybody would choose, and not trying to be. It is the framing
 * that guarantees the thing you just imported is *on screen* - which is the
 * failure this exists to prevent, because a set that lands behind the camera
 * looks exactly like an import that did nothing.
 */
export function framingFor(blocks: BlockSpec[]): { position: [number, number, number]; target: [number, number, number] } {
  if (blocks.length === 0) {
    return { position: [7.4, 3.6, 8.2], target: [0, 1.1, 0] }
  }

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  let top = 0

  for (const block of blocks) {
    minX = Math.min(minX, block.x)
    maxX = Math.max(maxX, block.x)
    minZ = Math.min(minZ, block.z)
    maxZ = Math.max(maxZ, block.z)
    top = Math.max(top, block.top)
  }

  const centre = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }
  // Far enough back that the widest axis fits at the default lens, with a floor
  // so a single block does not put the camera inside it.
  const reach = Math.max(maxX - minX, maxZ - minZ, 6)

  return {
    position: [
      Math.round((centre.x + reach * 0.9) * 10) / 10,
      Math.round((top + reach * 0.5) * 10) / 10,
      Math.round((centre.z + reach * 0.9) * 10) / 10,
    ],
    // Aimed at half the set's height rather than at the floor, so a tall build
    // sits in the frame instead of running off the top of it.
    target: [
      Math.round(centre.x * 10) / 10,
      Math.round((top / 2) * 10) / 10,
      Math.round(centre.z * 10) / 10,
    ],
  }
}
