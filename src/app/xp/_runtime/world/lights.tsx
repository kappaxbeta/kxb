'use client'

import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { MAX_LIGHTS } from '@kxb/xp'
import { turnPoint, worldTransform, type EntityWorld } from '@kxb/xp/engine'
import type { Blueprint } from '@kxb/xp'

/**
 * The lamps a level put in itself.
 *
 * The scene's own three lights — a hemisphere, a sun and one pink bounce — are
 * *lighting*, in the sense a photographer means: they exist so the prototype
 * kit's flat shading reads as shape rather than as silhouette, and every level
 * gets them whether or not it asked. These are different. A lamp is a thing in
 * the world at a place, and the level says where.
 *
 * ---------------------------------------------------------------------------
 * A lamp is an entity, which is what makes it scriptable
 * ---------------------------------------------------------------------------
 * The obvious shape was a `world.lights` list beside `placements` — a position,
 * a colour, an intensity. It was refused for the reason `draw: false` refuses a
 * `world.nodes` list in ./blueprints: a list would need its own naming, its own
 * selection and gizmo in the editor, its own spelling in every verb that takes
 * a target, and its own way of being turned off — and all of that exists for
 * entities already.
 *
 * So a lamp is a `light` block on a blueprint, and everything follows for free:
 *
 *   * it **moves** — a torch carried in a hand is `worldTransform`, the same
 *     call the body is drawn with, so the light goes where the hand goes;
 *   * it **switches** — `deactivate` takes the entity out of `alive` and the
 *     lamp goes out with it, because this reads `alive`;
 *   * it **animates** — `self.intensity = 0` is a script writing a number on an
 *     entity, which is the mechanism scripts already had. Nothing here knew
 *     about that and nothing had to.
 *
 * ---------------------------------------------------------------------------
 * Mutated per frame, never re-rendered
 * ---------------------------------------------------------------------------
 * A script fading a lamp writes a number sixty times a second. Putting that in
 * React state would re-render this tree sixty times a second to move one float,
 * which is the rule every other frame-path component in this runtime follows
 * (see ./health-bars, ./rings). So a fixed pool of `pointLight` objects is made
 * once and pointed at whichever entities are lit this frame.
 */

/**
 * How many lamps are drawn at once, and why there is a cap at all.
 *
 * three.js compiles a shader per light count and the fragment cost is linear in
 * it, so this is not a tidiness limit: forty torches is a level that runs at
 * nine frames a second on the machine that authored it and not at all on a
 * phone. `MAX_LIGHTS` is the engine's number so the editor can warn with the
 * same one.
 *
 * Over the cap, the **nearest** win. A lamp behind you contributes almost
 * nothing to what is on screen, and the alternative — first in the document —
 * makes which lamps work depend on the order somebody happened to place them.
 *
 * The cap is shared between the two kinds rather than one each: the list below
 * is sorted by distance and trimmed to `POOL` before it is split by kind, so
 * eight torches and one spot is still nine lamps competing for eight slots,
 * not eight-plus-eight - the shader-count argument above does not care which
 * kind a light was.
 */
const POOL = MAX_LIGHTS

/**
 * A spot's cone points wherever the entity's own `rotation`/`pitch` already
 * faces - see the note on `Light` in `packages/xp/src/blueprints.ts` - so the
 * target is a point this far along that direction rather than a second field
 * an author has to place. Only the direction is used; the falloff distance is
 * `range`, same as a point light's.
 */
const AIM_DISTANCE = 8

/** Reused per frame so the sort allocates nothing. */
interface Lit {
  id: number
  x: number
  y: number
  z: number
  colour: number
  intensity: number
  range: number
  kind: 'point' | 'spot'
  /** Cone half-angle in degrees. Unused, and unset, on a `'point'` lamp. */
  angle: number
  /** Aim, in degrees. Both zero and unused on a `'point'` lamp. */
  rotation: number
  pitch: number
  distance: number
}

