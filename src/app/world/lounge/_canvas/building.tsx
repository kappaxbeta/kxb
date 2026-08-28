'use client'

import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { type RefObject, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useRainbowFor } from '@/app/world/_canvas/rainbow'
import {
  type Cell,
  cellKey,
  faceNormal,
  NO_TARGET,
  type Target,
  type VrRay,
} from '@/app/world/lounge/_scene/scene-types'
import { modelUrl } from '@/domain/lounge/palette'

/**
 * Drawing the world, and pointing at it.
 *
 * The three pieces of building that live inside the Canvas: what the world is
 * made of, what the crosshair is on, and the ghost that says what a click would
 * do. Together rather than in three files because they share the contract that
 * makes targeting work at all - <BlockInstances> stashes its cell list on
 * `userData.positions`, and <Targeting> is the only reader of it. Splitting them
 * would hide that handshake behind two imports.
 *
 * None of them touch the scene's refs: a block map in, a target out. That is why
 * they take plain props while the controller does not.
 */

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
const BLOCK_SCALE = 0.5

/** How far you can reach, in blocks. Minecraft uses about five. */
const REACH = 8

/** Scratch: the crosshair never moves, so the ray always starts here. */
const SCREEN_CENTRE = new THREE.Vector2(0, 0)

/**
 * One InstancedMesh per model, sharing the glTF's geometry and material.
 *
 * `useGLTF` caches by URL, so a model used by 4,000 blocks is fetched and
 * parsed once. The positions array is stashed on `userData` so the targeting
 * raycast can turn an `instanceId` back into a world cell.
 */
export function BlockInstances({
  model,
  positions,
}: {
  model: string
  positions: Cell[]
}) {
  const { scene } = useGLTF(modelUrl(model))
  const meshRef = useRef<THREE.InstancedMesh>(null)
  // Null unless rainbow mode is on and this model is in it, in which case it
  // replaces the glTF's own material below. The geometry is untouched either
  // way: a glass wall is still exactly the wall that was built.
  const skin = useRainbowFor(model)

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

    positions.forEach((position, index) => {
      // Cells are addressed by their integer corner and the model is centred on
      // its own origin, so the mesh goes at the centre of the cell. Once scaled
      // to 0.5 the authored 2-unit cube spans exactly x..x+1, which is what
      // makes blocks meet flush and line up with the grid.
      translation.set(position.x + 0.5, position.y + 0.5, position.z + 0.5)
      matrix.compose(translation, rotation, scale)
      mesh.setMatrixAt(index, matrix)
    })
    mesh.count = positions.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.userData.positions = positions
    // `skin` is a dependency because it is a constructor argument below: R3F
    // rebuilds the InstancedMesh when `args` change, and a fresh mesh has none
    // of these matrices on it. Without this, throwing the switch empties the
    // world rather than glazing it.
  }, [positions, skin])

  if (!source) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[
        source.geometry,
        skin ?? (source.material as THREE.Material),
        Math.max(positions.length, 1),
      ]}
      castShadow
      receiveShadow
    />
  )
}

/**
 * Casts a ray from the centre of the screen every frame and reports what it
 * finds.
 *
 * This replaces per-object pointer handlers entirely. Under pointer lock the
 * mouse never moves, so DOM pointer events are useless - the crosshair is
 * fixed, and what matters is what lies along the camera's forward axis.
 *
 * State is only pushed upward when the target *changes*, which for a player
 * standing still is never. Setting React state 60 times a second would re-render
 * the whole scene continuously.
 */
