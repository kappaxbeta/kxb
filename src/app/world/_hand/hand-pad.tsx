'use client'

import { useState } from 'react'

import { HandGlyph } from '@/app/world/_hand/hand-glyph'
import { handFor } from '@/app/world/_hand/alphabet'
import { HandLayer } from '@/app/world/_hand/hand-layer'
import type { HandLabels } from '@/app/world/_hand/labels'
import { type Phrase, PHRASES, spellingOf, wordingOf } from '@/app/world/_hand/phrases'
import type { Said } from '@/app/world/_hand/signing'
import type { Locale } from '@/domain/i18n/locale'

/**
 * A card with a hand in it: somewhere to practise that is not a room.
 *
 * The pen's pad exists because the lounge is the worst place to *meet* the pen -
 * you have to be signed in, standing somewhere, with a world running behind the
 * glass - and every word of that is truer here. An alphabet takes a week, and
 * nobody spends a week in a lounge learning one.
 *
 * Two modes, and the second is the one that teaches. **Free** is a hand you can
 * wave. **Chase** puts a phrase on the card with its hands drawn next to it and
 * asks you to sign that one, which turns a gesture somebody would try once into
 * the twenty attempts it actually takes - the same trick, and the same reason,
 * as `_ink/ink-pad.tsx`.
 *
 * The phrase is shown in the reader's own language with the *hands* beside it,
 * which is the whole idea made visible: the hands are the spelling, the words
 * are the meaning, and the two are not in the same language on purpose.
 */

/** What a chosen chip looks like: the fuchsia its own hover promises, kept on. */
const LIT = 'border-[var(--color-accent)] text-[var(--color-ink)]'

export function HandPad({
  labels,
  locale,
  words,
  className,
}: {
  labels: HandLabels
  locale: Locale
  /** The chips the mode switch draws, and the two lines under the target. */
  words: { free: string; chase: string; idle: string; signed: string; got: string }
  className?: string
}) {
  const [chasing, setChasing] = useState(false)
  const [target, setTarget] = useState<Phrase>('hello')
  const [score, setScore] = useState(0)
  const [heard, setHeard] = useState<string[]>([])

  const say = (said: Said) => {
    const text = said.phrase ? wordingOf(said.phrase, locale) : said.letters.join('').toUpperCase()
    setHeard((current) => [text, ...current].slice(0, 4))
    if (!chasing || said.phrase !== target) return
    setScore((current) => current + 1)
    setTarget(nextPhrase(target))
  }

  return (
    <div className={className}>
      <div className="mb-2 flex items-center gap-2 text-xs">
        {[
          { label: words.free, on: !chasing, pick: () => setChasing(false) },
          { label: words.chase, on: chasing, pick: () => setChasing(true) },
        ].map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={chip.pick}
            className={`rounded-full border px-3 py-1 transition-colors hover:border-[var(--color-accent)] ${
              chip.on ? LIT : 'border-white/15 text-white/55'
            }`}
          >
            {chip.label}
          </button>
        ))}
        {chasing && score > 0 && (
          <span className="ml-auto opacity-50">
            {score} {words.got}
          </span>
        )}
      </div>

      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#07060d] sm:aspect-[16/10]">
        {chasing ? (
          <div className="absolute inset-x-0 top-0 p-5">
            <p className="text-xs tracking-widest uppercase opacity-40">{words.signed}</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--color-ink)]">
              {wordingOf(target, locale)}
            </p>
            <span className="mt-2 flex gap-1">
              {spellingOf(target).map((letter, index) => (
                <HandGlyph
                  key={`${letter}${index}`}
                  pose={handFor(letter)}
                  className="h-11 w-9"
                  title={letter}
                />
              ))}
            </span>
          </div>
        ) : (
          <p className="absolute inset-x-0 top-0 p-5 text-xs tracking-widest uppercase opacity-40">
            {words.idle}
          </p>
        )}

        {heard.length > 0 && (
          <ul className="absolute bottom-3 left-4 space-y-0.5 text-sm">
            {heard.map((line, index) => (
              <li
                key={`${line}-${index}`}
                className="text-[var(--color-ink)]"
                style={{ opacity: 1 - index * 0.26 }}
              >
                {line}
              </li>
            ))}
          </ul>
        )}

        {/* Always on: a card with a hand in it that you have to switch on first
            is a card whose one job needs explaining.

            The camera is offered here and nowhere else yet, because this is the
            page people come to in order to *learn the hands* - which is exactly
            the job where showing the camera your own hand beats learning five
            keys first. A room is a different question: see the note on the prop. */}
        <HandLayer active camera labels={labels} locale={locale} onSay={say} />
      </div>

      <p className="mt-2 text-center text-[0.65rem] tracking-widest uppercase opacity-35">
        {labels.keys} · {labels.pads}
      </p>
    </div>
  )
}

/**
 * A different phrase from the one just done.
 *
 * Different, specifically - `Math.random` on its own hands you the same target
 * twice about one time in fourteen, and a practice drill that repeats itself
 * reads as broken rather than as random.
 */
function nextPhrase(current: Phrase): Phrase {
  const others = PHRASES.filter((signed) => signed.phrase !== current)
  return others[Math.floor(Math.random() * others.length)].phrase
}
