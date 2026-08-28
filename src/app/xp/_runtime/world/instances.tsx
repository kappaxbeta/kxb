'use client'

import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { floorOffset } from '@kxb/xp/catalogue'
import { modelUrl, splitModel } from '@kxb/xp/packs'
import type { Placement } from '@kxb/xp'

/**
 * Every placement in a world, drawn as one call per model.
 *
 * Provenance: copied from `src/app/ovaloffice/builder/instances.tsx`, which
 * does the same job for the world builder. Its own copy per docs/xp/creator.md
 * §1.3 - and it is already diverging, because an XP world has entities in it
 * that the builder has no concept of and this is where they will hang.
 *
 * ---------------------------------------------------------------------------
 * Why instanced and not a clone each
 * ---------------------------------------------------------------------------
 * The rest of the codebase clones a glTF per thing in a scene, which is right
 * where a scene holds a dozen pieces. A level is not that: even the small
 * example room is thirty-odd placements, and a real one is thousands. Thousands
 * of cloned scene graphs is thousands of draw calls and a level that drops to
 * two frames a second before the first room is finished.
 *
 * So: one `InstancedMesh` per mesh per model, and the placements become
 * matrices in its buffer. Twenty distinct models means twenty-odd draw calls no
 * matter how many pieces there are.
 *
 * What it cannot express is a model that animates, which is why the player's
 * own character is drawn the ordinary way. Instancing shares one skeleton
 * across every instance, so an instanced crowd is a crowd doing exactly the
 * same thing at exactly the same moment.
 */

/**
 * Where an unused instance slot goes.
 *
 * Shared and never mutated - a zero-scale matrix is the same matrix every time,
 * and `setMatrixAt` copies it rather than keeping the reference.
 */
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)

/** One drawable piece of a model: what to draw, how, and where inside the model. */
interface Part {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  /** The piece's transform relative to the model's own origin. */
  local: THREE.Matrix4
  /**
   * The node's own name, as `GLTFLoader` sanitizes it - the same stripping
   * `scripts/gltf-raster.ts`'s `sanitizeNodeName` applies at build time so a
   * blueprint's `spin.node` names the same string here. What draws this part
   * is usually a mesh with no useful name of its own; the node above it is
   * what `xp-catalogue.ts` lists and what a picker offers.
   */
  name: string
  /**
   * Everything above this node, composed into one matrix - `local` with the
   * node's own transform left out.
   *
   * Only `LiveModel` reads this, to inject a live rotation between a node and
   * its ancestors without re-deriving the ancestor chain every frame: `pivot
   * × turn(angle) × ownLocal` in place of the baked `local` for the one part a
   * blueprint's `spin` names.
   */
  pivot: THREE.Matrix4
  /** The node's own untouched TRS - what `pivot` does not already carry. */
  ownLocal: THREE.Matrix4
}

/**
 * A model's meshes, flattened.
 *
 * `scene` out of `useGLTF` is shared and cached per URL, and nothing here
 * mutates it: the geometries and materials are referenced, not cloned, which is
 * the entire point - one upload to the GPU serving every instance.
 */
export function useParts(url: string): Part[] {
  const { scene } = useGLTF(url)

  return useMemo(() => {
    const parts: Part[] = []
    // The matrices inside a freshly loaded glTF are set but not composed down
    // the tree, so a mesh nested two groups deep reports the identity until
    // this runs.
    scene.updateMatrixWorld(true)

    scene.traverse((node) => {
      const mesh = node as THREE.Mesh
      if (!mesh.isMesh || !mesh.geometry) return

      // A multi-material mesh is one geometry drawn once per group. Rare in
      // this pack, and splitting it properly would mean slicing the index
      // buffer - so it takes the first material and looks slightly wrong,
      // rather than being dropped and looking absent.
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      if (!material) return

      parts.push({
        geometry: mesh.geometry,
        material,
        local: mesh.matrixWorld.clone(),
        name: mesh.name,
        pivot: mesh.parent ? mesh.parent.matrixWorld.clone() : new THREE.Matrix4(),
        ownLocal: mesh.matrix.clone(),
      })
    })

    return parts
  }, [scene])
}

/**
 * Every placement of one model.
 *
 * Split out per model so React can key on it: adding a piece of a model already
 * in the world rewrites one buffer, and adding the first piece of a new model
 * mounts one component. Neither touches the others.
 */
