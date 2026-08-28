'use client'

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { sideOf, teamColour } from '@/app/xp/_runtime/match/teams'
import type { Mark, XpRules } from '@kxb/xp'
import { EYE_HEIGHT, type Crowd } from '@kxb/xp/engine'

/**
 * Whose side somebody is on, readable across the level.
 *
 * Copied from `src/app/world/team-ring.tsx` rather than imported, per AGENTS.md,
 * and the two decisions worth keeping came with it:
 *
 * **On the floor rather than on the body.** Tinting a body's materials would
 * trade the thing that tells people apart for the thing that tells sides apart -
 * two differently-coloured avatars become two similar red smudges. A ring adds
 * the second without spending the first.
 *
 * **Drawn through the floor** (`depthTest={false}`). Knowing who is on which
 * side matters more than strict occlusion, and a ring that disappears behind the
 * step somebody is standing on is a ring you cannot rely on.
 *
 * ---------------------------------------------------------------------------
 * What changed in the copy: the colour means the team, not the allegiance
 * ---------------------------------------------------------------------------
 * The lounge's rings are green for ally and red for enemy - relative to you,
 * which is the right answer when the only question is whether to charge
 * somebody. Here the sides are *named by the document* and the HUD is about to
 * put those names next to a score, so a ring has to be the colour of the side it
 * belongs to. Ally and enemy would read as a third and fourth colour that
 * corresponds to nothing on the scoreboard, and a player would have to hold two
 * mappings at once.
 *
 * It still answers the lounge's question, because you know your own colour.
 */

/** Comfortably wider than `PLAYER_RADIUS`, so it reads as a ring around a body. */
const INNER = 0.42
const OUTER = 0.58

/**
 * A hair above the ground.
 *
 * Exactly at zero and it fights the floor for the same pixels, which flickers as
 * the camera moves. Far enough to win, close enough to still look painted on.
 */
const HOVER = 0.03

/**
 * Rings under everybody else.
 *
 * One mesh per person rather than an instanced batch, because the colours differ
 * per instance and per-instance colour is a second attribute to keep in step with
 * a buffer that is already being rewritten every frame. A room is capped at about
 * twenty-five people by the tenant rate limit (§9), so this is twenty-five draw
 * calls of a thirty-two segment ring - which is the same trade the lounge makes,
 * and it has been through contact with players.
 *
 * The side comes from `sideOf` rather than from the wire. Every client knows
 * every peer's id from presence, so every client computes the same answer with
 * nothing extra sent at 8 Hz - see ./teams for why that is worth more than it
 * looks.
 */
export function Rings({
  crowd,
  ids,
  marks,
  rules,
}: {
  crowd: { readonly current: Crowd }
  ids: readonly string[]
  marks: readonly Mark[]
  /**
   * What the document says about sides.
   *
   * Passed through rather than left out, and the omission was a real
   * disagreement while it lasted: `sideOf` asked with no rules here and with
   * them in ../_runtime/simulation, so a level that declared a free-for-all -
   * or one waiting on a host to hand sides out - drew a red ring under
   * somebody the world had put on no side at all.
   */
  rules?: Pick<XpRules, 'assign' | 'sides'>
}) {
  const meshes = useRef<Map<string, THREE.Mesh>>(new Map())

  useFrame(() => {
    const now = performance.now()
    for (const id of ids) {
      const mesh = meshes.current.get(id)
      if (!mesh) continue
      const placed = crowd.current.at(id, now)
      /**
       * Somebody present but not yet placed is hidden rather than left at the
       * origin. A ring sitting at 0,0,0 belonging to a player who has not sent a
       * packet yet reads as a person standing in the middle of the level.
       */
      mesh.visible = placed !== null
      if (!placed) continue
      mesh.position.set(placed.x, placed.y + HOVER, placed.z)
    }
  })

  return (
    <>
      {ids.map((id) => (
        <Ring
          key={id}
          colour={teamColour(sideOf(marks, { id }, rules))}
          attach={(node) => {
            if (node) meshes.current.set(id, node)
            else meshes.current.delete(id)
          }}
        />
      ))}
    </>
  )
}

/**
 * The ring under the local body, in third person.
 *
 * Not in first, where the camera is inside the head and the ring would be a
 * coloured band across the bottom of the screen. Separate from the crowd's
 * because it follows a ref this component already has rather than a buffer, and
 * because it is the one ring that is always drawn even in a level nobody else is
 * in - which is what tells a player their own colour before anybody arrives to
 * compare against.
 */
export function OwnRing({
  at,
  team,
}: {
  at: { readonly current: { x: number; y: number; z: number } }
  team: string | undefined
}) {
  const mesh = useRef<THREE.Mesh>(null)

  useFrame(() => {
    const node = mesh.current
    if (!node) return
    // Feet, not eye. `at` is the controller's position, which is the eye - the
    // same conversion the body and the trigger prober get in ./simulation.
    node.position.set(at.current.x, at.current.y - EYE_HEIGHT + HOVER, at.current.z)
  })

  return <Ring colour={teamColour(team)} attach={mesh} />
}

function Ring({
  colour,
  attach,
}: {
  colour: string
  attach: React.Ref<THREE.Mesh> | ((node: THREE.Mesh | null) => void)
}) {
  const geometry = useMemo(() => new THREE.RingGeometry(INNER, OUTER, 32), [])

  return (
    <mesh
      ref={attach}
      geometry={geometry}
      // Laid flat. A ring geometry is born standing up in the XY plane.
      rotation={[-Math.PI / 2, 0, 0]}
      renderOrder={5}
      // Not an obstacle to a shot, for the same reason the bodies are not:
      // `castRay` tests the cell grid and entity boxes and never sees this, and
      // a ring that stopped a bullet would be scenery pretending to be cover.
      raycast={() => null}
    >
      <meshBasicMaterial
        color={colour}
        transparent
        opacity={0.85}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
