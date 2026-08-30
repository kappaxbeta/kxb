'use client'

/**
 * The podium, and the characters that stand on it.
 *
 * Extracted from the lobby the day the shop wanted the same thing: one stage
 * built once, so a skin on the shelf and a skin in the locker cannot drift
 * into being two different objects. Everything here is presentational - it
 * knows how to draw a body on a lit plate and nothing about who owns it.
 */

import { useAnimations, useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'

/* ---------------------------------------------------------------------------
 * The podium — `scripts/render-stage.ts`, live.
 *
 * The landing page shows that script's output as a PNG; the lobby rebuilds the
 * same object in real geometry so the pair actually stands on it. Every
 * constant below is the render script's, verbatim: the stadium cross-section,
 * the three slabs from fuchsia to cyan with violet between, the bright rim
 * band on the top third of each wall, the violet pool on the stage floor.
 * The material is unlit vertex colour for the same reason the script's was —
 * it is a hologram, nothing about it wants a light rig — and the bloom pass
 * becomes two additive glow sprites, which is the closest a scene without a
 * composer gets to "glow hugs the silhouette".
 * ------------------------------------------------------------------------- */

const STADIUM_W = 4.4
const STADIUM_D = 2.4
const CORNER_R = 1.0
const ARC_SEGS = 12
const SLAB_HEIGHT = 0.3
const SLAB_GAP = 0.1

const SLABS = [
  { rim: [1.0, 0.62, 0.98], side: [0.5, 0.19, 0.6], grow: 1.0 },
  { rim: [0.68, 0.56, 1.0], side: [0.3, 0.19, 0.64], grow: 1.045 },
  { rim: [0.42, 0.85, 1.0], side: [0.12, 0.38, 0.62], grow: 1.09 },
] as const

const TOP_CENTRE = [0.74, 0.44, 0.88] as const
const TOP_EDGE = [0.48, 0.23, 0.68] as const

type Colour = readonly [number, number, number]

/** The stadium outline, counter-clockwise, y = 0. */
function stadiumOutline(scale: number): [number, number][] {
  const hw = (STADIUM_W / 2 - CORNER_R) * scale
  const hd = (STADIUM_D / 2 - CORNER_R) * scale
  const r = CORNER_R * scale

  const corners: [number, number, number][] = [
    [hw, hd, 0],
    [-hw, hd, 90],
    [-hw, -hd, 180],
    [hw, -hd, 270],
  ]

  const points: [number, number][] = []
  for (const [cx, cz, startDeg] of corners) {
    for (let s = 0; s <= ARC_SEGS; s++) {
      const a = ((startDeg + (s / ARC_SEGS) * 90) * Math.PI) / 180
      points.push([cx + r * Math.cos(a), cz + r * Math.sin(a)])
    }
  }
  return points
}

/** Every triangle of the podium, vertex-coloured — the script's builder with
 *  flat arrays where it had objects, because BufferGeometry eats arrays. */
function podiumGeometry(): THREE.BufferGeometry {
  const positions: number[] = []
  const colours: number[] = []
  const put = (x: number, y: number, z: number, c: Colour) => {
    positions.push(x, y, z)
    /* The script's numbers are final sRGB pixels; three.js treats vertex
     * colours as linear and re-encodes on output, which washed the whole
     * podium pastel until these were converted the other way first. */
    colours.push(c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2)
  }

  let yTop = 0
  SLABS.forEach((slab, index) => {
    const yBot = yTop - SLAB_HEIGHT
    const yBand = yTop - SLAB_HEIGHT * 0.32
    const outline = stadiumOutline(slab.grow)

    /** Depth cue: the far side of each wall sits a register darker. */
    const shade = (c: Colour, z: number): Colour => {
      const f = 0.7 + 0.3 * ((z + STADIUM_D / 2) / STADIUM_D)
      return [c[0] * f, c[1] * f, c[2] * f]
    }

    for (let i = 0; i < outline.length; i++) {
      const [x0, z0] = outline[i]
      const [x1, z1] = outline[(i + 1) % outline.length]

      // The bright rim band.
      put(x0, yTop, z0, shade(slab.rim, z0))
      put(x1, yTop, z1, shade(slab.rim, z1))
      put(x1, yBand, z1, shade(slab.rim, z1))
      put(x0, yTop, z0, shade(slab.rim, z0))
      put(x1, yBand, z1, shade(slab.rim, z1))
      put(x0, yBand, z0, shade(slab.rim, z0))

      // The body below it, fading darker towards the bottom.
      const dim: Colour = [slab.side[0] * 0.55, slab.side[1] * 0.55, slab.side[2] * 0.55]
      put(x0, yBand, z0, shade(slab.side, z0))
      put(x1, yBand, z1, shade(slab.side, z1))
      put(x1, yBot, z1, shade(dim, z1))
      put(x0, yBand, z0, shade(slab.side, z0))
      put(x1, yBot, z1, shade(dim, z1))
      put(x0, yBot, z0, shade(dim, z0))
    }

    // Top face. The first slab's is the stage floor; the lower ones only show
    // as the ring their `grow` leaves uncovered, in their own rim colour.
    const centre: Colour = index === 0 ? TOP_CENTRE : slab.rim
    const edge: Colour =
      index === 0
        ? TOP_EDGE
        : [slab.rim[0] * 0.75, slab.rim[1] * 0.75, slab.rim[2] * 0.75]
    for (let i = 0; i < outline.length; i++) {
      const [x0, z0] = outline[i]
      const [x1, z1] = outline[(i + 1) % outline.length]
      put(0, yTop, 0, centre)
      put(x0, yTop, z0, edge)
      put(x1, yTop, z1, edge)
    }

    yTop = yBot - SLAB_GAP
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
  return geometry
}

/** A soft white radial falloff; the sprite's colour does the tinting. */
function glowTexture(): THREE.Texture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(
    size / 2, size / 2, 0,
    size / 2, size / 2, size / 2,
  )
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.28)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true
  return texture
}

export function Stage() {
  // Wrapped rather than passed by reference: the compiler's lint wants an
  // inline expression it can see through, and a bare function name is opaque
  // to it even when the dependency list is empty.
  const geometry = useMemo(() => podiumGeometry(), [])
  const glow = useMemo(() => glowTexture(), [])
  return (
    <group scale={0.68}>
      <mesh geometry={geometry}>
        <meshBasicMaterial vertexColors toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {/* The bloom, approximated: a hot violet breath over the slabs and a
          cyan one under the base, both additive so they read as light. */}
      <sprite position={[0, -0.35, 0]} scale={[5.5, 2.2, 1]}>
        <spriteMaterial
          map={glow}
          color="#c86df5"
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
      <sprite position={[0, -1.0, 0]} scale={[6, 1.5, 1]}>
        <spriteMaterial
          map={glow}
          color="#37c8f0"
          transparent
          opacity={0.16}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  )
}

/**
 * One character you can turn by hand — mouse or finger, each on its own.
 *
 * A drag anywhere on the body spins that body and only that body: the grab is
 * per-group, and pointer capture keeps the turn going when the drag leaves
 * the silhouette. Horizontal only, because the pair stays on the podium — this
 * is a turntable you push, not an orbit camera.
 */
export function Spinnable({
  base,
  position,
  children,
}: {
  base: number
  position: [number, number, number]
  children: ReactNode
}) {
  const group = useRef<THREE.Group>(null)
  const drag = useRef<{ x: number; rotation: number } | null>(null)

  return (
    <group
      ref={group}
      position={position}
      rotation={[0, base, 0]}
      onPointerDown={(e) => {
        e.stopPropagation()
        ;(e.target as Element).setPointerCapture?.(e.pointerId)
        drag.current = { x: e.clientX, rotation: group.current?.rotation.y ?? base }
        document.body.style.cursor = 'grabbing'
      }}
      onPointerMove={(e) => {
        if (!drag.current || !group.current) return
        group.current.rotation.y = drag.current.rotation + (e.clientX - drag.current.x) * 0.02
      }}
      onPointerUp={(e) => {
        ;(e.target as Element).releasePointerCapture?.(e.pointerId)
        drag.current = null
        document.body.style.cursor = ''
      }}
      onPointerOver={() => {
        if (!drag.current) document.body.style.cursor = 'grab'
      }}
      onPointerOut={() => {
        if (!drag.current) document.body.style.cursor = ''
      }}
    >
      {children}
    </group>
  )
}

/**
 * The default XP body, idling.
 *
 * Deliberately not the runtime's `SkinnedBody`: that one carries the rainbow
 * material, the peer glow and the whole motion layer with it, and the lobby
 * needs none of it — one body, one clip. The same three facts hold here as
 * there: `SkeletonUtils.clone` (a plain clone leaves meshes bound to the
 * cached original's skeleton), one mixer per body, and the pack's clips bind
 * to `Dummy.glb` by bone name with no retargeting.
 */
export function XpBody({ model }: { model: string | null }) {
  /*
   * Every dressed character in the pack rides the dummy's own 23-joint rig, so
   * the clip file below plays on all of them with no retargeting and the skin
   * is only a different URL. `modelUrl` is not reached for here because the
   * catalogue's path scheme is the id: `adventurers/Knight` is that file.
   */
  const dummy = useGLTF(
    model ? `/xp/packs/${model}.glb` : '/xp/packs/dummy/Dummy.glb',
  )
  const clips = useGLTF('/xp/packs/animation/Rig_Medium/Rig_Medium_General.glb')
  const body = useMemo(() => cloneSkinned(dummy.scene), [dummy.scene])

  const group = useRef<THREE.Group>(null)
  const { actions } = useAnimations(clips.animations, group)

  useEffect(() => {
    const action = actions['Idle_A']
    if (!action) return
    action.reset().fadeIn(0.2).play()
    return () => {
      action.fadeOut(0.2)
    }
  }, [actions])

  return (
    /* 0.75 is BUILT_IN_BODY_SCALE — the dummy at authored size reads a head
       taller than every peep, and the lobby pair should stand as equals. */
    <group ref={group} scale={0.75}>
      <primitive object={body} />
    </group>
  )
}
