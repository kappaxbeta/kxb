'use client'

import type * as THREE from 'three'

/**
 * A frame as a picture, and a take as a file.
 *
 * ---------------------------------------------------------------------------
 * Copied from the studio, on purpose
 * ---------------------------------------------------------------------------
 * `src/app/ovaloffice/studio/capture.ts` and `record.ts` are the same two jobs
 * and have been shooting the landing page for months. `src/app/xp/` may not
 * import them - docs/xp/creator.md §1.2 and the lint rule that enforces it -
 * and the reason is worth restating rather than treated as red tape: the
 * backoffice is live and this is a prototype, so a shared module means the
 * prototype either drags the product around or gets stuck behind it.
 *
 * What is *not* copied is as informative as what is. The studio's recorder
 * takes an audio track and a `render(t)` callback because it poses its scene by
 * hand off a `sceneAt`. A movie here is already running its own frame loop
 * against a world in a ref, so the recorder has nothing to drive - it only has
 * to sample a canvas that is drawing anyway. That is the whole of the
 * simplification, and it is why this is not a straight copy.
 */

export interface CaptureParts {
  gl: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
}

/**
 * One frame, at the size asked for, as a PNG data URL.
 *
 * The viewport is whatever size the layout left it and the export is whatever
 * the fields say, so the renderer has to be resized, drawn, read back and put
 * straight again. `updateStyle: false` keeps the canvas element's CSS size
 * untouched through all of it, so the picture on screen does not jump while the
 * shutter fires.
 *
 * Pixel ratio 1, because the size asked for is the size delivered: at the
 * screen's ratio a 1600px export comes back 3200px wide on a retina display,
 * which is a surprise nobody wants in a filename that says 1600.
 *
 * **The transparency is a property of the canvas, not of this function.** The
 * canvas is made with `alpha` and the scene paints no background when the
 * backdrop is `none`, so what comes back here is a cut-out. With a colour or a
 * picture behind it, the same call returns the same frame composited. Nothing
 * here chooses; the document does.
 */
export function capturePng(parts: CaptureParts, width: number, height: number): string {
  const { gl, scene, camera } = parts

  const previousSize = { x: gl.domElement.width, y: gl.domElement.height }
  const previousRatio = gl.getPixelRatio()
  const previousAspect = camera.aspect

  gl.setPixelRatio(1)
  gl.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  gl.render(scene, camera)

  const dataUrl = gl.domElement.toDataURL('image/png')

  gl.setPixelRatio(previousRatio)
  gl.setSize(previousSize.x / previousRatio, previousSize.y / previousRatio, false)
  camera.aspect = previousAspect
  camera.updateProjectionMatrix()
  gl.render(scene, camera)

  return dataUrl
}

/** What to run on the file afterwards to turn it into an mp4. */
export const FFMPEG_HINT =
  'ffmpeg -i shot.webm -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart shot.mp4'

export interface Capture {
  blob: Blob
  /** Frames the stream actually carried. */
  drawn: number
  /** Frames the requested rate and duration called for. */
  wanted: number
  /** Seconds of wall clock the take really took. */
  elapsed: number
}

/**
 * Codecs worth asking for, best first.
 *
 * VP9 over VP8 for the reason any encoder prefers it - noticeably better at the
 * flat colour and hard edges this art style is made of - with the bare mime
 * type last so a browser that supports none of the specific strings still
 * records something rather than throwing at the constructor.
 */
const CODECS = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']

function pickCodec(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  return CODECS.find((codec) => MediaRecorder.isTypeSupported(codec))
}

export const canRecord = () => pickCodec() !== undefined

/**
 * Bits per second for a given frame.
 *
 * Scaled off the pixel count rather than fixed, so a square 1200 and a wide
 * 1920 are not encoded at the same budget. Generous on purpose: this is a
 * master that gets re-encoded at least once more on the way to a timeline and
 * again by whatever site it is posted to, and quality lost in the first pass is
 * not recoverable in the third.
 */
const bitrate = (width: number, height: number, fps: number) =>
  Math.round(Math.min(width * height * fps * 0.15, 40_000_000))

/**
 * Record whatever the canvas draws, for `duration` seconds.
 *
 * ---------------------------------------------------------------------------
 * What this trades away, and what is done about it
 * ---------------------------------------------------------------------------
 * `MediaRecorder` encodes in real time off the wall clock. It is not handed
 * frames; it samples whatever the canvas last drew, at whatever rate the
 * machine manages. So if the scene is heavier than the frame budget the
 * recording does not slow down to keep up - it drops frames, silently, and the
 * only sign is that the finished file stutters.
 *
 * The alternative is WebCodecs, which takes frames one at a time and does not
 * care how long each took, and would make export deterministic. It also needs a
 * muxer dependency to get a playable file out the other end.
 *
 * So this stays dependency-free and **measures** instead: the elapsed time is
 * compared against what the requested rate should have produced and the result
 * says so. A stuttery clip you are told about is one you re-shoot smaller; a
 * stuttery clip you are not told about is one you post.
 *
 * ---------------------------------------------------------------------------
 * It does not drive the picture, and that is the difference from the studio's
 * ---------------------------------------------------------------------------
 * The movie stage is already running a frame loop against a world in a ref.
 * Handing this a `render(t)` as the studio does would mean two clocks driving
 * one canvas, and the one that lost would be the one the author is watching.
 * So the caller starts playback, this samples, and the caller stops it.
 */
export function record(
  canvas: HTMLCanvasElement,
  options: { fps: number; duration: number; width: number; height: number },
): { stop: () => void; done: Promise<Capture> } {
  const { fps, duration, width, height } = options

  let stop = () => {}
  const done = new Promise<Capture>((resolve, reject) => {
    const mimeType = pickCodec()
    if (!mimeType) {
      reject(new Error('This browser cannot record video from a canvas.'))
      return
    }

    // Asking the stream for `fps` rather than letting it capture on every paint:
    // an uncapped stream records at the display's rate, so a 30fps shot on a
    // 120Hz screen would carry four copies of every frame.
    const stream = canvas.captureStream(fps)
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: bitrate(width, height, fps),
    })

    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onerror = () => reject(new Error('The recorder stopped unexpectedly.'))

    const started = performance.now()
    let ended = false

    stop = () => {
      if (ended) return
      ended = true
      const elapsed = (performance.now() - started) / 1000
      for (const track of stream.getVideoTracks()) track.stop()
      recorder.onstop = () => {
        resolve({
          blob: new Blob(chunks, { type: mimeType }),
          // The stream carries one frame per requested tick when it keeps up, so
          // elapsed times rate is the honest count of what was captured - there
          // is no per-frame callback here to count in.
          drawn: Math.round(elapsed * fps),
          wanted: Math.round(fps * duration),
          elapsed,
        })
      }
      recorder.stop()
    }

    recorder.start()
  })

  return { stop: () => stop(), done }
}

/**
 * Whether a take is worth keeping, as a fraction of the frames wanted.
 *
 * Deliberately loose. A handful of missed frames over eight seconds is
 * invisible, and warning about those would train everybody to ignore the
 * warning that matters - so it only speaks up once the shortfall is enough to
 * see.
 */
export function dropped(capture: Capture): number {
  if (capture.wanted === 0) return 0
  const missing = capture.wanted - capture.drawn
  return missing / capture.wanted >= 0.1 ? missing : 0
}

/** Hand a blob or a data URL to the browser as a download. */
export function save(data: Blob | string, filename: string) {
  const url = typeof data === 'string' ? data : URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  if (typeof data !== 'string') URL.revokeObjectURL(url)
}
