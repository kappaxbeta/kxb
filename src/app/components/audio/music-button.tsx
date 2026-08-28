'use client'

import { useAudioGate, useAudioPrefs } from '@/app/components/audio/use-audio'

/**
 * Kill the music without leaving what you are doing.
 *
 * The moment somebody wants the music off is the moment they are already doing
 * something else - on a call, in a match, or listening to their own. Anything
 * that makes them navigate to a settings page and back is long enough that they
 * will close the tab instead, so this is on every page in the app.
 *
 * It flips only the music. Silencing the loop and silencing the game are
 * different wishes, and one button that did both would have no way to say which
 * it had done - the settings view is where the two are separable.
 *
 * It lived in the lounge HUD first, as a neon chip beside the help button. It
 * does not any more: the loop plays everywhere inside a workspace, so a control
 * that only existed in one room meant walking back to that room to use it.
 */
export function MusicButton({ className }: { className?: string }) {
  // The dock renders on pages that have no scene to arm the gate, and a click
  // on this button is itself a gesture - so arming here means the very click
  // that turns music *on* is the one the browser accepts it from.
  useAudioGate()

  const { prefs, toggleMusic } = useAudioPrefs()
  const on = prefs.music

  return (
    <button
      type="button"
      onClick={toggleMusic}
      // The dimming for the off state hangs off this in CSS rather than off a
      // second class here, so the accessible state and the visible one cannot
      // disagree about whether the music is playing.
      aria-pressed={on}
      aria-label={on ? 'Turn music off' : 'Turn music on'}
      title={on ? 'Music on' : 'Music off'}
      className={`corner-launcher corner-launcher-icon ${className ?? ''}`}
    >
      <span aria-hidden className="relative inline-flex size-4 items-center justify-center">
        ♪
        {/* The slash. Drawn rather than picked from a font, because the
            combining-slash codepoint lands in a different place in every
            typeface and the muted-speaker emoji is full colour in a corner that
            is not. */}
        {!on && (
          <span className="absolute left-1/2 top-1/2 h-px w-5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-current" />
        )}
      </span>
    </button>
  )
}
