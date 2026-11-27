'use client'

import type { HandLandmarker as Landmarker } from '@mediapipe/tasks-vision'

/**
 * Getting MediaPipe's hand model into the browser.
 *
 * The machinery, kept apart from the mode that uses it, because it is the one
 * piece of hand mode that is about somebody else's library rather than about a
 * hand: it loads a wasm runtime, it has a GPU path that is not available on
 * every machine, and it is the only thing here that can fail before anybody has
 * made a shape. The same file, for the same reasons, as the animator's
 * `capture/landmarker.ts` - and deliberately not shared with it, because the
 * two load different models and want different failures.
 *
 * Everything is served from `public/mocap`, vendored by `bun run mocap:vendor`.
 * Google's own snippets point at a CDN and a bucket; the argument against that
 * is the one `three:vendor` gives, and it is sharper here - the wasm is already
 * on this machine for the capture page, and hand mode should not be the reason
 * a lounge stops working when somebody else's DNS does.
 *
 * The files are a build output and are not in git, so the first thing this does
 * is check they are there. Getting that wrong is otherwise a wasm loader
 * failing deep inside a bundle with a message about a stream.
 *
 * The `import()` is inside the function on purpose. A client component's module
 * still runs on the server while Next renders the page, and it keeps four
 * megabytes of library out of every room nobody has switched a camera on in.
 */

const MODEL = '/mocap/hand_landmarker.task'
const WASM = '/mocap/wasm'

export const VENDOR_HINT = 'Run `bun run mocap:vendor` and reload.'

/** The landmarker, and the bone list the preview draws it with. */
export interface Sighting {
  landmarker: Landmarker
  connections: { start: number; end: number }[]
}

/**
 * The model, ready to be handed video frames.
 *
 * `numHands: 1` because the alphabet is one hand. Asking for two would spend
 * the same work again on whoever is sitting behind you and then leave this mode
 * deciding which of the two of you is talking.
 *
 * The confidences are left at MediaPipe's defaults, written out. They are worth
 * seeing next to `sight.ts`: this is the threshold on *there being a hand*, and
 * everything in that file is a threshold on what the hand is doing. Turning
 * this one up makes the mode go blind at the edge of the frame; turning it down
 * makes it read letters off a coat on a chair.
 *
 * The GPU delegate is tried first and CPU is the fallback rather than a
 * failure - on a machine where WebGL is software, the GPU path either refuses
 * or runs a frame every few seconds, and either is worse than a slow hand.
 */
export async function openHandModel(): Promise<Sighting> {
  await present(MODEL)
  await present(`${WASM}/vision_wasm_internal.wasm`)

  const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')
  const fileset = await FilesetResolver.forVisionTasks(WASM)

  const options = {
    baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  }

  const landmarker = await HandLandmarker.createFromOptions(fileset, options).catch(() =>
    HandLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'CPU' },
    }),
  )

  return { landmarker, connections: HandLandmarker.HAND_CONNECTIONS }
}

/**
 * That a vendored file is really there, said in words somebody can act on.
 *
 * A `HEAD` rather than a fetch of the body: the model is eight megabytes and
 * the loader is about to download it anyway.
 */
async function present(path: string): Promise<void> {
  const response = await fetch(path, { method: 'HEAD' }).catch(() => null)
  if (response?.ok) return
  throw new Error(`${path} is not here. ${VENDOR_HINT}`)
}

export type { Landmarker }
