'use client'

import { useGLTF } from '@react-three/drei'
import { use, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useRainbowFor } from '@/app/world/_canvas/rainbow'
import { BLOCK_SCALE, blockY } from '@/app/world/shots/pieces'
import { worldSet } from '@/domain/scenes/actions'
import { modelUrl } from '@/domain/lounge/palette'
import type { BlockSpec } from '@/domain/studio/scene'

/**
 * The world a scene names as its set, drawn.
 *
 * The other half of `SetSpec` in `@/domain/studio/scene`: the document carries
 * a world id, and this is the thing that turns one into blocks on screen. Both
 * halves of the studio use it, and so does the player at `/s/<id>`, so a set
 * looks the same in the editor, in the recording and in the link you sent.
 *
 * ---------------------------------------------------------------------------
 * Drawn as instances, not as clones
 * ---------------------------------------------------------------------------
 * `@/app/world/shots/pieces` clones a glTF per block, which is right for the
 * dozen props a still places by hand and hopeless for a world: a built world is
 * routinely thousands of blocks, and thousands of cloned scene graphs is
 * thousands of draw calls and an editor at two frames a second.
 *
 * So one `InstancedMesh` per model, exactly as the lounge draws the same worlds
 * and for the same reason - twenty-odd draw calls whatever the block count. It
 * is the reason the set has no per-block cap worth speaking of while a
 * hand-placed block still does.
 *
 * ---------------------------------------------------------------------------
 * Fetched once per world, per tab
 * ---------------------------------------------------------------------------
 * The blocks come from a server action, and the promise is cached here by world
 * id. Three things want the same set at once - the viewport, the recorder's
 * second canvas, a shot whose still-link was just opened - and each of them
 * re-renders constantly. Without the cache that is a round trip per render.
 *
 * Suspense does the waiting: `use` on the cached promise suspends the same
 * boundary the glTFs already suspend, so `onReady` in the stage keeps meaning
 * "everything has arrived" and the export button keeps waiting for the truth.
 */

/** What a set resolved to. An unreadable world is an empty set, never a throw. */
interface Resolved {
  blocks: BlockSpec[]
  /** The world's name, for a panel that wants to say what is standing there. */
  name: string | null
  /** Blocks that did not fit under the set cap. */
  dropped: number
  /** Placements that were furniture rather than blocks. */
  props: number
}

const EMPTY: Resolved = { blocks: [], name: null, dropped: 0, props: 0 }

const cache = new Map<string, Promise<Resolved>>()

/**
 * The set for a world, as a promise that is only made once.
 *
 * Never rejects. A world that was deleted, or made private after a scene was
 * saved against it, resolves to no blocks - the scene then draws without its
 * backdrop, which is a scene missing its set rather than a page showing an
 * error boundary to somebody who only wanted to watch eight seconds of animals.
 */
export function setBlocks(worldId: string): Promise<Resolved> {
  const held = cache.get(worldId)
  if (held) return held

  const pending = worldSet(worldId)
    .then((result) =>
      result.ok
        ? { blocks: result.blocks, name: result.name, dropped: result.dropped, props: result.props }
        : EMPTY,
    )
    .catch(() => EMPTY)

  cache.set(worldId, pending)
  return pending
}

/**
 * A set that has already been fetched, put in the cache before anything asks.
 *
 * The picker has just been handed every block in the world by the action it
 * called to build its summary. Without this the editor would suspend and fetch
 * the identical list a second time, so the world you just chose would appear a
 * beat after the note saying it had.
 */
export function primeSet(worldId: string, resolved: Resolved): void {
  cache.set(worldId, Promise.resolve(resolved))
}

/** How far the set reaches from the origin, for the shadow camera. */
export function setReach(blocks: BlockSpec[]): number {
  let reach = 0
  for (const block of blocks) {
    reach = Math.max(reach, Math.abs(block.x), Math.abs(block.z))
  }
  return reach
}

export function WorldSet({
  worldId,
  /**
   * How far the set reaches, once it is known.
   *
   * Reported upward rather than measured up there, because the stage does not
   * have the blocks - that is the entire point of a set being a reference - and
   * a shadow camera sized to the document alone would light a metre of a world
   * that is forty across, which reads as the far half being unlit rather than
   * as a shadow map that ran out.
   */
  onReach,
}: {
  worldId: string
  onReach?: (worldId: string, reach: number) => void
}) {
  const { blocks } = use(setBlocks(worldId))

  /** One list per model, which is one `InstancedMesh` per model below. */
  const grouped = useMemo(() => {
    const out = new Map<string, BlockSpec[]>()
    for (const block of blocks) {
      const held = out.get(block.model)
      if (held) held.push(block)
      else out.set(block.model, [block])
    }
    return [...out.entries()]
  }, [blocks])

  useEffect(() => {
    onReach?.(worldId, setReach(blocks))
  }, [worldId, blocks, onReach])

  return (
    <>
      {grouped.map(([model, placements]) => (
        <BlockInstances key={model} model={model} blocks={placements} />
      ))}
    </>
  )
}

/**
 * Every block of one model, as a single draw.
 *
 * The lounge's `BlockInstances` with one difference, and it is the coordinate
 * convention rather than anything structural: a lounge cell is addressed by its
 * corner and offset by half a block to find its centre, while a scene's blocks
 * are already centres with their *top* face named. `blockY` is that difference,
 * and it is the same function the hand-placed blocks go through - which is what
 * makes a crate you drop on an imported floor land on the floor.
 */
function BlockInstances({ model, blocks }: { model: string; blocks: BlockSpec[] }) {
  const { scene } = useGLTF(modelUrl(model))
  const meshRef = useRef<THREE.InstancedMesh>(null)
  // Null unless the scene asked for a rainbow and this model is in it. A set is
  // where the mode earns its keep: somebody's whole town, in glass.
  const skin = useRainbowFor(model)

  // The palette models are single-mesh cubes, so the first mesh is the model.
  // A model that is not - none are today - would draw as its first piece rather
  // than not at all.
  const source = useMemo(() => {
    let found: THREE.Mesh | null = null
    scene.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!found && mesh.isMesh) found = mesh
    })
    return found as THREE.Mesh | null
  }, [scene])

  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const matrix = new THREE.Matrix4()
    const translation = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const scale = new THREE.Vector3(BLOCK_SCALE, BLOCK_SCALE, BLOCK_SCALE)

    blocks.forEach((block, index) => {
      translation.set(block.x, blockY(block.top), block.z)
      rotation.setFromEuler(new THREE.Euler(0, (block.rotation * Math.PI) / 180, 0))
      matrix.compose(translation, rotation, scale)
      mesh.setMatrixAt(index, matrix)
    })
    mesh.count = blocks.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    // `skin` is a dependency because it is a constructor argument below, and
    // R3F rebuilds the mesh when those change - a fresh one has none of these
    // matrices on it, so without this the rainbow would empty the set.
  }, [blocks, skin])

  if (!source) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[
        source.geometry,
        skin ?? (source.material as THREE.Material),
        Math.max(blocks.length, 1),
      ]}
      castShadow
      receiveShadow
    />
  )
}