export function ModelInstances({
  model,
  placements,
  onPick,
}: {
  model: string
  placements: Placement[]
  /** Which instance was clicked, by its index in the buffer. */
  onPick?: (instance: number) => void
}) {
  const url = modelUrl(model)
  const pack = splitModel(model)?.pack
  const parts = useParts(url)

  const matrices = useMemo(() => {
    const scale = pack?.scale ?? 1
    const lift = pack?.lift ?? 0
    /**
     * Extra height for a model drawn around its own centre.
     *
     * Separate from the pack's `lift`, which is about how a whole pack is
     * authored. This is per model: 20 of the prototype kit's 85 are pivoted at
     * their middle because they hang off a socket, and dropped on a floor they
     * sink half into it. `@kxb/xp/engine` applies the same number, so the
     * barrel you can see and the barrel you bump into are in one place.
     */
    const stand = floorOffset(model)
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const euler = new THREE.Euler()
    const size = new THREE.Vector3()

    return placements.map((placement) => {
      const factor = scale * placement.scale
      // Absent is 1, which is what the format says and what the collision grid
      // reads through `stretchOf`. Written out here rather than imported so the
      // matrix and the cells cannot drift over what an absent axis means.
      const sx = placement.stretch?.x ?? 1
      const sy = placement.stretch?.y ?? 1
      const sz = placement.stretch?.z ?? 1
      position.set(
        placement.x,
        // The lift scales with the placement, not with the pack: the pack scale
        // is already what makes one authored unit one cell, so counting it
        // twice would sink every piece into the floor. Zero for this pack, which
        // stands on y=0 - it is here for the day a pack does not.
        //
        // Through the y stretch as well, because it is half the model's own
        // height: a piece stretched twice as tall is pivoted twice as far above
        // its feet, and `placementCells` raises it by exactly this.
        placement.y + (lift + stand) * placement.scale * sy,
        placement.z,
      )
      /**
       * `YXZ`, so the angles are applied yaw, pitch, roll.
       *
       * The order the format documents and the one `skinned.tsx` sets on a
       * weapon in a hand - and `rotationMatrix` in `@kxb/xp/engine` is this
       * matrix transcribed, so the ramp you can see and the cells you stand on
       * are tilted the same way rather than by two conventions that agree until
       * two angles are non-zero at once.
       */
      euler.set(
        ((placement.pitch ?? 0) * Math.PI) / 180,
        (placement.rotation * Math.PI) / 180,
        ((placement.roll ?? 0) * Math.PI) / 180,
        'YXZ',
      )
      quaternion.setFromEuler(euler)
      size.set(factor * sx, factor * sy, factor * sz)
      return new THREE.Matrix4().compose(position, quaternion, size)
    })
  }, [placements, pack, model])

  /**
   * Room for more than there are, so that placing one piece is not a rebuild.
   *
   * `args` on an `instancedMesh` is read once, at construction - a buffer sized
   * for 400 does not become 401, it silently keeps drawing 400 - so the count
   * has to be part of the key. Keying on the *exact* count means every single
   * placement remounts every mesh of that model, and in an editor that is the
   * whole level visibly popping out and back on every click, which is what it
   * looked like: "the whole scene reloads when I add one".
   *
   * Rounded up to a power of two instead, so a run of forty walls sits in a
   * buffer of sixty-four and the next twenty-four cost a buffer write. The
   * unused slots are given a zero scale - a degenerate matrix draws nothing,
   * where parking them at the origin would draw a pile of walls in the middle
   * of the room.
   */
  const room = capacityFor(matrices.length)

  if (parts.length === 0 || matrices.length === 0) return null

  return (
    <>
      {parts.map((part, index) => (
        <PartMesh key={`${index}-${room}`} part={part} matrices={matrices} room={room} onPick={onPick} />
      ))}
    </>
  )
}

/**
 * How big a buffer to ask for, given how many there are.
 *
 * Doubling, with a floor: the floor is because most models in a level appear
 * once or twice and a buffer of one is a remount on the second, and the
 * doubling is because the alternative - a fixed slack of, say, 32 - remounts
 * every 32 pieces however big the level gets, which is worst exactly where it
 * hurts most.
 */
export function capacityFor(count: number): number {
  return Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(count, 1))))
}

function PartMesh({
  part,
  matrices,
  room,
  onPick,
}: {
  part: Part
  matrices: THREE.Matrix4[]
  /** How many the buffer holds, which is at least `matrices.length`. */
  room: number
  onPick?: (instance: number) => void
}) {
  const mesh = useRef<THREE.InstancedMesh>(null)

  /**
   * The matrix buffer, filled after mount and after every change.
   *
   * `useLayoutEffect` rather than `useEffect`: an instanced mesh whose buffer
   * has not been written yet draws every instance stacked at the origin, and
   * with a plain effect that wrong frame is presented before the right one -
   * which reads as the whole level flashing into a pile at the centre.
   */
  useLayoutEffect(() => {
    const target = mesh.current
    if (!target) return

    const composed = new THREE.Matrix4()
    for (let index = 0; index < matrices.length; index += 1) {
      composed.multiplyMatrices(matrices[index], part.local)
      target.setMatrixAt(index, composed)
    }
    /**
     * The slack, hidden rather than left as it was.
     *
     * An `InstancedMesh` draws every slot in its buffer, and a slot nobody
     * wrote holds an identity matrix - which is a wall at the origin. A zero
     * scale is a degenerate matrix and draws nothing at all, where parking the
     * spares somewhere far away would still cost the transform and would still
     * stretch the bounding sphere over the whole distance.
     */
    for (let spare = matrices.length; spare < room; spare += 1) {
      target.setMatrixAt(spare, HIDDEN)
    }
    target.instanceMatrix.needsUpdate = true
    // Without this the frustum test uses the geometry's own bounds sitting at
    // the origin, so a level drawn off-centre disappears the moment the camera
    // looks away from the middle of it.
    target.computeBoundingSphere()
  }, [matrices, part, room])

  return (
    <instancedMesh
      ref={mesh}
      args={[part.geometry, part.material, room]}
      castShadow
      receiveShadow
      onPointerDown={
        onPick
          ? (event) => {
              if (event.instanceId === undefined) return
              // Stopped so the build plane underneath does not also react - a
              // click that selects a crate and lays a wall behind it is one
              // gesture doing two things.
              event.stopPropagation()
              onPick(event.instanceId)
            }
          : undefined
      }
    />
  )
}

