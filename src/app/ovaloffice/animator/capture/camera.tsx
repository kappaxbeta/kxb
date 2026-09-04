'use client'

import { useEffect, useRef } from 'react'
import {
  type Quality,
  type Reading,
  VENDOR_HINT,
  openLandmarker,
} from '@/app/ovaloffice/animator/capture/landmarker'
import { type PoseFrame, toModelSpace } from '@/domain/mocap/landmarks'
import { smoothFrame } from '@/domain/mocap/smooth'

/**
 * The camera, the model, and the loop between them.
 *
 * Everything about this component is imperative and none of it is state. A
 * detector running at thirty frames a second that wrote each result into React
 * would re-render the page thirty times a second to change a number nobody is
 * reading - the same argument the animator's stage makes about bones. So the
 * loop lives in one effect, the frames leave through a callback, and the only
 * thing that re-renders is the rate, twice a second, because it is the one
 * number that tells you whether this machine can keep up.
 *
 * ---------------------------------------------------------------------------
 * Why the video is mirrored and the numbers are not
 * ---------------------------------------------------------------------------
 * A camera photographs you the way a stranger sees you, which is the wrong way
 * round for using your own body as a controller: raise your left hand and it
 * appears on the right of the picture, so the thing on screen that moved is on
 * the wrong side of the thing that moved in the room. Every video call mirrors
 * the self-view for this reason, and so does this.
 *
 * The mirroring is CSS on the video and the overlay together - one `scaleX`
 * over both, so the drawn skeleton stays glued to the body it was measured
 * from. It never touches the landmarks: `toModelSpace` maps the person's left
 * to the dummy's left directly, and a mirror applied to the numbers as well
 * would put a wave on the wrong arm. See the note in `@/domain/mocap/landmarks`.
 */
export function Camera({
  running,
  quality,
  smoothing,
  onFrame,
  onTrouble,
  onRate,
}: {
  running: boolean
  quality: Quality
  /** 0 to 1. Read live, so moving the slider does not restart the camera. */
  smoothing: number
  /** Every frame the model produced a body for, in the dummy's space. */
  onFrame: (frame: PoseFrame) => void
  /** Something the person has to do something about, or null when it clears. */
  onTrouble: (message: string | null) => void
  /** Detections a second, twice a second. */
  onRate: (rate: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)

  // The things the loop reads but must not restart for. Written in an effect
  // and not in the render body: the compiler's lint refuses a ref written
  // while rendering, and it is right to - a render can be thrown away and run
  // again, and this one has a camera on the other end of it.
  const smoothingRef = useRef(smoothing)
  const onFrameRef = useRef(onFrame)
  const onTroubleRef = useRef(onTrouble)
  const onRateRef = useRef(onRate)

  useEffect(() => {
    smoothingRef.current = smoothing
    onFrameRef.current = onFrame
    onTroubleRef.current = onTrouble
    onRateRef.current = onRate
  }, [smoothing, onFrame, onTrouble, onRate])

  useEffect(() => {
    if (!running) return
    // Taken once, and used for the whole life of the effect: React owns this
    // element and it does not change under us, and reading it again in the
    // cleanup would be reading it after the component may have gone.
    const video = videoRef.current
    if (!video) return

    let stopped = false
    let frame = 0
    let stream: MediaStream | null = null
    let reading: Reading | null = null

    // Loop state. Locals rather than refs: it all dies with the effect, and a
    // ref that outlived a restart would carry one camera's timing into the
    // next one's first frame.
    let lastVideoTime = -1
    let previous: PoseFrame | null = null
    let previousAt = 0
    let counted = 0
    let countedFrom = 0

    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (!reading || video.readyState < 2) return

      // The same video frame twice is the detector's timestamps going
      // backwards, which MediaPipe treats as an error rather than as a repeat.
      if (video.currentTime === lastVideoTime) return
      lastVideoTime = video.currentTime

      const now = performance.now()
      const result = reading.landmarker.detectForVideo(video, now)
      draw(overlayRef.current, video, result.landmarks[0], reading.connections)

      counted += 1
      if (now - countedFrom > 500) {
        onRateRef.current(Math.round((counted * 1000) / (now - countedFrom)))
        counted = 0
        countedFrom = now
      }

      const world = result.worldLandmarks[0]
      if (!world) {
        // Nobody in shot. The last frame is dropped rather than held, so the
        // smoother does not blend a body that has left the room into the one
        // that walks back in.
        previous = null
        return
      }

      const elapsed = previousAt ? (now - previousAt) / 1000 : 1 / 30
      const smoothed = smoothFrame(previous, toModelSpace(world), smoothingRef.current, elapsed)
      previous = smoothed
      previousAt = now
      onFrameRef.current(smoothed)
    }

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // A bigger picture is not a better skeleton: the model works on a
          // square crop of a few hundred pixels either way, and everything
          // above that is bandwidth spent on the preview.
          video: { width: { ideal: 960 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false,
        })
        if (stopped) return
        video.srcObject = stream
        await video.play()

        reading = await openLandmarker(quality)
        if (stopped) return
        onTroubleRef.current(null)
        countedFrom = performance.now()
        frame = requestAnimationFrame(tick)
      } catch (error) {
        onTroubleRef.current(explain(error))
      }
    }

    void start()

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      // In this order: the loop is holding the video the landmarker is reading.
      reading?.landmarker.close()
      for (const track of stream?.getTracks() ?? []) track.stop()
      video.srcObject = null
    }
  }, [running, quality])

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-black">
      {/*
        The same three classes on both layers: mirrored, and cropped the same
        way. `object-cover` on the canvas is not decoration - the overlay is
        drawn in the video's own pixels, so it only lands on the body if the
        browser scales the two identically. Without it, a camera that hands
        over 16:9 into a 4:3 box draws the skeleton beside the person.
      */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
        playsInline
        muted
        autoPlay
      />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
      />
      {!running && (
        <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/70">
          The camera is off.
        </p>
      )}
    </div>
  )
}

