'use client'

import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { worldTransform, type EntityWorld } from '@kxb/xp/engine'
import type { Blueprint } from '@kxb/xp'

/**
 * What a sign says, drawn where the sign is.
 *
 * In the scene rather than on the HUD - a sign is a thing in the room, not a
 * message from the level, so this sits beside `./lights` rather than beside
 * `./hud`: a fact about a *place*, mutated per frame rather than kept in React
 * state for the same reason a lamp is (see the note there). `world.text` is
 * sparse, so this scans a handful of rows at most, not the whole entity world.
 *
 * ---------------------------------------------------------------------------
 * Read distance, and the nearest few
 * ---------------------------------------------------------------------------
 * A level with a dozen signs should not fill the screen with paragraphs the
 * moment it loads - text only appears once a player is close enough to
 * plausibly be reading it, and only the nearest `POOL` of them. Same
 * nearest-wins trim `./lights` uses for its own pool, and the same reason: a
 * wall of overlapping labels is worse than a missing one.
 *
 * Billboarded rather than fixed to the entity's own facing, because the
 * catalogue does not say which side of a given model its board faces - a
 * guess that is wrong half the time is worse than text that always turns to
 * meet you, the same trade `./emote-bubble` already makes for a face.
 */

/** How many signs can be read at once. Few, because each one is a paragraph. */
const POOL = 4

/** How close a player has to be before a sign's text appears, in world units. */
const READ_DISTANCE = 5

/** How far above the entity's own origin the text floats - roughly board height. */
const HEIGHT = 1.1

/** How wide a line gets before it wraps. */
const MAX_WIDTH = 1.8

const FONT_SIZE = 0.16

/** The troika mesh a `<Text>` ref actually points at - drei types it as `any`. */
interface Label extends THREE.Object3D {
  text: string
  color: THREE.ColorRepresentation
}

/** Reused per frame so the sort allocates nothing. */
interface Readable {
  id: number
  x: number
  y: number
  z: number
  text: string
  colour?: number
  background?: number
  distance: number
}

export function Signs({
  world,
  blueprints,
  /** Where the camera is, so the nearest signs are the ones that get read. */
  eye,
}: {
  world: React.RefObject<EntityWorld | null>
  blueprints: Readonly<Record<string, Blueprint>>
  eye: { readonly current: { x: number; y: number; z: number } }
}) {
  const groups = useRef<(THREE.Group | null)[]>([])
  const labels = useRef<(Label | null)[]>([])
  const plates = useRef<(THREE.Mesh | null)[]>([])
  const found = useRef<Readable[]>([])

  useFrame(() => {
    const live = world.current
    if (!live) return

    const list = found.current
    list.length = 0

    for (const [id, text] of live.text) {
      if (!live.alive.has(id)) continue

      // A sign has no reason to be a spot light's kind of parented, but a
      // torch carried past one does - so the position still has to go through
      // the same parent check `./lights` makes rather than assuming the flat
      // case.
      let x: number
      let y: number
      let z: number
      if (live.parent.has(id)) {
        const at = worldTransform(live, id, blueprints)
        if (!at) continue
        x = at.x
        y = at.y
        z = at.z
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
      const distance = dx * dx + dy * dy + dz * dz
      if (distance > READ_DISTANCE * READ_DISTANCE) continue

      list.push({
        id,
        x,
        y,
        z,
        text,
        colour: live.colour.get(id),
        background: live.background.get(id),
        distance,
      })
    }

    if (list.length > POOL) list.sort((a, b) => a.distance - b.distance)

    for (let index = 0; index < POOL; index++) {
      const group = groups.current[index]
      const label = labels.current[index]
      if (!group || !label) continue

      const lit = index < list.length ? list[index] : undefined
      if (!lit) {
        group.visible = false
        continue
      }

      group.visible = true
      group.position.set(lit.x, lit.y + HEIGHT, lit.z)

      if (label.text !== lit.text) label.text = lit.text
      const colour = lit.colour ?? 0xffffff
      if (label.color !== colour) label.color = colour

      const plate = plates.current[index]
      if (plate) {
        if (lit.background !== undefined) {
          plate.visible = true
          ;(plate.material as THREE.MeshBasicMaterial).color.setHex(lit.background)
        } else {
          plate.visible = false
        }
      }
    }
  })

  return (
    <>
      {Array.from({ length: POOL }, (_, index) => (
        <group
          key={index}
          ref={(node) => {
            groups.current[index] = node
          }}
          visible={false}
        >
          <Billboard>
            {/*
              A plate behind the text, only when the sign asked for one.
              Slightly behind the glyphs rather than coplanar, so the two
              never fight over which one wins a depth tie.
            */}
            <mesh
              ref={(node) => {
                plates.current[index] = node
              }}
              position={[0, 0, -0.01]}
              visible={false}
              renderOrder={19}
            >
              <planeGeometry args={[MAX_WIDTH + 0.2, 0.6]} />
              <meshBasicMaterial transparent opacity={0.75} depthWrite={false} />
            </mesh>
            <Text
              ref={(node) => {
                labels.current[index] = node as Label | null
              }}
              fontSize={FONT_SIZE}
              maxWidth={MAX_WIDTH}
              textAlign="center"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.008}
              outlineColor="black"
              renderOrder={20}
            >
              {' '}
            </Text>
          </Billboard>
        </group>
      ))}
    </>
  )
}