/**
 * One entity, drawn.
 *
 * Entities go through the same instancing as placements - grouped by model, one
 * buffer each - because a level with forty crates in it is a level with forty
 * crates in it either way. What differs is only the position: an entity's is in
 * world units and fractional, so it is written straight into the matrix rather
 * than snapped.
 */
export interface DrawnEntity {
  /** The entity's own id, so a click can name it. */
  id: number
  model: string
  x: number
  y: number
  z: number
  rotation: number
  /** The other two angles and the per-axis size. Absent is level and unstretched. */
  pitch?: number
  roll?: number
  stretch?: { x?: number; y?: number; z?: number }
  scale: number
}

export function Entities({
  entities,
  onPick,
}: {
  entities: readonly DrawnEntity[]
  /** Called with the entity's id when one is clicked. */
  onPick?: (id: number) => void
}) {
  /**
   * Grouped by model, and the ids kept alongside.
   *
   * Instancing is what makes a level of forty crates one draw call, and it is
   * also what makes clicking one hard: there is no object per crate to attach a
   * handler to, only a buffer index. So each group carries the ids in the same
   * order its matrices were written, and `instanceId` from the event is an
   * index into that - which is exact, because the two lists are built in one
   * pass from one array.
   */
  const byModel = useMemo(() => {
    const groups = new Map<string, { placements: Placement[]; ids: number[] }>()
    for (const entity of entities) {
      const group = groups.get(entity.model) ?? { placements: [], ids: [] }
      group.placements.push({
        model: entity.model,
        x: entity.x,
        y: entity.y,
        z: entity.z,
        rotation: entity.rotation,
        // Spread, so an entity that is level and unstretched becomes exactly
        // the placement it always was rather than one carrying three zeroes.
        ...(entity.pitch ? { pitch: entity.pitch } : {}),
        ...(entity.roll ? { roll: entity.roll } : {}),
        ...(entity.stretch ? { stretch: entity.stretch } : {}),
        scale: entity.scale,
      })
      group.ids.push(entity.id)
      groups.set(entity.model, group)
    }
    return [...groups.entries()]
  }, [entities])

  return (
    <>
      {byModel.map(([model, group]) => (
        <ModelInstances
          key={model}
          model={model}
          placements={group.placements}
          onPick={
            onPick
              ? (instance) => {
                  const id = group.ids[instance]
                  if (id !== undefined) onPick(id)
                }
              : undefined
          }
        />
      ))}
    </>
  )
}

/**
 * The whole world, grouped by model so each one instances.
 *
 * The groups carry the index each piece had in the document, for the same
 * reason the entities do: instancing is what makes four hundred walls one draw
 * call and it is also what makes clicking one hard, because there is no object
 * per wall to hang a handler on - only a slot in a buffer. The two lists are
 * built in one pass from one array, so `instanceId` is an exact index back.
 */
export function Placements({
  placements,
  onPick,
}: {
  placements: readonly Placement[]
  /** Called with the placement's index in the document when one is clicked. */
  onPick?: (index: number) => void
}) {
  const byModel = useMemo(() => {
    const groups = new Map<string, { placements: Placement[]; indexes: number[] }>()
    placements.forEach((placement, index) => {
      const group = groups.get(placement.model) ?? { placements: [], indexes: [] }
      group.placements.push(placement)
      group.indexes.push(index)
      groups.set(placement.model, group)
    })
    return [...groups.entries()]
  }, [placements])

  return (
    <>
      {byModel.map(([model, group]) => (
        <ModelInstances
          key={model}
          model={model}
          placements={group.placements}
          onPick={
            onPick
              ? (instance) => {
                  const index = group.indexes[instance]
                  if (index !== undefined) onPick(index)
                }
              : undefined
          }
        />
      ))}
    </>
  )
}
