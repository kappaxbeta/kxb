'use client'

import { useEffect, useRef } from 'react'
import { useSceneRefs } from '@/app/world/lounge/_scene/scene-refs'

/**
 * How much running you have left, over the world.
 *
 * ---------------------------------------------------------------------------
 * Why it animates itself
 * ---------------------------------------------------------------------------
 * The value changes every frame while somebody is running. Holding it in React
 * state would re-render the whole HUD sixty times a second to move one edge,
 * which is exactly what every ref in this scene exists to avoid - so the number
 * stays in `staminaRef` and this reads it on its own clock and writes a width.
 *
 * A `requestAnimationFrame` loop rather than `useFrame`, because this is DOM: it
 * is drawn over the canvas, not in it, and a component inside the Canvas cannot
 * hold an element that is outside it.
 *
 * ---------------------------------------------------------------------------
 * Why it is only there when it matters
 * ---------------------------------------------------------------------------
 * Rendered only when the space charges for running, and *faded* whenever the
 * bar is full - which is most of the time, for most people. A gauge that is
 * always at maximum is a gauge nobody reads; one that appears as you spend it
 * is one you look at exactly when the answer matters.
 */
export function StaminaBar() {
  const { staminaRef } = useSceneRefs()
  const fill = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    /** What was last written, so a still bar writes no styles at all. */
    let last = -1

    const draw = () => {
      raf = requestAnimationFrame(draw)

      const level = Math.max(0, Math.min(1, staminaRef.current))
      // A hundredth is a pixel on a bar this wide. Below that there is nothing
      // to see and nothing worth touching the DOM for.
      if (Math.abs(level - last) < 0.01) return
      last = level

      if (fill.current) fill.current.style.width = `${level * 100}%`
      // Out of the way while it is full, and present the moment it is not.
      if (box.current) box.current.style.opacity = level > 0.995 ? '0.25' : '1'
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [staminaRef])

  return (
    <div
      ref={box}
      aria-hidden
      className="pointer-events-none absolute bottom-12 left-1/2 h-1.5 w-40 -translate-x-1/2 overflow-hidden rounded-full bg-black/50 transition-opacity duration-500"
    >
      <div
        ref={fill}
        className="h-full w-full rounded-full bg-gradient-to-r from-emerald-300 to-cyan-300"
      />
    </div>
  )
}
