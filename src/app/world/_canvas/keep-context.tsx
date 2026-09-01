'use client'

import { useThree } from '@react-three/fiber'
import { useCallback, useEffect, useState } from 'react'

/**
 * Whether the browser has taken the drawing surface away, and when it gives it
 * back.
 *
 * ---------------------------------------------------------------------------
 * What actually happens, and why the page goes white
 * ---------------------------------------------------------------------------
 * A browser will only keep so many live WebGL contexts at once - Chrome's limit
 * is around sixteen per process - and when something asks for one more it takes
 * the least recently used one away from whoever had it. Somebody with the
 * lounge open in two tabs, a composer in a third and a preview in a fourth is
 * closer to that number than it sounds.
 *
 * three.js already handles the half that has to happen immediately: it calls
 * `preventDefault` on the loss, which is what makes the context *eligible* to
 * come back at all, logs "WebGLRenderer: Context Lost.", and rebuilds its state
 * if the browser restores it. What none of that does is tell the person looking
 * at the screen. The canvas keeps its last pixels or clears to white, the frame
 * loop runs on happily drawing into nothing, and the page looks broken with no
 * word about why - which is exactly how it was reported: a white rectangle with
 * a broken-image glyph in the corner of it.
 *
 * The report is half of it. The other half is `useSurface` below, because the
 * surface often does not come back on its own: the tab keeps its dead canvas,
 * the browser draws a sad face where the world was, and the only thing that
 * gets a context again is *asking for a new one*.
 *
 * ---------------------------------------------------------------------------
 * Why the listeners are here rather than on the canvas element
 * ---------------------------------------------------------------------------
 * The `<canvas>` is made by `<Canvas>` and never handed out; `useThree` is the
 * only way to reach the renderer that owns it. Which also means this has to be
 * a component *inside* the canvas rather than a hook beside it - hence a
 * component that draws nothing.
 */
export function KeepContext({
  onChange,
}: {
  /**
   * Called with `true` when the surface is taken and `false` when it returns.
   *
   * A `setState` from the scene above, which is stable, so this effect is set
   * up once for the life of the canvas rather than on every render of it.
   */
  onChange: (lost: boolean) => void
}) {
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    const canvas = gl.domElement

    const lost = () => onChange(true)
    const back = () => {
      onChange(false)
      // A scene rendering on demand has nothing scheduled at the moment the
      // surface comes back, and would sit on the last frame it managed to draw
      // before losing it. Harmless where the loop always runs.
      invalidate()
    }

    canvas.addEventListener('webglcontextlost', lost)
    canvas.addEventListener('webglcontextrestored', back)

    return () => {
      canvas.removeEventListener('webglcontextlost', lost)
      canvas.removeEventListener('webglcontextrestored', back)
    }
  }, [gl, invalidate, onChange])

  return null
}

/**
 * How long to wait for the surface to come back before asking for a new one.
 *
 * A second and a half, which is comfortably longer than a restore that is going
 * to happen - the browser fires `webglcontextrestored` as soon as it can - and
 * short enough that somebody staring at a white rectangle has not yet decided
 * the page is broken.
 */
const WAIT_FOR_RESTORE = 1500

/**
 * How many times to ask for a new one before leaving the message up.
 *
 * Twice. A lost context is usually the browser reclaiming the least recently
 * used one, and a fresh request generally gets served - it just costs somebody
 * else's. But if the reason is that this machine has no room for another
 * context at all, retrying is a loop that takes the page down with it, and the
 * honest end of that loop is the sentence telling somebody to close some tabs.
 */
const TRIES = 2

/**
 * A canvas that comes back.
 *
 * Returns a key to hang on `<Canvas>` and the reporter to pass to
 * `<KeepContext>` inside it. Changing the key throws the dead canvas away and
 * mounts a new one, which asks the browser for a context of its own - the one
 * move that reliably brings a page back, and the one a component inside the
 * dead canvas cannot make for itself.
 *
 * What it costs is the scene: a remounted canvas is a fresh camera, a fresh
 * frame loop and whatever the scene rebuilds on mount. Which is why it waits
 * for a restore first, and why the count is two - this is the last resort, not
 * the first response.
 */
export function useSurface(): {
  /** Hang this on `<Canvas key={...}>`. */
  key: number
  /** Whether the surface is gone right now. Draw the message on this. */
  lost: boolean
  /** Pass to `<KeepContext onChange={...}>`. */
  watch: (lost: boolean) => void
} {
  const [lost, setLost] = useState(false)
  const [key, setKey] = useState(0)
  const [tries, setTries] = useState(0)

  useEffect(() => {
    if (!lost || tries >= TRIES) return

    const timer = setTimeout(() => {
      setTries((count) => count + 1)
      setKey((count) => count + 1)
      // The new canvas has its own surface until it says otherwise. Cleared
      // here rather than waiting for a `restored` the dead one will never fire.
      setLost(false)
    }, WAIT_FOR_RESTORE)

    return () => clearTimeout(timer)
  }, [lost, tries])

  /**
   * A surface that came back on its own resets the count.
   *
   * Otherwise a page open all afternoon spends its two tries on two unrelated
   * losses hours apart and has none left for the one that matters.
   */
  const watch = useCallback((gone: boolean) => {
    setLost(gone)
    if (!gone) setTries(0)
  }, [])

  return { key, lost, watch }
}
