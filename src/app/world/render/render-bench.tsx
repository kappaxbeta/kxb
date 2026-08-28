'use client'

import { createRoot, extend, useStore, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { SceneStage } from '@/app/ovaloffice/studio/scene-stage'
import { Backdrop } from '@/app/world/shots/pieces'
import type { StudioScene } from '@/domain/studio/scene'
import { parseShot, sceneAt } from '@/domain/studio/shot'

/**
 * A renderer with nothing to render.
 *
 * The page holds no document, fetches nothing and draws nothing until somebody
 * hands it a scene. `window.draw(request)` is the whole interface: give it a
 * shot document, an instant and a size, get back the pixels. The render worker
 * calls it over the DevTools protocol; that is the only caller there is.
 *
 * ---------------------------------------------------------------------------
 * Why the worker injects the document instead of the page loading it
 * ---------------------------------------------------------------------------
 * The obvious shape is `/world/render/[job]`: the worker opens a URL, the page
 * reads the job and draws it. That needs the page to read a `render_jobs` row
 * from a browser with no session, which means either a service-role read in a
 * route or a shared secret in a query string - a new privileged read path, for
 * a renderer.
 *
 * The worker already holds the service role. It has the document before it
 * opens a tab. So it passes it in, and this page stays what it looks like: a
 * canvas and a function, with no authority and nothing to leak. That it is
 * publicly reachable costs nothing - the rendering happens in whichever browser
 * asked, on that machine's own CPU, from a document that browser supplied.
 *
 * ---------------------------------------------------------------------------
 * Why `createRoot` and not `<Canvas>`
 * ---------------------------------------------------------------------------
 * The same reason `ShotStudio` gives, and it matters more here because this
 * page has no human fallback: `<Canvas>` sizes itself with a ResizeObserver,
 * and a ResizeObserver in a tab that is never painted never fires. The canvas
 * would sit at the DOM default of 300x150 and R3F would never build a root at
 * all. The size is not something that needs measuring anyway - it is the size
 * of the image being asked for.
 */

/**
 * `<Canvas>` extends the THREE namespace for you; `createRoot` does not.
 *
 * The same line `ShotStudio` carries, for the same reason and with the same
 * failure: without it the first `<color>` or `<ambientLight>` throws "not part
 * of the THREE namespace", the root never commits, and `window.draw` returns a
 * promise that never settles - which a worker cannot tell apart from a slow
 * render, and so reports as a timeout three minutes later.
 */
// @ts-expect-error - the THREE namespace is wider than `Catalogue`, on purpose.
extend(THREE as unknown as Record<string, unknown>)

/** What a caller asks for. Everything but the document has a sensible default. */
export interface DrawRequest {
  /** A ShotSpec. Re-parsed here, so a caller cannot hand the renderer nonsense. */
  document: unknown
  /** Which instant of the shot to draw. Zero is the first frame. */
  at?: number
  width?: number
  height?: number
  /**
   * webp by default, and that default is what keeps the worker small.
   *
   * A canvas will encode either, and the browser doing it means nothing
   * downstream needs an image library: the worker used to pull a megabyte of
   * base64 PNG over the protocol and re-encode it with sharp, which is a native
   * dependency, a decode and an encode, to arrive at bytes Chrome could have
   * produced directly. PNG stays available because lossless is the right answer
   * when a human is going to look at the file rather than a card.
   */
  format?: 'webp' | 'png'
  /** 0..1, webp only. Ignored for PNG, which has no such dial. */
  quality?: number
}

/** One drawn frame. Matches `Capture` in the shot studio, deliberately. */
export interface Capture {
  /** `data:image/webp;base64,...` or `data:image/png;base64,...`. */
  dataUrl: string
  /** `image/webp` or `image/png`, so a caller need not parse the prefix. */
  contentType: string
  width: number
  height: number
}

/**
 * Kept in step with the check constraint on `render_jobs`, by hand.
 *
 * Two copies, and the duplication is the point: the database refuses a job it
 * cannot store, and this refuses a request that never became a job - the CLI
 * path does not go through the table at all.
 */
const MIN_SIZE = 16
const MAX_SIZE = 2048

const clampSize = (value: number) =>
  Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(value)))

declare global {
  interface Window {
    /** Draws one scene and hands back its pixels. The only interface here. */
    draw?: (request: DrawRequest) => Promise<Capture>
    /** True once the bench is mounted and `draw` is safe to call. */
    drawReady?: boolean
  }
}

