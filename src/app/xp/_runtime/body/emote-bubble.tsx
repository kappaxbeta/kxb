'use client'

import { Billboard } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  EMOTE_COLUMNS,
  EMOTE_DURATION_MS,
  EMOTE_ROWS,
  EMOTE_SHEET,
  type EmoteId,
  type EmoteState,
  emoteUvOffset,
} from '@/app/xp/_runtime/body/emotes'

/**
 * The face over somebody's head.
 *
 * Copied from `src/app/world/emote-bubble.tsx` (2026-08-11) per
 * docs/xp/creator.md §1.2, and enforced by `eslint.config.mjs` rather than
 * agreed. The one deliberate difference is the default height: the lounge
 * clears the tallest animal in its pack at 3 units, and a body here is a
 * humanoid whose eyes are at `EYE_HEIGHT` — see `HEIGHT`.
 *
 * Driven by a ref rather than a prop, for the same reason the lounge's health
 * bar is: an emote is somebody else's packet arriving, and turning that into
 * React state would re-render every body in the room each time anybody in it
 * pulled a face. What actually has to happen is one texture offset and one
 * visibility flag, which is a frame-loop job.
 *
 * That also gets the timing right for free. There is no `setTimeout` here, so
 * there is nothing to clear when a peer leaves mid-emote, nothing to leak if
 * the component unmounts, and a tab that was in the background does not come
 * back to three seconds of queued expiry callbacks - it just reads the clock
 * and finds the emote long over.
 */

/** How long the bubble takes to spring up, in milliseconds. */
const POP_MS = 140

/** How long it spends fading out at the end. */
const FADE_MS = 320

/** How big the face is in world units. */
const SIZE = 0.7

/**
 * How far above the body's feet it floats.
 *
 * Above the head rather than the lounge's 3, which clears a bear. `EYE_HEIGHT`
 * is 1.7, so this is roughly a head and a half of clearance — high enough not
 * to sit on the face and low enough to still read as *this* body's when two
 * people are standing together.
 */
const HEIGHT = 2.3

export function EmoteBubble({
  state,
  height = HEIGHT,
}: {
  state: React.RefObject<EmoteState>
  height?: number
}) {
  const group = useRef<THREE.Group>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)

  /**
   * A texture per bubble, not per sheet.
   *
   * `offset` lives on the texture, so every bubble sharing one would show
   * whichever face was set last - the whole room pulling the same face, changing
   * in unison. Cloning is cheap: `.source` is shared, so this is a second set of
   * sampler settings over the same uploaded image, not a second upload.
   *
   * Loaded with a plain loader rather than drei's `useTexture` so that this
   * component never suspends. It hangs off a body that is already inside a
   * Suspense boundary for its model, and suspending here would unmount the
   * whole body for a frame the first time anybody emoted.
   */
  const texture = useMemo(() => {
    const loaded = new THREE.TextureLoader().load(EMOTE_SHEET)
    loaded.colorSpace = THREE.SRGBColorSpace
    // Pixel art. Linear filtering turns a 48px face into a smear at the
    // distance these are actually read from.
    loaded.magFilter = THREE.NearestFilter
    loaded.minFilter = THREE.LinearMipmapLinearFilter
    loaded.repeat.set(1 / EMOTE_COLUMNS, 1 / EMOTE_ROWS)
    // Nothing wraps: every sample is inside one tile, and clamping means a
    // rounding error at a tile edge repeats the edge pixel instead of wrapping
    // to the face on the opposite side of the sheet.
    loaded.wrapS = THREE.ClampToEdgeWrapping
    loaded.wrapT = THREE.ClampToEdgeWrapping
    return loaded
  }, [])

  useEffect(() => () => texture.dispose(), [texture])

  /** The face currently pointed at, so the offset is only rewritten on change. */
  const shown = useRef<EmoteId | null>(null)

  useFrame(() => {
    const node = group.current
    const slot = state.current
    if (!node || !slot) return

    const now = performance.now()
    const live = slot.id !== null && now < slot.until

    // Cheapest possible early out for the overwhelmingly common case: nobody in
    // the room is emoting, so there is nothing to compute.
    if (!live) {
      if (node.visible) node.visible = false
      shown.current = null
      return
    }

    node.visible = true

    if (slot.id !== shown.current) {
      const { x, y } = emoteUvOffset(slot.id as EmoteId)
      texture.offset.set(x, y)
      shown.current = slot.id
    }

    /**
     * Spring up, hold, fade out.
     *
     * The pop is what makes an emote read as *just happened* rather than as a
     * label that was always there - at three seconds, an instant appearance and
     * an instant disappearance both look like a rendering fault.
     */
    const age = now - (slot.until - EMOTE_DURATION_MS)
    const remaining = slot.until - now

    const pop = Math.min(1, age / POP_MS)
    // Overshoot slightly and settle, which is a two-term approximation of a
    // spring and indistinguishable from one at this duration.
    const scale = pop < 1 ? 0.6 + 0.55 * pop - 0.15 * pop * pop : 1
    node.scale.setScalar(scale)

    if (material.current) {
      material.current.opacity = Math.min(1, remaining / FADE_MS)
    }
  })

  return (
    <group ref={group} position={[0, height, 0]} visible={false}>
      <Billboard>
        <mesh userData={{ ignoreRay: true }} renderOrder={20}>
          <planeGeometry args={[SIZE, SIZE]} />
          {/*
            `depthTest` off for the same reason the lounge's health bar turns it
            off: an emote swallowed by the wall somebody is standing behind is an
            emote that did not happen, and being able to see the room react
            matters more here than strict occlusion.
          */}
          <meshBasicMaterial
            ref={material}
            map={texture}
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
