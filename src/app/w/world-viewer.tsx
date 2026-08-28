'use client'

import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import { Placements } from '@/app/ovaloffice/builder/instances'
import { Rig } from '@/app/world/shots/pieces'
import {
  type BuilderWorld,
  groundPlacements,
  LAMP_SCALE,
  type Placement,
} from '@/domain/builder/world'

/**
 * A shared world, to look at.
 *
 * The builder's stage without any of the editing: no pointer plane, no ghost,
 * no level grid. It could have been the same component behind a `readOnly`
 * flag, and that would have been worse - the stage's whole shape is about
 * turning pointer events into cells, and a flag that switches all of it off is
 * a flag that means "this is a different component".
 *
 * What it does share is `Placements`, which is the part that matters: the
 * instancing is what makes a five-thousand-block world open on a laptop the
 * customer happens to have, and a viewer that drew it any other way would be a
 * viewer that only works on the machine it was built on.
 */
export function WorldViewer({ world }: { world: BuilderWorld }) {
  const ground = useMemo<Placement[]>(() => groundPlacements(world.ground), [world.ground])

  const radius = useMemo(() => {
    let reach = world.ground ? Math.max(world.ground.cols, world.ground.rows) / 2 : 0
    for (const placement of world.placements) {
      reach = Math.max(reach, Math.abs(placement.x), Math.abs(placement.z))
    }
    return Math.min(Math.max(reach, 8) + 4, 120)
  }, [world.ground, world.placements])

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: world.camera.position, fov: world.camera.fov, near: 0.1, far: 600 }}
      // No `preserveDrawingBuffer` here, unlike the editor: nothing reads this
      // canvas back, and keeping the buffer costs memory on every frame.
      gl={{ alpha: true, antialias: true }}
      style={world.background ? { background: world.background } : undefined}
    >
      {/* Same split the builder's stage makes: no rim from the rig, the
          world's own two lamps instead. */}
      <Rig light={{ ...world.light, rim: 0 }} radius={radius} />
      <Lamps world={world} radius={radius} />
      {/* Left-drag orbits, which is the opposite of the editor and correct
          here: there is nothing to draw, so the primary button belongs to the
          only verb there is. Panning off, so a world cannot be dragged out of
          frame with no way back. */}
      <OrbitControls
        target={world.camera.target}
        enablePan={false}
        enableDamping
        maxPolarAngle={Math.PI / 2.02}
      />
      <Suspense fallback={null}>
        <Placements placements={ground} />
        <Placements placements={world.placements} />
      </Suspense>
    </Canvas>
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
