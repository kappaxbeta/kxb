import type { StudioScene } from '@/domain/studio/scene'

/**
 * Where a newly added prop should stand.
 *
 * ---------------------------------------------------------------------------
 * Why the origin stopped being the answer
 * ---------------------------------------------------------------------------
 * A prop used to arrive at `x: 0, z: 0` with the note that somewhere visible
 * beats somewhere clever - and that was true while the only things you could
 * add were a metre-wide bb10 cube and a galaxy. It stopped being true the
 * moment the picker reached the whole catalogue, because the origin is exactly
 * where the default cast stands: three peeps within a cell and a half of it.
 * Add a firework rocket there - a third of a peep's height, by design - and it
 * arrives behind a penguin. The button reads as broken.
 *
 * So the spot is *found* rather than fixed: the first candidate that has
 * nobody standing on it. That is the same promise the old comment made, kept
 * in a scene that has things in it.
 *
 * ---------------------------------------------------------------------------
 * Why it walks outward from the front rather than scanning the grid
 * ---------------------------------------------------------------------------
 * The camera looks at the origin from `+x, +z` (see `DEFAULT_SCENE.camera`), so
 * the near edge of the island is the part of the frame nothing ever occludes.
 * Walking outward from there puts a new prop in front of the cast rather than
 * behind it, and the ring keeps it close enough that the next thing you do -
 * drag it - is a short drag.
 *
 * Nothing here knows how big the model is. A bounds-aware version would need
 * the catalogue's half-megabyte of measurements on a surface that currently
 * imports none of it, to move a prop somebody is about to drag anyway.
 */

/** How close is too close, in cells, to something already standing there. */
const CLEAR = 1.4

/**
 * Candidate spots, nearest-and-most-visible first.
 *
 * Written out rather than generated: it is eleven numbers, the order is the
 * whole design, and a loop producing them would be longer than the list.
 */
const SPOTS: readonly { x: number; z: number }[] = [
  { x: 0, z: 3 },
  { x: 2, z: 3 },
  { x: -2, z: 3 },
  { x: 3.5, z: 1.5 },
  { x: -3.5, z: 1.5 },
  { x: 0, z: 4.5 },
  { x: 4.5, z: 3 },
  { x: -4.5, z: 3 },
  { x: 2, z: -2 },
  { x: -2, z: -2 },
  { x: 0, z: -4 },
]

/** Half the ground's extent, or a sensible patch when a scene has no ground. */
function bounds(scene: StudioScene): { x: number; z: number } {
  const cols = scene.ground ? Math.floor(scene.ground.cols / 2) : 6
  const rows = scene.ground ? Math.floor(scene.ground.rows / 2) : 5
  return { x: cols, z: rows }
}

function taken(scene: StudioScene, x: number, z: number): boolean {
  const near = (ax: number, az: number) => Math.hypot(ax - x, az - z) < CLEAR
  return (
    scene.peeps.some((peep) => near(peep.x, peep.z)) ||
    scene.blocks.some((block) => near(block.x, block.z))
  )
}

/**
 * A free spot in the scene, or the first candidate if every one is occupied.
 *
 * Total on purpose: a crowded scene still adds the prop, on top of something,
 * which is a prop you can see and drag. Returning nothing would mean a button
 * that sometimes does nothing, which is the failure this exists to prevent.
 */
export function freeSpot(scene: StudioScene): { x: number; z: number } {
  const limit = bounds(scene)
  const inside = SPOTS.filter((spot) => Math.abs(spot.x) <= limit.x && Math.abs(spot.z) <= limit.z)
  const room = inside.length > 0 ? inside : SPOTS
  return room.find((spot) => !taken(scene, spot.x, spot.z)) ?? room[0]
}
