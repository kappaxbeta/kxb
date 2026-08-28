'use client'

import type { Hand } from '@/lib/controls/hand'
import { useHand } from '@/lib/controls/use-hand'

/**
 * Which way round the touch controls go, as two pictures.
 *
 * Drawn rather than written, and that is the whole design. "Left-handed" and
 * "right-handed" are ambiguous the moment somebody thinks about it - is the
 * label naming the thumb that steers, or the thumb that jumps? - and a control
 * scheme is not something anybody wants to reason about while a level is
 * loading. Each option is a 40px sketch of the phone they are holding, with the
 * stick where the stick will be. The words are underneath as confirmation, not
 * as the question.
 *
 * Only ever shown on a coarse pointer. A mouse has no handedness this can help
 * with - the keys are the keys - so every caller here is already inside an
 * `isTouch` branch, and this component deliberately does not check again: it is
 * also the settings-page control, where somebody on a laptop is quite reasonably
 * setting up the phone in their other hand.
 *
 * Also copied, in shape rather than in code, to `@/app/xp/_runtime/hand-gate`.
 * `src/app/xp/**` may not import `@/app/components/*` (eslint.config.mjs;
 * docs/xp-creator.md §1.3), and the two are allowed to look different - what
 * they must share is the *preference*, which they do, through
 * `@/lib/controls/hand`.
 */

/**
 * A phone, with the controls on it.
 *
 * `hand` names the dominant hand, so the stick goes in the *opposite* corner -
 * see the note on the type. Getting that backwards here would be a picture that
 * lies, which is worse than no picture.
 */
function Layout({ hand }: { hand: Hand }) {
  const stickLeft = hand === 'right'

  return (
    <svg
      viewBox="0 0 48 32"
      aria-hidden
      className="h-8 w-12 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      {/* The screen. */}
      <rect x="1" y="1" width="46" height="30" rx="4" opacity={0.35} />
      {/* The stick: one ring, because that is what it is. */}
      <circle cx={stickLeft ? 12 : 36} cy="20" r="6.5" />
      <circle cx={stickLeft ? 12 : 36} cy="20" r="2" fill="currentColor" stroke="none" />
      {/* The buttons, stacked the way the action rail stacks. */}
      <circle cx={stickLeft ? 36 : 12} cy="22" r="3.5" fill="currentColor" stroke="none" />
      <circle cx={stickLeft ? 36 : 12} cy="12" r="2.5" opacity={0.6} />
    </svg>
  )
}

const LABELS: Record<Hand, { title: string; hint: string }> = {
  right: { title: 'Right-handed', hint: 'Steer left, act right' },
  left: { title: 'Left-handed', hint: 'Steer right, act left' },
}

export function HandChoice({
  /**
   * Whether this is the first-run question or a setting being revisited.
   *
   * Only changes the words above the buttons. The controls themselves are
   * identical, because they are the same choice - a first answer and a change
   * of mind are not two features.
   */
  asking = false,
  /**
   * `null` to drop the little heading.
   *
   * For the settings card, which has already said "Touch controls" in a proper
   * `<h2>` directly above. Two headings for one control reads as two controls.
   * The radiogroup keeps its own label either way, so nothing is lost to a
   * screen reader by hiding this.
   */
  heading = asking ? 'Which hand?' : 'Controls',
  /** `start` for a settings card, where a centred row floats off its own text. */
  align = 'center',
  className,
}: {
  asking?: boolean
  heading?: string | null
  align?: 'center' | 'start'
  className?: string
}) {
  const { hand, choose } = useHand()

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
        aria-label="Which hand the on-screen controls belong to"
        className={`flex gap-3 ${align === 'center' ? 'justify-center' : 'justify-start'}`}
      >
        {(['left', 'right'] as const).map((option) => {
          const on = hand === option
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
              <Layout hand={option} />
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