export function RenderBench() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = useState('waiting for a scene')
  const [size, setSize] = useState({ width: 640, height: 360 })

  useEffect(() => {
    const element = canvas.current
    if (!element) return

    let live = true
    let root: ReturnType<typeof createRoot> | null = null

    window.draw = async (request: DrawRequest): Promise<Capture> => {
      /**
       * Parsed rather than trusted, exactly as `published_scenes` documents are
       * on the way out. An unrecognised avatar or block model becomes a `fetch`
       * for a glTF that is not there, which suspends the scene's boundary
       * forever - and a render that hangs is the one failure a worker cannot
       * tell apart from a slow one.
       */
      const shot = parseShot(request.document)
      const width = clampSize(request.width ?? shot.width)
      const height = clampSize(request.height ?? shot.height)
      const scene = sceneAt(shot, Math.max(0, request.at ?? 0))

      setSize({ width, height })
      setStatus('loading models…')

      // A previous draw's root owns the canvas and its WebGL context. Unmounted
      // rather than reused: a bench that has drawn a hundred scenes into one
      // root is a hundred scenes' worth of retained glTF on a box with 4GB.
      root?.unmount()
      root = createRoot(element)

      await root.configure({
        // The buffer has to survive the draw call for `toDataURL` to see it.
        gl: { preserveDrawingBuffer: true, antialias: true, alpha: false },
        shadows: 'percentage',
        // 1, not the studio's 2. There the number is a quality decision about a
        // marketing still; here the caller asked for a pixel size and that is
        // what it gets.
        dpr: 1,
        // Nothing animates. The clock is an argument to `sceneAt`, so a frame
        // loop would redraw the same instant forever - and a frame loop is also
        // the thing that does not run in a tab nobody is painting.
        frameloop: 'never',
        size: { width, height, top: 0, left: 0 },
        camera: {
          position: scene.camera.position,
          fov: scene.camera.fov,
          near: 0.1,
          far: 400,
        },
      })
      if (!live) throw new Error('the bench was unmounted mid-draw')

      const three: { current: ThreeBits | null } = { current: null }
      const arrived = new Promise<void>((resolve) => {
        root?.render(
          <>
            <Lens framing={scene.camera} />
            {/* The background belongs to the shot, not to the instant of it -
                `sceneAt` reduces the cast and the camera, and a scene whose sky
                changed halfway through would be a different shot. Read off
                `shot` for that reason, exactly as `ScenePlayer` does. */}
            {shot.background.image === null && (
              <color attach="background" args={[shot.background.colour]} />
            )}
            <Backdrop image={shot.background.image} aspect={width / height} />
            <Grab intoRef={three} />
            <Suspense fallback={null}>
              <SceneStage scene={scene} onReady={resolve} />
            </Suspense>
          </>,
        )
      })

      await arrived
      if (!live) throw new Error('the bench was unmounted mid-draw')

      /**
       * One turn of the event loop between "the models are here" and the draw.
       *
       * `onReady` fires from an effect, so React has committed the scene - but
       * `SceneStage` reports the reach of a world set back up as state, and that
       * second commit is what sizes the shadow camera. Drawing in the same tick
       * catches the frame before it, which shows up as a scene lit correctly and
       * shadowed as though the set were not there.
       */
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (!live) throw new Error('the bench was unmounted mid-draw')

      const bits = three.current
      if (!bits) throw new Error('the renderer never reported back')

      bits.gl.render(bits.scene, bits.camera)

      const contentType = request.format === 'png' ? 'image/png' : 'image/webp'
      const capture: Capture = {
        // The quality argument is ignored for PNG rather than refused, which is
        // the canvas API's own behaviour and not worth wrapping a branch around.
        dataUrl: bits.gl.domElement.toDataURL(contentType, request.quality ?? 0.86),
        contentType,
        width: bits.gl.domElement.width,
        height: bits.gl.domElement.height,
      }
      setStatus(`drew ${capture.width}x${capture.height}`)
      return capture
    }

    window.drawReady = true

    return () => {
      live = false
      delete window.draw
      window.drawReady = false
      root?.unmount()
    }
  }, [])

  return (
    <main className="min-h-dvh bg-[#0a0616] p-6 text-white">
      <p className="mb-4 font-mono text-xs text-white/40">
        render bench — {status}
      </p>
      <canvas
        ref={canvas}
        style={{ width: size.width, height: size.height }}
        className="max-w-full rounded-2xl"
      />
    </main>
  )
}

interface ThreeBits {
  gl: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.Camera
}

/**
 * Hands the renderer, scene and camera back out of the canvas.
 *
 * The same trick `ShotStudio`'s `Bridge` uses. `useThree` is the only way to
 * reach them, and `useThree` only works from inside the root - so something has
 * to be mounted in there whose whole job is to pass them out.
 */
function Grab({ intoRef }: { intoRef: { current: ThreeBits | null } }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    intoRef.current = { gl, scene, camera }
  }, [intoRef, gl, scene, camera])
  return null
}

/**
 * The shot's framing, on the real camera.
 *
 * `configure` above already took the position and the fov, but not where the
 * camera is pointed - three.js has no declarative `lookAt`, and a camera that
 * is in the right place facing the wrong way is the single most common way a
 * render comes back looking empty. Copied from `ScenePlayer`'s own `Lens` for
 * that reason: a render and a playback must frame a scene identically or the
 * thumbnail is a picture of something else.
 */
function Lens({ framing }: { framing: StudioScene['camera'] }) {
  const store = useStore()
  const [x, y, z] = framing.position
  const [tx, ty, tz] = framing.target
  const { fov } = framing

  useEffect(() => {
    const camera = store.getState().camera as THREE.PerspectiveCamera
    camera.position.set(x, y, z)
    camera.lookAt(tx, ty, tz)
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    camera.updateMatrixWorld()
  }, [store, x, y, z, tx, ty, tz, fov])

  return null
}
