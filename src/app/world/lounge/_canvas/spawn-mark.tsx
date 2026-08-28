'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ARRIVAL_CELLS, standingSurface } from '@/app/world/lounge/_sim/spawn'

/**
 * Where people come in, drawn on the floor.
 *
 * A world's spawn point was a fact only the code knew. It decides where every
 * arrival lands, an owner can move it, and the one place it was never visible
 * was the world itself - so "put the door over there" was a thing you did by
 * walking somewhere, pressing a button and then reloading to find out where
 * everybody actually appeared. A ring on the ground turns it into a place.
 *
 * ---------------------------------------------------------------------------
 * The ring is the *area*, not the point
 * ---------------------------------------------------------------------------
 * This first drew a tight ring on the anchor cell, and it lied: `arrivalCell`
 * does not put people on the anchor, it spreads them across two rings of cells
 * around it so a crowd walking in together does not land in one square. Somebody
 * who had just placed a spawn point reloaded, appeared three blocks off the
 * little circle, and reasonably concluded the feature did not work.
 *
 * So the radius is *derived from* `ARRIVAL_CELLS` rather than chosen. Whatever
 * the spread is, the ring is exactly it - widen the spread and the ring widens
 * with it, and there is no second number to keep in sync. Landing inside the
 * ring is now something the drawing actually promises.
 *
 * Flat on the floor rather than a post or an arch, for the reason the goal
 * frames are not nets: it has to say *where* without being something to walk
 * into. Nothing here is solid and nothing is a ray target - see `ignoreRay`, the
 * same flag the ball and the goals carry - so it can never be the thing your
 * crosshair picks up when you meant the block under it.
 */

/**
 * How far the spread actually reaches, in cells.
 *
 * Read off the list rather than written down. `ARRIVAL_CELLS` is a ring of
 * offsets and this is the furthest of them along either axis, plus the half cell
 * that takes the circle to the far edge of that square rather than to its
 * middle - somebody standing on the outermost cell should be *inside* the ring,
 * not balanced on it.
 */
const REACH =
  ARRIVAL_CELLS.reduce(
    (far, cell) => Math.max(far, Math.abs(cell.x), Math.abs(cell.z)),
    0,
  ) + 0.5

/** Clear of the floor, so it does not fight the surface for the same pixels. */
const HOVER = 0.02

/**
 * A gentle pulse, so it reads as a marker rather than as paint somebody spilled.
 *
 * Slow - one breath every few seconds - because this sits in the middle of a
 * room people stand around in, and anything faster becomes the thing you cannot
 * stop looking at. See the drift toggle for the same restraint.
 */
const PULSE_PERIOD = 3.2

/**
 * The green a start line is drawn in.
 *
 * Borrowed on purpose, and it is the same idea in both places: green is where
 * people *begin*. A start line begins a race and a spawn begins a visit, and
 * anybody who has seen one in this world already reads the colour correctly.
 *
 * The two are still different things - a start is a mark on the Goals tab, a
 * spawn is its own tab and belongs to no match - and they never appear as the
 * same shape: a start is an upright plane you run through, this is flat on the
 * ground. Shared colour, different geometry, no confusion.
 */
const ARRIVAL_GREEN = '#22c55e'