export function Lights({
  world,
  blueprints,
  /** Where the camera is, so the nearest lamps are the ones that get drawn. */
  eye,
}: {
  world: React.RefObject<EntityWorld | null>
  blueprints: Readonly<Record<string, Blueprint>>
  eye: { readonly current: { x: number; y: number; z: number } }
}) {
  const points = useRef<(THREE.PointLight | null)[]>([])
  const spots = useRef<(THREE.SpotLight | null)[]>([])
  const found = useRef<Lit[]>([])

  useFrame(() => {
    const live = world.current
    if (!live) return

    /**
     * Every lit entity that is switched on, with how far away it is.
     *
     * `alive` rather than the light map, so a `deactivate` puts a lamp out
     * without anything here knowing what deactivation is.
     */
    const list = found.current
    list.length = 0

    for (const [id, lamp] of live.light) {
      if (!live.alive.has(id)) continue
      // Nothing to draw, and skipping it here means a lamp turned down to zero
      // by a script gives its slot back to one that is still on.
      if (lamp.intensity <= 0) continue

      const spot = lamp.kind === 'spot'
      let x: number
      let y: number
      let z: number
      let rotation = 0
      let pitch = 0

      // A spot needs the entity's facing, which only `worldTransform` carries -
      // a point never does, so the cheap path (most lamps) is left alone.
      if (spot || live.parent.has(id)) {
        const at = worldTransform(live, id, blueprints)
        if (!at) continue
        x = at.x
        y = at.y
        z = at.z
        if (spot) {
          rotation = at.rotation
          pitch = at.pitch
        }
      } else {
        const at = live.position.get(id)
        if (!at) continue
        x = at.x
        y = at.y
        z = at.z
      }

      const dx = x - eye.current.x
      const dy = y - eye.current.y
      const dz = z - eye.current.z

      list.push({
        id,
        x,
        y,
        z,
        colour: lamp.colour,
        intensity: lamp.intensity,
        range: lamp.range,
        kind: lamp.kind,
        angle: lamp.angle,
        rotation,
        pitch,
        distance: dx * dx + dy * dy + dz * dz,
      })
    }

    // Only when it matters: a level with eight lamps or fewer is every lamp,
    // and sorting it would be work to reach the same answer.
    if (list.length > POOL) list.sort((a, b) => a.distance - b.distance)

    // Split the (already trimmed) nearest `POOL` lamps by kind - see the note
    // on `POOL` above for why the two share one budget rather than one each.
    let pointIndex = 0
    let spotIndex = 0
    for (let index = 0; index < list.length && index < POOL; index++) {
      const lit = list[index]!
      if (lit.kind === 'spot') {
        const light = spots.current[spotIndex++]
        if (!light) continue
        light.position.set(lit.x, lit.y, lit.z)
        light.color.setHex(lit.colour)
        light.intensity = lit.intensity
        light.distance = lit.range
        light.angle = (lit.angle * Math.PI) / 180

        const forward = turnPoint({ x: 0, y: 0, z: -1 }, { rotation: lit.rotation, pitch: lit.pitch, roll: 0 })
        light.target.position.set(
          lit.x + forward.x * AIM_DISTANCE,
          lit.y + forward.y * AIM_DISTANCE,
          lit.z + forward.z * AIM_DISTANCE,
        )
        // Not in the scene graph - see the JSX below - so nothing else walks
        // this and updates it.
        light.target.updateMatrixWorld()
      } else {
        const light = points.current[pointIndex++]
        if (!light) continue
        light.position.set(lit.x, lit.y, lit.z)
        light.color.setHex(lit.colour)
        light.intensity = lit.intensity
        // three's own meaning for zero, which is what the format's is: no limit.
        light.distance = lit.range
      }
    }

    // Off rather than removed, for every slot this frame did not reach: the
    // object stays in the scene so the shader is compiled once, and an
    // intensity of zero costs nothing to sample.
    for (let index = pointIndex; index < POOL; index++) {
      const light = points.current[index]
      if (light) light.intensity = 0
    }
    for (let index = spotIndex; index < POOL; index++) {
      const light = spots.current[index]
      if (light) light.intensity = 0
    }
  })

  return (
    <>
      {Array.from({ length: POOL }, (_, index) => (
        <pointLight
          key={index}
          ref={(light) => {
            points.current[index] = light
          }}
          intensity={0}
          /**
           * No shadows, and it is a measurement rather than a preference.
           *
           * A shadow-casting point light is six shadow maps — a cube — and
           * eight of them is forty-eight extra render passes a frame. The one
           * shadow that reads on this art is the sun's, which the scene already
           * casts. A lamp here lights; it does not carve.
           */
          castShadow={false}
        />
      ))}
      {Array.from({ length: POOL }, (_, index) => (
        <spotLight
          key={index}
          ref={(light) => {
            spots.current[index] = light
          }}
          intensity={0}
          penumbra={0.3}
          castShadow={false}
        />
      ))}
    </>
  )
}
