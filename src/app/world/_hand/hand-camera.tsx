'use client'

import { useEffect, useRef, useState } from 'react'

import { FIST, type Pose } from '@/app/world/_hand/fingers'
import { openHandModel, type Sighting, VENDOR_HINT } from '@/app/world/_hand/landmarker'
import type { HandLabels } from '@/app/world/_hand/labels'
import { createSteady, type Drift, readHand } from '@/app/world/_hand/sight'

/**
 * The camera, the model, and the loop between them.
 *
 * Hand mode's third way in. The keys are a hand on the home row and the pads
 * are a hand on a phone; this is *your actual hand*, which is the version
 * everybody expects the moment they see the mode and the only one that does not
 * have to be learned. It costs a permission prompt and eight megabytes of
 * model, which is why it is an option you switch on rather than the way in.
 *
 * Everything about this component is imperative and almost none of it is state.
 * A detector running thirty times a second that wrote each reading into React
 * would re-render a room thirty times a second - the same argument the
 * animator's `capture/camera.tsx` makes, and the same one `hand-layer.tsx`
 * makes about the pose it already draws. So the loop lives in one effect, the
 * readings leave through a callback, and the only thing that re-renders is
 * whether a hand is in shot, because that is the one thing there is to say.
 *
 * ---------------------------------------------------------------------------
 * The picture is mirrored and so is what is measured from it
 * ---------------------------------------------------------------------------
 * A camera photographs you the way a stranger sees you, which is the wrong way
 * round for using your own hand as a controller. Every video call mirrors the
 * self-view; so does this, in CSS, over the video and the overlay together so
 * the drawn skeleton stays glued to the hand it was measured from.
 *
 * The *drift* is mirrored too, but in `sight.ts` rather than here - see the
 * note there. What is not mirrored is the pose, because a pose has no sides: it
 * is five fingers up or down, and it reads the same off either hand. That is
 * worth knowing, because it means a left-handed member signs the same alphabet
 * without a setting.
 */

/** What a reading is handed to. Called every frame the camera produced one. */
export interface Seen {
  /** The pose to believe, already settled. See `createSteady`. */
  pose: Pose
  /** Where the hand is, or `null` while there is nothing in shot. */
  drift: Drift | null
}

