import { useEffect, useRef } from 'react'
import { callFullTime } from '@/domain/battle/actions'
import { isFullTime } from '@/domain/battle/events'

/**
 * Blowing the whistle when the clock runs out.
 *
 * Somebody has to ask: the log cannot notice time passing, and there is no
 * server timer. Every client in the match tries, and that is fine - the decider
 * validates the request against the recorded kickoff and refuses a second
 * ending, so the first through wins and the rest are no-ops.
 *
 * ---------------------------------------------------------------------------
 * Latched *after* the answer, not before the request
 * ---------------------------------------------------------------------------
 * The latch is what stops a re-render firing this twice, and the interesting
 * part is when it comes back down: **on a rejection, not on a refusal.** A
 * refusal is an answer - somebody else got there first - and the latch stays.
 * A rejection is silence, and silence has to be retried, which the caller's
 * per-second tick does for free by re-running this.
 *
 * That distinction is the whole bug. The redundancy of "every client tries"
 * collapses in the case the aggregate explicitly supports: a football match
 * whose opponents walked out stays live with one player, so there is exactly
 * one client watching the clock. Latching before the round trip meant its
 * single attempt could reject on a blip and leave the match live at 0:00
 * forever - and `callFullTime` is the only way a clocked match ends absent a
 * score limit. The same shape as the finish line's, and ./report's.
 */
export function useFullTime({
  slug,
  battleId,
  startedAt,
  durationMinutes,
  live,
  tick,
  onEnded,
}: {
  slug: string
  battleId: string
  startedAt: string | null
  /** Absent when this mode has no clock, and then nothing is ever asked. */
  durationMinutes: number | undefined
  live: boolean
  /** Any value that changes each second, so the check runs again. */
  tick: unknown
  onEnded: () => void
}): void {
  const asked = useRef(false)

  useEffect(() => {
    if (durationMinutes === undefined || !live) return
    if (asked.current) return
    if (!isFullTime(startedAt, durationMinutes)) return

    asked.current = true
    void callFullTime(slug, battleId)
      .then((result) => {
        if (result.ok) onEnded()
      })
      .catch(() => {
        asked.current = false
      })
  }, [slug, battleId, startedAt, durationMinutes, live, tick, onEnded])
}
