'use client'

import { Suspense, useEffect, useMemo, useRef } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { Placements } from '@/app/ovaloffice/builder/instances'
import { Rig } from '@/app/world/shots/pieces'
import type { Cell } from '@/domain/builder/draw'
import {
  type BuilderWorld,
  GRID_REACH,
  groundPlacements,
  LAMP_SCALE,
} from '@/domain/builder/world'

/**
 * The world, drawn, plus the two things only an editor needs: a plane to point
 * at and a ghost of what the current drag would lay down.
 *
 * Everything permanent goes through `Placements`, which instances. The two
 * editor-only pieces are drawn with plain boxes, deliberately - a ghost that
 * loaded the real models would suspend mid-drag, which is a preview that
 * appears after you have let go.
 */

/**
 * The cells the current drag would fill, as translucent boxes.
 *
 * One `InstancedMesh` rather than a box per cell, for the same reason the world
 * is instanced: a wall drag previews four hundred cells and re-previews them on
 * every pointer move.
 */
function Ghost({ cells, erasing }: { cells: Cell[]; erasing: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const target = mesh.current
    if (!target) return
    const matrix = new THREE.Matrix4()
    for (let index = 0; index < cells.length; index += 1) {
      const cell = cells[index]
      matrix.setPosition(cell.x, cell.y + 0.5, cell.z)
      target.setMatrixAt(index, matrix)
    }
    target.instanceMatrix.needsUpdate = true
    target.computeBoundingSphere()
  }, [cells])

  if (cells.length === 0) return null

  return (
    <instancedMesh
      key={cells.length}
      ref={mesh}
      args={[undefined, undefined, cells.length]}
      raycast={() => null}
    >
      {/* A shade under a full cell, so adjacent ghosts read as separate cells
          rather than as one solid mass with no seams in it. */}
      <boxGeometry args={[0.94, 0.94, 0.94]} />
      <meshBasicMaterial
        color={erasing ? '#f87171' : '#f0abfc'}
        transparent
        opacity={0.42}
        depthWrite={false}
      />
    </instancedMesh>
  )
}

/**
 * The lattice the current level sits on, drawn as lines.
 *
 * Without it, building above the ground is aiming at nothing: the plane you are
 * drawing on is invisible, so a block placed at level 6 appears to float in a
 * place you did not choose. The grid is what makes the level a surface.
 */
function LevelGrid({ level, reach }: { level: number; reach: number }) {
  const grid = useMemo(() => {
    const helper = new THREE.GridHelper(reach * 2, reach * 2, '#f0abfc', '#64748b')
    const material = helper.material as THREE.Material
    material.transparent = true
    material.opacity = 0.16
    material.depthWrite = false
    return helper
  }, [reach])

  // The helper owns GPU buffers, and a level change makes a new one.
  useEffect(() => () => grid.dispose(), [grid])

  return <primitive object={grid} position={[0, level, 0]} raycast={() => null} />
}

