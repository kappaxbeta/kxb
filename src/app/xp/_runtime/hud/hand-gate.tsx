'use client'

import type { Hand } from '@/lib/controls/hand'
import { useHand } from '@/lib/controls/use-hand'
import { xpDict, type XpDict } from '@/app/i18n/xp'
import { useLocale } from '@/app/i18n/locale-context'

/**
 * Which way round the touch controls go, asked once and changeable after.
 *
 * Provenance: copied from `src/app/components/controls/hand-choice.tsx` per the
 * copy rule in docs/xp-creator.md §1.3 and the lint rule that enforces it -
 * `src/app/xp/**` may not import `@/app/components/*`. What is *not* copied is
 * the preference itself: `@/lib/controls/hand` is one store, shared, so
 * answering the question in the lounge answers it here too. A player has one
 * pair of hands whichever of our worlds they are standing in, and two
 * independent answers would be a bug rather than a divergence.
 *
 * The part that genuinely diverges is the gate below. The lounge's panel is
 * also its door - everybody passes through it, so the question can just live
 * there. A level has no door: it starts the moment it loads (see the note on
 * the entry gate in ./controls-panel), so the only way to ask before somebody
 * plays is to put something in front of them, once.
 */

/**
 * A phone, with the controls on it.
 *
 * `hand` names the dominant hand, so the stick goes in the *opposite* corner -
 * see the note on the type. Drawn rather than written because "left-handed" is
 * ambiguous the moment you think about it: is it naming the thumb that steers,
 * or the thumb that jumps? The sketch answers that without a sentence.
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
      <rect x="1" y="1" width="46" height="30" rx="4" opacity={0.35} />
      <circle cx={stickLeft ? 12 : 36} cy="20" r="6.5" />
      <circle cx={stickLeft ? 12 : 36} cy="20" r="2" fill="currentColor" stroke="none" />
      {/* Jump, and the action rail stacked above it. */}
      <circle cx={stickLeft ? 36 : 12} cy="22" r="3.5" fill="currentColor" stroke="none" />
      <circle cx={stickLeft ? 36 : 12} cy="12" r="2.5" opacity={0.6} />
    </svg>
  )
}

/** The two answers, worded. Read at render rather than held in a module table. */
function labelsFor(t: XpDict['hand']): Record<Hand, { title: string; hint: string }> {
  return {
    right: { title: t.rightTitle, hint: t.rightHint },
    left: { title: t.leftTitle, hint: t.leftHint },
  }
}

export function HandChoice({
  /** Only changes the words above the buttons. See the world's copy. */
  asking = false,
  className,
}: {
  asking?: boolean
  className?: string
}) {
  const t = xpDict(useLocale()).hand
  const labels = labelsFor(t)
  const { hand, choose } = useHand()

  return (
    <div className={`pointer-events-auto ${className ?? ''}`}>
      <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
        {asking ? t.which : t.controls}
      </p>

      <div
        role="radiogroup"
        aria-label={t.groupLabel}
        className="flex justify-center gap-3"
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
              <span className="text-xs font-semibold">{labels[option].title}</span>
              <span className="text-[10px] leading-tight opacity-70">
                {labels[option].hint}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The question, once, over a level that has already started.
 *
 * ---------------------------------------------------------------------------
 * Why picking is the only way out
 * ---------------------------------------------------------------------------
 * There is no "skip", and no ✕. Both buttons dismiss it, so the cheapest way
 * past is to answer - and either answer is a real one, because the default is
 * one of the two options anyway. A skip link would be a third target that
 * silently means "right", which is the worst of both: it is more to read, and
 * the one person who taps it is the person who has just told us they were not
 * paying attention.
 *
 * It is deliberately *not* a pause. The level is running underneath, which
 * costs a couple of seconds of a run nobody has started caring about yet, and
 * buys the thing that makes the question answerable: you can see the controls
 * you are choosing between, laid out on the world they will sit on.
 *
 * Mounted only on a coarse pointer and only while unanswered - both conditions
 * are the caller's, so this component draws whenever it is rendered at all.
 */
export function HandGate({ onDone }: { onDone?: () => void }) {
  const t = xpDict(useLocale()).hand
  const labels = labelsFor(t)
  const { choose } = useHand()

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-40 flex items-end justify-center p-4 pb-10"
      style={{ background: 'oklch(0.08 0.04 285 / 0.45)' }}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={t.groupLabel}
        className="hud-panel hud-panel-enter w-full max-w-sm px-5 py-5"
      >
        <h2 className="font-pixel mb-1 text-center text-base uppercase tracking-[0.12em] text-[var(--color-accent)]">
          {t.which}
        </h2>
        <p className="mb-4 text-center text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
          {t.gateBody}
        </p>

        {/*
          The picker above, but with the tap also closing this.

          Written out rather than reusing <HandChoice> because the two differ in
          the one thing that matters here: there, choosing is a setting; here,
          choosing is also the way out. Passing a callback into <HandChoice> for
          the benefit of one caller would put the gate's behaviour inside the
          control, where the settings page would then have to opt out of it.
        */}
        <div
          role="radiogroup"
          aria-label={t.groupLabel}
          className="flex justify-center gap-3"
        >
          {(['left', 'right'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                choose(option)
                onDone?.()
              }}
              className="flex min-w-[7.5rem] flex-col items-center gap-1.5 rounded-xl border border-[var(--color-line)] px-3 py-2.5 text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/15"
            >
              <Layout hand={option} />
              <span className="text-xs font-semibold">{labels[option].title}</span>
              <span className="text-[10px] leading-tight text-[var(--color-ink-muted)]">
                {labels[option].hint}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