export function SpawnMark({
  at,
  blocks,
  floorY = 0,
  colour = ARRIVAL_GREEN,
}: {
  /**
   * The door's cell, and the height it was set at when it remembers one.
   *
   * `y` is the same nullable preference `world_spawns` stores and the arrival
   * reads - see `standingSurface`. It has to be here as well, because the ring
   * and the people landing on it work the surface out separately and a ring
   * that ignored the height drew on the ground floor while everybody arrived
   * on the island above it. Null, or absent, is the old lowest-first answer.
   */
  at: { x: number; z: number; y?: number | null }
  blocks: readonly { x: number; y: number; z: number }[]
  floorY?: number
  colour?: string
}) {
  /**
   * On the ground under the anchor, not at the world's floor.
   *
   * A spawn point on a raised platform is the interesting case and the one that
   * looks broken if this is wrong: the ring would be buried in the platform and
   * the marker would simply not exist.
   *
   * `standingSurface` and not `surfaceAt`, which is the same call the arrival
   * itself makes - and it has to be the same one, or the ring and the people
   * landing on it end up on different floors. Under a roof that is the visible
   * half of the bug: the ring drew on the roof while everybody arrived beneath
   * it, so the marker pointed at somewhere nobody was.
   *
   * Which is why the remembered height is passed too. `standingSurface` grew a
   * preference when doors started recording the surface they were set on, the
   * arrival started passing it, and this did not - so on a floating island the
   * arrival landed on the island and the ring stayed on the ground far below,
   * which reads exactly like the height having been thrown away.
   */
  const y = useMemo(
    () =>
      standingSurface(
        blocks,
        at.x,
        at.z,
        floorY,
        undefined,
        at.y ?? undefined,
      ) + HOVER,
    [blocks, at.x, at.z, at.y, floorY],
  )

  const material = useRef<THREE.MeshBasicMaterial>(null)

  useFrame((state) => {
    if (!material.current) return
    const phase = (state.clock.elapsedTime % PULSE_PERIOD) / PULSE_PERIOD
    // A cosine rather than a sawtooth: no corner at the top or the bottom of
    // the breath, so it never looks like it stuttered.
    material.current.opacity = 0.35 + 0.25 * (1 - Math.cos(phase * Math.PI * 2)) * 0.5
  })

  return (
    // The cell's middle, which is where an arrival now stands too - see the
    // note in the scene's `spawn` about the half block that used to be missing.
    <group position={[at.x + 0.5, y, at.z + 0.5]}>
      {/* The edge of the landing area. `ringGeometry` is already flat in XY, so
          one quarter turn about X lays it on the floor. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} userData={{ ignoreRay: true }}>
        <ringGeometry args={[REACH - 0.14, REACH, 64]} />
        <meshBasicMaterial
          ref={material}
          color={colour}
          transparent
          opacity={0.5}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* A soft wash across the whole area, so it reads as ground you land on
          rather than as a circle drawn round nothing. Very faint - it covers
          most of a small room, and anything stronger would recolour the floor. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} userData={{ ignoreRay: true }}>
        <circleGeometry args={[REACH - 0.14, 64]} />
        <meshBasicMaterial
          color={colour}
          transparent
          opacity={0.05}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* The exact spot the door was put on, inside it. This is the cell an
          owner stood on when they pressed the button, and the one a lone
          arrival is most likely to get - worth marking apart from the area. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} userData={{ ignoreRay: true }}>
        <ringGeometry args={[0.42, 0.5, 32]} />
        <meshBasicMaterial
          color={colour}
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <SpreadCells colour={colour} />
    </group>
  )
}

/**
 * The cells an arrival can actually be put in.
 *
 * Read straight from `ARRIVAL_CELLS` rather than redrawn from a radius, so this
 * cannot describe a spread the spawn code does not use. If somebody widens the
 * rings there, this widens with them - and so does `REACH` above.
 *
 * Drawn for everybody rather than only while building, which is the other half
 * of the ring telling the truth: these are the squares people land on, and
 * seeing your own square is the thing that makes an arrival feel placed rather
 * than dropped.
 */
function SpreadCells({ colour }: { colour: string }) {
  return (
    <>
      {ARRIVAL_CELLS.map((cell) => (
        <mesh
          key={`${cell.x},${cell.z}`}
          position={[cell.x, 0, cell.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          userData={{ ignoreRay: true }}
        >
          <ringGeometry args={[0.28, 0.34, 20]} />
          <meshBasicMaterial
            color={colour}
            transparent
            opacity={0.22}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  )
}
