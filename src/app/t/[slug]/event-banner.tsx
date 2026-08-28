'use client'

import { useCallback, useState, useSyncExternalStore } from 'react'
import type { EventView } from '@/domain/events/queries'
import { fill } from '@/app/i18n/fill'
import { useLocale } from '@/app/i18n/locale-context'
import { workspaceDict } from '@/app/i18n/workspace'

/**
 * When this event runs and what the host wants said, on every page inside it.
 *
 * The sentence people actually need is "how long have I got", and it is
 * genuinely hard to answer from inside a 3D room with no clock in it. An event
 * has one date and no second attempt, so a jam that ends at six should not end
 * by surprise. That line is ours and is always here.
 *
 * Above it, when the host has written one, is theirs: a headline, a couple of
 * sentences, and named links to the schedule or the Discord. Those are edited
 * in Settings, under the event desk, and stored on `event_spaces` - see
 * 20260902000000_event_header.sql for why the host may write those three
 * columns and nothing else on the row.
 *
 * Renders nothing for an ordinary space, which is almost every space - so this
 * costs the rest of the product one null check.
 *
 * ---------------------------------------------------------------------------
 * Why this is a client component now, and what it still is not
 * ---------------------------------------------------------------------------
 * Only so it can be closed. A banner repeated above every page in a two-day
 * event is read once and is furniture afterwards, and the people it sits above
 * are trying to build in the room underneath it.
 *
 * What it is still not is a countdown. "Closes 18:00" is the fact somebody
 * needs; "01:47:12 remaining" pulsing in the corner is a timer for a room they
 * are trying to work in, and it would re-render every page in the event once a
 * second to say something they already know.
 */
export function EventBanner({ event }: { event: EventView | null }) {
  /**
   * Dismissal is per browser, per version of the header, and deliberately not
   * stored on the server.
   *
   * Per version, because the host editing the headline is the one moment the
   * banner has something new to say - "keynote moved to Hall 2" must reach the
   * people who closed yesterday's. So the key carries the text: change the
   * text and the old key is not the one being looked up any more.
   *
   * Per browser, because a preference this cheap to re-express is not worth a
   * write from every guest at a conference. Session storage rather than local:
   * closing it means "not for the rest of this sitting", and somebody who
   * comes back tomorrow should be told again when the doors shut.
   */
  const key = event
    ? `event-banner:${event.tenantId}:${event.phase}:${event.headline ?? ''}:${event.blurb ?? ''}:${event.links.map((link) => link.name).join(',')}`
    : null

  /**
   * Read through `useSyncExternalStore` rather than in an effect, because the
   * server has no session storage and this is exactly the case it exists for:
   * it renders the server's answer (never closed), then swaps in the browser's
   * on hydration, without the render-then-setState that would flash the banner
   * on every page load for somebody who had already closed it.
   *
   * Nothing subscribes: session storage is only written by the button below,
   * which sets state itself, so there is no external change to hear about.
   *
   * Inside a try, because reading the property itself throws - not the getter -
   * in a browser with site data blocked and in an iframe sandboxed without
   * `allow-same-origin`. This runs as a `getSnapshot`, so a throw is not one
   * banner failing to remember: it takes down the render that called it, and
   * with it every page in the event that shows this. Refused storage reads as
   * "never closed", which shows the banner one time too many rather than
   * showing nothing at all.
   */
  const stored = useSyncExternalStore(
    () => () => {},
    useCallback(() => {
      if (!key) return false
      try {
        return window.sessionStorage.getItem(key) === '1'
      } catch {
        return false
      }
    }, [key]),
    () => false,
  )

  const locale = useLocale()
  const t = workspaceDict(locale).event
  const [dismissed, setDismissed] = useState(false)

  if (!event || stored || dismissed) return null

  const when = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    })

  /**
   * One palette per phase, chosen once here.
   *
   * The colour is the fastest thing read on the page and it should carry the
   * only fact that changes: sky for a room that is not open yet, emerald for
   * one that is, and the plain surface for one that is over - because an ended
   * event is not a warning, it is a room somebody is still welcome to walk
   * through.
   */
  const tone = {
    upcoming: {
      frame: 'border-sky-400/40 bg-sky-500/10',
      dot: 'bg-sky-400',
      title: 'text-sky-100',
      body: 'text-sky-100/70',
      chip: 'border-sky-400/30 text-sky-100 hover:border-sky-300/70 hover:bg-sky-400/10',
      label: t.opens,
      line: fill(t.opensLine, { when: when(event.opensAt) }),
    },
    running: {
      frame: 'border-emerald-400/40 bg-emerald-500/10',
      dot: 'bg-emerald-400',
      title: 'text-emerald-50',
      body: 'text-emerald-100/70',
      chip: 'border-emerald-400/30 text-emerald-100 hover:border-emerald-300/70 hover:bg-emerald-400/10',
      label: t.live,
      line: fill(t.runningLine, { when: when(event.closesAt) }),
    },
    ended: {
      frame: 'border-line bg-surface-raised/60',
      dot: 'bg-ink-muted',
      title: 'text-ink',
      body: 'text-ink-muted',
      chip: 'border-line text-ink-muted hover:border-ink-muted/60 hover:bg-surface-raised',
      label: t.ended,
      line: fill(t.endedLine, { when: when(event.closesAt) }),
    },
  }[event.phase]

  return (
    <section
      className={`mb-4 rounded-2xl border px-4 py-3 shadow-sm backdrop-blur-sm ${tone.frame}`}
      aria-label={t.label}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/*
            The status line is the same height whether or not the host wrote a
            headline, so the banner does not jump between pages the moment one
            is saved. Only its weight moves: without a headline this line is
            the banner, and with one it is the caption above it.
          */}
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] opacity-80">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot} ${
                event.phase === 'running' ? 'animate-pulse' : ''
              }`}
              aria-hidden
            />
            <span className={tone.title}>{tone.label}</span>
          </p>

          {event.headline ? (
            <>
              <h2 className={`mt-1 text-balance text-base font-semibold leading-snug ${tone.title}`}>
                {event.headline}
              </h2>
              {event.blurb && (
                <p className={`mt-1 whitespace-pre-line text-sm leading-relaxed ${tone.body}`}>
                  {event.blurb}
                </p>
              )}
              <p className={`mt-1.5 text-xs ${tone.body}`}>{tone.line}</p>
            </>
          ) : (
            <p className={`mt-1 text-sm leading-relaxed ${tone.title}`}>{tone.line}</p>
          )}

          {event.links.length > 0 && (
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {event.links.map((link) => (
                <li key={`${link.name}-${link.url}`}>
                  {/*
                    Plain anchors, not <Link>: every one of these goes somewhere
                    that is not this app. `noopener` because a tab opened from
                    an event banner is opened by a stranger's URL.
                  */}
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${tone.chip}`}
                  >
                    {link.name}
                    <span aria-hidden className="opacity-50">
                      ↗
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setDismissed(true)
            // State first, and storage second inside a try: the ✕ must close
            // the banner in a browser that refuses to remember it was closed.
            try {
              if (key) window.sessionStorage.setItem(key, '1')
            } catch {
              // Closed for this sitting, and back on the next page. Better
              // than a click that does nothing.
            }
          }}
          aria-label={t.hide}
          className={`-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-sm leading-none opacity-50 transition hover:bg-white/10 hover:opacity-100 ${tone.title}`}
        >
          ✕
        </button>
      </div>
    </section>
  )
}
