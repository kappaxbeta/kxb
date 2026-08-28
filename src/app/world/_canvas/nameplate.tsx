'use client'

import { useLocale } from '@/app/i18n/locale-context'
import { worldDict } from '@/app/i18n/world'

import { Billboard } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/**
 * Whose body this is, floating above it.
 *
 * Drawn to a canvas and used as a texture rather than with drei's `<Text>`.
 * Troika - what `<Text>` is built on - ships with no default font configured,
 * so the usual arrangement is to fetch one over the network at first render.
 * That is a font request in the middle of a scene, a blank label until it
 * lands, and a hard dependency on an external host for something as small as
 * six characters over somebody's head.
 *
 * A canvas has none of those problems: it uses a font the machine already has,
 * it is ready on the frame it is created, and it costs one small texture per
 * person in the room. Names change when somebody joins, which is exactly when
 * paying for a canvas is fine.
 */

/** Rendered at twice the display size, so it stays sharp on a HiDPI screen. */
const SCALE = 2

/** Font size in canvas pixels, before `SCALE`. */
const FONT_PX = 26

/** Padding around the text, in canvas pixels. */
const PAD_X = 14
const PAD_Y = 8

/** How tall the plate is in world units. Width follows from the text. */
const WORLD_HEIGHT = 0.26

/**
 * Longest name drawn before it is cut short.
 *
 * A floating label is only useful while it is narrower than the body under it.
 * Past about this many characters the plate stops labelling somebody and starts
 * hiding them.
 */
const MAX_CHARS = 16

/**
 * The name as it goes on the plate.
 *
 * Presence carries an email, because that is what members already see each
 * other by everywhere else in the app. Drawn in full it is a banner - a
 * measured `ada@example.com` is nearly six times wider than it is tall, which
 * at this height is wider than the animal wearing it. The local part is the bit
 * that identifies a colleague to another colleague anyway; the domain is the
 * same for everyone in the workspace and carries no information at all.
 *
 * The lists in the HUD still show the whole address - there is room there, and
 * it is where you go to be sure which Sam you meant.
 */
export function plateName(name: string, nobody = 'Someone'): string {
  const trimmed = name.trim()
  if (!trimmed) return nobody

  const at = trimmed.indexOf('@')
  // Guarded against a leading `@`, which would otherwise render an empty plate.
  const local = at > 0 ? trimmed.slice(0, at) : trimmed

  if (local.length <= MAX_CHARS) return local
  return `${local.slice(0, MAX_CHARS - 1)}…`
}

/**
 * Whose side somebody is on, when that is a question.
 *
 * Undefined everywhere it is not: the lounge has no sides, and neither does a
 * free-for-all, where colouring everybody as an enemy would be a lot of red
 * saying nothing.
 *
 * It matters in a team match specifically because friendly fire is off - a dash
 * passes straight through a team-mate. Without a way to tell who that is, the
 * first thing you learn about your own side is that charging them does
 * nothing, which is a poor way to find out.
 */
export type PlateTone = 'ally' | 'enemy'

const SLAB: Record<PlateTone | 'neutral', string> = {
  // Kept dark and only tinted, rather than fully coloured: the plate's job is
  // still to be a readable label, and white text on saturated red is not.
  neutral: 'rgba(0, 0, 0, 0.55)',
  ally: 'rgba(6, 78, 59, 0.72)',
  enemy: 'rgba(76, 5, 25, 0.72)',
}

export function Nameplate({
  name,
  tone,
  /** Clear of the head, below the health bar and the emote. */
  height = 2.05,
}: {
  name: string
  tone?: PlateTone
  height?: number
}) {
  /**
   * Read here even though this draws inside the `<Canvas>`.
   *
   * React context does cross that boundary - `SceneRefsProvider` sits outside
   * the canvas in `lounge-scene` and `player-controls` reads it from inside -
   * so the plate can be told what to call somebody whose name never arrived
   * without a prop threaded through every avatar in the room.
   */
  const nobody = worldDict(useLocale()).dock.someone

  const plate = useMemo(() => {
    const label = plateName(name, nobody)

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return null

    // Measure first, then size the canvas to fit - a canvas resize resets the
    // context, so the font has to be set again afterwards.
    const font = `600 ${FONT_PX * SCALE}px ui-sans-serif, system-ui, sans-serif`
    context.font = font
    const width = context.measureText(label).width

    canvas.width = Math.ceil(width + PAD_X * 2 * SCALE)
    canvas.height = Math.ceil((FONT_PX + PAD_Y * 2) * SCALE)

    context.font = font
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    // A rounded slab behind the text, so a pale name over a pale wall is still
    // readable. The same reason the HUD panels are translucent black.
    const radius = canvas.height / 2
    context.fillStyle = SLAB[tone ?? 'neutral']
    context.beginPath()
    if (typeof context.roundRect === 'function') {
      context.roundRect(0, 0, canvas.width, canvas.height, radius)
    } else {
      // Safari only grew `roundRect` in 16. Square corners are a cosmetic
      // downgrade; an unguarded call is a TypeError that takes the whole scene
      // down with it, which is not a trade worth making for rounded edges.
      context.rect(0, 0, canvas.width, canvas.height)
    }
    context.fill()

    context.fillStyle = '#ffffff'
    context.fillText(label, canvas.width / 2, canvas.height / 2 + SCALE)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    // No mipmaps: the plate is always roughly screen-facing and roughly the
    // same size, and generating them for a label this small is wasted work.
    texture.minFilter = THREE.LinearFilter
    texture.generateMipmaps = false

    return { texture, aspect: canvas.width / canvas.height }
  }, [name, tone, nobody])

  useEffect(() => () => plate?.texture.dispose(), [plate])

  if (!plate) return null

  return (
    <group position={[0, height, 0]}>
      <Billboard>
        {/*
          `depthTest` off, matching the health bar and the emote: a name
          swallowed by the wall somebody is standing behind tells you nothing,
          and knowing who is in the room matters more than strict occlusion.
        */}
        <mesh userData={{ ignoreRay: true }} renderOrder={15}>
          <planeGeometry args={[WORLD_HEIGHT * plate.aspect, WORLD_HEIGHT]} />
          <meshBasicMaterial
            map={plate.texture}
            transparent
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      </Billboard>
    </group>
  )
}
