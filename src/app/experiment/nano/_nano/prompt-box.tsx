'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { Panel, Press } from '@/app/experiment/nano/_nano/panel'
import type { NanoSession } from '@/app/experiment/nano/_nano/types'

/**
 * Somewhere to say something to the model and watch what it costs.
 *
 * The answer is the least interesting thing this box produces. Everything above
 * says *whether* the model is there; the only question left is whether it is
 * fast enough to put in front of anybody, and that is a number, not an opinion.
 *
 * The numbers are said in words rather than printed as `first:299ms`, because
 * the point is a judgement - "fast enough to watch, too slow to wait for" - and
 * a millisecond count in monospace makes a reader do that arithmetic
 * themselves. The one that matters is time to the first word: the rest arrives
 * while they are reading.
 *
 * Two of the three clocks are only honest if the session is kept. The first
 * `create()` on a cold profile is tens of seconds and every one after it is a
 * few; a box that opened a session per question would report the cold number
 * forever and would also throw away the conversation. So the session is held in
 * a ref, reused, and destroyed on unmount - and `ready` mirrors it in state,
 * because the ref itself must not be read while rendering.
 *
 * The stream yields **deltas**. Concatenating is not an optimisation here; an
 * earlier version assigned each chunk and ended up displaying the final "\n".
 */

/** Milliseconds, said the way somebody would say them out loud. */
function said(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

export function PromptBox() {
  const sessionRef = useRef<NanoSession | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('Nenne drei Emotes, die ein Spieler in einer 3D-Lounge benutzen würde.')
  const [output, setOutput] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [times, setTimes] = useState<{ create?: number; first?: number; total?: number }>({})

  // A session is a held resource, and this page is a place people leave.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      sessionRef.current?.destroy()
      sessionRef.current = null
    }
  }, [])

  const ask = useCallback(async () => {
    if (!window.LanguageModel) {
      setNote('There is no language model in this browser — see above.')
      return
    }
    setBusy(true)
    setNote(null)
    setOutput('')
    const controller = new AbortController()
    abortRef.current = controller

    try {
      if (!sessionRef.current) {
        const opened = performance.now()
        setNote('Opening a session. The first one on a cold profile fetches the model, which takes a while.')
        sessionRef.current = await window.LanguageModel.create({
          initialPrompts: [{ role: 'system', content: 'Antworte kurz.' }],
          signal: controller.signal,
          monitor: (monitor) => {
            monitor.addEventListener('downloadprogress', (event) => {
              const loaded = (event as Event & { loaded?: number }).loaded ?? 0
              setNote(`Downloading the model — ${Math.round(loaded * 100)}%.`)
            })
          },
        })
        setTimes((was) => ({ ...was, create: Math.round(performance.now() - opened) }))
        setReady(true)
        setNote(null)
      }

      const asked = performance.now()
      let first: number | undefined
      let text = ''
      const stream = sessionRef.current.promptStreaming(input, { signal: controller.signal })
      for await (const delta of stream) {
        first ??= Math.round(performance.now() - asked)
        text += delta
        setOutput(text)
      }
      setTimes((was) => ({ ...was, first, total: Math.round(performance.now() - asked) }))
    } catch (error) {
      // An abort is a person changing their mind, not a failure worth shouting.
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setNote(error instanceof Error ? `${error.name}: ${error.message}` : String(error))
      }
    } finally {
      abortRef.current = null
      setBusy(false)
    }
  }, [input])

  return (
    <Panel
      title="Say something to it"
      aside={times.first != null ? `first word after ${said(times.first)}` : ready ? 'session open' : undefined}
    >
      <textarea
        value={input}
        onChange={(event) => setInput(event.target.value)}
        rows={2}
        className="w-full resize-y rounded-xl border border-line/60 bg-surface/60 p-4 text-base leading-relaxed text-ink outline-none focus:border-accent"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Press onPress={() => void ask()} disabled={busy}>
          {busy ? 'thinking…' : 'ask'}
        </Press>
        {busy ? (
          <Press quiet onPress={() => abortRef.current?.abort()}>
            stop
          </Press>
        ) : null}
      </div>

      {note ? <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-ink-muted">{note}</p> : null}

      {output ? (
        <p className="mt-5 rounded-xl border border-line/40 bg-surface/40 p-4 text-base leading-relaxed whitespace-pre-wrap text-ink">
          {output}
        </p>
      ) : null}

      {times.total != null ? (
        <p className="mt-4 max-w-[56ch] text-sm leading-relaxed text-ink-muted">
          The whole answer took {said(times.total)}, and the first word arrived after {said(times.first ?? 0)} — fast enough to
          watch, too slow to wait for.{' '}
          {times.create != null ? `Opening the session cost ${said(times.create)}; every one after it is a few seconds.` : null}
        </p>
      ) : null}
    </Panel>
  )
}
