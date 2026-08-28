/**
 * Whether moving is also allowed to turn the camera.
 *
 * Two modes, and the words name what the *movement input* does to the camera
 * rather than what the camera does, because that is the choice being made:
 *
 * - `'free'` is the arrangement every scene has always had: the stick (or WASD)
 *   moves you and the camera is its own control - a drag on glass, the mouse
 *   under a pointer lock. Two hands, and precise.
 * - `'steer'` hands the camera to the movement input as well: push the stick
 *   somewhere and the camera swings round to follow, so the direction you
 *   pushed becomes forward. One thumb does everything, which is the whole
 *   point - "moving the peep and the camera needs both hands" was the request
 *   this exists to answer. The dedicated look control keeps working on top,
 *   for the glance the stick cannot express.
 *
 * Kept per device rather than on the profile, exactly like the handedness in
 * `./hand` and for the same reason: it is a fact about the hardware in
 * somebody's hands. A phone held one-handed on a train and the same account at
 * a desk with a mouse are allowed different answers.
 *
 * Unlike the hand there is no "never asked" state to preserve - nobody is
 * gated on this question. Whatever is in storage short of a real answer simply
 * means the default.
 */
export type CameraMode = 'free' | 'steer'

export const CAMERA_MODE_STORAGE_KEY = 'unkown.camera'

/**
 * Free, because it is what every player already has in their hands.
 *
 * Steering is the mode you opt into once you have felt the two-handed problem;
 * defaulting to it would change how every existing world drives on the day it
 * ships.
 */
export const DEFAULT_CAMERA_MODE: CameraMode = 'free'

/** Read anything at all and never throw. Not one of the two words means unset. */
export function parseCameraMode(raw: unknown): CameraMode | null {
  return raw === 'free' || raw === 'steer' ? raw : null
}

export function loadCameraMode(): CameraMode | null {
  if (typeof window === 'undefined') return null

  try {
    return parseCameraMode(window.localStorage.getItem(CAMERA_MODE_STORAGE_KEY))
  } catch {
    // Safari's private mode, a full quota, a profile with site data blocked.
    // The player gets the default and can flip it again from the panel.
    return null
  }
}

export function saveCameraMode(mode: CameraMode): void {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(CAMERA_MODE_STORAGE_KEY, mode)
  } catch {
    // The choice still applies for this session; it just will not survive the
    // reload, which is the honest failure here.
  }
}