export function BuildStage({
  world,
  level,
  ghost,
  erasing,
  drawing,
  onPoint,
  onPointerDown,
  onPointerUp,
}: {
  world: BuilderWorld
  /** Which level the pointer plane sits on. */
  level: number
  /** The cells the in-flight drag would fill. Empty when nothing is happening. */
  ghost: Cell[]
  erasing: boolean
  /**
   * Whether the left button belongs to the tools.
   *
   * False while the camera has it - see the note on look mode in the editor.
   * The plane stops answering rather than the editor ignoring what it says,
   * because the plane is also what feeds the hover readout, and a readout that
   * keeps updating while the camera swings is a readout showing where the
   * pointer would be if you were drawing, which you are not.
   */
  drawing: boolean
  /**
   * The cell under the pointer, every time it moves over the plane.
   *
   * `shift` rides along on all three because shift is what turns a stroke into
   * a rubbing-out - see the note on it in the editor. It is read from the
   * event rather than from a keyboard listener so that it is the state of the
   * key at the moment of the gesture, which is the only moment that matters.
   */
  onPoint: (cell: Cell, shift: boolean) => void
  onPointerDown: (cell: Cell, shift: boolean) => void
  onPointerUp: (shift: boolean) => void
}) {
  const ground = useMemo(() => groundPlacements(world.ground), [world.ground])

  /**
   * The shadow camera's box, sized to what is actually in the world.
   *
   * A fixed box is wrong in both directions: too small and the far half of a
   * big build has no shadows at all, too large and the same 2048px map is
   * spread over empty space until the contact shadows go soft.
   */
  const radius = useMemo(() => {
    let reach = world.ground ? Math.max(world.ground.cols, world.ground.rows) / 2 : 0
    for (const placement of world.placements) {
      reach = Math.max(reach, Math.abs(placement.x), Math.abs(placement.z))
    }
    return Math.min(Math.max(reach, 8) + 4, 120)
  }, [world.ground, world.placements])

  /**
   * Where the pointer is, in cells.
   *
   * The plane is a mesh rather than a `THREE.Plane` and a manual raycast,
   * because R3F's pointer events already do the raycasting, the capture and the
   * hit-testing against everything else in the scene.
   *
   * `point` arrives in world units and a cell is named by its centre - a block
   * at x=3 spans 2.5 to 3.5 - so the cell is the rounded coordinate. Written as
   * a floor of the half-shifted value rather than `Math.round`, which breaks
   * ties upward and would make the boundary at -2.5 belong to -2 while the one
   * at 2.5 belongs to 3.
   */
  const toCell = (event: ThreeEvent<PointerEvent>): Cell => ({
    x: Math.floor(event.point.x + 0.5),
    y: level,
    z: Math.floor(event.point.z + 0.5),
  })

  return (
    <>
      {/* No rim from the rig: the world's own pair is drawn below. */}
      <Rig light={{ ...world.light, rim: 0 }} radius={radius} />
      <Lamps world={world} radius={radius} />
      {world.background && <color attach="background" args={[world.background]} />}

      <LevelGrid level={level} reach={GRID_REACH} />

      {/*
        The pointer plane. Invisible, enormous, and the only thing in the scene
        that is raycast against - every other object opts out, so a wall you
        already built never intercepts a drag aimed past it.

        `visible={false}` would take it out of the raycast too, so it is drawn
        with a fully transparent material instead.
      */}
      <mesh
        position={[0, level, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={
          drawing
            ? (event) => {
                event.stopPropagation()
                onPoint(toCell(event), event.shiftKey)
              }
            : undefined
        }
        onPointerDown={
          drawing
            ? (event) => {
                // Only the left button draws. The others belong to the orbit
                // control, and ignoring them here is what stops a camera drag
                // from painting a line across whatever it passed over.
                if (event.button !== 0) return
                event.stopPropagation()
                onPointerDown(toCell(event), event.shiftKey)
              }
            : undefined
        }
        onPointerUp={
          drawing
            ? (event) => {
                if (event.button !== 0) return
                event.stopPropagation()
                onPointerUp(event.shiftKey)
              }
            : undefined
        }
      >
        <planeGeometry args={[GRID_REACH * 2 + 1, GRID_REACH * 2 + 1]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/*
        One boundary around everything that loads.

        Per-model boundaries would let the world paint in as each pack arrives,
        which sounds better and is worse for the thing this page exists for: the
        export button fires when the boundary resolves, and a scene made of
        twenty boundaries has no single moment at which it is complete.
      */}
      <Suspense fallback={null}>
        <Placements placements={ground} />
        <Placements placements={world.placements} />
      </Suspense>

      <SpawnMarker world={world} />
      <Marks world={world} />
      <Ghost cells={ghost} erasing={erasing} />
    </>
  )
}

/**
 * The two coloured lights, where the document says they stand.
 *
 * Drawn here rather than inside `Rig`, which has an identical pair baked into
 * it. That is deliberate: `Rig` is shared with the scene studio and the shots,
 * and widening its props to carry a builder document's lamps would make every
 * caller answer a question only this one asks. So the rig is asked for no rim
 * at all, and the world supplies its own pair.
 *
 * `light.rim` stays the master dial: it multiplies both, which is exactly what
 * it did when the pair was hardcoded.
 */
function Lamps({ world, radius }: { world: BuilderWorld; radius: number }) {
  return (
    <>
      {world.lamps.map((lamp, index) => {
        const angle = (lamp.azimuth * Math.PI) / 180
        // Standing outside whatever is built, so a lamp is never buried inside
        // a wall on a big world and blazing on a small one.
        const distance = Math.max(12, radius)
        return (
          <pointLight
            // The pair is fixed at two and neither is reordered, so the index is
            // the identity.
            key={index}
            position={[
              distance * Math.sin(angle),
              lamp.height,
              distance * Math.cos(angle),
            ]}
            intensity={LAMP_SCALE * lamp.intensity * world.light.rim}
            color={lamp.color}
            distance={distance * 3}
          />
        )
      })}
    </>
  )
}

/**
 * The door, drawn as a post you can see over a wall.
 *
 * Tall and thin rather than a mark on the floor, because the thing you need to
 * check is "is the spawn inside the arena or behind it", and a flat marker
 * disappears the moment anything is built between you and it.
 *
 * Out of the raycast like everything else here: the pointer plane is the only
 * thing a stroke may hit, so the marker never eats a click aimed past it.
 */
function SpawnMarker({ world }: { world: BuilderWorld }) {
  if (!world.spawn) return null

  return (
    <group position={[world.spawn.x, 0, world.spawn.z]} raycast={() => null}>
      <mesh position={[0, 2, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.14, 0.14, 4, 8]} />
        <meshBasicMaterial color="#4ade80" transparent opacity={0.75} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        {/* A ring the size the arrivals actually spread over, so a spawn set
            against a wall is visibly one that will put people inside it. */}
        <ringGeometry args={[3.6, 4.4, 32]} />
        <meshBasicMaterial color="#4ade80" transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </group>
  )
}

/** The colours the lounge draws goals and race marks in. */
const MARK_COLOURS: Record<string, string> = {
  red: '#f87171',
  blue: '#60a5fa',
  start: '#4ade80',
  finish: '#fbbf24',
}

/**
 * Goals and race marks, as frames.
 *
 * Drawn as an outline rather than a solid, because that is what they are: a
 * thing you run *through*. A filled panel would read as a wall, which is the
 * one thing a goal must not look like.
 *
 * Out of the raycast, like everything else that is not the pointer plane.
 */
function Marks({ world }: { world: BuilderWorld }) {
  return (
    <>
      {world.marks.map((mark, index) => (
        <group
          key={`${mark.kind}-${index}`}
          position={[mark.x, mark.y, mark.z]}
          // Quarter turns, the same unit the goal aggregate stores.
          rotation={[0, (mark.facing * Math.PI) / 2, 0]}
          raycast={() => null}
        >
          <mesh position={[0, mark.height / 2, 0]} raycast={() => null}>
            <boxGeometry args={[mark.width, mark.height, 0.3]} />
            <meshBasicMaterial
              color={MARK_COLOURS[mark.kind] ?? '#ffffff'}
              transparent
              opacity={0.28}
              depthWrite={false}
            />
          </mesh>
          {/* Posts, so the frame is legible edge-on - a translucent panel seen
              from the side is nothing at all. */}
          {[-mark.width / 2, mark.width / 2].map((offset) => (
            <mesh key={offset} position={[offset, mark.height / 2, 0]} raycast={() => null}>
              <boxGeometry args={[0.3, mark.height, 0.3]} />
              <meshBasicMaterial color={MARK_COLOURS[mark.kind] ?? '#ffffff'} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  )
}
