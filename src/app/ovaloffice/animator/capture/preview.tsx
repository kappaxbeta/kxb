'use client'

import { OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { type RigHandle, rigFrom } from '@/app/ovaloffice/animator/posing'
import { Rig } from '@/app/world/shots/pieces'
import { RIGS } from '@/domain/animator/rig'
import { type MocapSkeleton, type SkeletonBone, skeletonOf } from '@/domain/mocap/skeleton'
import { DEFAULT_LIGHT } from '@/domain/studio/scene'

/**
 * The dummy, standing there doing whatever the camera says.
 *
 * A cut-down cousin of the animator's stage: the same model, the same
 * lighting, and none of the handles - there is nothing to drag here, because
 * everything this figure does comes from a body in front of a webcam. What it
 * keeps is the split the stage argues for at length: React owns nothing about
 * the pose, the caller writes straight into `THREE.Bone.quaternion` through
 * the `RigHandle` it is handed, and the canvas draws whatever is there.
 *
 * That is what makes a live preview affordable at all. Thirty poses a second
 * through `useState` is thirty renders a second of a page with a timeline and
 * a panel of controls on it.
 */
export function Preview({
  onReady,
}: {
  /** The loaded body, and the same skeleton as plain numbers for retargeting. */
  onReady: (rig: RigHandle, skeleton: MocapSkeleton) => void
}) {
  return (
    <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-slate-950">
      <Canvas
        shadows="percentage"
        dpr={[1, 2]}
        camera={{ position: [0, 1.1, 3.1], fov: 40, near: 0.05, far: 100 }}
      >
        <Rig light={{ ...DEFAULT_LIGHT, rim: DEFAULT_LIGHT.rim * 0.5 }} radius={4} />
        <Floor />
        <Suspense fallback={null}>
          <Body onReady={onReady} />
        </Suspense>
        <OrbitControls
          makeDefault
          target={[0, 0.8, 0]}
          enableDamping={false}
          maxPolarAngle={Math.PI / 1.9}
          minDistance={0.8}
          maxDistance={8}
        />
      </Canvas>
    </div>
  )
}

function Body({ onReady }: { onReady: (rig: RigHandle, skeleton: MocapSkeleton) => void }) {
  const body = RIGS.dummy
  const { scene } = useGLTF(body.url)

  const loaded = useMemo(() => {
    // Skinned, so `SkeletonUtils.clone` - a plain clone leaves the meshes bound
    // to the original skeleton and posing the copy moves nothing. The same note
    // is in the animator's stage; the same mistake is available here.
    const root = cloneSkinned(scene)
    root.traverse((node) => {
      node.raycast = () => null
    })
    const rig = rigFrom(root, body.specs)
    // Read *now*, before anything has been applied: `skeletonFrom` is taking
    // the bind pose off live objects, and a pose written into them first would
    // be recorded as the model's resting shape.
    return { rig, skeleton: skeletonFrom(rig) }
  }, [scene, body.specs])

  useEffect(() => onReady(loaded.rig, loaded.skeleton), [loaded, onReady])

  return <primitive object={loaded.rig.root} />
}

/**
 * The loaded rig, as the plain numbers `@/domain/mocap` works in.
 *
 * The bridge between the two halves of this feature, and the only file that
 * has a foot in both. Retargeting is deliberately free of three - see the note
 * on `MocapSkeleton` - so somebody has to walk the live tree once and write
 * down what it is: who each bone's nearest bone-parent is, and the local
 * transform it shipped with.
 *
 * "Nearest bone-parent" rather than "parent" because the tree has containers
 * in it: `root` hangs off `Rig_Medium`, which is not part of any pose and is
 * not in `rig.bones`. Climbing past those is what keeps the chain unbroken.
 */
export function skeletonFrom(rig: RigHandle): MocapSkeleton {
  const bones: SkeletonBone[] = []

  for (const [name, node] of rig.bones) {
    let parent: string | null = null
    for (let at = node.parent; at; at = at.parent) {
      if (rig.bones.has(at.name)) {
        parent = at.name
        break
      }
    }

    const rest = rig.restQuats.get(name) ?? new THREE.Quaternion()
    bones.push({
      name,
      parent,
      rest: [rest.x, rest.y, rest.z, rest.w],
      offset: [node.position.x, node.position.y, node.position.z],
    })
  }

  return skeletonOf(bones)
}

/** The ground, so a crouch reads as a crouch and not as a figure sinking. */
function Floor() {
  const grid = useMemo(() => {
    const helper = new THREE.GridHelper(8, 16, '#f0abfc', '#475569')
    const material = helper.material as THREE.Material
    material.transparent = true
    material.opacity = 0.35
    material.depthWrite = false
    return helper
  }, [])

  useEffect(() => () => grid.dispose(), [grid])

  return (
    <>
      <primitive object={grid} raycast={() => null} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.001, 0]} raycast={() => null}>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#1e293b" roughness={1} />
      </mesh>
    </>
  )
}
