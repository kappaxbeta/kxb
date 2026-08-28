'use client'

import { useLocale } from '@/app/i18n/locale-context'
import { worldDict } from '@/app/i18n/world'

/**
 * Let go of the controls.
 *
 * The same round button in the corner as the emotes and the creatures, because
 * it is the same kind of control: something you reach for over a live canvas
 * without it stealing the canvas' pointer events. No panel - there is nothing to
 * configure, and a menu asking which of sleeping, sitting or wandering you would
 * like would be missing the point of a body that decides for itself.
 *
 * There is no "off" here beyond pressing it again, because the scene turns it
 * off for you: reaching for the movement keys takes the controls back, exactly
 * as it gets you up off the sofa. That is why this takes `on` from the caller
 * rather than holding it - the frame loop is the other writer.
 */
export function DriftToggle({
  on,
  onChange,
  /** Nudged aside from whatever already owns the corner. */
  className = '',
}: {
  on: boolean
  onChange: (on: boolean) => void
  className?: string
}) {
  const t = worldDict(useLocale()).dock

  return (
    <div className={`pointer-events-auto absolute z-30 ${className}`}>
      <button
        type="button"
        onClick={() => onChange(!on)}
        aria-pressed={on}
        aria-label={on ? t.driftOn : t.driftOff}
        title={on ? t.driftOnTitle : t.driftOffTitle}
        className={`flex h-11 w-11 items-center justify-center rounded-full border text-lg shadow-lg backdrop-blur transition-colors ${
          on
            ? 'border-amber-300/50 bg-amber-400/30'
            : 'border-white/10 bg-black/55 hover:bg-black/70'
        }`}
      >
        <span aria-hidden>{on ? '💤' : '🚶'}</span>
      </button>
    </div>
  )
}
