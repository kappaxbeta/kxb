'use client'

import { useCallback, useRef, useState } from 'react'

import { Panel, Press } from '@/app/experiment/nano/_nano/panel'
import type { NanoDetector, NanoTranslator } from '@/app/experiment/nano/_nano/types'

/**
 * Detect, then translate - the pair that is actually worth having.
 *
 * The chat model above is the famous one and the wrong first use: two to three
 * seconds a turn cannot sit in front of a message anybody is waiting to send.
 * These two can. They are small, they are specific, they answer fast enough to
 * be invisible, and they cost nothing and reach nowhere - a room where five
 * languages are being typed at once is a real problem here, and this solves it
 * on the reader's own machine.
 *
 * Two calls, not one, because a translator is created *for a pair*: you cannot
 * ask for "into German" without saying what from. Hence the detector first,
 * whose answer opens the right translator. Both are cached by pair, since the
 * expensive part is opening one, and a room only ever has a few pairs in it.
 */

/** The five this project would plausibly want. Codes, because the chips are small. */
const INTO = [
  { code: 'de', name: 'German' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'French' },
  { code: 'es', name: 'Spanish' },
  { code: 'bg', name: 'Bulgarian' },
] as const

export function TranslateBox() {
  const detectorRef = useRef<NanoDetector | null>(null)
  const translatorsRef = useRef(new Map<string, NanoTranslator>())

  const [text, setText] = useState('hallo zusammen, wer spielt mit?')
  const [into, setInto] = useState<string>('en')
  const [from, setFrom] = useState<string | null>(null)
  const [out, setOut] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = useCallback(async () => {
    if (!window.LanguageDetector || !window.Translator) {
      setNote('This browser has no detector or translator — see above.')
      return
    }
    setBusy(true)
    setNote(null)
    setOut('')
    try {
      detectorRef.current ??= await window.LanguageDetector.create()
      const [best] = await detectorRef.current.detect(text)
      const source = best?.detectedLanguage ?? 'en'
      setFrom(best ? `${source} · ${Math.round(best.confidence * 100)}% sure` : null)

      if (source === into) {
        setOut(text)
        setNote('Already in that language.')
        return
      }

      const pair = `${source}->${into}`
      let translator = translatorsRef.current.get(pair)
      if (!translator) {
        // A pair Chrome has never seen downloads a small model on first use.
        setNote(`Opening ${pair}. A pair this browser has not seen downloads a small model first.`)
        translator = await window.Translator.create({ sourceLanguage: source, targetLanguage: into })
        translatorsRef.current.set(pair, translator)
        setNote(null)
      }
      setOut(await translator.translate(text))
    } catch (error) {
      // Two ways this fails, and both are the same rule wearing different
      // clothes: **anything that still has to download must be created from a
      // real click**. That covers the detector as much as the translator, even
      // though the detector's own `availability()` says `available` - what is
      // available is the API, not the model behind it.
      //
      // The translator says so properly, with a `NotAllowedError`. The detector
      // does not: it rejects with a bare `undefined`, which is why the second
      // arm has to cope with an error that is not an `Error`. Worse, once that
      // rejection has happened, every later `LanguageDetector.availability()`
      // in the same document rejects with `undefined` too - the API is wedged
      // until the page is reloaded. So there is no retry worth writing here;
      // the honest move is to tell the reader to press it themselves.
      //
      // Which settles the product question this box exists to answer: chat
      // cannot silently translate itself on arrival. It needs a button the
      // reader presses once per pair, and can be quiet afterwards.
      const gesture = (error instanceof DOMException && error.name === 'NotAllowedError') || error === undefined
      setNote(
        gesture
          ? 'This still has to download, and Chrome only allows that from a real press — press translate yourself. If it keeps failing, reload: a refused download wedges the API for the whole page.'
          : error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error),
      )
    } finally {
      setBusy(false)
    }
  }, [text, into])

  return (
    <Panel title="Detect, then translate" aside={from ? `from ${from}` : undefined}>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={2}
        className="w-full resize-y rounded-xl border border-line/60 bg-surface/60 p-4 text-base leading-relaxed text-ink outline-none focus:border-accent"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm text-ink-muted">into</span>
        {INTO.map((language) => (
          <button
            key={language.code}
            type="button"
            title={language.name}
            onClick={() => setInto(language.code)}
            className={`rounded-full border px-3 py-1.5 font-mono text-xs transition duration-100 ease-out active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 ${
              into === language.code ? 'border-accent text-ink' : 'border-line/50 text-ink-muted hover:border-accent hover:text-ink'
            }`}
          >
            {language.code}
          </button>
        ))}
        <span className="ml-1">
          <Press onPress={() => void run()} disabled={busy}>
            {busy ? 'working…' : 'translate'}
          </Press>
        </span>
      </div>

      {note ? <p className="mt-4 max-w-[56ch] text-sm leading-relaxed text-ink-muted">{note}</p> : null}

      {out ? (
        <p className="mt-5 rounded-xl border border-line/40 bg-surface/40 p-4 text-base leading-relaxed text-ink">{out}</p>
      ) : null}
    </Panel>
  )
}
