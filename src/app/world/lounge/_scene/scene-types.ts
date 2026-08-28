import type * as THREE from 'three'
import { EYE_HEIGHT } from '@/app/world/lounge/_sim/physics'
import { surfaceAt } from '@/app/world/lounge/_sim/spawn'
import { blockKey, WORLD_HEIGHT } from '@/domain/lounge/events'
import type { BlockView } from '@/domain/lounge/queries'

/**
 * The handful of shapes the scene's pieces all have to agree on.
 *
 * Here rather than in `./lounge-scene` because that is now an assembly - it
 * mounts the components in this folder and owns none of them. A type that
 * <Targeting> produces and <Preview> consumes belongs to neither of them and
 * would make whichever one held it the other's dependency.
 *
 * Deliberately not in `@/domain/lounge`. Nothing here is written down: a cell
 * under the crosshair, a pose the shutter borrows and what put you on the floor
 * are all facts about what is on screen this frame, and the domain's job is the
 * log.
 */

export type Cell = { x: number; y: number; z: number }

/**
 * The world, keyed by cell.
 *
 * One map is the whole of the scene's state - see the note on <BlockInstances>,
 * which groups it by model so a world of four thousand blocks is a few dozen
 * draw calls rather than four thousand.
 */
export type BlockMap = Map<string, { x: number; y: number; z: number; model: string }>

/** What took the last of your health, for the one line the death screen gets. */
export interface Downfall {
  /** Their name, or what to call the room when the room did it. */
  name: string
  /** True when it was the floor rather than a person. */
  lava: boolean
}

/**
 * What the crosshair is currently on.
 *
 * `hit` is the block you would break; `place` is the empty cell you would fill.
 * Both are null when you are staring into space.
 */
export interface Target {
  hit: Cell | null
  place: Cell | null
  /** Id of the image under the crosshair, if the ray lands on one first. */
  image: string | null
}

export const NO_TARGET: Target = { hit: null, place: null, image: null }

/**
 * The camera the shutter uses, which is not always the camera on screen.
 *
 * Written by <PlayerControls> every frame and read by `capture`; see the note
 * on `shotPoseRef` in ./scene-refs for why the two can differ.
 */
export interface ShotPose {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  /** False until the first frame has run; nothing to borrow before that. */
  ready: boolean
}

/**
 * Where the pointing hand is and which way it points, in world space.
 *
 * The crosshair's replacement in a headset. Everywhere else "what am I aiming
 * at" is the camera's forward axis through the centre of the screen, because
 * under pointer lock the mouse cannot move and the middle of the view is the
 * only place a cursor could be. In VR there is no screen to have a centre of and
 * the head is not a pointer - you look at a wall and reach for a different one -
 * so the ray has to come off the controller instead.
 *
 * World space rather than local, because the only consumer raycasts with it and
 * a raycaster works in world space. <VrRig> reads the controller's world matrix
 * once a frame and writes both halves here.
 */
export interface VrRay {
  origin: THREE.Vector3
  direction: THREE.Vector3
  /**
   * False whenever there is no hand to point with - out of VR entirely, or in
   * it with a controller asleep on the desk. The reader falls back to the gaze,
   * so a headset with nothing tracked still targets what you look at rather
   * than targeting nothing.
   */
  active: boolean
}

/**
 * The bb10 pack is authored at 2 units per block, centred on the origin - every
 * model's POSITION accessor runs from -1 to +1. The world grid is 1 unit per
 * cell, so everything has to be halved to sit 1:1 in a cell.
 *
 * Measured from the glTF accessors rather than eyeballed: `glass` and `wood`
 * are exactly 2.0, which is the pack's canonical cube.
 *
 * Deliberately a single constant rather than per-model normalisation. Several
 * models overshoot slightly on purpose - dirt_with_grass is 2.166 wide because
 * its grass tufts overhang the cube, and anvil is 2.31 deep - and scaling each
 * model to its own bounding box would shrink exactly those details away, so a
 * grass block would end up visibly smaller than the glass block beside it.
 * Uniform scaling keeps the pack's proportions and lets the overhangs overhang,
 * which is what they were modelled to do.
 */
export const BLOCK_SCALE = 0.5

/** How far you can reach, in blocks. Minecraft uses about five. */
export const REACH = 8

