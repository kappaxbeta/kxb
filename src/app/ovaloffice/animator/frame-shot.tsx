'use client'

import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import * as THREE from 'three'

/**
 * The frame you are looking at, as a PNG.
 *
 * ---------------------------------------------------------------------------
 * Why this is a component inside the Canvas rather than a function beside it
 * ---------------------------------------------------------------------------
 * The renderer, the scene and the camera are only reachable through
 * `useThree`, which only works inside the Canvas. A button outside it has none
 * of them - so the capture lives in here and hands a function *out*, through a
 * ref the toolbar holds.
 *
 * ---------------------------------------------------------------------------
 * Two things have to be true before `toDataURL` returns a picture
 * ---------------------------------------------------------------------------
 * `preserveDrawingBuffer: true` on the Canvas, or the buffer is cleared the
 * moment the frame is presented and the capture is a blank rectangle. It costs
 * a little memory and a little speed on every frame, which is why three.js
 * defaults it off - and it is the only way to read a WebGL canvas back
 * *without* re-rendering at the exact moment of the read.
 *
 * And the read has to happen right after a render, in the same task. Hence the
 * explicit `render()` below rather than waiting for the loop to come round:
 * whatever we changed for the shot - the floor, the background - has to be
 * true in the buffer we are about to read, not in the next frame.
 */
export type TakeFrame = (options: { transparent: boolean }) => string | null

export function FrameShot({ takeRef }: { takeRef: React.RefObject<TakeFrame | null> }) {
  const { gl, scene, camera } = useThree()

  useEffect(() => {
    takeRef.current = ({ transparent }) => {
      const background = scene.background
      const clear = gl.getClearColor(new THREE.Color())
      const clearAlpha = gl.getClearAlpha()

      try {
        if (transparent) {
          // Nothing behind the dummy: no scene background, and a clear colour
          // with zero alpha so the pixels it does not cover come out empty
          // rather than black. The floor is the caller's to hide - it is a
          // prop on the stage and hiding it here would mean reaching across
          // React to a component we do not own.
          scene.background = null
          gl.setClearColor(0x000000, 0)
        }

        gl.render(scene, camera)
        return gl.domElement.toDataURL('image/png')
      } catch {
        // A tainted canvas is the realistic failure - a texture loaded from
        // somewhere without CORS makes the whole buffer unreadable. Null, and
        // the caller says so, rather than an exception out of a click handler.
        return null
      } finally {
        scene.background = background
        gl.setClearColor(clear, clearAlpha)
        gl.render(scene, camera)
      }
    }

    return () => {
      takeRef.current = null
    }
  }, [gl, scene, camera, takeRef])

  return null
}

/** Hand the browser a data URL as a file. */
export function saveDataUrl(dataUrl: string, name: string): void {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = name
  link.click()
}
