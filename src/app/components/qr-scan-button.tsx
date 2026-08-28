'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { canScanNatively, scanQr, TELEGRAM_READY } from '@/lib/telegram/webapp'

/**
 * Reading a code, by whichever of three routes this device actually has.
 *
 * ---------------------------------------------------------------------------
 * The problem this finally answers
 * ---------------------------------------------------------------------------
 * The nearby handshake has always had a text box where it wanted a camera, for
 * one reason: writing a QR *decoder* is a genuinely hard problem, and the
 * browser's own — `BarcodeDetector` — does not exist in Safari. So on the
 * all-iPhone table that this feature is mostly for, there was no scanner to
 * offer at any price.
 *
 * Telegram changes that, and it is the strongest argument for the Mini App:
 * inside the container there is a *native* scanner on both platforms, and it is
 * one call. The thing iOS would not give us, Telegram does.
 *
 * So, in order of preference:
 *
 * 1. **Telegram's own popup.** Native, both platforms, no camera permission
 *    prompt of ours, and no video element to get wrong.
 * 2. **`BarcodeDetector`.** Android Chrome, and desktop Chrome with a webcam.
 *    The browser does the hard part; this only drives the camera.
 * 3. **Nothing.** Safari outside Telegram. The button is *not rendered* — the
 *    caller's text box is the answer there, and a scan button that opens a
 *    camera and then never finds anything is worse than no button, because it
 *    reads as the app being broken rather than as the feature being absent.
 *
 * Which is why this returns null rather than a disabled control. Absence is the
 * honest render.
 */

/** The slice of the Barcode Detection API used here. */
interface Detector {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): Detector
      getSupportedFormats?: () => Promise<string[]>
    }
  }
}

/**
 * How often a frame is looked at.
 *
 * An interval rather than `requestAnimationFrame`, for two reasons that point
 * the same way. Detection is expensive enough that running it sixty times a
 * second heats the phone for no extra hit rate — a code held up to a camera is
 * there for seconds, not milliseconds. And rAF is throttled to nothing in a
 * background or zero-sized frame, which is exactly where this app is hardest to
 * verify (see the note on the Browser pane in the world's canvas).
 */
const LOOK_EVERY_MS = 250

type Mode = 'unavailable' | 'native' | 'camera'

/**
 * Which scanner this device has, read as an external store.
 *
 * All three answers depend on `window`, so the server cannot know any of them,
 * and a server that guessed would either hide a working button or render one
 * that hydration then removes. `null` is "not looked yet" - the server's answer
 * and the first client render's - and it draws nothing, which is the same thing
 * `unavailable` draws. So the pending frame is invisible.
 *
 * A store rather than an effect for the reason set out in
 * `lib/telegram/use-telegram`: this is a fact about the browser that was true
 * before the component mounted and cannot change while it lives, so it is not
 * state React should own. The cache also keeps the answer referentially stable,
 * which `getSnapshot` requires.
 */
let known: Mode | null = null

function detect(): Mode {
  if (known) return known
  if (canScanNatively()) known = 'native'
  else {
    const hasDetector = Boolean(window.BarcodeDetector)
    const hasCamera = Boolean(navigator.mediaDevices?.getUserMedia)
    known = hasDetector && hasCamera ? 'camera' : 'unavailable'
  }
  return known
}

/**
 * The one capability here that is not knowable at first paint.
 *
 * Telegram's scanner arrives with a script, tens of milliseconds after this
 * component first renders. Without this subscription the cache above would
 * freeze the pre-script answer - `unavailable` on an iPhone - and the native
 * scanner would never appear in the only container that offers one.
 */
function subscribe(changed: () => void): () => void {
  const arrived = () => {
    known = null
    changed()
  }
  window.addEventListener(TELEGRAM_READY, arrived)
  return () => window.removeEventListener(TELEGRAM_READY, arrived)
}

const onServer = (): Mode | null => null

function useMode(): Mode | null {
  return useSyncExternalStore(subscribe, detect, onServer)
}

export function QrScanButton({
  onScan,
  prompt = 'Point at the code',
  className,
  children = 'Scan',
}: {
  /** The decoded text. Called once per successful scan. */
  onScan: (text: string) => void
  /** Shown above Telegram's native viewfinder. */
  prompt?: string
  className?: string
  children?: React.ReactNode
}) {
  const mode = useMode()
  const [open, setOpen] = useState(false)

  const scanNatively = useCallback(async () => {
    const text = await scanQr(prompt)
    if (text) onScan(text)
  }, [onScan, prompt])

  if (mode === null || mode === 'unavailable') return null

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          if (mode === 'native') void scanNatively()
          else setOpen(true)
        }}
      >
        {children}
      </button>

      {open ? (
        <CameraScanner
          onClose={() => setOpen(false)}
          onScan={(text) => {
            setOpen(false)
            onScan(text)
          }}
        />
      ) : null}
    </>
  )
}

/**
 * The fallback viewfinder, for browsers that have `BarcodeDetector`.
 *
 * Mounted only while it is open, so the camera is acquired on the way in and
 * released on the way out by the same effect. A scanner that keeps the camera
 * light on after it has closed is the kind of thing people uninstall an app
 * over, and tying the stream's life to the component's is the only version of
 * this that cannot leak one.
 */
function CameraScanner({
  onScan,
  onClose,
}: {
  onScan: (text: string) => void
  onClose: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    let stopped = false

    const stop = () => {
      stopped = true
      if (timer) clearInterval(timer)
      for (const track of stream?.getTracks() ?? []) track.stop()
    }

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // The back camera, because somebody is pointing this at another
          // person's phone. The default is the selfie camera, which would make
          // every scan a contortion.
          video: { facingMode: { ideal: 'environment' } },
        })
        if (stopped) {
          for (const track of stream.getTracks()) track.stop()
          return
        }
        if (!video.current) return
        video.current.srcObject = stream
        await video.current.play()
      } catch {
        // Refused, or no camera. Both are the same sentence to the person
        // holding the phone, and both leave the caller's text box working.
        setProblem('No camera available. Paste the link instead.')
        return
      }

      const detector = new window.BarcodeDetector!({ formats: ['qr_code'] })

      timer = setInterval(async () => {
        if (!video.current || video.current.readyState < 2) return
        try {
          const found = await detector.detect(video.current)
          const text = found[0]?.rawValue
          if (text) {
            stop()
            onScan(text)
          }
        } catch {
          // A frame that could not be read is the normal case, not an error -
          // most frames have no code in them. Swallowed rather than surfaced,
          // because the loop is the retry.
        }
      }, LOOK_EVERY_MS)
    })()

    return stop
  }, [onScan])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-6">
      <div className="relative aspect-square w-full max-w-xs overflow-hidden rounded-2xl border border-white/15 bg-black">
        <video
          ref={video}
          playsInline
          muted
          className="h-full w-full object-cover"
          aria-label="Camera"
        />
        {/* A frame to aim inside. Purely an affordance - the detector looks at
            the whole picture - but without it people hold the code at the edge
            and wonder why nothing happens. */}
        <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/60" />
      </div>

      <p className="text-center text-xs text-white/60" role="status">
        {problem ?? 'Point at the code'}
      </p>

      <button
        type="button"
        onClick={onClose}
        className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white transition-colors hover:border-white/40"
      >
        Cancel
      </button>
    </div>
  )
}
