'use client'

import { useLocale } from '@/app/i18n/locale-context'
import { worldDict } from '@/app/i18n/world'
import { fpsOf } from '@/app/world/perf/collector'
import { usePerfWindow } from '@/app/world/perf/store'

/**
 * The room's own numbers, in the room, for the people playing in it.
 *
 * Opt-in per space rather than automatic - see the `perf_display` capability
 * and `perfDisplayOn`. A space turns it on in Space Settings and everybody in
 * that space's rooms sees it; a space that has not asked sees nothing, whatever
 * an operator is measuring. Those are deliberately two switches: collection is
 * an operator's diagnostic, and this is a thing a space chose to look at.
 *
 * It shows the same readings the backoffice page shows rather than a badge
 * saying somebody is watching, because a badge would be chrome and this is
 * useful: "am I the one with the bad frame rate" is the question a person in a
 * laggy room actually has, and nothing else in the app can answer it.
 *
 * Rendered from the last *closed* window, so it changes once every fifteen
 * seconds. That cadence is the point rather than a limitation: a live readout
 * would re-render the HUD on every packet, and a diagnostic that changes what
 * it measures is worse than no diagnostic.
 */
export function PerfReadout() {
  const t = worldDict(useLocale()).dock
  const window = usePerfWindow()

  // Before the first window closes there is nothing measured to show. Silent
  // rather than a placeholder: fifteen seconds of "—" in the corner of a room
  // reads as something broken.
  if (!window) return null

  const fps = fpsOf(window)
  const parts: string[] = []

  /**
   * A hidden tab drew nothing, and that is not zero frames a second.
   *
   * Mostly unreachable from here - nobody is reading a HUD in a tab they cannot
   * see - but the window somebody comes *back* to is the one that spanned the
   * gap, and reporting that as 0fps to the person who just returned would be
   * the same lie the backoffice page refuses to draw.
   */
  if (window.hiddenMs > window.windowMs / 2) parts.push('tab hidden')
  else if (fps !== null) parts.push(`${Math.round(fps)}fps`)

  const counts = [...Object.values(window.sent), ...Object.values(window.received)]
  const traffic = counts.reduce((total, count) => total + (count ?? 0), 0)
  if (traffic > 0) {
    parts.push(`${Math.round((traffic * 1000) / window.windowMs)} msg/s`)
  }

  if (window.rttP50Ms !== null) {
    // The round trip, labelled as one. Halving it would need an assumption
    // about a symmetric path that is often wrong on a phone, and a HUD chip is
    // not the place to spend words on that caveat - see the backoffice page,
    // which has room for it.
    parts.push(`${Math.round(window.rttP50Ms)}ms rtt`)
  } else if (window.peers > 0) {
    parts.push(t.noEcho)
  }

  if (parts.length === 0) return null

  return (
    <span
      className="text-sky-600"
      title={t.perfTitle}
    >
      {parts.join(' · ')}
    </span>
  )
}
