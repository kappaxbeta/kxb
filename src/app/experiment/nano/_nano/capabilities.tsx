'use client'

import { useCallback, useEffect, useState } from 'react'

import { BYPASS_FLAG, NANO_APIS } from '@/app/experiment/nano/_nano/apis'
import { type NanoReading, readAll } from '@/app/experiment/nano/_nano/availability'
import { Panel, Press } from '@/app/experiment/nano/_nano/panel'
import { toneFor, verdictFrom, wordFor } from '@/app/experiment/nano/_nano/verdict'

/**
 * What this browser can do, said before it is shown.
 *
 * The verdict is the hero and the rows are the evidence, in that order,
 * because "four of the seven are ready" is the sentence somebody came for and
 * a grid of state words is not. The rows below it are a list rather than a
 * table: seven items with a name, a purpose and a status is not tabular data,
 * and drawing rules around it only added lines to look past.
 *
 * The remedy - which flag, which internals page - is one level down and shows
 * up only when something is actually switched off. It used to sit at the
 * bottom permanently, four lines of `chrome://` addresses under a panel where
 * nothing was wrong, which is how a page teaches people not to read it.
 *
 * Measured on mount and again on demand, since the way you fix a bad row is to
 * change a flag in another tab and come back wanting a different answer.
 */
export function Capabilities() {
  const [readings, setReadings] = useState<Record<string, NanoReading> | null>(null)
  const [asking, setAsking] = useState(false)

  const names = NANO_APIS.map((api) => api.name)

  // The first look. Deliberately not the button's handler: that one flips a
  // flag the moment it is called, and a setState run synchronously inside an
  // effect is a cascading render the lint refuses - rightly. Here the only
  // state written is written after the await, once the browser has answered.
  useEffect(() => {
    let live = true
    void readAll(NANO_APIS.map((api) => api.name)).then((found) => {
      if (live) setReadings(found)
    })
    return () => {
      live = false
    }
  }, [])

  // Asking again, from a click, where saying so first is the point.
  const ask = useCallback(async () => {
    setAsking(true)
    setReadings(await readAll(NANO_APIS.map((api) => api.name)))
    setAsking(false)
  }, [])

  const verdict = verdictFrom(readings, names)
  const off = NANO_APIS.filter((api) => verdict?.off.includes(api.name))

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs tracking-[0.14em] text-ink-muted uppercase">Chrome&rsquo;s built-in AI</p>
        <h1 className="mt-3 max-w-[18ch] text-[clamp(1.9rem,5vw,2.9rem)] leading-[1.08] font-medium tracking-[-0.02em] text-balance text-ink">
          {verdict ? verdict.headline : 'Asking this browser what it can do…'}
        </h1>
        {verdict?.aside ? <p className="mt-3 max-w-[42ch] text-base leading-relaxed text-ink-muted">{verdict.aside}</p> : null}
      </div>

      <Panel
        title="The seven"
        aside={
          <span className="inline-flex items-center gap-3">
            {asking ? <span>asking…</span> : null}
            <Press quiet onPress={() => void ask()} disabled={asking}>
              ask again
            </Press>
          </span>
        }
      >
        <ul className="flex flex-col">
          {NANO_APIS.map((api) => {
            const found = readings?.[api.name]
            return (
              <li
                key={api.name}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-line/25 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <span className="font-mono text-sm text-ink">{api.name}</span>
                  <span className="ml-3 text-sm text-ink-muted">{api.what}</span>
                </div>
                <span className={`text-sm whitespace-nowrap ${found ? toneFor(found.state) : 'text-ink-muted/60'}`}>
                  {found ? wordFor(found.state) : '…'}
                </span>
              </li>
            )
          })}
        </ul>

        {off.length > 0 ? (
          <details className="group mt-5 border-t border-line/25 pt-4 text-sm text-ink-muted">
            {/*
              The marker is drawn rather than left to the browser: the default
              triangle sits outside the text box and pulls the line out of the
              column everything else is aligned to. It also has to be *there* -
              an unadorned line of grey text reads as a caption, and nobody
              presses a caption.
            */}
            <summary className="flex cursor-pointer list-none items-center gap-2 text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden
                className="inline-block transition-transform duration-150 ease-out group-open:rotate-90 motion-reduce:transition-none"
              >
                ›
              </span>
              How to switch {off.length === 1 ? 'it' : 'them'} on
            </summary>
            <div className="mt-3 flex flex-col gap-2 leading-relaxed">
              <p>
                Open <span className="font-mono text-xs text-ink">chrome://flags</span>, enable the entry, relaunch:
              </p>
              <ul className="flex flex-col gap-1">
                {off.map((api) => (
                  <li key={api.name} className="font-mono text-xs">
                    <span className="text-ink">{api.flag}</span>
                    <span className="ml-2 text-ink-muted">{api.name}</span>
                  </li>
                ))}
              </ul>
              <p>
                If a model then refuses to download, set <span className="font-mono text-xs text-ink">{BYPASS_FLAG}</span> to{' '}
                <span className="font-mono text-xs text-ink">Enabled BypassPerfRequirement</span> and watch{' '}
                <span className="font-mono text-xs text-ink">chrome://on-device-internals</span>. It is a one-time
                multi-gigabyte fetch that wants an unmetered connection.
              </p>
            </div>
          </details>
        ) : null}
      </Panel>
    </div>
  )
}
