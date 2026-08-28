import {
  type CameraMode,
  CAMERA_MODE_STORAGE_KEY,
  loadCameraMode,
  parseCameraMode,
  saveCameraMode,
} from '@/lib/controls/camera-mode'

/**
 * The one copy of the camera mode React reads.
 *
 * The same shape as `./hand-store`, and deliberately so - the two are answers
 * to neighbouring questions and are read by the same far-apart places: a frame
 * loop inside a 3D scene, the controls panel over it, the settings page in a
 * different route entirely. See the note at the top of that file for why this
 * is an external store rather than a context, and why it lives in `src/lib`
 * rather than beside a component (both hosts need it and the copy rule keeps
 * their components apart; a preference is not a renderer).
 */

/** Whether `current` has been read off the device yet. */
let loaded = false

/** `null` means nothing stored, which renders as the default. */
let current: CameraMode | null = null

const listeners = new Set<() => void>()

/** Installed with the first subscriber. See `subscribe`. */
let watchingStorage = false

function emit(): void {
  for (const listener of listeners) listener()
}

/**
 * The stored choice, reading it off the device on first use.
 *
 * Lazy rather than initialised at module scope, because this module is imported
 * by server-rendered trees and `localStorage` does not exist there.
 */
export function getStoredCameraMode(): CameraMode | null {
  if (!loaded) {
    current = loadCameraMode()
    loaded = true
  }
  return current
}

/** What the server rendered with: always "nothing stored". See `getServerHand`. */
export function getServerCameraMode(): CameraMode | null {
  return null
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)

  /**
   * Other tabs of the same app. `storage` only fires in the tabs that did not
   * make the change, which is precisely the set that needs telling.
   */
  if (!watchingStorage && typeof window !== 'undefined') {
    watchingStorage = true
    window.addEventListener('storage', (event) => {
      if (event.key !== CAMERA_MODE_STORAGE_KEY) return

      current = parseCameraMode(event.newValue)
      loaded = true
      emit()
    })
  }

  return () => {
    listeners.delete(listener)
  }
}

/**
 * Change the answer.
 *
 * Applied before it is stored, so a browser that refuses writes still switches
 * for this session - a player who cannot persist the choice can still make it.
 */
export function chooseCameraMode(mode: CameraMode): void {
  current = mode
  loaded = true
  emit()
  saveCameraMode(mode)
}
