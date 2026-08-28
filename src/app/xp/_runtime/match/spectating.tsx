'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { watchFrom } from '@/app/xp/_runtime/match/spectate'
import type { Crowd } from '@kxb/xp/engine'

/**
 * The camera, while you are out.
 *
 * Mounted only when there is somebody to watch, which is what keeps this out of
 * everybody else's way: a level nobody can be eliminated from never renders it,
 * and the controller keeps the camera exactly as it always did.
 *
 * ---------------------------------------------------------------------------
 * It reads the same buffer the shots do
 * ---------------------------------------------------------------------------
 * `Crowd.at` rather than a position of its own, so a spectator sees people
 * where everybody else sees them - a quarter of a second in the past, smoothly.
 * A camera fed the newest sample would run ahead of the bodies it is watching
 * and every peer would appear to lag behind their own position.
 *
 * ---------------------------------------------------------------------------
 * Why it does not smooth
 * ---------------------------------------------------------------------------
 * Straight to the spot, every frame. The body being followed is already
 * interpolated, so the camera inherits that smoothness for free - and a second
 * smoothing pass on top of it is a camera that lags the body it is glued to,
 * which reads as the game being slow rather than as a soft camera.
 *
 * Switching targets is the one place a jump is visible, and it is the right
 * kind: pressing a key to look at somebody else *should* cut, the way a
 * broadcast does. Easing between two people across a level is a second of
 * flying through walls.
 */
export function Spectating({
  crowd,
  watching,
}: {
  crowd: { readonly current: Crowd | null }
  /** Whose eyes to sit behind, or null while nobody has been picked. */
  watching: string | null
}) {
  const camera = useThree((state) => state.camera)

  useFrame(() => {
    if (!watching) return
    const placed = crowd.current?.at(watching, performance.now())
    // Somebody who has said nothing yet, or has just gone. Left alone rather
    // than reset to the origin: the last frame is a better picture than the
    // middle of the world, and the key that picks somebody else still works.
    if (!placed) return

    const { eye, look } = watchFrom(placed)
    camera.position.set(eye.x, eye.y, eye.z)
    camera.lookAt(look.x, look.y, look.z)
  })

  return null
}
