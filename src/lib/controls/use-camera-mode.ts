'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { type CameraMode, DEFAULT_CAMERA_MODE } from '@/lib/controls/camera-mode'
import {
  chooseCameraMode,
  getServerCameraMode,
  getStoredCameraMode,
  subscribe,
} from '@/lib/controls/camera-mode-store'

/**
 * The React face of the camera-mode store.
 *
 * In `src/lib` beside the store rather than under `src/app/components`, for the
 * same lint-shaped reason `use-hand` is: `src/app/xp/**` is forbidden from
 * importing `@/app/components/*`, and an XP needs this exactly as much as the
 * lounge does.
 */

export interface CameraModeControls {
  /** The mode to drive with. Never null - unset renders as the default. */
  mode: CameraMode
  /** Change it. Applies immediately and persists. */
  choose: (mode: CameraMode) => void
}

/**
 * The mode to drive with, and how to change it.
 *
 * `unset` is what a player who has never opened the panel gets, and it is a
 * parameter rather than a constant because the right answer depends on what is
 * in their hands. A mouse gets `free` - two controls, which is what a desk has
 * always had. A thumb is offered `steer`, because the alternative on glass is
 * strafing with one thumb while turning with the other, and the sideways half
 * of that is what people report as the camera fighting them. The XP runtime
 * passes it; nothing else does, so no surface changes underfoot.
 *
 * A *stored* answer always wins, in either direction: somebody who picked
 * `free` on their phone picked it on purpose.
 */
export function useCameraMode(unset: CameraMode = DEFAULT_CAMERA_MODE): CameraModeControls {
  const stored = useSyncExternalStore(subscribe, getStoredCameraMode, getServerCameraMode)

  const choose = useCallback((mode: CameraMode) => chooseCameraMode(mode), [])

  return { mode: stored ?? unset, choose }
}
