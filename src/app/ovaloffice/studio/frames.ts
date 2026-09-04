'use client'

import { encodeGif } from '@/domain/studio/gif'
import { quantise } from '@/domain/studio/quantise'
import { animatedWebp } from '@/domain/studio/webp-anim'

/**
 * A shot, as an animation with a hole in it.
 *
 * The third way out of the studio, beside the WebM and the still. The other two
 * are what they are for good reasons - a video for anything that goes on a
 * timeline, a PNG for anything that goes in a layout - and neither can do the
 * thing this is for: a scene that *moves* on a page that already has a
 * background, with no black box around it.
 *
 * ---------------------------------------------------------------------------
 * Frame by frame, not in real time
 * ---------------------------------------------------------------------------
 * `record` uses `MediaRecorder`, which samples the canvas off the wall clock
 * and drops whatever it could not keep up with - see the long note there. This
 * cannot work that way even if it wanted to, because there is no recorder that
 * takes an alpha channel; it has to read the canvas itself.
 *
 * Which turns the weakness into the feature. Nothing here is timed: the
 * playhead is moved, the frame is *waited for*, and only then is it read. A
 * scene too heavy to play at thirty frames a second still exports at exactly
 * thirty frames a second - it just takes longer to do it. There is no such
 * thing as a dropped frame on this path.
 *
 * ---------------------------------------------------------------------------
 * The two formats, and why both
 * ---------------------------------------------------------------------------
 * **WebP** is the one to use. It keeps the real alpha channel, so edges stay
 * soft, and it keeps every colour. The browser encodes each frame and
 * `animatedWebp` muxes them, so nothing is re-compressed.
 *
 * **GIF** is the compatibility copy, and it costs: 256 colours and a hard-cut
 * edge - see `quantise`. It is here because a GIF drops into a mail, a wiki, a
 * README and a decade-old CMS without anybody being asked whether their browser
 * supports it.
 */

export type AlphaFormat = 'webp' | 'gif'

export interface AlphaCapture {
  blob: Blob
  /** What to call it, extension included. */
  extension: 'webp' | 'gif'
  /** How many frames were actually written. */
  frames: number
}

export interface AlphaOptions {
  fps: number
  /** Seconds of finished animation. */
  duration: number
  width: number
  height: number
  /** Moves the playhead to `t` seconds. Awaited by a frame, not by a promise. */
  render: (t: number) => void
  /** 0 to 1, for a progress bar. */
  onProgress?: (fraction: number) => void
}

/**
 * How many pixels of raw frame a GIF take may hold at once.
 *
 * The GIF path has to keep every frame as RGBA until the last one is in, because
 * the palette is chosen across the whole animation - one table for all of it, as
 * `quantise` explains. Sixty million pixels is about 240MB of `Uint8ClampedArray`
 * and is comfortably under what a tab will hold; twice that is a browser that
 * stops answering halfway through a take with no way to say why.
 *
 * The WebP path has no such limit: each frame is compressed the moment it is
 * read, and a whole take lives in a few megabytes.
 */
const GIF_PIXEL_BUDGET = 60_000_000

/** Waits for the browser to have actually drawn what was just asked for. */
const nextFrame = () => new Promise<void>((go) => requestAnimationFrame(() => go()))

/**
 * Read the WebGL canvas as pixels.
 *
 * Through a 2D canvas rather than `gl.readPixels`, and it is not laziness: the
 * renderer's buffer is premultiplied, bottom-up, and in whatever colour space
 * the context was made with. `drawImage` is the browser undoing all three for
 * us, and `getImageData` hands back straight, top-down, non-premultiplied RGBA -
 * which is what both encoders want.
 */
function readPixels(
  canvas: HTMLCanvasElement,
  into: CanvasRenderingContext2D,
  width: number,
  height: number,
): Uint8ClampedArray {
  into.clearRect(0, 0, width, height)
  into.drawImage(canvas, 0, 0, width, height)
  return into.getImageData(0, 0, width, height).data
}

/** One frame of the canvas as a complete WebP file. */
async function readWebp(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((go) =>
    /*
      Quality 0.92 rather than 1.

      At 1 Chrome switches to *lossless*, which on a 1200px frame of a shaded
      scene is four or five times the bytes for a difference nobody watching an
      animation can see. The point of this format over the GIF is the alpha
      channel and the colour depth, both of which survive a lossy pass intact.
    */
    canvas.toBlob(go, 'image/webp', 0.92),
  )

  if (!blob) throw new Error('This browser will not encode WebP.')
  if (blob.type !== 'image/webp') {
    // A canvas asked for a format it cannot write gives back a PNG without
    // saying so. Muxing those into a WebP container would produce a file that
    // is a WebP by its header and nothing else all the way down.
    throw new Error('This browser wrote a PNG instead of a WebP.')
  }

  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Draw the whole take and hand back the file.
 *
 * The canvas must already be at the export size, with a transparent clear -
 * both are the caller's job, because the caller is the one that has to put them
 * back afterwards. See the export handler in `ShotEditor`.
 */
export async function captureAlpha(
  canvas: HTMLCanvasElement,
  format: AlphaFormat,
  options: AlphaOptions,
): Promise<AlphaCapture> {
  const { fps, duration, width, height, render, onProgress } = options

  const total = Math.max(1, Math.round(duration * fps))
  const frameMs = 1000 / fps

  if (format === 'gif' && width * height * total > GIF_PIXEL_BUDGET) {
    const seconds = Math.floor(GIF_PIXEL_BUDGET / (width * height) / fps)
    throw new Error(
      `A GIF this size holds about ${Math.max(1, seconds)}s. Shorten the shot, ` +
        `or export it as WebP, which has no such limit.`,
    )
  }

  const webpFrames: Uint8Array[] = []
  const rgbaFrames: Uint8ClampedArray[] = []

  /*
    One scratch canvas for the whole take rather than one per frame.

    `willReadFrequently` is the hint that decides whether the browser keeps this
    surface on the GPU or in main memory, and every frame of this is read back -
    without it Chrome moves the buffer across the bus once per frame and the
    export runs several times slower.
  */
  let scratch: CanvasRenderingContext2D | null = null
  if (format === 'gif') {
    const surface = document.createElement('canvas')
    surface.width = width
    surface.height = height
    scratch = surface.getContext('2d', { willReadFrequently: true })
    if (!scratch) throw new Error('This browser will not open a 2D canvas.')
  }

  for (let i = 0; i < total; i += 1) {
    render(i / fps)
    /*
      Two frames, not one.

      The first lets the scene react to the new time - the mixers advance, the
      camera moves, the cast is posed - and the second is the one that is
      actually drawn from it. Reading after a single frame gives the *previous*
      pose about a third of the time, which shows up as an animation that
      stutters back a step at random.
    */
    await nextFrame()
    await nextFrame()

    if (format === 'webp') webpFrames.push(await readWebp(canvas))
    else rgbaFrames.push(readPixels(canvas, scratch!, width, height))

    onProgress?.((i + 1) / total)
  }

  if (format === 'webp') {
    const file = animatedWebp(webpFrames, { width, height, frameMs })
    return {
      blob: new Blob([file as BlobPart], { type: 'image/webp' }),
      extension: 'webp',
      frames: webpFrames.length,
    }
  }

  const { palette, frames, transparent } = quantise(rgbaFrames)
  const file = encodeGif(
    frames.map((indices) => ({ indices, delayCs: Math.round(100 / fps) })),
    { width, height, palette, transparent },
  )

  return {
    blob: new Blob([file as BlobPart], { type: 'image/gif' }),
    extension: 'gif',
    frames: frames.length,
  }
}
