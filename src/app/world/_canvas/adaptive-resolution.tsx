'use client'

import { PerformanceMonitor, type PerformanceMonitorApi } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useCallback, useRef } from 'react'

/**
 * How many pixels the room is worth drawing, decided by the machine drawing it.
 *
 * ---------------------------------------------------------------------------
 * What this is fixing
 * ---------------------------------------------------------------------------
 * A room's GPU cost splits in two, and only one half is about resolution. The
 * lounge was measured in the deployed build with `EXT_disjoint_timer_query`, on
 * one Mac, in one room, at three pixel ratios:
 *
 *     dpr 2.0   3024x1704   5.2 Mpx   17.9 ms
 *     dpr 1.5   2268x1278   2.9 Mpx   13.2 ms
 *     dpr 1.0   1512x852    1.3 Mpx   10.2 ms
 *
 * which is about **7.6 ms of fixed cost plus 2.0 ms per megapixel**. The fixed
 * half is the shadow map and the geometry and this component cannot touch it.
 * The other half is pure fill, and on a Retina display it is most of the frame:
 * a full-screen window is around five megapixels, which is ten milliseconds of
 * a sixteen millisecond budget spent on pixels nobody asked for.
 *
 * ---------------------------------------------------------------------------
 * Why it moves instead of being a number
 * ---------------------------------------------------------------------------
 * The obvious fix is `dpr={[1, 1.5]}` and no component at all. It would work,
 * and it would also permanently soften the room for every machine that was
 * comfortable at native - which is most desktops with a discrete GPU, and is
 * the machine whose owner would notice the difference. A room that looks worse
 * than it needs to on good hardware is not a performance fix, it is a trade
 * made on somebody else's behalf.
 *
 * So the ratio starts in the middle and walks. `<PerformanceMonitor>` samples
 * the frame rate in quarter-second batches and hands back a 0..1 factor; this
 * maps that onto `floor..native` and quantises it, because every change
 * reallocates the drawing buffer and a ratio that slid continuously would spend
 * its life hitching. Native is capped at 2 whatever the display says: a phone
 * reporting 3 would be asking for nine times the pixels of a 1x screen, which
 * no phone GPU has ever been able to afford.
 */

/**
 * Where the ratio starts, before anything has been measured.
 *
 * The middle of the ladder rather than the top, and that asymmetry is on
 * purpose: starting high means every weak machine spends its first seconds -
 * the ones where the room is still loading and the judgement is worst - at the
 * most expensive setting it will ever use. Starting in the middle means a
 * strong machine spends the same seconds looking slightly soft, and then stops.
 * Only one of those two mistakes is felt as the room being broken.
 *
 * A range rather than a number so a 1x display is never asked to supersample:
 * R3F clamps `devicePixelRatio` into it, so this reads "no more than 1.5, and
 * no less than the screen has".
 */
export const ADAPTIVE_DPR: [number, number] = [1, 1.5]

/** The bottom of the ladder. Below this the room is a smear rather than soft. */
const FLOOR = 1

/** Nobody's fill rate is worth nine megapixels. Also R3F's own default cap. */
const NATIVE_CAP = 2

/**
 * The rungs, in pixel ratio.
 *
 * Changing the ratio resizes the drawing buffer, which is a reallocation and a
 * dropped frame - so the ladder is deliberately coarse. Five rungs between 1
 * and 2 is enough to find the setting a machine can hold and few enough that
 * finding it costs a handful of hitches rather than a continuous one.
 */
const STEP = 0.25

export function AdaptiveResolution() {
  const setDpr = useThree((state) => state.setDpr)

  /**
   * Read once, on the client, and never again.
   *
   * `devicePixelRatio` changes when a window is dragged between a laptop screen
   * and an external monitor. Not re-read on purpose: the loop below is already
   * watching the thing that actually matters, which is whether frames are
   * arriving on time, and it will walk to the right rung on the new screen
   * within a couple of seconds without being told the screen changed.
   */
  const native = useRef<number | null>(null)
  native.current ??= Math.min(
    typeof window === 'undefined' ? FLOOR : window.devicePixelRatio,
    NATIVE_CAP,
  )

  const applied = useRef<number>(ADAPTIVE_DPR[1])

  const settle = useCallback(
    (dpr: number) => {
      // Guarded because `onChange` fires on every factor step, and most steps
      // land on the rung the room is already drawing at.
      if (dpr === applied.current) return
      applied.current = dpr
      setDpr(dpr)
    },
    [setDpr],
  )

  const onChange = useCallback(
    ({ factor }: PerformanceMonitorApi) => {
      const span = (native.current ?? FLOOR) - FLOOR
      settle(Math.round((FLOOR + span * factor) / STEP) * STEP)
    },
    [settle],
  )

  return (
    <PerformanceMonitor
      /**
       * "Is this holding vsync", not "is this playable".
       *
       * drei's own default declines below 40fps, which is a room that is
       * already unpleasant by the time anything is done about it. These bounds
       * ask for the frame rate the display can actually show: on a 60Hz screen,
       * drop a rung under 50 and climb one at 58. `refreshrate` is the highest
       * rate ever observed, so a 120Hz display is judged against its own.
       */
      bounds={(refreshrate) => (refreshrate > 90 ? [75, 105] : [50, 58])}
      onChange={onChange}
      /**
       * Enough flips to find a rung, then stop.
       *
       * A machine sitting exactly on a boundary will climb, miss, drop, make
       * it, and climb again forever - and every one of those is a reallocated
       * framebuffer, so the oscillation costs more than either rung. After six
       * changes the room settles at the floor and stops measuring: whatever
       * this machine is, it is not comfortable at native.
       */
      flipflops={6}
      /**
       * Settle a rung *down*, not all the way to the floor.
       *
       * The first version dropped to `FLOOR` here, which is backwards. A
       * machine only reaches fallback by oscillating between two adjacent
       * rungs - so it has just demonstrated that the lower of those two is
       * fine, and slamming it to 1 answers "you were nearly comfortable" with
       * the blurriest setting there is. One step below where it was is the
       * rung it kept succeeding at.
       */
      onFallback={() => settle(Math.max(FLOOR, applied.current - STEP))}
    />
  )
}
