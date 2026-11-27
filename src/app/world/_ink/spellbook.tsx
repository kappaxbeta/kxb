'use client'

import { useEffect } from 'react'

import { GlyphDemo } from '@/app/world/_ink/glyph-demo'
import type { InkLabels } from '@/app/world/_ink/labels'
import { SAMPLES } from '@/app/world/_ink/samples'
import type { Word } from '@/app/world/_ink/words'

/**
 * What the pen knows, shown rather than listed.
 *
 * A gesture feature with no book is a feature with two users: the person who
 * built it and the person they told. The awkward part is that the instruction
 * is a *movement* - "a bowl and a stem", "two strokes that cross" - and the one
 * medium that says it plainly is the movement itself, so each row here is a
 * drawing of the word being drawn, with the words beside it rather than
 * instead of it.
 *
 * Every row comes from `SAMPLES`, which the tests play through the recogniser.
 * The book therefore cannot teach a gesture that does not work: that is a
 * failing test rather than a puzzled player.
 *
 * It lists what this room understands rather than everything the pen can read.
 * A beam only exists in a battle, and a page that offers one where there is
 * none is worse than a page that never mentioned it.
 */
export function Spellbook({
  labels,
  spells,
  onClose,
}: {
  labels: InkLabels
  spells?: readonly Word[]
  onClose: () => void
}) {
  // Escape closes, like every other panel in this world. The pen has already
  // given the pointer back, so nothing is competing for the key.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const shown = SAMPLES.filter((sample) => !spells || spells.includes(sample.word))

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center p-4"
      style={{ background: 'oklch(0.08 0.04 285 / 0.55)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={labels.title}
        className="hud-panel hud-panel-enter max-h-full w-full max-w-sm overflow-y-auto px-5 py-6 sm:px-7"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-full text-lg text-[var(--color-ink-muted)] transition hover:bg-white/10 hover:text-[var(--color-ink)]"
        >
          ✕
        </button>

        <h2 className="font-pixel mb-5 text-center text-lg uppercase tracking-[0.12em] text-[var(--color-accent)] [text-shadow:0_0_1.5rem_oklch(0.7_0.27_322/0.7)]">
          {labels.title}
        </h2>

        <ul className="flex flex-col gap-3">
          {shown.map((sample) => (
            <li key={sample.word} className="flex items-center gap-4">
              {/*
                A fixed box rather than an aspect ratio: the demo letterboxes
                its own handwriting into whatever it is given, and two rows of
                different heights would make the book look like two features.
              */}
              <GlyphDemo
                sample={sample}
                className="h-16 w-28 shrink-0 rounded-xl border border-white/10 bg-black/30"
              />
              <div className="min-w-0">
                <p className="font-pixel text-xs uppercase tracking-wide text-[var(--color-ink)]">
                  {labels.spells[sample.word].name}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-muted)]">
                  {labels.spells[sample.word].how}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
