/**
 * A canvas, as a video file.
 *
 * `MediaRecorder` over `canvas.captureStream()`, which is the whole of the
 * browser's built-in video encoder and costs nothing to reach.
 *
 * ---------------------------------------------------------------------------
 * What this trades away, and what is done about it
 * ---------------------------------------------------------------------------
 * `MediaRecorder` encodes in real time off the wall clock. It is not handed
 * frames; it samples whatever the canvas last drew, at whatever rate it manages.
 * So if the scene is heavier than the frame budget, the recording does not slow
 * down to keep up - it drops frames, silently, and the only sign is that the
 * finished file stutters.
 *
 * The alternative is WebCodecs, which takes frames one at a time and does not
 * care how long each took, and would make export deterministic. It also needs a
 * muxer dependency to get a playable file out the other end.
 *
 * So this stays dependency-free and measures instead: `render` is counted, the
 * count is compared against what the elapsed time should have produced, and the
 * result says so. A stuttery clip you are told about is a clip you re-shoot at
 * a smaller size; a stuttery clip you are not told about is one you post.
 *
 * ---------------------------------------------------------------------------
 * The format
 * ---------------------------------------------------------------------------
 * WebM, because it is the only thing `MediaRecorder` is widely required to
 * write, and almost nothing else accepts. The social platforms and every
 * editor worth the name want H.264 in an mp4, so a finished clip needs one pass
 * through ffmpeg - see `FFMPEG_HINT`, which the panel shows next to the
 * download rather than leaving to be discovered.
 */

/**
 * What to run on the file afterwards to turn it into an mp4.
 *
 * `fps=30` is not optional. A MediaRecorder WebM has no frame rate, only
 * per-frame timestamps on Matroska's millisecond clock - and ffmpeg, asked to
 * make an mp4 from that without being told a rate, conforms to the tick and
 * writes a **1000fps** file, one duplicate frame per millisecond. Every social
 * platform refuses it ("maximum frame rate: 60"), which is how it was found.
 */
export const FFMPEG_HINT =
  'ffmpeg -i shot.webm -vf fps=30 -c:v libx264 -pix_fmt yuv420p -crf 18 -c:a aac -b:a 128k -movflags +faststart shot.mp4'

export interface Capture {
  blob: Blob
  /** Frames actually drawn during the take. */
  drawn: number
  /** Frames the requested rate and duration called for. */
  wanted: number
  /** Seconds of wall clock the take really took. */
  elapsed: number
}

/**
 * Codecs worth asking for, best first.
 *
 * VP9 over VP8 for the same reason any encoder prefers it - noticeably better
 * at the flat colour and hard edges this art style is made of - with the bare
 * mime type last so a browser that supports none of the specific strings still
 * records something rather than throwing at the constructor.
 */
const CODECS = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
]

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

export interface RecordOptions {
  fps: number
  /** Seconds of finished video. */
  duration: number
  width: number
  height: number
  /**
   * Draws one frame at time `t`, in seconds. Called on every animation frame
   * for the length of the take.
   */
  render: (t: number) => void
  /** 0 to 1, for a progress bar. */
  onProgress?: (fraction: number) => void
  /**
   * The cast, if they are audible - see `@/app/ovaloffice/studio/speak`.
   *
   * Added to the same stream as the picture rather than recorded separately and
   * muxed afterwards, which is what keeps the two in sync: `MediaRecorder`
   * timestamps both tracks off one clock, so a dropped video frame slides the
   * picture and leaves the dialogue where it was, exactly as a real capture
   * should behave.
   */
  audio?: MediaStreamTrack | null
}

/**
 * Run the take.
 *
 * Drives the clock from `performance.now()` rather than by accumulating a fixed
 * step, because the recorder's timestamps come from the wall clock either way -
 * stepping by `1/fps` while the wall clock ran slower would produce a file
 * whose motion is correct frame to frame and wrong against its own timeline.
 * Following real time means a struggling machine drops frames instead, which is
 * at least the failure the caller is told about.
 */
export function record(canvas: HTMLCanvasElement, options: RecordOptions): Promise<Capture> {
  const { fps, duration, width, height, render, onProgress, audio } = options

  return new Promise((resolve, reject) => {
    const mimeType = pickCodec()
    if (!mimeType) {
      reject(new Error('This browser cannot record video from a canvas.'))
      return
    }

    // Asking the stream for `fps` rather than letting it capture on every paint:
    // an uncapped stream records at the display's rate, so a 30fps shot on a
    // 120Hz screen would carry four copies of every frame.
    const stream = canvas.captureStream(fps)
    // The dialogue joins the picture's stream rather than being recorded on its
    // own. `addTrack` and not a second `MediaRecorder`, for the sync reason in
    // `RecordOptions.audio`.
    if (audio) stream.addTrack(audio)

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: bitrate(width, height, fps),
      audioBitsPerSecond: 128_000,
    })

    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onerror = () => reject(new Error('The recorder stopped unexpectedly.'))

    let drawn = 0
    let frame = 0
    const started = performance.now()

    const stop = () => {
      cancelAnimationFrame(frame)
      // Only the picture. The audio track belongs to the voice's graph and is
      // reused by the next take - stopping it here ends it permanently, and the
      // second recording of a session would come out silent.
      for (const track of stream.getVideoTracks()) track.stop()
      if (audio) stream.removeTrack(audio)
      const elapsed = (performance.now() - started) / 1000
      recorder.onstop = () => {
        resolve({
          blob: new Blob(chunks, { type: mimeType }),
          drawn,
          wanted: Math.round(fps * duration),
          elapsed,
        })
      }
      recorder.stop()
    }

    const tick = () => {
      const t = (performance.now() - started) / 1000
      if (t >= duration) {
        // One last draw exactly on the end, so the final frame of the file is
        // the shot's last moment rather than whenever the loop happened to land.
        render(duration)
        drawn += 1
        onProgress?.(1)
        stop()
        return
      }
      render(t)
      drawn += 1
      onProgress?.(t / duration)
      frame = requestAnimationFrame(tick)
    }

    recorder.start()
    frame = requestAnimationFrame(tick)
  })
}

/**
 * Whether a take is worth keeping, in the caller's words.
 *
 * The threshold is deliberately loose. A handful of missed frames over eight
 * seconds is invisible, and warning about those would train everybody to ignore
 * the warning that matters - so it only speaks up once the shortfall is enough
 * to see.
 */
export function captureNote(capture: Capture): { text: string; dropped: boolean } {
  const ratio = capture.wanted === 0 ? 1 : capture.drawn / capture.wanted
  const rate = Math.round(capture.drawn / Math.max(capture.elapsed, 0.001))

  if (ratio >= 0.9) {
    return { text: `recorded ${capture.drawn} frames at about ${rate}/s`, dropped: false }
  }
  return {
    text: `only ${rate} frames a second — the scene is too heavy to record at this size. Try a smaller output or a lower rate.`,
    dropped: true,
  }
}
