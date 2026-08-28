'use client'

import { Billboard, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { worldTransform, type EntityWorld } from '@kxb/xp/engine'
import { linesAt, type XpTimeline } from '@kxb/xp/movie'

/**
 * What people say, over their heads.
 *
 * ---------------------------------------------------------------------------
 * A fixed pool, written per frame
 * ---------------------------------------------------------------------------
 * The same shape `Signs` in the runtime has, and for the same reason: a bubble
 * appearing is a *frame* event, and mounting a `<Text>` when a line starts
 * would mean troika building an SDF atlas mid-shot - which is a hitch exactly
 * when somebody is watching, and a dropped frame if they are recording.
 *
 * So the meshes exist from the start, hidden, and the loop moves them, fills
 * them and shows them. `MAX_BUBBLES` is how many can be up at once, not how
 * many a shot may hold - a shot may hold 256 lines and never have three people
 * talking at the same moment.
 *
 * ---------------------------------------------------------------------------
 * Placed off the world, not off the document
 * ---------------------------------------------------------------------------
 * The bubble follows where the body actually *is*, which during playback is
 * wherever the keys have put it - so it is read out of `EntityWorld` through
 * the same `worldTransform` the renderer uses, not off the `EntitySpec`. A
 * bubble drawn from the document would sit at the actor's un-keyed position and
 * drift away from them the moment anything moved.
 *
 * ---------------------------------------------------------------------------
 * In `_runtime` rather than in `_editor/movie`, where it was written
 * ---------------------------------------------------------------------------
 * Because the game needs it too, and did not have it. `Cutscene` draws a cut
 * over a level that is still there, and it drew no lines at all - a shot whose
 * whole joke is two people talking played in silence for anybody who was not
 * looking at the editor. The component was already general: it wants a world, a
 * timeline and the time, and had nothing editor-shaped in it except the type of
 * its third argument.
 *
 * So the clock became `at`, a function returning seconds, and the file moved
 * down. The direction is the one the editor already depends in - `MovieStage`
 * imports `LiveEntities`, `Placements` and `PosedEntity` from here - rather
 * than a copy, which is the shape this codebase keeps getting caught by: two
 * versions of one thing and a fix that lands in whichever one somebody had
 * open.
 */

/** How many bubbles can be up at once. */
const MAX_BUBBLES = 6

/** How high above the body's own origin the bubble floats, in world units. */
const HEIGHT = 2.6

const FONT_SIZE = 0.22
const MAX_WIDTH = 2.6

/** The troika mesh a `<Text>` ref actually points at - drei types it as `any`. */
type Label = THREE.Mesh & { text: string; sync: () => void }

export function Bubbles({
  world,
  timeline,
  at: now,
}: {
  world: { current: EntityWorld }
  timeline: XpTimeline
  /** What second it is. A function, because it is read in a frame loop. */
  at: () => number
}) {
  const groups = useRef<(THREE.Group | null)[]>([])
  const labels = useRef<(Label | null)[]>([])
  const plates = useRef<(THREE.Mesh | null)[]>([])
  /** What each slot is currently showing, so `sync()` is called only on a change. */
  const shown = useRef<string[]>([])

  useFrame(() => {
    const live = linesAt(timeline, now())
    const byName = world.current.name

    let slot = 0
    for (const [id, name] of byName) {
      if (slot >= MAX_BUBBLES) break
      const say = live.get(name)
      if (!say) continue

      const group = groups.current[slot]
      const label = labels.current[slot]
      const plate = plates.current[slot]
      if (!group || !label) continue

      const at = worldTransform(world.current, id)
      if (!at) continue

      group.visible = true
      group.position.set(at.x, at.y + HEIGHT, at.z)

      // `sync()` re-lays the glyphs and is not free, so it is called when the
      // words change rather than sixty times a second on a line that is not
      // moving.
      if (shown.current[slot] !== say.text) {
        shown.current[slot] = say.text
        label.text = say.text
        label.sync()
      }
      if (plate) plate.visible = true
      slot += 1
    }

    for (let rest = slot; rest < MAX_BUBBLES; rest += 1) {
      const group = groups.current[rest]
      if (group) group.visible = false
      shown.current[rest] = ''
    }
  })

  return (
    <>
      {Array.from({ length: MAX_BUBBLES }, (_, index) => (
        <group
          key={index}
          visible={false}
          ref={(node) => {
            groups.current[index] = node
          }}
        >
          <Billboard>
            {/*
              The plate sits slightly behind the glyphs rather than coplanar, so
              the two never fight over which wins a depth tie - the same trick
              `Signs` uses, and the same reason.
            */}
            <mesh
              ref={(node) => {
                plates.current[index] = node
              }}
              position={[0, 0, -0.01]}
              renderOrder={19}
            >
              <planeGeometry args={[MAX_WIDTH + 0.3, 0.62]} />
              <meshBasicMaterial color="#0b0b0f" transparent opacity={0.82} depthWrite={false} />
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