/**
 * Frame time is clamped before it reaches the simulation. A tab left in the
 * background for a minute comes back with an enormous delta, and one step of
 * gravity that large puts the player through the floor and out of the world.
 */
export const MAX_DELTA = 1 / 20

/**
 * Is this cell inside the world at all?
 *
 * Height only: `x` and `z` are bounded elsewhere, by the reach of the pointer
 * and by the world's own edges. This is the check that stops a block being laid
 * under the floor or above the ceiling, and it is a separate answer from
 * `withBlock` returning the map unchanged - a cell outside the world is not an
 * edit that declined, it is a cell that does not exist, and the caller must not
 * go on to queue a write for it.
 */
export function inWorld(cell: { y: number }): boolean {
  return cell.y >= 0 && cell.y < WORLD_HEIGHT
}

/**
 * The world with one more block in it — or the same world, unchanged.
 *
 * **Returning the identical map when nothing changed is load-bearing twice
 * over.** React skips the re-render, which matters in a scene that redraws a
 * canvas; and the caller reads that same fact to decide whether to make a
 * noise. Swinging at a cell that already holds the block you are placing is
 * silent, because nothing happened.
 *
 * Copied rather than mutated when it does change, for the same reason: a map
 * edited in place is the same object, and the scene would go on drawing the
 * world it had.
 */
export function withBlock(blocks: BlockMap, cell: Cell, model: string): BlockMap {
  const key = blockKey(cell.x, cell.y, cell.z)
  if (blocks.get(key)?.model === model) return blocks

  const next = new Map(blocks)
  next.set(key, { ...cell, model })
  return next
}

/** The world with one fewer block — or the same world, if there was none there. */
export function withoutBlock(blocks: BlockMap, cell: Cell): BlockMap {
  const key = blockKey(cell.x, cell.y, cell.z)
  if (!blocks.has(key)) return blocks

  const next = new Map(blocks)
  next.delete(key)
  return next
}

export function toBlockMap(blocks: BlockView[]): BlockMap {
  const map: BlockMap = new Map()
  for (const block of blocks) {
    map.set(blockKey(block.x, block.y, block.z), block)
  }
  return map
}

/**
 * Put the player back on top of a world that was just laid under them.
 *
 * Laying a template replaces the whole world without moving anybody, and
 * everybody in the room is standing at whatever height the *old* world left
 * them at. Drop a two-block-thick pitch under someone standing on a bare plane
 * and they are inside it: `collides` refuses every direction, so they cannot
 * walk out, and gravity cannot help because down is solid too. That is the
 * "the world appears and then you are stuck" report, and it only showed up
 * once laying stopped reloading the page - a reload re-derived the spawn from
 * the new blocks, which is exactly what this does without the reload.
 *
 * The column they are standing in rather than the origin, so a lay does not
 * also teleport everybody to the middle of the map. And only ever upward:
 * somebody flying above the new roof stays where they are, because the world
 * arriving beneath them is not a reason to drop them onto it.
 */
export function standOn(
  player: THREE.Vector3,
  laid: readonly { x: number; y: number; z: number }[],
): void {
  const eye = surfaceAt(laid, Math.floor(player.x), Math.floor(player.z)) + EYE_HEIGHT
  if (player.y < eye) player.y = eye
}

/** Keeps summed keyboard + thumbstick input inside a unit range. */
export function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value))
}

export function cellKey(cell: Cell | null): string {
  return cell ? `${cell.x},${cell.y},${cell.z}` : '-'
}

/**
 * Which face of a cube was hit, as a unit vector.
 *
 * Derived from the hit point rather than the geometry's face normal: the normal
 * would need transforming out of instance space, while the offset from the cell
 * centre gives the answer directly and its dominant axis is the face.
 */
export function faceNormal(point: THREE.Vector3, cell: Cell): Cell {
  const dx = point.x - (cell.x + 0.5)
  const dy = point.y - (cell.y + 0.5)
  const dz = point.z - (cell.z + 0.5)

  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const az = Math.abs(dz)

  if (ax >= ay && ax >= az) return { x: Math.sign(dx) || 1, y: 0, z: 0 }
  if (ay >= ax && ay >= az) return { x: 0, y: Math.sign(dy) || 1, z: 0 }
  return { x: 0, y: 0, z: Math.sign(dz) || 1 }
}
