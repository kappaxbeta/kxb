/**
 * Taking the shake out of a camera's guess.
 *
 * A landmarker re-solves every frame from scratch, so a person standing
 * perfectly still still produces joints that jitter by a centimetre or two -
 * and a centimetre at the wrist is a visible tremor once it is an angle at the
 * shoulder. Every capture needs some smoothing; the question is only how much
 * lag you are willing to pay for it.
 *
 * So the blend is not a fixed one. A point that is barely moving is smoothed
 * hard, because everything it is doing is noise. A point that is travelling
 * fast is smoothed barely at all, because at that speed the noise is small
 * against the movement and the lag is what you would see instead - a hand that
 * arrives late at the top of a wave, which reads as the animation being
 * *wrong* rather than as the animation being soft.
 *
 * That is the idea behind the one-euro filter, without its second filter on
 * the derivative: at the twenty to thirty frames a second a webcam gives us,
 * the extra stage is a lot of state for a difference nobody has been able to
 * see.
 */
import type { Vec3 } from '@/domain/animator/clip'
import type { PoseFrame } from '@/domain/mocap/landmarks'

/**
 * The speed, in metres per second, at which smoothing has mostly let go.
 *
 * Read off a hand: a deliberate wave crosses about a metre a second, and
 * shaking noise on a still joint is well under a tenth of that.
 */
const FAST = 0.8

/**
 * One frame, blended into the last.
 *
 * `strength` is 0 (raw) to 1 (as smooth as this will go). `elapsed` is
 * seconds since the previous frame, so a dropped frame does not double the
 * lag - the blend is per second, not per frame, which is the only way this
 * behaves the same on a machine rendering at 30fps and one at 12.
 */
export function smoothFrame(
  previous: PoseFrame | null,
  next: PoseFrame,
  strength: number,
  elapsed = 1 / 30,
): PoseFrame {
  if (!previous || strength <= 0) return next
  if (previous.points.length !== next.points.length) return next

  const points: Vec3[] = []
  for (let index = 0; index < next.points.length; index += 1) {
    const was = previous.points[index]
    const now = next.points[index]
    const speed = Math.hypot(now[0] - was[0], now[1] - was[1], now[2] - was[2]) / Math.max(elapsed, 1e-3)
    // How much of the old value to keep: the full strength when still, none of
    // it once the point is moving at `FAST`.
    const keep = strength * Math.max(0, 1 - speed / FAST)
    points.push([
      now[0] + (was[0] - now[0]) * keep,
      now[1] + (was[1] - now[1]) * keep,
      now[2] + (was[2] - now[2]) * keep,
    ])
  }

  // Visibility is the model's own confidence and is not a position: smoothing
  // it would only delay the moment a limb that has left the frame stops being
  // driven, which is the one thing you want to happen immediately.
  return { points, visible: next.visible }
}
