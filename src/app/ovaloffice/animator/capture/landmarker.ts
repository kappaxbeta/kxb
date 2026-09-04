'use client'

import type { PoseLandmarker as Landmarker } from '@mediapipe/tasks-vision'

/**
 * A pair of landmarks with a line drawn between them.
 *
 * Written out rather than imported: the package declares `Connection` inside
 * its bundle and does not export the name, so the only way to say what
 * `POSE_CONNECTIONS` is made of is to say it.
 */
export interface Connection {
  start: number
  end: number
}

/**
 * Getting MediaPipe's pose model into the browser.
 *
 * The machinery, kept apart from everything that uses it, because it is the
 * one piece here that is about somebody else's library rather than about this
 * app - it loads a wasm runtime, it has a GPU path that is not available on
 * every machine, and it is the only thing on the page that can fail before
 * anybody has done anything.
 *
 * ---------------------------------------------------------------------------
 * Everything is served from here
 * ---------------------------------------------------------------------------
 * Google's own snippets point `FilesetResolver` at a CDN and the model at a
 * bucket. Both are vendored into `public/mocap` instead - see
 * `scripts/mocap-vendor.ts` - for the reason `three:vendor` gives: an app that
 * stops working when somebody else's DNS does is not an app. It also means the
 * page keeps working on a laptop with no internet, which is exactly the
 * situation somebody recording a walk cycle in a room is in.
 *
 * The files are a build output and are not in git, so the first thing this
 * does is check they are actually there. Getting that wrong is otherwise a
 * wasm loader failing deep inside a bundle with a message about a stream.
 *
 * ---------------------------------------------------------------------------
 * Imported at the moment it is wanted, and not before
 * ---------------------------------------------------------------------------
 * The `import()` is inside the function on purpose. A client component's
 * module still runs on the server while Next renders the page, and a library
 * that reaches for `document` or `self` as it loads would take the whole route
 * down before anybody had pressed anything. Deferring it also keeps a large
 * bundle out of a page that nobody has opened the camera on yet.
 */

/**
 * Which model to run.
 *
 * `lite` and `full` are the same 33 landmarks at different costs. The
 * difference shows up in depth - the axis a single camera is guessing at - so
 * `full` is worth it for anything where the body turns, and `lite` is the one
 * that keeps up on a laptop already running a dev server.
 */
export const QUALITIES = ['fast', 'fine'] as const
export type Quality = (typeof QUALITIES)[number]

const MODELS: Record<Quality, string> = {
  fast: '/mocap/pose_landmarker_lite.task',
  fine: '/mocap/pose_landmarker_full.task',
}

const WASM = '/mocap/wasm'

export const VENDOR_HINT = 'Run `bun run mocap:vendor` and reload.'

/**
 * The landmarker, ready to be handed video frames.
 *
 * `numPoses: 1` because a dummy is one body: asking for more spends the same
 * work on somebody walking past behind you, and then leaves this page to
 * decide which of the two is the performer.
 *
 * The GPU delegate is tried first and CPU is the fallback rather than a
 * failure. On a machine where WebGL is software - a headless browser, a VM -
 * the GPU path either refuses outright or runs at a frame every few seconds,
 * and a capture page that silently does neither is worse than a slow one.
 */
export async function openLandmarker(quality: Quality): Promise<Reading> {
  const model = MODELS[quality]
  await assertPresent(model)
  await assertPresent(`${WASM}/vision_wasm_internal.wasm`)

  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
  const fileset = await FilesetResolver.forVisionTasks(WASM)

  const options = {
    baseOptions: { modelAssetPath: model, delegate: 'GPU' as const },
    runningMode: 'VIDEO' as const,
    numPoses: 1,
    // The defaults, written down: the detector's own thresholds are what
    // `visibility` is measured against downstream, and a page that quietly
    // moved them would be a page whose captures cannot be compared.
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  }

  const landmarker = await PoseLandmarker.createFromOptions(fileset, options).catch(() =>
    PoseLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'CPU' },
    }),
  )

  // The connection list comes back with the landmarker rather than being
  // imported where it is drawn, for the same reason the import is deferred:
  // it is a static on the class, and reading it is loading the module.
  return { landmarker, connections: PoseLandmarker.POSE_CONNECTIONS }
}

/** The landmarker, and the bone list the overlay draws it with. */
export interface Reading {
  landmarker: Landmarker
  connections: Connection[]
}

/**
 * That a vendored file is really there, said in words somebody can act on.
 *
 * A `HEAD` rather than a fetch of the body: the model is six megabytes and the
 * loader is about to download it anyway.
 */
async function assertPresent(path: string): Promise<void> {
  const response = await fetch(path, { method: 'HEAD' }).catch(() => null)
  if (response?.ok) return
  throw new Error(`${path} is not here. ${VENDOR_HINT}`)
}

export type { Landmarker }
