'use client'

import type { PlateTone } from '@/app/world/_canvas/nameplate'

/**
 * Whose side somebody is on, readable across the arena.
 *
 * The nameplate already says it, but a name is something you have to be close
 * enough to *read* - and the moment you need to know whether to charge someone
 * is the moment they are a shape at the far end of the map. A ring on the floor
 * is legible at any distance and at any angle, which a label facing you is not.
 *
 * On the floor rather than on the body, deliberately. The avatars are brightly
 * coloured animals; tinting their materials makes a penguin and a fox into two
 * similar red smudges, which trades the thing that tells people apart for the
 * thing that tells sides apart. A ring adds the second without spending the
 * first.
 */

/** Comfortably wider than PLAYER_RADIUS, so it reads as a ring around a body. */
const INNER = 0.42
const OUTER = 0.58

/**
 * A hair above the ground.
 *
 * Exactly at zero and it fights the floor for the same pixels, which flickers
 * as the camera moves - the classic z-fight. Far enough to win, close enough to
 * still look painted on.
 */
const HOVER = 0.03

const COLOURS: Record<PlateTone, string> = {
  ally: '#34d399',
  enemy: '#fb7185',
}

export function TeamRing({ tone }: { tone: PlateTone }) {
  return (
    <mesh
      // Laid flat. A ring geometry is born standing up in the XY plane.
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, HOVER, 0]}
      // Not an obstacle to the crosshair, for the same reason the bodies are
      // not: being unable to place a block because somebody is standing where
      // you aimed is worse than clipping.
      userData={{ ignoreRay: true }}
      renderOrder={5}
    >
      <ringGeometry args={[INNER, OUTER, 32]} />
      <meshBasicMaterial
        color={COLOURS[tone]}
        transparent
        opacity={0.85}
        // Visible through the floor they are standing on, matching the health
        // bar and the nameplate: knowing who is on which side matters more than
        // strict occlusion.
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
