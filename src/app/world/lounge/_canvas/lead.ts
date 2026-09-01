'use client'

import type * as THREE from 'three'

/**
 * Hand the body over to a new animation, from wherever it is.
 *
 * ---------------------------------------------------------------------------
 * Why `crossFadeFrom` and not `reset().fadeIn()`
 * ---------------------------------------------------------------------------
 * Both fade, and they fade from different places. `fadeIn` ramps the incoming
 * action's weight from zero, which blends it against *whatever else happens to
 * be weighted* - and when the thing it should have been blending against was
 * torn down and rebuilt a frame earlier, that is nothing, so the body arrives
 * at the new clip's first frame in one step. Reported as a clip always starting
 * from the same place rather than from where the body was standing.
 *
 * `crossFadeFrom` names the outgoing action, so the blend is between two poses
 * that both exist. `warp` is on: it also eases the *time scales* together, so a
 * run handing over to a walk does not blend a fast cycle against a slow one and
 * produce the skate that neither of them has.
 *
 * ---------------------------------------------------------------------------
 * The two rules that make it safe to call every render
 * ---------------------------------------------------------------------------
 * Handing over to the action already leading does nothing at all. That is the
 * common case - an effect re-running because some unrelated prop changed - and
 * without the guard it would `reset()` the current animation, snapping a walk
 * back to its first stride every time anything else on the body moved.
 *
 * With nothing playing yet it simply fades in, because there is genuinely
 * nothing to come from: the first pose a body takes is the one it appears in.
 */
export function lead(
  next: THREE.AnimationAction,
  playing: { current: THREE.AnimationAction | null },
  fade: number,
): void {
  const current = playing.current
  if (current === next) {
    // Already the one in front. Kept playing rather than restarted - see above.
    if (!next.isRunning()) next.play()
    return
  }

  next.reset().play()

  if (current && current.isRunning()) {
    next.crossFadeFrom(current, fade, true)
  } else {
    next.fadeIn(fade)
  }

  playing.current = next
}