export function Targeting({
  onTarget,
  vrRay,
}: {
  onTarget: (target: Target) => void
  /**
   * The pointing hand, when there is one. See `VrRay`.
   *
   * A ref rather than a value, and the one exception to this file taking plain
   * props: it changes every frame and is read inside one, so passing it as a
   * value would be a re-render per frame to deliver a number this loop was
   * going to read anyway. Optional, because every scene but the lobby has no
   * headset to point with.
   */
  vrRay?: RefObject<VrRay>
}) {
  const { camera, scene } = useThree()
  const lastKey = useRef<string>('')

  // Our own Raycaster rather than the one from useThree(). Setting `far` on the
  // shared instance would silently impose this component's reach limit on every
  // other consumer of it.
  const raycaster = useMemo(() => {
    const instance = new THREE.Raycaster()
    instance.far = REACH
    return instance
  }, [])

  useFrame(() => {
    /**
     * The crosshair, or the hand.
     *
     * In a headset the middle of the view is not a cursor - you look at one
     * thing and reach for another - so when a controller is tracked the ray
     * comes off it instead. `far` survives the switch, because reach is a rule
     * about the world rather than about the pointer: you can lean towards a
     * block, but you cannot build across the room.
     */
    const ray = vrRay?.current
    if (ray?.active) raycaster.set(ray.origin, ray.direction)
    else raycaster.setFromCamera(SCREEN_CENTRE, camera)

    const hits = raycaster.intersectObjects(scene.children, true)

    let next: Target = NO_TARGET

    for (const hit of hits) {
      const object = hit.object

      // The preview ghost must not occlude the thing it is previewing.
      if (object.userData.ignoreRay) continue

      /**
       * Something in front of the world that is not part of it: the VR menu.
       *
       * The opposite of `ignoreRay` above, and it needs saying because the loop
       * *falls through* anything it does not recognise. Without this the ray
       * passes straight out of the back of a menu button and targets the wall
       * behind, so pulling the trigger to choose a block would also knock a hole
       * in the room - and the hole would be where you were pointing, which makes
       * it look like the menu did it on purpose.
       *
       * No target rather than a different one: a panel is not somewhere you can
       * build, so the honest answer to "what is under the pointer" is nothing.
       */
      if (object.userData.stopsRay) {
        next = NO_TARGET
        break
      }

      // Images win when they are nearer, because `intersectObjects` returns
      // hits sorted by distance - so looking at a picture on a wall targets the
      // picture, not the wall behind it.
      const imageId = object.userData.imageId as string | undefined
      if (imageId) {
        next = { hit: null, place: null, image: imageId }
        break
      }

      if (object.userData.isGround) {
        const cell = {
          x: Math.floor(hit.point.x),
          y: 0,
          z: Math.floor(hit.point.z),
        }
        next = { hit: null, place: cell, image: null }
        break
      }

      const positions = object.userData.positions as Cell[] | undefined
      if (positions && hit.instanceId !== undefined) {
        const cell = positions[hit.instanceId]
        if (!cell) continue

        const normal = faceNormal(hit.point, cell)
        next = {
          hit: cell,
          place: { x: cell.x + normal.x, y: cell.y + normal.y, z: cell.z + normal.z },
          image: null,
        }
        break
      }
    }

    const key = `${cellKey(next.hit)}|${cellKey(next.place)}|${next.image ?? '-'}`
    if (key !== lastKey.current) {
      lastKey.current = key
      onTarget(next)
    }
  })

  return null
}

/**
 * The placement preview.
 *
 * Two overlays, because they answer different questions: a glowing shell on the
 * cell that would be filled, and a wireframe cage on the block that would
 * break. Without them, building by eye against a dark void is guesswork - you
 * cannot tell which face of a cube you are pointing at until a block appears in
 * the wrong place.
 */
export function Preview({ target }: { target: Target }) {
  return (
    <>
      {target.place && (
        <mesh
          position={[target.place.x + 0.5, target.place.y + 0.5, target.place.z + 0.5]}
          userData={{ ignoreRay: true }}
        >
          <boxGeometry args={[1.001, 1.001, 1.001]} />
          {/* Saturated rather than pale: against a near-white scene a light
              ghost is invisible, so the preview leans violet and opaque enough
              to read against both the clouds and a white block. */}
          <meshBasicMaterial
            color="#7c3aed"
            transparent
            opacity={0.3}
            depthWrite={false}
          />
        </mesh>
      )}

      {target.hit && (
        <lineSegments
          position={[target.hit.x + 0.5, target.hit.y + 0.5, target.hit.z + 0.5]}
          userData={{ ignoreRay: true }}
        >
          <edgesGeometry args={[new THREE.BoxGeometry(1.02, 1.02, 1.02)]} />
          <lineBasicMaterial color="#4c1d95" transparent opacity={0.9} />
        </lineSegments>
      )}
    </>
  )
}
