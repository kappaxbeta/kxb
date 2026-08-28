'use client'

import { useGLTF } from '@react-three/drei'
import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { builderUrl, splitModel } from '@/domain/builder/packs'
import type { Placement } from '@/domain/builder/world'

/**
 * Thousands of the same model, drawn as one call each.
 *
 * The rest of the codebase clones a glTF per thing in the world - see `useModel`
 * in `@/app/world/shots/pieces` - and that is right there, where a scene holds
 * a dozen pieces. It is not right here. A world built by dragging is routinely
 * four thousand blocks, and four thousand cloned scene graphs is four thousand
 * draw calls, a hundred megabytes of duplicated matrices, and an editor that
 * drops to two frames a second before you have finished the first wall.
 *
 * So: one `InstancedMesh` per mesh per model, and the placements become
 * matrices in its buffer. Twenty distinct models in a world means twenty-odd
 * draw calls no matter how many blocks there are, and adding a block is a
 * matrix write rather than a scene graph mutation.
 *
 * ---------------------------------------------------------------------------
 * Why the meshes are pulled apart instead of instancing the whole glTF
 * ---------------------------------------------------------------------------
 * Instancing draws one geometry with one material many times, and a pack model
 * is frequently neither: a `street_lantern` is a post, a bracket and a glowing
 * pane, each with its own material and its own transform inside the file. The
 * loop below flattens that once per model into a list of (geometry, material,
 * where it sits inside the model), and every instance then carries the same
 * flattening. What it cannot express is a model that animates - which is why
 * the peeps are drawn the old way, one clone each, in the stage.
 */

/** One drawable piece of a model: what to draw, how, and where inside the model. */
interface Part {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  /** The piece's transform relative to the model's own origin. */
  local: THREE.Matrix4
}

/**
 * A model's meshes, flattened.
 *
 * `scene` out of `useGLTF` is shared and cached per URL, and nothing here
 * mutates it: the geometries and materials are referenced, not cloned, which is
 * the entire point - one upload to the GPU serving every instance.
 */
function useParts(url: string): Part[] {
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
      // these packs, and splitting it properly would mean slicing the index
      // buffer - so it takes the first material and looks slightly wrong,
      // rather than being dropped and looking absent.
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
      if (!material) return

      parts.push({
        geometry: mesh.geometry,
        material,
        // Relative to the glTF root, which is at the identity - so its world
        // matrix is its local one.
        local: mesh.matrixWorld.clone(),
      })
    })

    return parts
  }, [scene])
}

/**
 * Every placement of one model.
 *
 * Split out per model so React can key on it: adding a block of a model already
 * in the world rewrites one buffer, and adding the first block of a new model
 * mounts one component. Neither touches the others.
 */
export function ModelInstances({
  model,
  placements,
}: {
  model: string
  placements: Placement[]
}) {
  const url = builderUrl(model)
  const pack = splitModel(model)?.pack
  const parts = useParts(url)

  /**
   * Where each placement sits, composed once per change.
   *
   * A cell's `y` is the level of its *floor*, so a bb10 cube - which is
   * modelled around its own centre - is lifted half a cell to sit in it. Every
   * other pack is modelled standing on y=0 and needs no lift. That difference
   * is the `lift` in the pack table, and it is the only reason a chair and a
   * block placed in the same cell both look like they are in it.
   */
  const matrices = useMemo(() => {
    const scale = pack?.scale ?? 1
    const lift = pack?.lift ?? 0
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    const axis = new THREE.Vector3(0, 1, 0)
    const size = new THREE.Vector3()

    return placements.map((placement) => {
      const factor = scale * placement.scale
      position.set(
        placement.x,
        // The lift scales with the placement: a cube drawn at half size is half
        // a cell tall, so its centre sits a quarter of a cell above its floor
        // rather than half. Multiplying by the pack scale too would be wrong -
        // that is already what makes one authored cube one cell.
        placement.y + lift * placement.scale,
        placement.z,
      )
      quaternion.setFromAxisAngle(axis, (placement.rotation * Math.PI) / 180)
      size.setScalar(factor)
      return new THREE.Matrix4().compose(position, quaternion, size)
    })
  }, [placements, pack])

  if (parts.length === 0 || matrices.length === 0) return null

  return (
    <>
      {parts.map((part, index) => (
        <Part
          // Keyed on the count as well as the index because `args` on an
          // `instancedMesh` is only read at construction: a buffer sized for
          // 400 does not grow to 401, it silently keeps drawing 400.
          key={`${index}-${matrices.length}`}
          part={part}
          matrices={matrices}
        />
      ))}
    </>
  )
}

function Part({ part, matrices }: { part: Part; matrices: THREE.Matrix4[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null)

  /**
   * The matrix buffer, filled after mount and after every change.
   *
   * `useLayoutEffect` rather than `useEffect`: an instanced mesh whose buffer
   * has not been written yet draws every instance stacked at the origin, and
   * with a plain effect that wrong frame is presented before the right one -
   * which reads as the whole world flashing into a pile at the centre on every
   * stroke.
   */
  useLayoutEffect(() => {
    const target = mesh.current
    if (!target) return

    const composed = new THREE.Matrix4()
    for (let index = 0; index < matrices.length; index += 1) {
      composed.multiplyMatrices(matrices[index], part.local)
      target.setMatrixAt(index, composed)
    }
    target.instanceMatrix.needsUpdate = true
    // Without this the frustum test uses the geometry's own bounds sitting at
    // the origin, so a world drawn off-centre disappears the moment the camera
    // looks away from the middle of it.
    target.computeBoundingSphere()
  }, [matrices, part])

  return (
    <instancedMesh
      ref={mesh}
      args={[part.geometry, part.material, matrices.length]}
      castShadow
      receiveShadow
      // Not raycast against. The build plane is what the pointer hits (see the
      // stage), and letting a wall intercept the ray would mean you cannot draw
      // on the far side of something you already built.
      raycast={() => null}
    />
  )
}

/**
 * Every placement in the world, grouped by model.
 *
 * The grouping is the whole optimisation, so it happens once here rather than
 * inside each child.
 */
export function Placements({ placements }: { placements: Placement[] }) {
  const groups = useMemo(() => {
    const byModel = new Map<string, Placement[]>()
    for (const placement of placements) {
      const list = byModel.get(placement.model)
      if (list) list.push(placement)
      else byModel.set(placement.model, [placement])
    }
    return [...byModel.entries()]
  }, [placements])

  return (
    <>
      {groups.map(([model, list]) => (
        <ModelInstances key={model} model={model} placements={list} />
      ))}
    </>
  )
}