export function HandCamera({
  labels,
  onSee,
  className,
}: {
  labels: HandLabels
  onSee: (seen: Seen) => void
  className?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  /*
    The sink and the sentences, without making the loop depend on either.

    A room that passed a fresh `onSee` every time anything in it moved would
    otherwise take the camera down and ask for the permission again - and so
    would a dictionary arriving a render late. The same trap, and the same
    answer, as `hand-layer.tsx` and `_ink/ink-layer.tsx`.
  */
  const sink = useRef(onSee)
  const words = useRef(labels)

  const [holding, setHolding] = useState(false)
  const [trouble, setTrouble] = useState<string | null>(null)

  useEffect(() => {
    sink.current = onSee
    words.current = labels
  }, [onSee, labels])

  useEffect(() => {
    // Taken once and used for the whole life of the effect: React owns this
    // element, it does not change under us, and reading it again in the cleanup
    // would be reading it after the component may have gone.
    const video = videoRef.current
    if (!video) return

    let stopped = false
    let frame = 0
    let stream: MediaStream | null = null
    let sighting: Sighting | null = null

    // Loop state, as locals rather than refs: it all dies with the effect, and
    // a ref that outlived a restart would carry one camera's last hand into the
    // next one's first frame.
    const steady = createSteady()
    let lastVideoTime = -1
    let seeing = false

    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (!sighting || video.readyState < 2) return

      // The same video frame twice is the detector's timestamps going
      // backwards, which MediaPipe treats as an error rather than as a repeat.
      if (video.currentTime === lastVideoTime) return
      lastVideoTime = video.currentTime

      const now = performance.now()
      const result = sighting.landmarker.detectForVideo(video, now)
      const picture = result.landmarks[0]
      const world = result.worldLandmarks[0]
      draw(overlayRef.current, video, picture, sighting.connections)

      const read = picture && world ? readHand(picture, world) : null
      /*
        No hand in shot is a hand falling shut, not a hand frozen mid-letter.

        It goes through the same steadier as everything else, so a frame or two
        of the detector losing you costs nothing, and actually walking away
        closes the hand - which lets `signing.ts` forget the half-word the way
        it does when somebody puts their hands down at the keyboard.
      */
      sink.current({ pose: steady.see(read?.pose ?? FIST, now), drift: read?.drift ?? null })

      if (seeing !== Boolean(read)) {
        seeing = Boolean(read)
        setHolding(seeing)
      }
    }

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // A bigger picture is not a better hand: the model works on a crop of
          // a few hundred pixels either way, and everything above that is
          // bandwidth spent on a preview the size of a stamp.
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        })
        /*
          Both of these have to hand back what they were given.

          Two awaits here means two moments where the effect can have been torn
          down while a promise was in flight - and in development that is not a
          rare race, it is *every* mount, because strict mode mounts, unmounts
          and mounts again. The cleanup that ran cannot stop a camera that had
          not been handed over yet, so whoever is holding it stops it: without
          this, the first of the two mounts leaves the webcam light on for the
          life of the tab.
        */
        if (stopped) return drop(stream)
        video.srcObject = stream
        await video.play()

        sighting = await openHandModel()
        if (stopped) {
          sighting.landmarker.close()
          sighting = null
          return drop(stream)
        }
        setTrouble(null)
        frame = requestAnimationFrame(tick)
      } catch (error) {
        setTrouble(explain(error, words.current))
      }
    }

    void start()

    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      // In this order: the loop is holding the video the landmarker is reading.
      sighting?.landmarker.close()
      drop(stream)
      video.srcObject = null
      // Whatever the hand was doing when the camera went off, it is not doing
      // it now. Without this the drawn hand keeps the last shape it was seen
      // holding, and the keys come back to a hand that is already half a letter.
      sink.current({ pose: FIST, drift: null })
    }
  }, [])

  return (
    <div
      className={`relative aspect-[4/3] overflow-hidden rounded-xl border border-white/15 bg-black/70 ${className ?? ''}`}
    >
      {/* The same two classes on both layers: mirrored, and cropped the same
          way. `object-cover` on the canvas is not decoration - the overlay is
          drawn in the video's own pixels, so it only lands on the hand if the
          browser scales the two identically. */}
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full scale-x-[-1] object-cover opacity-70"
        playsInline
        muted
        autoPlay
      />
      <canvas
        ref={overlayRef}
        className="absolute inset-0 h-full w-full scale-x-[-1] object-cover"
      />

      {(trouble || !holding) && (
        <p className="absolute inset-0 flex items-center justify-center bg-black/55 px-2 text-center text-[0.6rem] leading-tight text-white/80">
          {trouble ?? labels.looking}
        </p>
      )}
    </div>
  )
}

/** Give the camera back. Safe to call on nothing, which is half of why. */
function drop(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop()
}

/**
 * The hand the model found, drawn over the picture.
 *
 * Not decoration, and this is the whole reason the preview is on screen at all:
 * when a letter will not come out, the answer is either that the hand is not
 * being *seen* - half out of frame, too dark, too far - or that it is being
 * seen and read as a different shape. Those two have completely different
 * fixes, and the skeleton is what tells them apart at a glance.
 */
function draw(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement,
  points: { x: number; y: number }[] | undefined,
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

  context.lineWidth = Math.max(2, width / 200)
  // The pen's fuchsia, which is the colour a lit finger is drawn in next door.
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
    context.arc(point.x * width, point.y * height, Math.max(2, width / 260), 0, Math.PI * 2)
    context.fill()
  }
}

/**
 * A failure, in words the reader can act on and in their own language.
 *
 * Two of the three that happen are the member's to fix - the prompt was
 * refused, there is no camera - and those are translated. The third is a
 * vendored model missing on a fresh clone, which is a developer's, and that one
 * keeps its English path and its command: a translated "something is missing"
 * would help nobody who can actually do something about it.
 */
function explain(error: unknown, labels: HandLabels): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return labels.denied
    if (error.name === 'NotFoundError' || error.name === 'NotReadableError') return labels.noCamera
  }
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('/mocap/') ? message : `${labels.trouble} ${VENDOR_HINT}`
}