/**
 * The skeleton the model found, drawn over the picture.
 *
 * Not decoration: it is the only way to tell a bad capture from a bad
 * retarget. A dummy doing something strange with an arm is either the model
 * losing the arm - which you can see here immediately - or this app's maths,
 * and without the overlay the two are indistinguishable from the chair.
 */
function draw(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement,
  points: { x: number; y: number; visibility?: number }[] | undefined,
  connections: { start: number; end: number }[],
) {
  if (!canvas) return
  const width = video.videoWidth || canvas.clientWidth
  const height = video.videoHeight || canvas.clientHeight
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }

  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, width, height)
  if (!points) return

  context.lineWidth = Math.max(2, width / 240)
  context.strokeStyle = 'rgba(240, 171, 252, 0.9)'
  context.beginPath()
  for (const { start, end } of connections) {
    const from = points[start]
    const to = points[end]
    if (!from || !to) continue
    context.moveTo(from.x * width, from.y * height)
    context.lineTo(to.x * width, to.y * height)
  }
  context.stroke()

  context.fillStyle = 'rgba(255, 255, 255, 0.95)'
  for (const point of points) {
    context.beginPath()
    context.arc(point.x * width, point.y * height, Math.max(2, width / 300), 0, Math.PI * 2)
    context.fill()
  }
}

/**
 * A failure, in words that say what to do next.
 *
 * The three that actually happen are worth naming: the permission prompt was
 * refused, there is no camera, and the vendored model is missing on a fresh
 * clone. Everything else falls through with its own message, which is more
 * use than a house one.
 */
function explain(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return 'The browser refused the camera. Allow it for this site and press Start again.'
    }
    if (error.name === 'NotFoundError') return 'No camera on this machine.'
    if (error.name === 'NotReadableError') {
      return 'Something else is holding the camera - a call, another tab.'
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('/mocap/') ? message : `The pose model would not start: ${message}. ${VENDOR_HINT}`
}
