'use client'

import type { VoiceMode } from '@/lib/controls/voice-mode'
import { useVoiceMode } from '@/lib/controls/use-voice-mode'

/**
 * When the microphone is open, as two pictures.
 *
 * Sits under `./camera-mode-choice` in the same panel and is drawn on the same
 * 48x32 frame, for the reason that file gives: a different canvas between two
 * neighbouring questions reads as a different *kind* of question.
 *
 * The distinction it has to carry is not "held versus not held" - it is how
 * much of your room leaves the building, and for how long. So the contrast is
 * a closed mic with a key under it against an open one with sound already
 * coming out.
 *
 * This is not a mute and does not switch anything on. Whether there is a
 * microphone at all is the button in the HUD; this decides what pressing that
 * button means afterwards.
 */
function Sketch({ mode }: { mode: VoiceMode }) {
  return (
    <svg
      viewBox="0 0 48 32"
      aria-hidden
      className="h-8 w-12 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="1" width="46" height="30" rx="4" opacity={0.35} />

      {/* The same mic in both, so the difference is only ever what is around
          it. Capsule, stand, foot - small enough to leave the frame to the
          answer. */}
      <rect x="21" y="8" width="6" height="10" rx="3" />
      <path d="M18.5 16a5.5 5.5 0 0 0 11 0" />
      <path d="M24 21.5v3M21 24.5h6" />

      {mode === 'push' ? (
        /* A key, held. Drawn as a keycap rather than a finger: the panel's own
           `.hud-key` is a rounded rectangle with a letter in it, and this is
           the same object seen from the same design. */
        <g opacity={0.85}>
          <rect x="33" y="12" width="11" height="9" rx="2.5" />
          <path d="M36.4 16.5h4.2" />
        </g>
      ) : (
        /* Sound already leaving, and travelling. Three arcs rather than two:
           two read as a wifi glyph, three as a sound that carries - which is
           the thing this mode actually costs. */
        <g opacity={0.85}>
          <path d="M32 13.5a6.5 6.5 0 0 1 0 5" />
          <path d="M35.5 11a11 11 0 0 1 0 10" />
          <path d="M39 8.5a15.5 15.5 0 0 1 0 15" />
        </g>
      )}
    </svg>
  )
}

const LABELS: Record<VoiceMode, { title: string; hint: string }> = {
  push: { title: 'Push to talk', hint: 'Hold T. Silent the rest of the time' },
  open: { title: 'Open mic', hint: 'Always on, and fades with distance' },
}

export function VoiceModeChoice({
  /** `null` to drop the heading, where a proper `<h2>` has already said it. */
  heading = 'Voice',
  /** `start` for a settings card, where a centred row floats off its own text. */
  align = 'center',
  className,
}: {
  heading?: string | null
  align?: 'center' | 'start'
  className?: string
}) {
  const { mode, choose } = useVoiceMode()

  return (
    <div className={`pointer-events-auto ${className ?? ''}`}>
      {heading !== null && (
        <p
          className={`mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)] ${
            align === 'center' ? 'text-center' : 'text-left'
          }`}
        >
          {heading}
        </p>
      )}

      <div
        role="radiogroup"
        aria-label="When the microphone is open"
        className={`flex gap-3 ${align === 'center' ? 'justify-center' : 'justify-start'}`}
      >
        {(['push', 'open'] as const).map((option) => {
          const on = mode === option
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(option)}
              className={`flex min-w-[7.5rem] flex-col items-center gap-1.5 rounded-xl border px-3 py-2.5 transition ${
                on
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-ink)]'
                  : 'border-[var(--color-line)] text-[var(--color-ink-muted)] hover:bg-white/10 hover:text-[var(--color-ink)]'
              }`}
            >
              <Sketch mode={option} />
              <span className="text-xs font-semibold">{LABELS[option].title}</span>
              <span className="text-[10px] leading-tight opacity-70">
                {LABELS[option].hint}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
