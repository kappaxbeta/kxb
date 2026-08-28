'use client'

import { useMemo } from 'react'

/**
 * The light the dummy stands in, copied out of the shots' rig.
 *
 * From `Rig` in `src/app/world/shots/pieces.tsx` and `DEFAULT_LIGHT` in
 * `src/domain/studio/scene.ts`. Copied rather than imported because
 * `src/app/xp/` owns what it draws (docs/xp-creator.md §1.2, enforced by the
 * `no-restricted-imports` rule in eslint.config.mjs): those two are lighting a
 * live marketing surface, and a change made for a product shot should not
 * silently relight the editor somebody is posing a skeleton in.
 *
 * **Only the daylight rig came over.** The original branches on a `neon`
 * preset, and this stage has exactly one call site which has always asked for
 * daylight with the rim halved. A preset nothing can select is a branch that
 * only ever goes stale, so the spec here is the shape of the numbers rather
 * than the studio's whole `LightSpec`.
 */
export interface LightSpec {
  /** Where the sun comes from, in degrees around the scene. */
  azimuth: number
  /** How high it sits, in degrees above the horizon. */
  elevation: number
  sun: number
  ambient: number
  hemisphere: number
  /** Scales both coloured rim lights together. */
  rim: number
}

export const DEFAULT_LIGHT: LightSpec = {
  // The angles that reproduce the marketing shots' fixed rig, which sat at
  // [9, 15, 7]. Written as the angles rather than the position so there is one
  // knob for "where is it coming from" and not three that must agree.
  azimuth: 52,
  elevation: 53,
  sun: 2.4,
  ambient: 0.75,
  hemisphere: 1,
  rim: 1,
}

/**
 * Daylight, with two coloured lights to cut the silhouette out of the sky.
 *
 * The sun is given as an angle rather than a position so there is one knob for
 * "where is it coming from" instead of three coordinates that have to stay on a
 * sphere between them.
 */
export function Lights({
  light,
  radius = 14,
}: {
  light: LightSpec
  /** Half-width of the shadow camera's box. Set it to fit the scene. */
  radius?: number
}) {
  const sun = useMemo<[number, number, number]>(() => {
    const azimuth = (light.azimuth * Math.PI) / 180
    const elevation = (light.elevation * Math.PI) / 180
    const distance = 19
    return [
      distance * Math.cos(elevation) * Math.sin(azimuth),
      distance * Math.sin(elevation),
      distance * Math.cos(elevation) * Math.cos(azimuth),
    ]
  }, [light.azimuth, light.elevation])

  return (
    <>
      <ambientLight intensity={light.ambient} color="#fff6ea" />
      <hemisphereLight args={['#bcd6ff', '#3f6b34', light.hemisphere]} />
      <directionalLight
        position={sun}
        intensity={light.sun}
        color="#fff3e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-camera-left={-radius}
        shadow-camera-right={radius}
        shadow-camera-top={radius}
        shadow-camera-bottom={-radius}
      />
      <pointLight
        position={[-10, 6, -8]}
        intensity={90 * light.rim}
        color="#f0abfc"
        distance={40}
      />
      <pointLight position={[8, 4, 10]} intensity={45 * light.rim} color="#67e8f9" distance={40} />
    </>
  )
}
